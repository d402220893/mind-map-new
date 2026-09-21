import { test } from 'node:test'
import assert from 'node:assert'
import { clearHistoryBaseline, isHistoryState } from '../../src/utils/mdHistory.js'

// ── 复刻 prosemirror-history 的关键形状 ──
// ⚠️ 真实 HistoryState 的 done/undone 是 **Branch 实例**（{ items, eventCount, popEvent }），
//    而不是数组 —— v2.0.11 的旧实现误判成数组，导致插件从未被识别（Ctrl+Z 仍清空全文）。
class Branch {
  constructor(items, eventCount) {
    this.items = items
    this.eventCount = eventCount
  }
  popEvent() { return null }
}
Branch.empty = new Branch(null, 0)

class HistoryState {
  constructor(done, undone, prevRanges, prevTime, prevComposition) {
    this.done = done
    this.undone = undone
    this.prevRanges = prevRanges
    this.prevTime = prevTime
    this.prevComposition = prevComposition
  }
}

const emptyState = () => new HistoryState(Branch.empty, Branch.empty, null, 0, -1)
const dirtyState = () => new HistoryState(new Branch({ length: 3 }, 2), Branch.empty, null, 0, -1)

function makeView(plugins) {
  const tr = {
    _meta: new Map(),
    // 复刻 prosemirror-state：字符串键取自身，PluginKey/Plugin 取 .key
    setMeta(k, v) { this._meta.set(typeof k === 'string' ? k : k.key, v); return this }
  }
  const view = {
    _dispatched: null,
    state: { plugins, tr },
    dispatch(t) { view._dispatched = t }
  }
  return view
}

// ── 主路径：用插件自带 state.init() 取空基线 ──
test('clearHistoryBaseline 用插件 state.init 取空基线并 dispatch（真修复，非 {recreate}）', () => {
  const empty = emptyState()
  let initCalled = 0
  const plugin = {
    key: 'history$',
    spec: { config: { depth: 100, newGroupDelay: 500 }, state: { init: () => { initCalled++; return empty } } },
    getState: () => dirtyState()
  }
  const view = makeView([plugin])
  assert.strictEqual(clearHistoryBaseline(view), true)
  assert.strictEqual(initCalled, 1, '必须走插件自带的 state.init()')
  assert.ok(view._dispatched, '必须 dispatch 一条事务')
  assert.deepStrictEqual(
    view._dispatched._meta.get('history$'),
    { historyState: empty },
    'meta 必须是 { historyState: <空 HistoryState> }'
  )
  // 回归锁：绝不能再用无效的 {recreate:true}（applyTransaction 会返回 undefined，等于没清）
  assert.ok(!('recreate' in view._dispatched._meta.get('history$')), '不得再用 {recreate} meta')
})

// ── 兜底路径：无 state.init 时从当前实例反推 ──
test('clearHistoryBaseline 无 state.init 时从实例反推空基线（兜底）', () => {
  const plugin = { key: 'history$', spec: { config: {} }, getState: () => dirtyState() }
  const view = makeView([plugin])
  assert.strictEqual(clearHistoryBaseline(view), true)
  const meta = view._dispatched._meta.get('history$')
  assert.ok(meta.historyState instanceof HistoryState)
  assert.strictEqual(meta.historyState.done, Branch.empty, 'done 必须是空 branch')
  assert.strictEqual(meta.historyState.undone, Branch.empty, 'undone 必须是空 branch')
  assert.strictEqual(meta.historyState.prevTime, 0)
  assert.strictEqual(meta.historyState.prevComposition, -1)
})

// ── 回归锁：旧实现的错误假设必须被拒绝 ──
test('done/undone 为数组的假状态不再被误认（Branch 不是数组）', () => {
  const plugin = { key: 'history$', spec: { config: {} }, getState: () => ({ done: [], undone: [] }) }
  const view = makeView([plugin])
  assert.strictEqual(clearHistoryBaseline(view), false)
  assert.strictEqual(view._dispatched, null, '误认会走错分支，必须不 dispatch')
})

test('找不到 history 插件（状态非 HistoryState 形）返回 false 且不 dispatch', () => {
  const view = makeView([{ key: 'x', spec: {}, getState: () => ({ other: 1 }) }])
  assert.strictEqual(clearHistoryBaseline(view), false)
  assert.strictEqual(view._dispatched, null)
})

test('空插件列表返回 false', () => {
  const view = makeView([])
  assert.strictEqual(clearHistoryBaseline(view), false)
})

test('state.init 抛错且实例不可反推时返回 false（宁可不动作也不塞坏状态）', () => {
  const plugin = {
    key: 'history$',
    spec: { config: {}, state: { init() { throw new Error('boom') } } },
    getState: () => ({ done: { eventCount: 1 }, undone: { eventCount: 0 } }) // 缺 popEvent，非 HistoryState
  }
  const view = makeView([plugin])
  assert.strictEqual(clearHistoryBaseline(view), false)
  assert.strictEqual(view._dispatched, null)
})

test('meta 键取自 plugin.key / spec.key（兼容 PluginKey 形态）', () => {
  const empty = emptyState()
  const plugin = {
    spec: { config: {}, key: { key: 'history$' }, state: { init: () => empty } },
    getState: () => emptyState()
  }
  const view = makeView([plugin])
  assert.strictEqual(clearHistoryBaseline(view), true)
  assert.deepStrictEqual(view._dispatched._meta.get('history$'), { historyState: empty })
})

// ── isHistoryState 单测 ──
test('isHistoryState 只认 Branch 形（eventCount 数字 + popEvent 函数）', () => {
  assert.strictEqual(isHistoryState(emptyState()), true)
  assert.strictEqual(isHistoryState({ done: [], undone: [] }), false)
  assert.strictEqual(isHistoryState({ done: { eventCount: 1 }, undone: { eventCount: 0 } }), false)
  assert.strictEqual(isHistoryState(null), false)
  assert.strictEqual(isHistoryState(undefined), false)
})

test('clearHistoryBaseline 容错：view/state/plugins 缺失不抛', () => {
  assert.strictEqual(clearHistoryBaseline(null), false)
  assert.strictEqual(clearHistoryBaseline({}), false)
  assert.strictEqual(clearHistoryBaseline({ state: {} }), false)
  assert.strictEqual(clearHistoryBaseline({ state: { plugins: null } }), false)
})
