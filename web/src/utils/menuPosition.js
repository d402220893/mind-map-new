// 右键菜单视口钳制：把菜单坐标约束在窗口内，靠右/靠底时翻转到内侧，
// 避免 Teleport 到 body 后菜单贴窗口边缘仍被裁切或溢出。
// 纯函数（无 DOM 依赖），便于 Node 单测覆盖边界。

/**
 * 计算菜单修正后的左上角坐标。
 * @param {number} x 原始左上角 x（视口坐标系）
 * @param {number} y 原始左上角 y
 * @param {number} menuW 菜单实测宽度
 * @param {number} menuH 菜单实测高度
 * @param {number} vw 视口宽 window.innerWidth
 * @param {number} vh 视口高 window.innerHeight
 * @param {number} [pad=8] 距窗口边缘安全间距
 * @returns {{x:number,y:number}}
 */
export function clampMenuPosition(x, y, menuW, menuH, vw, vh, pad = 8) {
  const safePad = Number.isFinite(pad) && pad >= 0 ? pad : 8
  const w = Math.max(0, menuW || 0)
  const h = Math.max(0, menuH || 0)

  let nx = Number.isFinite(x) ? x : safePad
  // 右缘溢出 → 翻到内侧；左缘为负 → 夹到安全间距
  if (nx + w > vw - safePad) nx = Math.max(safePad, vw - safePad - w)
  else if (nx < safePad) nx = safePad

  let ny = Number.isFinite(y) ? y : safePad
  // 底缘溢出 → 翻到内侧；上缘为负 → 夹到安全间距
  if (ny + h > vh - safePad) ny = Math.max(safePad, vh - safePad - h)
  else if (ny < safePad) ny = safePad

  return { x: nx, y: ny }
}
