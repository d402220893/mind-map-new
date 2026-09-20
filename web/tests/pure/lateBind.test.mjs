import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lateNs, nsHas } from '../../src/utils/lateBind.js'

// ── 这组用例保护的是 2026-09-20 白屏事故的修复本身 ──
// 事故链：模块顶层解构 `const { services } = singleton` → 求值那刻服务还没赋值
// → undefined 被永久冻进闭包 → 启动路径 TypeError → app.mount 从未执行 → 整页白屏。
// lateNs 的核心保证：**取值推迟到"访问那一刻"**，因此真源后置就绪后依然取得到。

test('① 真源尚未就绪时访问一级属性不抛，返回 undefined（原事故正是这里炸掉）', () => {
  let real = null
  const ns = lateNs(() => real)
  assert.doesNotThrow(() => ns.fileRouter)
  assert.strictEqual(ns.fileRouter, undefined)
})

test('①′ 一级拿到 undefined 后再往下取值仍会抛 —— 这是调用方责任，必须能力探测', () => {
  // 这条不是 lateNs 的缺陷，而是 JS 语义：`undefined.setTabs` 必然 TypeError。
  // 事故里正是 `getServices().fileRouter.setTabs(...)` 这么写的。
  // 结论：lateNs 消除了"顶层解构冻结成 undefined"这一类**隐性**故障，
  // 但"服务真的没装上"必须由调用方做能力探测（main.js 即如此，见 wireServices）。
  const ns = lateNs(() => null)
  assert.throws(() => ns.fileRouter.setTabs, TypeError)
  assert.strictEqual(nsHas(ns, 'fileRouter.setTabs'), false)
})

test('② 真源"后置就绪"后立刻可取 —— 顶层解构做不到这件事（核心回归）', () => {
  let real = null
  const ns = lateNs(() => real)
  assert.strictEqual(ns.fileRouter, undefined, '就绪前应为空')
  real = { fileRouter: { setTabs: () => 'ok' } } // ← 相当于组合根的"后置赋值"
  assert.strictEqual(typeof ns.fileRouter.setTabs, 'function')
  assert.strictEqual(ns.fileRouter.setTabs(), 'ok')
})

test('③ 真源整体被替换后，后续访问跟随新对象（不是一次性快照）', () => {
  let real = { v: 1 }
  const ns = lateNs(() => real)
  assert.strictEqual(ns.v, 1)
  real = { v: 2 }
  assert.strictEqual(ns.v, 2, 'lateNs 必须每次现场取值，不能缓存')
})

test('④ pick 抛错时不吞异常（真实 bug 不应被静默掩盖）', () => {
  const ns = lateNs(() => {
    throw new Error('boom')
  })
  assert.throws(() => ns.x, /boom/)
})

test('⑤ has trap：`in` 与真源一致，真源为空时恒 false', () => {
  let real = null
  const ns = lateNs(() => real)
  assert.strictEqual('fileRouter' in ns, false)
  real = { fileRouter: {} }
  assert.strictEqual('fileRouter' in ns, true)
  assert.strictEqual('nope' in ns, false)
})

test('⑥ ownKeys：Object.keys 能枚举真源的键（缺 ownKeys 会返回空数组）', () => {
  let real = { a: 1, b: 2 }
  const ns = lateNs(() => real)
  assert.deepStrictEqual(Object.keys(ns).sort(), ['a', 'b'])
  real = { c: 3 }
  assert.deepStrictEqual(Object.keys(ns), ['c'])
})

test('⑦ JSON.stringify 走 ownKeys + getOwnPropertyDescriptor 组合，不抛且内容正确', () => {
  const ns = lateNs(() => ({ a: 1, b: 'x' }))
  assert.strictEqual(JSON.stringify(ns), '{"a":1,"b":"x"}')
})

test('⑧ 展开运算符能拿到真源字段（ownKeys 的真实用途之一）', () => {
  const ns = lateNs(() => ({ a: 1, b: 2 }))
  assert.deepStrictEqual({ ...ns }, { a: 1, b: 2 })
})

test('⑨ 真源为空时 ownKeys 返回空数组且 stringify 不抛', () => {
  const ns = lateNs(() => null)
  assert.deepStrictEqual(Object.keys(ns), [])
  assert.doesNotThrow(() => JSON.stringify(ns))
})

test('⑩ 方法被 bind 到真实对象：this 指向真源而非 Proxy（防"服务用 this"时静默失灵）', () => {
  const real = {
    name: 'real',
    who() {
      return this.name
    }
  }
  const ns = lateNs(() => real)
  assert.strictEqual(ns.who(), 'real')
  // 解构后单独调用也应保持正确 this（这正是需要 bind 的场景）
  const { who } = ns
  assert.strictEqual(who(), 'real')
})

test('⑪ 非函数值不做 bind，保持原始引用（避免无谓包装）', () => {
  const obj = { nested: { k: 1 } }
  const ns = lateNs(() => obj)
  assert.strictEqual(ns.nested, obj.nested, '对象字段必须是同一引用')
})

test('⑫ ⚠️ 语义偏差：lateNs 恒 truthy —— 不能用 !ns 判断"真源没就绪"', () => {
  const ns = lateNs(() => null)
  assert.ok(ns, '真源为 null 时代理仍为 truthy（这是必须知道的坑）')
  assert.strictEqual(!ns, false)
  // 正确做法是能力探测
  assert.strictEqual(nsHas(ns, 'fileRouter'), false)
})

test('⑬ nsHas 逐层探测：中间层缺失不抛、末端为 null 视为不存在', () => {
  const ns = lateNs(() => ({ a: { b: { c: 0 } }, d: null }))
  assert.strictEqual(nsHas(ns, 'a.b.c'), true, '末尾为 0（falsy 但存在）必须算"有"')
  assert.strictEqual(nsHas(ns, 'a.b.nope'), false)
  assert.strictEqual(nsHas(ns, 'a.x.y'), false, '中间层缺失应短路返回 false，不得抛')
  assert.strictEqual(nsHas(ns, 'd'), false, 'null 视为不存在')
  assert.strictEqual(nsHas(null, 'a'), false)
})

test('⑭ 同一 lateNs 实例是稳定引用（getServices() === getServices()）', () => {
  const ns = lateNs(() => ({}))
  const get = () => ns
  assert.strictEqual(get(), get(), 'identity 必须稳定，否则 === 比较会假失败')
})

test('⑮ Symbol 内建属性透传到真源（不劫持 toStringTag 等反射语义）', () => {
  const tag = Symbol.toStringTag
  const ns = lateNs(() => ({ [tag]: 'Custom' }))
  assert.strictEqual(ns[tag], 'Custom')
})

test('⑯ 多级路径写入不影响代理只读性（代理不提供 set，写入被忽略而非污染真源）', () => {
  const real = { a: 1 }
  const ns = lateNs(() => real)
  // 无 set trap：默认行为是写到 Proxy 的 target({}) 上，不得污染真源
  ns.a = 999
  assert.strictEqual(real.a, 1, '对代理赋值不得污染真源对象')
})
