// Markdown 表格选区纯函数（可 Node 单测，无 Vue / Electron / DOM 依赖）。
// 对 2D 字符串矩阵 string[][] 运算：矩形归一化、越界 clamp、TSV/HTML/Markdown 序列化。
// 渲染层（ProseMirror 选区 / DOM 坐标）不在这里，见 tableSelectionModel.js。

/**
 * 把锚点 anchor 与焦点 focus 归一化为正向矩形 {r0,c0,r1,c1}。
 * @param {{r:number,c:number}} anchor
 * @param {{r:number,c:number}} focus
 */
export function normalizeRect(anchor, focus) {
  const a = anchor || { r: 0, c: 0 }
  const b = focus || { r: 0, c: 0 }
  return {
    r0: Math.min(a.r, b.r),
    c0: Math.min(a.c, b.c),
    r1: Math.max(a.r, b.r),
    c1: Math.max(a.c, b.c)
  }
}

/**
 * 把单元格坐标 clamp 到矩阵边界内；坐标为 null/越界时返回 null（表示无有效格）。
 * @param {{r:number,c:number}|null} pos
 * @param {number} rows 矩阵行数
 * @param {number} cols 矩阵列数
 */
export function clampCell(pos, rows, cols) {
  if (!pos || typeof pos.r !== 'number' || typeof pos.c !== 'number') return null
  if (rows <= 0 || cols <= 0) return null
  return {
    r: Math.max(0, Math.min(rows - 1, pos.r)),
    c: Math.max(0, Math.min(cols - 1, pos.c))
  }
}

const cellText = (matrix, r, c) => {
  const row = matrix && matrix[r]
  const v = row && row[c]
  return v == null ? '' : String(v)
}

/** 序列化为 TSV（tab 分隔），便于粘贴回 Excel。 */
export function serializeTsv(matrix, rect) {
  if (!matrix || !rect) return ''
  const { r0, c0, r1, c1 } = rect
  const lines = []
  for (let r = r0; r <= r1; r++) {
    const cells = []
    for (let c = c0; c <= c1; c++) cells.push(cellText(matrix, r, c))
    lines.push(cells.join('\t'))
  }
  return lines.join('\n')
}

/** 序列化为 <table> HTML 片段，便于粘贴到 Word / 邮件。 */
export function serializeHtml(matrix, rect) {
  if (!matrix || !rect) return ''
  const { r0, c0, r1, c1 } = rect
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  let html = '<table>'
  for (let r = r0; r <= r1; r++) {
    html += '<tr>'
    for (let c = c0; c <= c1; c++) html += '<td>' + esc(cellText(matrix, r, c)) + '</td>'
    html += '</tr>'
  }
  html += '</table>'
  return html
}

/** 序列化为 Markdown 表格（首行为表头 + 分隔线）。粘贴回 Markdown 保持表格结构。 */
export function serializeMd(matrix, rect) {
  if (!matrix || !rect) return ''
  const { r0, c0, r1, c1 } = rect
  const colCount = c1 - c0 + 1
  if (colCount <= 0) return ''
  const cell = (r, c) => cellText(matrix, r, c).replace(/\|/g, '\\|')
  const rowsOut = []
  for (let r = r0; r <= r1; r++) {
    const row = matrix[r] || []
    const slice = row.slice(c0, c1 + 1)
    const out = slice.map((_, i) => cell(r, c0 + i)) // 注意：用 .map(cell) 会把单元格内容当 r 传入
    while (out.length < colCount) out.push(' ')
    rowsOut.push(out)
  }
  if (!rowsOut.length) return ''
  const header = rowsOut[0]
  const sep = Array(colCount).fill('---')
  const body = rowsOut.slice(1)
  return ['| ' + header.join(' | ') + ' |', '| ' + sep.join(' | ') + ' |', ...body.map(r => '| ' + r.join(' | ') + ' |')].join('\n')
}
