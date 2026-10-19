// 文件列表键盘快捷键的纯决策函数（可 Node 单测，无 Vue / Electron 依赖）。
// 把「按键 + 当前面板状态 → 该执行什么动作」的映射从 WorkspacePanel.vue 抽离，
// 便于单测与复用。副作用（复制/删除/重命名等）由调用方（组件方法）执行。
//
// @param {object} e  归一化按键事件：
//   { key:'F2'|'Delete'|'Enter'|'Escape'|'F5'|'Home'|'End'|'ArrowUp'|'ArrowDown'|'c'...,
//     ctrlKey, metaKey, shiftKey, preventDefault() }
// @param {object} state 面板状态：
//   { root, hasSelection, editingPath, fileCount }
// @returns {{ action: string|null, preventDefault: boolean }}
//   action ∈ 'copy'|'cut'|'paste'|'selectAll'|'rename'|'delete'|'open'|
//            'clearSelection'|'refresh'|'home'|'end'|'extendUp'|'extendDown'|
//            'moveUp'|'moveDown'|null
export function resolveFileListKey(e, state) {
  const editing = !!(state && state.editingPath)
  // 重命名内联编辑态：除 Esc（交由输入框自身的 .esc 处理）外，键盘不触发表面快捷键
  if (editing && e.key !== 'Escape') {
    return { action: null, preventDefault: false }
  }
  if (!state || !state.root) return { action: null, preventDefault: false }

  // Ctrl / Cmd 组合键（复制 / 剪切 / 粘贴 / 全选）
  if (e.ctrlKey || e.metaKey) {
    const k = String(e.key || '').toLowerCase()
    if (k === 'c') return { action: 'copy', preventDefault: true }
    if (k === 'x') return { action: 'cut', preventDefault: true }
    if (k === 'v') return { action: 'paste', preventDefault: true }
    if (k === 'a') return { action: 'selectAll', preventDefault: true }
    return { action: null, preventDefault: false }
  }

  const hasSel = !!(state.hasSelection)
  switch (e.key) {
    case 'F2':
      return { action: 'rename', preventDefault: true }
    case 'Delete':
      return hasSel ? { action: 'delete', preventDefault: true } : { action: null, preventDefault: false }
    case 'Enter':
      return hasSel ? { action: 'open', preventDefault: true } : { action: null, preventDefault: false }
    case 'Escape':
      // 编辑态的 Esc 由输入框单独处理（取消编辑）；此处只清选区
      return { action: 'clearSelection', preventDefault: false }
    case 'F5':
      return { action: 'refresh', preventDefault: true }
    case 'Home':
      return state.fileCount ? { action: 'home', preventDefault: true } : { action: null, preventDefault: false }
    case 'End':
      return state.fileCount ? { action: 'end', preventDefault: true } : { action: null, preventDefault: false }
    case 'ArrowUp':
      if (e.shiftKey) return { action: 'extendUp', preventDefault: true }
      return hasSel ? { action: 'moveUp', preventDefault: true } : { action: null, preventDefault: false }
    case 'ArrowDown':
      if (e.shiftKey) return { action: 'extendDown', preventDefault: true }
      return hasSel ? { action: 'moveDown', preventDefault: true } : { action: null, preventDefault: false }
    default:
      return { action: null, preventDefault: false }
  }
}
