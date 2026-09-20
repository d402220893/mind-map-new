import { test } from 'node:test'
import assert from 'node:assert'
import { clearHistoryBaseline } from '../../src/utils/mdHistory.js'

// ── 假 ProseMirror view：只复刻 prosemirror-history 插件的状态形状 ──
function fakeHistoryPlugin() {
  // 真实 history 插件状态：{ done:[...], undone:[...] }
  return {
    _state: { done: [{ foo: 1 }], undone: [] },
    getState() { return this._state }
  }
}
function makeView(plugins) {
  const tr = {
    _meta: new Map(),
    setMeta(k, v) { this._meta.set(k, v); return this }
  }
  const view = {
    _dispatched: null,
    state: { plugins, tr },
    dispatch(t) { view._dispatched = t }
  }
  return view
}

test('clearHistoryBaseline 对含 history 插件的 view 清空基线', () => {
  const plugin = fakeHistoryPlugin()
  const view = makeView([plugin])
  const ok = clearHistoryBaseline(view)
  assert.strictEqual(ok, true, '找到 history 插件应返回 true')
  assert.ok(view._dispatched, '必须 dispatch 一条事务')
  // 事务携带 recreate meta：prosemirror-history 据此把 done/undone 全部清空
  assert.deepStrictEqual(view._dispatched._meta.get(plugin), { recreate: true })
})

test('clearHistoryBaseline 找不到 history 插件（无 done/undone 数组）返回 false 且不 dispatch', () => {
  const view = makeView([{ getState: () => ({ other: 1 }) }])
  const ok = clearHistoryBaseline(view)
  assert.strictEqual(ok, false)
  assert.strictEqual(view._dispatched, null, '未找到插件不得误 dispatch')
})

test('clearHistoryBaseline 空插件列表返回 false', () => {
  const view = makeView([])
  assert.strictEqual(clearHistoryBaseline(view), false)
})

test('clearHistoryBaseline 容错：view/state/plugins 缺失不抛', () => {
  assert.strictEqual(clearHistoryBaseline(null), false)
  assert.strictEqual(clearHistoryBaseline({}), false)
  assert.strictEqual(clearHistoryBaseline({ state: {} }), false)
})
