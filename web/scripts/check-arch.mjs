// scripts/check-arch.mjs —— 零依赖架构守卫（§16.4）。
// 只用 node:fs / node:path / node:url + 自写正则解析 import。
// 接入点：web/package.json 的 test 前置（node scripts/check-arch.mjs && node --test）。
//
// 10 类断言：
//   ① 分层 import 白名单（按层 rank + 外部禁用模式）
//   ② 收集 services 内部边（含 L1 同层边，供环检测）
//   ③ L1/L2 不得引用 window / localStorage 全局
//   ④ 服务工厂业务方法签名不得暴露 ctx（B4）
//   ⑤ L4 工厂内部禁用 this（A1）
//   ⑥ 视图层不得直连 IO（含静态/动态 import services/io；新架构视图不得 window.smmApi）
//   ⑦ 组合根不得导出 io 层、不得含 if/switch（R16）
//   ⑧ 依赖环检测（DFS 三色，覆盖全部层含 L1 内部）
//   ⑨ TODO(退场条件:) 数量只减不增（§17.1 / B5）
//   ⑩ 零 mock 指标自动校验（C6，阈值来自 .arch-budget.json）
//   ⑪ `@/api` 具名导入必须真实导出（webpack 只给 warning，漏导出会在运行时炸 → 白屏）

import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, sep } from 'node:path'
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(__dirname, '..')
const SRC = resolve(WEB, 'src')
const SERVICES = resolve(SRC, 'services')
const VIEW_DIRS = [resolve(SRC, 'components'), resolve(SRC, 'pages'), resolve(SRC, 'composables')]
const TEST_DIRS = {
  pure: resolve(WEB, 'tests', 'pure'),
  orchestration: resolve(WEB, 'tests', 'orchestration'),
  regression: resolve(WEB, 'tests', 'regression')
}
const ELECTRON_TESTS = resolve(WEB, '..', 'electron-app', 'tests')
const BUDGET_PATH = resolve(WEB, '.arch-budget.json')
const TODO_SNAP = resolve(WEB, '.arch-todo-snapshot.json')

const failures = []
const warnings = []
function assert(cond, msg) { if (!cond) failures.push(msg) }
function warn(msg) { warnings.push(msg) }
function log(...a) { console.log('[check-arch]', ...a) }

// ── 文件遍历 ──
function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue
    const p = resolve(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) out.push(...walk(p))
    else if (/\.(js|mjs|vue)$/.test(name)) out.push(p)
  }
  return out
}

// ── 层判定 ──
const RANK = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4, CG: 5 }
const L1_FILES = new Set([
  'errors.js', 'hash.js', 'sectionParser.js', 'sectionWriter.js', 'linkResolver.js',
  'refData.js', 'conflictStrategies.js', 'commandRegistry.js', 'smmCodec.js'
])
function layerOf(file) {
  const rel = relative(SERVICES, file).split(sep).join('/')
  if (rel === 'index.js') return 'CG'
  if (rel.startsWith('migrations/')) return 'CG'
  const base = rel.split('/').pop()
  if (base === 'events.js' || base === 'logger.js' || base === 'context.js') return 'L0'
  if (L1_FILES.has(base)) return 'L1'
  if (rel.startsWith('state/')) return 'L2'
  if (rel.startsWith('io/')) return 'L3'
  return 'L4'
}

// 剥离注释后再做"全局引用"类断言，避免注释里的 localStorage / window 误报
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

// ── import 解析 ──
const IMPORT_RE = /(?:import\s+(?:[^'"]*?\s+from\s+)?|import\s*\(\s*|export\s+[^'"]*?\s+from\s+)(['"])([^'"]+)\1/g
function parseImports(src) {
  const specs = []
  let m
  while ((m = IMPORT_RE.exec(src))) specs.push(m[2])
  return specs
}
function resolveSpec(spec, file) {
  if (!spec.startsWith('.')) return null // 外部（node_modules / @/ / vue / 内置）
  let cand = resolve(dirname(file), spec)
  const cands = [cand + '.js', cand + '.mjs', cand, resolve(cand, 'index.js')]
  for (const c of cands) if (existsSync(c) && statSync(c).isFile()) return c
  return null
}

// ── ① 分层 import 白名单 ──
function forbiddenService(tl, sl) {
  if (sl === 'L0') return tl !== 'L0'
  if (sl === 'L1') return tl !== 'L1'
  if (sl === 'L2') return !(tl === 'L0' || tl === 'L1' || tl === 'L2')
  if (sl === 'L3') return !(tl === 'L0' || tl === 'L1' || tl === 'L3')
  return false // L4 / CG 允许全部服务层（ring 单独查）
}
const EXTERNAL_FORBIDDEN = /(^vue$)|(\.vue$)|(^@\/store)|(^@\/router)/
function checkExternal(spec, sl, file) {
  if (EXTERNAL_FORBIDDEN.test(spec)) return assert(false, `${file} 层${sl} 禁止 import ${spec}`)
  // L1/L2/L3 不得用 @/services（须相对导入，避免绕层）
  if (spec.startsWith('@/services') && (sl === 'L1' || sl === 'L2' || sl === 'L3')) {
    assert(false, `${file} 层${sl} 不得用 @/services（须相对导入）`)
  }
}

const EDGES = new Map()
const serviceFiles = walk(SERVICES)

for (const file of serviceFiles) {
  const layer = layerOf(file)
  const src = readFileSync(file, 'utf8')
  const base = relative(SERVICES, file).split('/').pop()
  for (const spec of parseImports(src)) {
    checkExternal(spec, layer, file)
    const target = resolveSpec(spec, file)
    if (target && target.startsWith(SERVICES + sep)) {
      const tl = layerOf(target)
      const tbase = relative(SERVICES, target).split('/').pop()
      // ring：refService → revisionService 禁止（v1.0 双向环）
      if (base === 'refService.js' && tbase === 'revisionService.js') {
        assert(false, `${file} 不得 import revisionService（破 v1.0 双向环）`)
      }
      if (forbiddenService(tl, layer)) {
        assert(false, `${file}（${layer}）违规 import ${relative(SERVICES, target)}（${tl}）`)
      }
      if (!EDGES.has(file)) EDGES.set(file, [])
      EDGES.get(file).push(target)
    }
  }
  // ③ L1/L2 不得引用 window / localStorage 全局（剥离注释后判断）
  if (layer === 'L1' || layer === 'L2') {
    const code = stripComments(src)
    assert(!/\bwindow\./.test(code), `${file} 层${layer} 不得引用 window 全局`)
    assert(!/\blocalStorage\b/.test(code), `${file} 层${layer} 不得引用 localStorage`)
  }
  // ④ 工厂业务方法签名不得暴露 ctx（context.js 除外）
  if (layer !== 'CG' && !/context\.js$/.test(file)) {
    assert(!/export\s+(async\s+)?function\s+\w+\s*\([^)]*\bctx\b/.test(src),
      `${file} 服务工厂签名之外不得把 ctx 作为业务方法参数`)
  }
  // ⑤ L4 工厂内部禁用 this
  if (layer === 'L4') assert(!/\bthis\./.test(src), `${file} L4 工厂内部不得使用 this（请改闭包）`)
}

// ⑥ 视图层不得直连 IO
for (const vdir of VIEW_DIRS) {
  for (const vf of walk(vdir)) {
    const vsrc = readFileSync(vf, 'utf8')
    const relv = relative(SRC, vf)
    assert(!/from\s+['"][^'"]*services\/io\//.test(vsrc), `${relv} 视图层静态 import IO（services/io）`)
    assert(!/import\(\s*['"][^'"]*services\/io\//.test(vsrc), `${relv} 视图层动态 import IO（services/io）`)
    const optsIntoNew = /from\s+['"]@\/services['"]/.test(vsrc)
    if (optsIntoNew && /\bwindow\.smmApi\b/.test(vsrc)) {
      assert(false, `${relv} 已接入 @/services 却仍直调 window.smmApi（须改走 io/fsApi）`)
    } else if (/\bwindow\.smmApi\b/.test(vsrc)) {
      // 遗留视图（未接入 @/services）：记为待迁移软债务，不阻断 P0
      warn(`${relv} 遗留 window.smmApi 直调（待迁移至 io/fsApi）`)
    }
  }
}

// ⑦ 组合根（index.js）约束
const cgPath = resolve(SERVICES, 'index.js')
if (existsSync(cgPath)) {
  const cg = readFileSync(cgPath, 'utf8')
  assert(!/export[\s\S]{0,80}\bfsApi\b/.test(cg), '组合根不得导出 fsApi（视图须经 services 间接访问）')
  assert(!/\bif\s*\(|\bswitch\s*\(/.test(cg), '组合根只装配，不得含条件分支（R16）')
}

// ⑧ 依赖环检测（DFS 三色）
const COLOR = new Map()
let cyclePath = null
function dfs(u, stack) {
  COLOR.set(u, 1)
  stack.push(u)
  for (const v of (EDGES.get(u) || [])) {
    if (!COLOR.has(v)) { if (dfs(v, stack)) return true }
    else if (COLOR.get(v) === 1) { cyclePath = [...stack, v]; return true }
  }
  COLOR.set(u, 2)
  stack.pop()
  return false
}
for (const u of EDGES.keys()) if (!COLOR.has(u)) { if (dfs(u, [])) break }
assert(!cyclePath, `检测到依赖环：${cyclePath && cyclePath.map(f => relative(SERVICES, f)).join(' → ')}`)

// ⑨ TODO(退场条件:) 数量只减不增
const todoRe = /TODO\(退场条件:/g
const todoCount = walk(SRC).reduce((n, f) => n + (readFileSync(f, 'utf8').match(todoRe) || []).length, 0)
let snap = null
if (existsSync(TODO_SNAP)) { try { snap = JSON.parse(readFileSync(TODO_SNAP, 'utf8')) } catch {} }
if (snap && todoCount > snap.count) {
  assert(false, `TODO(退场条件) 数量增加：${snap.count} → ${todoCount}（新增临时实现必须先登记退场条件）`)
}
writeFileSync(TODO_SNAP, JSON.stringify({ count: todoCount, at: Date.now() }, null, 2))
log('arch.todos', { count: todoCount })

// ⑩ 零 mock 指标自动校验（阈值来自 .arch-budget.json）
let budget = { pureMin: 160, totalMin: 227, pureRatioMin: 0.70 }
if (existsSync(BUDGET_PATH)) { try { budget = { ...budget, ...JSON.parse(readFileSync(BUDGET_PATH, 'utf8')) } } catch {} }
function countTests(dir) {
  return walk(dir).reduce((n, f) => n + (readFileSync(f, 'utf8').match(/(^|\s)test\s*\(/g) || []).length, 0)
}
const n = {
  pure: countTests(TEST_DIRS.pure),
  orchestration: countTests(TEST_DIRS.orchestration),
  regression: countTests(TEST_DIRS.regression),
  electron: existsSync(ELECTRON_TESTS) ? countTests(ELECTRON_TESTS) : 0
}
// ⚠️ 分母口径（详设 §11.2 明确定义）：`本轮新增用例数` = 四层用例总和 **减去既有基线**。
// 不扣基线会让"pure 占新增 ≥70%"这个比例随无关层的膨胀而结构性不可达，
// 逼实现者写凑数用例（方向相反）。基线数字落在 .arch-budget.json 的 `baseline`。
const base = budget.baseline || { pure: 0, orchestration: 0, regression: 0, electron: 0 }
const added = {
  pure: Math.max(0, n.pure - (base.pure || 0)),
  orchestration: Math.max(0, n.orchestration - (base.orchestration || 0)),
  regression: Math.max(0, n.regression - (base.regression || 0)),
  electron: Math.max(0, n.electron - (base.electron || 0))
}
const addedTotal = added.pure + added.orchestration + added.regression + added.electron
const MOCK_RE = /\b(mock|jsdom|sinon|jest\.fn)\b/
for (const f of walk(TEST_DIRS.pure)) {
  // ⚠️ 先剥注释：注释里写"不依赖任何 mock"是说明文字，不是依赖。
  // 不剥注释会让"写清楚为什么零 mock"反而触发失败（鼓励删注释，方向相反）。
  const code = readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/[^\n]*$/gm, '')
  assert(!MOCK_RE.test(code), `${relative(WEB, f)} pure/ 出现 mock 依赖`)
}
assert(n.pure >= budget.pureMin, `pure/ 用例不足：${n.pure} < ${budget.pureMin}`)
assert(addedTotal >= budget.totalMin, `本轮新增用例不足：${addedTotal} < ${budget.totalMin}`)
assert(added.orchestration >= (budget.orchestrationMin || 0), `新增 orchestration 用例不足：${added.orchestration} < ${budget.orchestrationMin}`)
assert(added.regression >= (budget.regressionMin || 0), `新增 regression 用例不足：${added.regression} < ${budget.regressionMin}`)
assert(added.electron >= (budget.electronMin || 0), `新增 electron 用例不足：${added.electron} < ${budget.electronMin}`)
assert(added.pure / Math.max(1, addedTotal) >= budget.pureRatioMin, `pure/ 占新增不足：${added.pure}/${addedTotal} < ${budget.pureRatioMin}`)
log('test.budget', {
  ...n,
  baseline: base,
  added,
  addedTotal,
  pureRatio: +(added.pure / Math.max(1, addedTotal)).toFixed(4)
})

// ⑪ `@/api` 的具名导入必须真实存在
// 背景：webpack 对「导入了不存在的具名导出」只给一条 warning（**不进退出码**），产物照常产出。
// 于是漏导出会一路溜到运行时 —— 调用点一执行就是 `TypeError: x.y is not a function`；
// 若调用点在启动路径上（main.js / 视图 created），表现就是**白屏**。
// 这条真实漏过 `getKind`（视图据此决定渲染导图还是 md 编辑器）。
{
  const API_DIR = resolve(SRC, 'api')
  const API_INDEX = resolve(API_DIR, 'index.js')
  if (existsSync(API_INDEX)) {
    const apiText = readFileSync(API_INDEX, 'utf8')
    const exported = new Set()
    for (const m of apiText.matchAll(/export\s+(?:async\s+)?(?:const|function|let|var)\s+([A-Za-z0-9_$]+)/g)) {
      exported.add(m[1])
    }
    for (const m of apiText.matchAll(/export\s*\{([^}]+)\}/g)) {
      for (const raw of m[1].split(',')) {
        const parts = raw.trim().split(/\s+as\s+/)
        const name = (parts.length > 1 ? parts[1] : parts[0]).trim()
        if (name) exported.add(name)
      }
    }
    const missing = []
    for (const f of walk(SRC)) {
      if (f.startsWith(API_DIR + sep)) continue
      const text = readFileSync(f, 'utf8')
      for (const m of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*'@\/api'/g)) {
        for (const raw of m[1].split(',')) {
          const name = raw.trim().split(/\s+as\s+/)[0].trim()
          if (name && !exported.has(name)) missing.push(`${name} ← ${relative(SRC, f).replace(/\\/g, '/')}`)
        }
      }
    }
    assert(!missing.length, `@/api 缺少导出（webpack 只给 warning，运行时才炸）：${[...new Set(missing)].join(', ')}`)
    log('api.exports', { exported: exported.size, missing: 0 })
  }
}

// ⑫ 全 src/ 无 import 环（服务层之外的环同样是致命的）
// 为什么必须查：ESM 环会让某个模块在被求值时，其依赖的绑定仍是 undefined。
// dev 模式（webpack-dev-server 的懒编译）求值顺序常与生产包不同 → 本地正常、打包后白屏。
// 2026-09-20 白屏事故的机制就是「组合根先建对象、后置赋值 + 桥顶层解构」，
// 顶层解构把 undefined 冻进闭包 → getServices() 恒 undefined → 启动路径 TypeError → 白屏。
{
  const files = walk(SRC)
  const fileset = new Set(files)
  const resolveSpec = (spec, fromFile) => {
    let base = null
    if (spec.startsWith('@/')) base = resolve(SRC, spec.slice(2))
    else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
    else return null
    for (const c of [base, base + '.js', base + '.mjs', base + '.vue', resolve(base, 'index.js'), resolve(base, 'index.vue')]) {
      if (fileset.has(c)) return c
    }
    return null
  }
  const RE_IMPORT = /(?:^|\n)\s*(?:import|export)\s[^\n]*?from\s*['"]([^'"]+)['"]/g
  const RE_DYN = /import\(\s*['"]([^'"]+)['"]\s*\)/g
  const graph = new Map()
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    const deps = new Set()
    for (const re of [RE_IMPORT, RE_DYN]) {
      for (const m of src.matchAll(re)) {
        const r = resolveSpec(m[1], f)
        if (r) deps.add(r)
      }
    }
    graph.set(f, deps)
  }
  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map(files.map(f => [f, WHITE]))
  const stack = []
  const cycles = []
  const dfs = u => {
    color.set(u, GRAY); stack.push(u)
    for (const v of graph.get(u) || []) {
      if (color.get(v) === GRAY) cycles.push(stack.slice(stack.indexOf(v)).concat(v))
      else if (color.get(v) === WHITE) dfs(v)
    }
    stack.pop(); color.set(u, BLACK)
  }
  for (const f of files) if (color.get(f) === WHITE) dfs(f)

  // 既有 legacy 环（api/index.js ⇄ store.js）已于 2026-09-20 通过抽出
  // web/src/api/localConfig.js 彻底消除（store.js 改 import @/api/localConfig）。
  // 因此不再冻结任何环：现网应零环，任何环（含该 legacy 环复发）一律硬失败。
  const FROZEN_CYCLES = []
  const relOf = p => relative(SRC, p).split(sep).join('/')
  const bad = []
  const seen = new Set()
  for (const c of cycles) {
    const key = [...new Set(c.map(relOf))].sort().join('|')
    if (seen.has(key)) continue
    seen.add(key)
    if (FROZEN_CYCLES.includes(key)) continue
    bad.push(c.map(relOf).join(' → '))
  }
  assert(!bad.length, `新增 import 环（环会让绑定在求值期为 undefined → 生产包白屏）：${bad.join(' ； ')}`)
  // 新架构（services/ 与桥）绝不允许出现在任何环里
  const archInCycle = [...seen].filter(k => FROZEN_CYCLES.indexOf(k) < 0).concat(
    [...seen].filter(k => k.includes('utils/workspaceBridge.js') || k.includes('services/'))
  )
  assert(!archInCycle.length, `新架构模块不得处于 import 环中：${archInCycle.join(' ； ')}`)
  log('import.cycles', { modules: files.length, cycles: seen.size, frozen: FROZEN_CYCLES.length })
}

// ⑬ 全 src/ 的本地具名导入必须真实存在（⑪ 的推广：不止 @/api）
// webpack 对「导入了不存在的具名导出」只给 warning，不进退出码；
// 调用点一执行就是 TypeError —— 落在启动路径上就是白屏。
{
  const files = walk(SRC)
  const fileset = new Set(files)
  const relOf = p => relative(SRC, p).split(sep).join('/')
  const resolveSpec = (spec, fromFile) => {
    let base = null
    if (spec.startsWith('@/')) base = resolve(SRC, spec.slice(2))
    else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
    else return null
    for (const c of [base, base + '.js', base + '.mjs', base + '.vue', resolve(base, 'index.js'), resolve(base, 'index.vue')]) {
      if (fileset.has(c)) return c
    }
    return null
  }
  const stripComments = s =>
    s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/[^\n]*$/gm, ' ')
  const exportCache = new Map()
  const collectExports = (file, seen = new Set()) => {
    if (exportCache.has(file)) return exportCache.get(file)
    const names = new Set()
    if (seen.has(file)) return names
    seen.add(file)
    const src = stripComments(readFileSync(file, 'utf8'))
    for (const m of src.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1])
    for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
      for (const raw of m[1].split(',')) {
        const t = raw.trim()
        if (!t) continue
        const parts = t.split(/\s+as\s+/)
        const out = (parts.length > 1 ? parts[1] : parts[0]).trim()
        if (out) names.add(out)
      }
    }
    for (const m of src.matchAll(/export\s*\*\s*from\s*['"]([^'"]+)['"]/g)) {
      const t = resolveSpec(m[1], file)
      if (t) for (const n of collectExports(t, seen)) names.add(n)
    }
    exportCache.set(file, names)
    return names
  }
  const missing = []
  for (const f of files) {
    const src = stripComments(readFileSync(f, 'utf8'))
    for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
      const target = resolveSpec(m[2], f)
      if (!target) continue
      const names = collectExports(target)
      for (const raw of m[1].split(',')) {
        const t = raw.trim()
        if (!t) continue
        const imported = t.split(/\s+as\s+/)[0].trim()
        if (imported && !names.has(imported)) {
          missing.push(`${imported} ← ${relOf(f)} (from ${relOf(target)})`)
        }
      }
    }
  }
  assert(!missing.length, `导入了不存在的具名导出（webpack 只 warning，运行时 TypeError）：${[...new Set(missing)].join(' ; ')}`)
  log('local.imports', { checked: files.length, missing: 0 })
}

// ── 结果 ──
if (failures.length) {
  console.error('\n✗ check-arch 失败（' + failures.length + ' 项）：')
  for (const f of failures) console.error('  - ' + f)
  if (warnings.length) { console.error('\n⚠ 待迁移债务（' + warnings.length + ' 项，不阻断）：'); for (const w of warnings) console.error('  - ' + w) }
  process.exit(1)
}
// ⚠️ EDGES 是 Map，Object.keys(Map) 恒为 [] —— 必须用 size，否则日志永远显示 0 modules
console.log('check-arch OK:', EDGES.size, 'modules with service edges, 0 cycles,', todoCount, 'pending-TODOs, new tests', addedTotal)
if (warnings.length) console.log('⚠ 待迁移债务（不阻断）：', warnings.length, '项 window.smmApi 直调（遗留视图）')
