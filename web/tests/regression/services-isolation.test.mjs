// §11.3 分层隔离守卫（零运行，只读源码）。
// 与 scripts/check-arch.mjs 的覆盖关系：check-arch 是"构建期总闸"，本文件把它最关键的三条
// 固化成 `npm test` 内的回归用例 —— 万一有人改守卫、或本地跳过守卫，这里仍会红。
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = new URL('../../src/', import.meta.url)
const SERVICES = new URL('../../src/services/', import.meta.url)

function walk(dir) {
  const out = []
  const base = dir instanceof URL ? fileURLToPath(dir) : dir
  if (!existsSync(base)) return out
  for (const name of readdirSync(base)) {
    const p = resolve(base, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(js|vue)$/.test(name)) out.push(p)
  }
  return out
}

function importsOf(file) {
  const src = readFileSync(file, 'utf8')
  const out = []
  const re = /(?:^|\n)\s*import\s[^'"]*['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(src))) out.push(m[1])
  return out
}

const REL = f => String(f).replace(/\\/g, '/')

test('① refService 不得 import revisionService（破 v1.0 双向环）', () => {
  const src = readFileSync(new URL('refService.js', SERVICES), 'utf8')
  assert.strictEqual(/from\s+['"]\.\/revisionService/.test(src), false, 'refService → revisionService 会产生双向环')
})

test('② L1 纯函数层不得 import L2/L3/L4（保持可单测、零 IO）', () => {
  const L1 = ['errors.js', 'hash.js', 'sectionParser.js', 'sectionWriter.js', 'linkResolver.js',
    'refData.js', 'conflictStrategies.js', 'commandRegistry.js', 'smmCodec.js', 'context.js']
  const FORBIDDEN = /from\s+['"][^'"]*(\.\/state\/|\.\/io\/|workspaceService|revisionService|refService|fileRouter|mdDocument|workspaceIndex|fsApi)/
  for (const f of L1) {
    const p = new URL(f, SERVICES)
    if (!existsSync(p)) continue
    const src = readFileSync(p, 'utf8')
    assert.strictEqual(FORBIDDEN.test(src), false, `${f} 作为 L1 不得依赖上层/IO`)
  }
})

test('③ 视图层不得直接 import services/io（唯一 IO 出口经 L4 服务）', () => {
  const views = walk(new URL('../../src/pages/', import.meta.url))
  for (const f of views) {
    const src = readFileSync(f, 'utf8')
    const bad = /from\s+['"][^'"]*(services\/io\/|services\/io['"])/.test(src)
    assert.strictEqual(bad, false, `${REL(f)} 不得直连 services/io`)
  }
})

test('④ services/ 内不存在"模块级 import 环"（DFS 三色）', () => {
  const files = walk(SERVICES).filter(f => f.endsWith('.js'))
  const graph = new Map()
  for (const f of files) {
    const dir = resolve(f, '..')
    const edges = importsOf(f)
      .filter(s => s.startsWith('.'))
      .map(s => resolve(dir, s))
      .filter(p => files.includes(p))
    graph.set(f, edges)
  }
  const color = new Map() // 0 白 / 1 灰 / 2 黑
  const stack = []
  let cycle = null
  const dfs = (node) => {
    color.set(node, 1)
    stack.push(node)
    for (const next of (graph.get(node) || [])) {
      const c = color.get(next) || 0
      if (c === 1) { cycle = [...stack.slice(stack.indexOf(next)), next]; return }
      if (c === 0) { dfs(next); if (cycle) return }
    }
    stack.pop()
    color.set(node, 2)
  }
  for (const f of files) if (!color.get(f)) { dfs(f); if (cycle) break }
  assert.strictEqual(cycle, null, '存在依赖环：' + (cycle || []).map(p => REL(p).split('/services/')[1]).join(' → '))
})

test('⑤ 组合根不得导出 io 层（视图不得经组合根绕过服务层）', async () => {
  const mod = await import('../../src/services/index.js')
  const s = mod.createServices()
  assert.strictEqual(s.io, undefined)
  assert.strictEqual(s.fsApi, undefined)
  assert.strictEqual(s.workspaceIndex, undefined)
})

test('⑥ 组合根不得含 if / switch（CG 零分支纪律）', () => {
  const src = readFileSync(new URL('index.js', SERVICES), 'utf8')
  const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  assert.strictEqual(/\bif\s*\(/.test(code), false)
  assert.strictEqual(/\bswitch\s*\(/.test(code), false)
})
