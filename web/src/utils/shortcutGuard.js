// 全局快捷键焦点守卫（纯函数，可在 Node 单测）。
// 当焦点位于可编辑元素（输入框/文本域/下拉/富文本）时，
// 不应拦截全局快捷键，避免 F2 / Ctrl+O 等在输入中误触发、
// 并阻断正常输入。详见《详细设计_全量改造.md》模块7 中危项。
export function isEditableTarget(el) {
  if (!el || !el.tagName) return false
  const tag = el.tagName.toUpperCase()
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return false
}

// activeElement: document.activeElement
// opts.allowInInput: 为 true 时即使焦点在输入框也放行（默认拦截）
export function shouldFireGlobalShortcut(activeElement, opts = {}) {
  const { allowInInput = false } = opts
  if (!allowInInput && isEditableTarget(activeElement)) return false
  return true
}
