// L1 纯函数：清除 Toast UI WYSIWYG（ProseMirror）编辑器的 undo 历史基线。
//
// 根因（§32.4 Bug④，v2.0.12 复核）：Toast UI 的 setMarkdown 用
//   `this.view.dispatch(tr.replaceWith(0, doc.content.size, nodes))`
//   且**未设 addToHistory:false**，于是每次 setMarkdown（mounted + watch tabId/filePath
//   多次触发 mountContent）都向 undo 栈压入一条「整篇替换」记录。用户 Ctrl+Z 会一路
//   回退到编辑器刚创建时的空状态 → 整篇被清空。
//
// v2.0.11 的"修复"有两处致命错误，导致 Ctrl+Z 仍然清空全文：
//   ① 插件定位条件写成 `Array.isArray(st.done)`。但 prosemirror-history 的 HistoryState 里
//      done/undone 是 **Branch 实例**（{ items, eventCount }），**不是数组** → 永远匹配不到
//      → 函数直接返回 false，根本没 dispatch。
//   ② 即便匹配到，dispatch 的是 `setMeta(key, { recreate: true })`。而 applyTransaction 是
//      `if (historyTr) return historyTr.historyState` —— {recreate:true} 没有 historyState
//      字段 → 返回 undefined，**并未清空 done/undone**（还会把历史状态置成 undefined）。
//
// 正确修复：dispatch 一条带**真正的空 HistoryState** 的 meta。prosemirror-history 的
// history() 插件把空基线定义为 `new HistoryState(Branch.empty, Branch.empty, null, 0, -1)`
// （见其 state.init），故直接调用插件的 state.init() 取同源空状态，形状必然兼容。
//
// 零依赖、纯函数、可直测：只依赖传入 view 的形状（state.plugins / state.tr.setMeta /
// dispatch）以及插件自身的 spec.state.init。
//
// 兜底：若插件没有可用的 state.init（被包装/自定义同构插件），则从当前 HistoryState 实例
// 反推类构造等价空状态（HistoryState = cur.constructor，Branch = cur.done.constructor）。

/**
 * 判定"这个插件状态是 prosemirror-history 的 HistoryState"。
 * ⚠️ 不能写成 Array.isArray(done)：done/undone 是 Branch 实例（{ items, eventCount }），
 *   不是数组 —— v2.0.11 正是栽在这个错误假设上，导致插件永不被识别。
 */
export function isHistoryState(st) {
  return !!(
    st &&
    st.done && st.undone &&
    typeof st.done.eventCount === 'number' &&
    typeof st.undone.eventCount === 'number' &&
    typeof st.done.popEvent === 'function'
  )
}

/** 取与 history 插件同源的 meta / state 键（PluginKey.key 与 Plugin.key 同为 'history$'） */
function metaKeyOf(plugin) {
  if (plugin && typeof plugin.key === 'string') return plugin.key
  const k = plugin && plugin.spec && plugin.spec.key
  if (typeof k === 'string') return k
  if (k && typeof k.key === 'string') return k.key
  return 'history'
}

/**
 * 构造与插件同源的"空历史状态"。返回 null 表示无法构造（调用方放弃，不 dispatch，
 * 宁可不动作也不能塞一个形状不对的对象把历史状态搞坏）。
 */
function emptyHistoryState(plugin, state) {
  // ① 首选：插件自带 state.init()（prosemirror-history 定义的空基线）
  const st = plugin && plugin.spec && plugin.spec.state
  if (st && typeof st.init === 'function') {
    try {
      const v = st.init(plugin.spec.config, state)
      if (isHistoryState(v)) return v
    } catch (e) { /* 落到 ② */ }
  }
  // ② 兜底：从当前状态实例反推类（兼容被包装/自定义的同构插件）
  let cur = null
  try { cur = plugin.getState(state) } catch (e) { cur = null }
  if (!isHistoryState(cur)) return null
  try {
    const HS = cur.constructor
    const BranchCls = cur.done.constructor
    const emptyBranch = BranchCls && BranchCls.empty
    if (typeof HS === 'function' && emptyBranch) {
      return new HS(emptyBranch, emptyBranch, null, 0, -1)
    }
  } catch (e) { /* ignore */ }
  return null
}

export function clearHistoryBaseline(view) {
  if (!view || !view.state || !Array.isArray(view.state.plugins)) return false
  const plugin = view.state.plugins.find(p => {
    let st = null
    try { st = p && typeof p.getState === 'function' ? p.getState(view.state) : null } catch (e) { st = null }
    return isHistoryState(st)
  })
  if (!plugin) return false
  const empty = emptyHistoryState(plugin, view.state)
  if (!empty) return false
  // 传 { historyState }（唯一被 prosemirror-history 采纳的 meta 形状）
  view.dispatch(view.state.tr.setMeta(metaKeyOf(plugin), { historyState: empty }))
  return true
}
