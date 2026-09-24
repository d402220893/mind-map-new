// 纯函数：文件树 Shift+左键连续多选的区间计算。
// 从 WorkspacePanel.selectRange 抽离，便于纯单测（避免与 Vue 组件耦合、无需 Electron）。
//
// 语义：在平铺文件列表里，以 anchor（上次选中的锚点）为起点、current 为终点，
// 选出两者之间的连续区间（仅含文件、排除目录）。append=true 时并入现有已选集合（Set 去重）。
// 若 anchor 不在列表（首次 Shift 点击），区间退化为仅 [current]。
export function computeRangeSelection(opts) {
  const { files, anchor, current, append, selected } = opts || {}
  const flat = Array.isArray(files) ? files : []
  const idxLast = flat.findIndex(n => n.path === anchor && !n.isDir)
  const idxNow = flat.findIndex(n => n.path === current && !n.isDir)
  if (idxNow < 0) return selected ? selected.slice() : []
  let range = []
  if (idxLast >= 0) {
    const [start, end] = idxLast < idxNow ? [idxLast, idxNow] : [idxNow, idxLast]
    range = flat.slice(start, end + 1).filter(n => !n.isDir).map(n => n.path)
  } else {
    range = [current]
  }
  if (append) {
    const set = new Set(selected || [])
    range.forEach(p => set.add(p))
    return Array.from(set)
  }
  return range
}
