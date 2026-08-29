// 存储异常判定（纯函数，可在 Node 单测）。
// 原 api/index.js 用 `if ('exceeded')`（字符串常量恒真），
// 任何 localStorage 写入异常都会误报"本地存储超限"。
// 详见《详细设计_全量改造.md》模块1 低危项。
export function isQuotaExceededError(error) {
  if (!error) return false
  if (error.name === 'QuotaExceededError') return true
  // Firefox 配额码 22；Safari 历史返回 1014
  if (error.code === 22 || error.code === 1014) return true
  // IE / 旧 Edge
  if (error.number === 0x8007000e) return true
  return false
}
