// §11.3 legacy 桥守卫（零运行，只读源码）。
// 目标：**新功能一律走 CommandBus / services**，不得再往老 `$bus` 直发命令，
// 也不得让 legacy 命令表继续膨胀（膨胀 = 新功能被悄悄写进旧路径）。
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = new URL('../../src/', import.meta.url)

function walk(dir) {
  const out = []
  const base = dir instanceof URL ? fileURLToPath(dir) : dir
  if (!existsSync(base)) return out
  for (const name of readdirSync(base)) {
    const p = resolve(base, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(vue|js)$/.test(name)) out.push(p)
  }
  return out
}

// ⚠️ 债务冻结表：这两个文件是尚未迁移的 legacy 工具栏/右键菜单，它们直发老 `$bus` 的
// execCommand。**不要求本轮清完**（迁移量 200+ 按钮，风险远大于收益），但要求：
//   ① 除这两个文件外，不得再出现任何直发 execCommand 的视图；
//   ② 这两个文件自己的调用点数不得增长（增长 = 新功能又写进老路径）。
// 迁移一个掉一个：删完这里就能改成 requireEmpty。
const LEGACY_EXEC_DEBT = {
  'Contextmenu.vue': 3,
  'ToolbarNodeBtnList.vue': 8
}

test('① 视图不得通过 $bus 直发 execCommand（除已冻结的 legacy 债务，且债不得增长）', () => {
  const seen = {}
  for (const f of walk(new URL('../../src/pages/', import.meta.url))) {
    const src = readFileSync(f, 'utf8')
    const n = (src.match(/\$emit\(\s*['"]execCommand['"]/g) || []).length
    if (!n) continue
    const name = f.replace(/\\/g, '/').split('/').pop()
    seen[name] = (seen[name] || 0) + n
  }
  const newOffenders = Object.keys(seen).filter(k => !(k in LEGACY_EXEC_DEBT))
  assert.deepStrictEqual(newOffenders, [], '新视图应改用 commandBus.execute()：' + newOffenders.join(', '))
  for (const [name, frozen] of Object.entries(LEGACY_EXEC_DEBT)) {
    assert.ok((seen[name] || 0) <= frozen, `${name} 的 legacy execCommand 调用点增长到 ${seen[name] || 0}（冻结值 ${frozen}）：新功能不得写进老路径`)
  }
})

test('② 新增 md 视图不得再往老 $bus 上注册全局 DOM 级命令', () => {
  const mdViews = ['MdEditor.vue', 'MdToolbar.vue', 'MdOutline.vue', 'RefBlock.vue', 'SectionPicker.vue', 'StatusBar.vue']
  const base = new URL('../../src/pages/Edit/components/', import.meta.url)
  const offenders = []
  for (const f of mdViews) {
    const p = new URL(f, base)
    if (!existsSync(p)) continue
    const src = readFileSync(p, 'utf8')
    // 只允许 $bus 做"视图内部协作"（如 md:exec 下发），不允许直发老命令总线语义
    if (/\$bus\.\$emit\(\s*['"](execCommand|exec|command)['"]/.test(src)) offenders.push(f)
  }
  assert.deepStrictEqual(offenders, [], 'md 视图不得直发老命令总线：' + offenders.join(', '))
})

test('③ legacy 命令表（commandRegistry 里 legacy:true）数量不得继续增长', () => {
  const src = readFileSync(new URL('../../src/services/commandRegistry.js', import.meta.url), 'utf8')
  const n = (src.match(/legacy\s*:\s*true/g) || []).length
  assert.ok(n <= 12, `legacy 命令数 ${n} 超过上限 12：新功能应走 CommandBus，不得挂到 legacy 表`)
})

test('④ 组合根不得 import legacy 桥（服务层不得反向依赖老实现）', () => {
  const src = readFileSync(new URL('../../src/services/index.js', import.meta.url), 'utf8')
  assert.strictEqual(/legacy/i.test(src.replace(/\/\/[^\n]*/g, '')), false, '组合根不得引用 legacy 模块')
})

test('⑤ 桥接层（workspaceBridge）是视图与服务层之间唯一通道：视图不得直接 import services 单例', () => {
  const offenders = []
  for (const f of walk(new URL('../../src/pages/', import.meta.url))) {
    const src = readFileSync(f, 'utf8')
    if (/from\s+['"]@\/services['"]/.test(src) || /from\s+['"][^'"]*services\/index\.js['"]/.test(src)) {
      offenders.push(f)
    }
  }
  assert.deepStrictEqual(offenders, [], '视图应经 @/utils/workspaceBridge 访问服务：' + offenders.join(', '))
})

test('⑥ 视图不得直调 window.smmApi（唯一出口是 bridge 的 shell 网关）', () => {
  const offenders = []
  for (const f of walk(new URL('../../src/', import.meta.url))) {
    const rel = f.replace(/\\/g, '/')
    if (rel.includes('/src/utils/workspaceBridge.js')) continue // 网关本身是实现点，天然允许
    if (rel.includes('/src/services/')) continue // io 层本来就要拿宿主能力（fsApi 等）
    const src = readFileSync(f, 'utf8')
    if (/window\.smmApi\b/.test(src)) offenders.push(rel.split('/src/')[1])
  }
  assert.deepStrictEqual(
    offenders, [],
    '视图必须经 bridge 的 shell 网关（否则网页端/单测环境漏判空即崩）：' + offenders.join(', ')
  )
})

// ⚠️ 以下三条只能做源码断言：workspaceBridge 用 `@/` webpack 别名 + 引入 .vue，
// Node 的 ESM 解析器跑不起来（这也是它落在 regression 而不是 orchestration 的原因）。
function bridgeSrc() {
  return readFileSync(new URL('../../src/utils/workspaceBridge.js', import.meta.url), 'utf8')
}

test('⑦ shell 网关暴露视图所需的全部宿主能力（删一个能力 = 某处按钮静默失效）', () => {
  const src = bridgeSrc()
  const required = [
    'available', 'has', 'writeFile', 'writeFileSync', 'saveWorkbook',
    'openWorkbookDialog', 'importFileDialog', 'renameFile', 'setTitle', 'onMenuCommand'
  ]
  for (const m of required) {
    assert.ok(new RegExp('\\b' + m + '\\s*[(:]').test(src), 'shell 缺少能力 ' + m)
  }
  for (const m of ['has', 'getState', 'minimize', 'maximize', 'close']) {
    assert.ok(new RegExp('\\b' + m + '\\s*[(:]').test(src), 'shell.windowControls 缺少 ' + m)
  }
  assert.ok(/windowControls\s*:/.test(src), '必须提供 windowControls 子网关')
})

test('⑧ writeFileSync 必须保持同步语义（退出前落盘不允许退化成 Promise）', () => {
  const src = bridgeSrc()
  // 取 writeFileSync 的能力体（到下一个同级成员为止）
  const i = src.indexOf('writeFileSync(')
  assert.ok(i > 0, 'shell 必须提供 writeFileSync')
  const body = src.slice(i, src.indexOf('saveWorkbook(', i))
  assert.strictEqual(
    /Promise\.resolve/.test(body), false,
    'writeFileSync 不得包成 Promise：调用方在窗口销毁前同步写盘，异步写会被直接丢弃导致丢数据'
  )
  assert.ok(/ok:\s*false/.test(body), '缺宿主时必须返回 Result 形状而不是抛/返回 undefined')
})

test('⑨ 无宿主环境时能力判定与调用都安全降级（网页端不崩）', () => {
  const src = bridgeSrc()
  // hostApi() 必须做存在性判定；hostCall 必须在缺能力时返回 Result 而非抛出
  assert.ok(/typeof window !== 'undefined'/.test(src), 'hostApi 必须判 window 是否存在')
  assert.ok(/E_NO_SHELL/.test(src), '缺宿主/缺能力时必须返回 E_NO_SHELL 而非抛异常')
  assert.ok(/catch\s*\(/.test(src.slice(src.indexOf('function hostCall'), src.indexOf('function hostWindowCall'))), 'hostCall 必须 try/catch 兜住宿主抛错')
})

// ── 模块求值顺序守卫（2026-09-20 白屏事故）────────────────────────────
// 事故链：组合根"先建对象、后置赋值 services" + 桥在**模块顶层**解构 singleton
//   → 解构发生在 services 赋值之前 → `services` 被永久冻结成 undefined
//   → main.js 启动路径 `services.fileRouter.setTabs(...)` 立刻 TypeError
//   → 而此刻 app.mount 尚未执行 → 整页白屏且页面上一无所获（只能翻 renderer.log）。
// dev 模式求值顺序常与生产包不同，本地看着一切正常。
test('⑩ 桥不得在模块顶层解构/直取服务单例（求值顺序一变就永久 undefined）', () => {
  const src = bridgeSrc()
  const offenders = []
  for (const raw of src.split('\n')) {
    const code = raw.replace(/\/\/.*$/, '')
    // 反例：const { services, events, log } = singleton
    if (/^\s*(export\s+)?const\s*\{[^}]*\}\s*=\s*singleton\b/.test(code)) offenders.push(raw.trim())
    // 反例：export const mdDoc = singleton.services.mdDocument
    if (/^\s*export\s+const\s+[A-Za-z0-9_$]+\s*=\s*singleton\./.test(code)) offenders.push(raw.trim())
  }
  assert.deepStrictEqual(offenders, [], '必须改为延迟取值（lateNs）：' + offenders.join(' | '))
})

test('⑪ 桥的 services/events/log/mdDoc 必须经 lateNs 延迟绑定', () => {
  const src = bridgeSrc()
  // lateNs 实现已抽到 ./lateBind.js（便于单测）：桥必须真的把它 import 进来，
  // 而不是自行实现一份（复制粘贴会各自漂移，且逃过 lateBind 的单测覆盖）。
  assert.ok(/from\s+'\.\/lateBind\.js'/.test(src), '必须从 ./lateBind.js 引入延迟绑定实现')
  assert.ok(/import\s*\{[^}]*\blateNs\b[^}]*\}\s*from\s*'\.\/lateBind\.js'/.test(src), '必须具名引入 lateNs')
  for (const name of ['services', 'events', 'log', 'mdDoc']) {
    assert.ok(
      new RegExp('(const|export const)\\s+' + name + '\\s*=\\s*lateNs\\(').test(src),
      name + ' 必须用 lateNs 延迟绑定（直取会在求值顺序变化时变成 undefined）'
    )
  }
})

test('⑫ lateNs 实现必须保留完整 trap（缺 ownKeys 会让 Object.keys/JSON 静默为空）', () => {
  // get/has 是最小实现，但 Object.keys、展开运算符、JSON.stringify 依赖 ownKeys +
  // getOwnPropertyDescriptor；漏掉会让"看着能用、边界处诡异"。
  const impl = readFileSync(new URL('../../src/utils/lateBind.js', import.meta.url), 'utf8')
  for (const trap of ['get(', 'has(', 'ownKeys(', 'getOwnPropertyDescriptor(']) {
    assert.ok(impl.includes(trap), 'lateNs 缺少 trap: ' + trap)
  }
  // 函数必须 bind 到真实对象，否则"服务内部用 this"会静默失灵
  assert.ok(/\.bind\(target\)/.test(impl), '方法必须 bind 到真源对象')
})

test('⑬ lateNs 必须只被"绑定"使用，不得对 singleton 做任何顶层属性读取', () => {
  const src = bridgeSrc()
  const offenders = []
  for (const raw of src.split('\n')) {
    const code = raw.replace(/\/\/.*$/, '')
    // 反例：任何 `singleton.` 出现在顶层 const/let/var 初始化里（lateNs 的 pick 回调除外，
    // 但 pick 是箭头函数参数位置 `lateNs(() => singleton && ...)`，不匹配此处模式）
    if (/^\s*(export\s+)?(const|let|var)\s+[A-Za-z0-9_$]+\s*=\s*singleton\b/.test(code)) {
      offenders.push(raw.trim())
    }
  }
  assert.deepStrictEqual(offenders, [], '顶层直取 singleton 会冻结求值结果：' + offenders.join(' | '))
})
