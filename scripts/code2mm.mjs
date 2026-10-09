#!/usr/bin/env node
// code2mm — 把代码目录抽成思维导图（CLI MVP）
//
// 原理：用 TypeScript 编译器（复用 electron-app/node_modules/typescript，零额外依赖）
// 解析目标目录下 .ts/.tsx/.js/.jsx/.mjs/.cjs，抽取导出符号（function/class/interface/
// type/enum/const）、类成员、import 依赖，构建"镜像文件夹层级"的脑图树，输出
// 规范多 sheet 容器形状 {app:'smm-multisheet', sheets:[{data:{root}}]} —— 与 app 自存
// .smm 完全同一 schema，思绪思维导图 app 双击即可打开（旧单图形状曾被 app 解码污染，见文末）。
//
// 用法：
//   node scripts/code2mm.mjs <targetDir|file> [--out <file.smm>] [--name <rootName>]
//                              [--max-depth N] [--no-imports] [--no-lines]
//
// 设计取舍：
//   - AST 只抽"导出面 + 类成员 + import"（事实层），不做语义概括（那是 LLM 的事，后续加）。
//   - 不幻觉符号名：所有节点名都来自真实 AST，行号来自真实位置。
//   - 文件夹层级原样镜像，便于在脑图里还原代码结构。
'use strict';

import { fileURLToPath } from 'url'
import { dirname, resolve, basename, extname, join } from 'path'
import { createRequire } from 'module'
import fs from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const require = createRequire(import.meta.url)
const ts = require(resolve(ROOT, 'electron-app/node_modules/typescript'))

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-electron', 'dist-electron2', '.trash', '_trash', 'coverage'])
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

// ---- 参数解析 ----
const args = process.argv.slice(2)
let target = null
let outFile = null
let rootName = null
let maxDepth = Infinity
let includeImports = true
let includeLines = true
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--out') outFile = args[++i]
  else if (a === '--name') rootName = args[++i]
  else if (a === '--max-depth') maxDepth = parseInt(args[++i], 10)
  else if (a === '--no-imports') includeImports = false
  else if (a === '--no-lines') includeLines = false
  else if (!a.startsWith('--') && target === null) target = a
}
if (!target) {
  console.error('用法: node scripts/code2mm.mjs <targetDir|file> [--out file.smm] [--name root] [--max-depth N] [--no-imports] [--no-lines]')
  process.exit(2)
}
target = resolve(target)
if (!fs.existsSync(target)) { console.error('目标不存在: ' + target); process.exit(2) }

// ---- 工具 ----
function mkNode(text, extra) {
  return { data: Object.assign({ text, expand: true }, extra || {}), children: [] }
}
function scriptKindFor(p) {
  if (p.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (p.endsWith('.ts')) return ts.ScriptKind.TS
  if (p.endsWith('.jsx')) return ts.ScriptKind.JSX
  return ts.ScriptKind.JS
}
function stripQuotes(s) { return s.replace(/^['"`]|['"`]$/g, '') }
function isCodeFile(name) { return CODE_EXT.has(extname(name).toLowerCase()) }
function hasMod(node, kind) { return (node.modifiers || []).some(m => m.kind === kind) }

// ---- 单文件 AST 抽取 ----
function parseFile(full) {
  const code = fs.readFileSync(full, 'utf8')
  let sf
  try {
    sf = ts.createSourceFile(full, code, ts.ScriptTarget.Latest, true, scriptKindFor(full))
  } catch (e) {
    return null
  }
  const lineOf = n => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
  const L = n => (includeLines ? ' :L' + lineOf(n) : '')
  const isExported = n => hasMod(n, ts.SyntaxKind.ExportKeyword)
  const imports = []
  const exportsNodes = []

  const mkFn = stmt => {
    const async = hasMod(stmt, ts.SyntaxKind.AsyncKeyword)
    const n = (stmt.parameters || []).length
    return mkNode(`${async ? 'async ' : ''}${stmt.name ? stmt.name.text : '?' }() (${n})${L(stmt)}`)
  }
  const mkClass = stmt => {
    const node = mkNode(`class ${stmt.name ? stmt.name.text : '?'}${L(stmt)}`)
    for (const m of stmt.members || []) {
      const mk = m.kind
      const priv = hasMod(m, ts.SyntaxKind.PrivateKeyword)
      const prot = hasMod(m, ts.SyntaxKind.ProtectedKeyword)
      const stat = hasMod(m, ts.SyntaxKind.StaticKeyword)
      const ro = hasMod(m, ts.SyntaxKind.ReadonlyKeyword)
      const asy = hasMod(m, ts.SyntaxKind.AsyncKeyword)
      const vis = priv ? '#' : (prot ? 'protected ' : '')
      if (mk === ts.SyntaxKind.MethodDeclaration || mk === ts.SyntaxKind.Constructor ||
          mk === ts.SyntaxKind.GetAccessor || mk === ts.SyntaxKind.SetAccessor) {
        const nm = m.name ? m.name.getText(sf) : (mk === ts.SyntaxKind.Constructor ? 'constructor' : '?')
        const p = (m.parameters || []).length
        node.children.push(mkNode(`${stat ? 'static ' : ''}${vis}${asy ? 'async ' : ''}${nm}() (${p})${L(m)}`))
      } else if (mk === ts.SyntaxKind.PropertyDeclaration) {
        node.children.push(mkNode(`${stat ? 'static ' : ''}${ro ? 'readonly ' : ''}${vis}${m.name ? m.name.getText(sf) : '?'}${L(m)}`))
      }
    }
    return node
  }

  for (const stmt of sf.statements) {
    switch (stmt.kind) {
      case ts.SyntaxKind.ImportDeclaration: {
        const mod = stmt.moduleSpecifier
        const spec = mod ? stripQuotes(mod.getText(sf)) : '?'
        if (!spec.startsWith('.')) break
        const clause = stmt.importClause
        let label = spec
        if (clause) {
          const parts = []
          if (clause.name) parts.push(clause.name.text)
          const nb = clause.namedBindings
          if (nb) {
            if (nb.kind === ts.SyntaxKind.NamespaceImport) parts.push('* as ' + nb.name.text)
            else if (nb.elements) parts.push('{ ' + nb.elements.map(e => e.name.text).join(', ') + ' }')
          }
          if (parts.length) label = spec + '  <- ' + parts.join(', ')
        }
        imports.push(label)
        break
      }
      case ts.SyntaxKind.ExportDeclaration: {
        const clause = stmt.exportClause
        if (clause && clause.elements)
          exportsNodes.push(mkNode('re-export { ' + clause.elements.map(e => e.name.text).join(', ') + ' }'))
        else if (stmt.moduleSpecifier)
          exportsNodes.push(mkNode('re-export * from ' + stripQuotes(stmt.moduleSpecifier.getText(sf))))
        break
      }
      case ts.SyntaxKind.ExportAssignment:
        exportsNodes.push(mkNode('export default ' + (stmt.expression ? stmt.expression.getText(sf).slice(0, 40) : '')))
        break
      case ts.SyntaxKind.FunctionDeclaration:
        if (stmt.name && isExported(stmt)) exportsNodes.push(mkFn(stmt))
        break
      case ts.SyntaxKind.ClassDeclaration:
        if (stmt.name && isExported(stmt)) exportsNodes.push(mkClass(stmt))
        break
      case ts.SyntaxKind.InterfaceDeclaration:
        if (isExported(stmt)) exportsNodes.push(mkNode(`interface ${stmt.name.text}${L(stmt)}`))
        break
      case ts.SyntaxKind.TypeAliasDeclaration:
        if (isExported(stmt)) exportsNodes.push(mkNode(`type ${stmt.name.text}${L(stmt)}`))
        break
      case ts.SyntaxKind.EnumDeclaration:
        if (isExported(stmt)) {
          const n = mkNode(`enum ${stmt.name.text}${L(stmt)}`)
          n.children = (stmt.members || []).map(m => mkNode(m.name.getText(sf) + L(m)))
          exportsNodes.push(n)
        }
        break
      case ts.SyntaxKind.VariableStatement:
        if (isExported(stmt)) {
          for (const d of stmt.declarationList.declarations) {
            const nm = d.name.getText(sf)
            const isFn = d.initializer && (d.initializer.kind === ts.SyntaxKind.ArrowFunction ||
              d.initializer.kind === ts.SyntaxKind.FunctionExpression)
            exportsNodes.push(mkNode(`${isFn ? 'const fn ' : 'const '}${nm}${L(d)}`))
          }
        }
        break
      default:
        break
    }
  }
  return { imports, exportsNodes }
}

function buildFileNode(full, name) {
  const parsed = parseFile(full)
  if (!parsed) {
    const n = mkNode(`${name} [parse-error]`)
    return n
  }
  const { imports, exportsNodes } = parsed
  const fnode = mkNode(`${name}  (exp:${exportsNodes.length} imp:${imports.length})`)
  for (const ex of exportsNodes) fnode.children.push(ex)
  if (includeImports && imports.length) {
    const imp = mkNode(`imports (${imports.length})`)
    for (const spec of imports) imp.children.push(mkNode(spec))
    fnode.children.push(imp)
  }
  return fnode
}

function buildDir(dir, label, depth) {
  const node = mkNode(label)
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) }
  catch (e) { return node }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') continue
    if (SKIP_DIRS.has(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (depth + 1 > maxDepth) { node.children.push(mkNode(e.name + '/ …(depth capped)')); continue }
      node.children.push(buildDir(full, e.name + '/', depth + 1))
    } else if (isCodeFile(e.name)) {
      node.children.push(buildFileNode(full, e.name))
    }
  }
  return node
}

// ---- 主流程 ----
const stat = fs.statSync(target)
let root
if (stat.isFile()) {
  const name = basename(target)
  root = mkNode(rootName || name.replace(/\.[^.]+$/, ''))
  root.children.push(buildFileNode(target, name))
} else {
  root = buildDir(target, rootName || basename(target) + '/', 0)
}

// 统计节点数
let count = 0
;(function walk(n) { count++; (n.children || []).forEach(walk) })(root)

// ⚠️ 落盘必须是规范多 sheet 容器形状 {app:'smm-multisheet',…}（与 app 自存格式同一 schema，
// 见工作记忆"写入⇄读取必须同一 schema key"铁律）。曾产出 {type:'mindmap',data:root} 单图，
// 旧版 app 解码后把裸根节点当 sheet.data → 画布回退默认模板 + 自动保存污染写回文件。
const payload = {
  app: 'smm-multisheet',
  version: 1,
  activeId: 'sheet-1',
  sheets: [{ id: 'sheet-1', name: 'Sheet1', data: { root } }]
}
const out = outFile || (basename(target).replace(/\.[^.]+$/, '') + '.smm')
const outPath = resolve(out)
fs.mkdirSync(dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8')

console.log('=== code2mm ===')
console.log('target   : ' + target)
console.log('root     : ' + root.data.text)
console.log('nodes    : ' + count)
console.log('out      : ' + outPath)
console.log('shape    : { app:"smm-multisheet", sheets:[{data:{root}}] }  (app 规范容器形态)')
