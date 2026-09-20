// L1 纯函数：清除 Toast UI WYSIWYG（ProseMirror）编辑器的 undo 历史基线。
//
// 根因（§32.4 Bug④）：Toast UI 的 setMarkdown 用
//   `this.view.dispatch(tr.replaceWith(0, doc.content.size, nodes))`
//   且**未设 addToHistory:false**，于是每次 setMarkdown（mounted + watch tabId/filePath
//   多次触发 mountContent）都向 undo 栈压入一条「整篇替换」记录。用户 Ctrl+Z 会一路
//   回退到编辑器刚创建时的空状态 → 整篇被清空。
//
// 修复：初始载入后调用本函数，给 prosemirror-history 插件 dispatch 一条
//   `setMeta(historyKey, { recreate: true })` 事务，把 done/undone 全部清空，
//   使「初始 setMarkdown」不可撤销；只有用户真实编辑才会进入 undo 栈。
//
// 零依赖、纯函数、可直测：仅依赖传入的 ProseMirror `view` 形状
// （view.state.plugins / view.state.tr.setMeta / view.dispatch），无 DOM 假设。

export function clearHistoryBaseline(view) {
  if (!view || !view.state || !view.state.plugins) return false
  const key = view.state.plugins.find(p => {
    const st = p.getState ? p.getState(view.state) : null
    return st && Array.isArray(st.done) && Array.isArray(st.undone)
  })
  if (!key) return false
  view.dispatch(view.state.tr.setMeta(key, { recreate: true }))
  return true
}
