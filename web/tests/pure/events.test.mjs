import { test } from 'node:test'
import assert from 'node:assert'
import { EVT, createEventBus } from '../../src/services/events.js'

// ── 常量表（§7.8 与本文件必须同步）──
test('EVT 声明工作区事件', () => {
  assert.ok(EVT.WS_OPENED && EVT.WS_CLOSED && EVT.WS_TREE_CHANGED)
})
test('EVT 声明文件语义事件', () => {
  assert.ok(EVT.FS_ADD && EVT.FS_CHANGE && EVT.FS_UNLINK)
})
test('EVT 声明引用事件', () => {
  assert.ok(EVT.REF_ADDED && EVT.REF_REMOVED && EVT.REF_SNAPSHOT_SYNCED)
})
test('EVT 声明章节事件', () => {
  assert.ok(EVT.SECTION_COMMITTED && EVT.SECTION_UPDATED && EVT.SECTION_MISSING)
})
test('EVT 声明导航事件', () => {
  assert.ok(EVT.LINK_MISSING && EVT.MD_SCROLL_TO_ANCHOR && EVT.TAB_REFRESH_REQUEST)
})
test('EVT 声明文档事件', () => {
  assert.ok(EVT.DOC_DIRTY && EVT.DOC_SAVED && EVT.FILE_SAVED)
})
test('EVT 事件名互不重复', () => {
  const vals = Object.values(EVT)
  assert.strictEqual(new Set(vals).size, vals.length)
})
test('EVT 全部为非空字符串', () => {
  assert.ok(Object.values(EVT).every(v => typeof v === 'string' && v.length > 0))
})

// ── createEventBus ──
test('on/emit 基本投递', () => {
  const bus = createEventBus()
  let got = null
  bus.on(EVT.WS_OPENED, p => { got = p })
  bus.emit(EVT.WS_OPENED, { root: 'D:/ws' })
  assert.deepStrictEqual(got, { root: 'D:/ws' })
})
test('on 返回 unsubscribe', () => {
  const bus = createEventBus()
  let n = 0
  const off = bus.on(EVT.DOC_DIRTY, () => { n++ })
  bus.emit(EVT.DOC_DIRTY, {})
  off()
  bus.emit(EVT.DOC_DIRTY, {})
  assert.strictEqual(n, 1)
})
test('off 精确移除', () => {
  const bus = createEventBus()
  let n = 0
  const fn = () => { n++ }
  bus.on(EVT.DOC_SAVED, fn)
  bus.off(EVT.DOC_SAVED, fn)
  bus.emit(EVT.DOC_SAVED, {})
  assert.strictEqual(n, 0)
})
test('多订阅者按注册顺序都收到', () => {
  const bus = createEventBus()
  const order = []
  bus.on(EVT.REF_ADDED, () => order.push('a'))
  bus.on(EVT.REF_ADDED, () => order.push('b'))
  bus.emit(EVT.REF_ADDED, {})
  assert.deepStrictEqual(order, ['a', 'b'])
})
test('未订阅事件 emit 不报错', () => {
  const bus = createEventBus()
  assert.doesNotThrow(() => bus.emit(EVT.WS_CLOSED, {}))
})
test('emit 未声明事件名 → 抛 E_EVENT_UNDECLARED', () => {
  const bus = createEventBus()
  assert.throws(() => bus.emit('nope:event', {}), /E_EVENT_UNDECLARED/)
})
test('on 未声明事件名 → 抛 E_EVENT_UNDECLARED', () => {
  const bus = createEventBus()
  assert.throws(() => bus.on('nope', () => {}), /E_EVENT_UNDECLARED/)
})
test('订阅者抛异常不中断其它订阅者', () => {
  const bus = createEventBus()
  let reached = false
  bus.on(EVT.FILE_SAVED, () => { throw new Error('boom') })
  bus.on(EVT.FILE_SAVED, () => { reached = true })
  assert.doesNotThrow(() => bus.emit(EVT.FILE_SAVED, {}))
  assert.strictEqual(reached, true)
})
test('订阅者异常走 logger.error（注入时用注入的 logger）', () => {
  const logged = []
  const bus = createEventBus({ error: (k, p) => logged.push([k, p]) })
  bus.on(EVT.FILE_SAVED, () => { throw new Error('boom') })
  bus.emit(EVT.FILE_SAVED, {})
  assert.strictEqual(logged.length, 1)
  assert.strictEqual(logged[0][0], 'bus.handler')
})
test('count 统计触发次数', () => {
  const bus = createEventBus()
  bus.emit(EVT.DOC_DIRTY, {})
  bus.emit(EVT.DOC_DIRTY, {})
  assert.strictEqual(bus.count(EVT.DOC_DIRTY), 2)
})
test('count 未触发为 0', () => {
  assert.strictEqual(createEventBus().count(EVT.DOC_DIRTY), 0)
})
test('count 按事件分别统计', () => {
  const bus = createEventBus()
  bus.emit(EVT.DOC_DIRTY, {})
  bus.emit(EVT.DOC_SAVED, {})
  bus.emit(EVT.DOC_SAVED, {})
  assert.strictEqual(bus.count(EVT.DOC_DIRTY), 1)
  assert.strictEqual(bus.count(EVT.DOC_SAVED), 2)
})
test('reset 清空订阅与计数', () => {
  const bus = createEventBus()
  let n = 0
  bus.on(EVT.DOC_DIRTY, () => { n++ })
  bus.emit(EVT.DOC_DIRTY, {})
  bus.reset()
  bus.emit(EVT.DOC_DIRTY, {})
  assert.strictEqual(n, 1, 'reset 后订阅已移除')
  assert.strictEqual(bus.count(EVT.DOC_DIRTY), 1)
})
test('clear 是 reset 的别名', () => {
  const bus = createEventBus()
  bus.emit(EVT.DOC_DIRTY, {})
  bus.clear()
  assert.strictEqual(bus.count(EVT.DOC_DIRTY), 0)
})
test('两个总线互相隔离', () => {
  const a = createEventBus()
  const b = createEventBus()
  let n = 0
  a.on(EVT.DOC_DIRTY, () => { n++ })
  b.emit(EVT.DOC_DIRTY, {})
  assert.strictEqual(n, 0)
})
test('重复订阅同一 fn 只生效一次（Set 语义）', () => {
  const bus = createEventBus()
  let n = 0
  const fn = () => { n++ }
  bus.on(EVT.DOC_DIRTY, fn)
  bus.on(EVT.DOC_DIRTY, fn)
  bus.emit(EVT.DOC_DIRTY, {})
  assert.strictEqual(n, 1)
})
test('payload 原样透传（不拷贝）', () => {
  const bus = createEventBus()
  const p = { a: 1 }
  let got = null
  bus.on(EVT.DOC_DIRTY, x => { got = x })
  bus.emit(EVT.DOC_DIRTY, p)
  assert.strictEqual(got, p)
})
test('payload 可为 undefined', () => {
  const bus = createEventBus()
  let got = 'x'
  bus.on(EVT.WS_CLOSED, x => { got = x })
  bus.emit(EVT.WS_CLOSED)
  assert.strictEqual(got, undefined)
})
test('unsubscribe 重复调用安全', () => {
  const bus = createEventBus()
  const off = bus.on(EVT.DOC_DIRTY, () => {})
  assert.doesNotThrow(() => { off(); off() })
})
test('off 未订阅过的事件安全', () => {
  const bus = createEventBus()
  assert.doesNotThrow(() => bus.off(EVT.DOC_DIRTY, () => {}))
})
test('订阅中再 emit 不死锁（同步递归投递）', () => {
  const bus = createEventBus()
  let n = 0
  bus.on(EVT.DOC_DIRTY, () => { n++; if (n < 3) bus.emit(EVT.DOC_DIRTY, {}) })
  bus.emit(EVT.DOC_DIRTY, {})
  assert.strictEqual(n, 3)
})
test('所有 EVT 事件均可 emit（声明表自洽）', () => {
  const bus = createEventBus()
  for (const ev of Object.values(EVT)) {
    assert.doesNotThrow(() => bus.emit(ev, {}), '无法 emit：' + ev)
  }
})
test('所有 EVT 事件均可 on（声明表自洽）', () => {
  const bus = createEventBus()
  for (const ev of Object.values(EVT)) {
    assert.doesNotThrow(() => bus.on(ev, () => {}), '无法订阅：' + ev)
  }
})
test('无 logger 时订阅者异常也不冒泡', () => {
  const bus = createEventBus() // 不注入 logger
  bus.on(EVT.DOC_DIRTY, () => { throw new Error('boom') })
  assert.doesNotThrow(() => bus.emit(EVT.DOC_DIRTY, {}))
})
test('emit 返回 undefined（同步投递，不返回 Promise）', () => {
  const bus = createEventBus()
  assert.strictEqual(bus.emit(EVT.DOC_DIRTY, {}), undefined)
})
test('unsubscribe 后 count 仍累计（计数与订阅解耦）', () => {
  const bus = createEventBus()
  const off = bus.on(EVT.DOC_DIRTY, () => {})
  bus.emit(EVT.DOC_DIRTY, {})
  off()
  bus.emit(EVT.DOC_DIRTY, {})
  assert.strictEqual(bus.count(EVT.DOC_DIRTY), 2)
})
test('reset 后仍可重新订阅（不残留状态）', () => {
  const bus = createEventBus()
  bus.on(EVT.DOC_DIRTY, () => {})
  bus.reset()
  let n = 0
  bus.on(EVT.DOC_DIRTY, () => { n++ })
  bus.emit(EVT.DOC_DIRTY, {})
  assert.strictEqual(n, 1)
})
test('logger 无 error 方法时安全降级', () => {
  const bus = createEventBus({}) // 空对象 logger
  bus.on(EVT.DOC_DIRTY, () => { throw new Error('boom') })
  assert.doesNotThrow(() => bus.emit(EVT.DOC_DIRTY, {}))
})
