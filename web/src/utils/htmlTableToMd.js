/**
 * HTML 表格 → Markdown 表格。
 *
 * 设计：拆成两层。
 * - `tableRowsToMd(rows)` 是纯函数（输入二维字符串数组），可在 Node 下单测，不依赖 DOM。
 * - `htmlTableToMd(html)` 在浏览器用原生 DOMParser 解析 HTML 表格，再调用纯函数。
 *
 * 分隔线固定插入首行之后（Markdown 规范）；单元格内 `|` 转义为 `\|`；空单元格占位空格。
 */

/**
 * 纯函数：二维字符串数组 → Markdown 表格字符串。
 * @param {string[][]} rows 每行单元格文本数组
 * @returns {string}
 */
export function tableRowsToMd(rows) {
  if (!rows || !rows.length) return ''
  const lines = rows.map(cells => {
    const arr = Array.isArray(cells) ? cells : [cells]
    const padded = arr.map(c => String(c == null ? '' : c).replace(/\|/g, '\\|').trim() || ' ')
    return '| ' + padded.join(' | ') + ' |'
  })
  // 列数取首行单元格数（拼接字符串用 ' | ' 分隔，首尾的 '|' 会干扰字符串反解，故直接用数组长度）
  const colCount = rows[0] ? rows[0].length : 1
  const sep = '| ' + Array(colCount).fill('---').join(' | ') + ' |'
  return [lines[0], sep, ...lines.slice(1)].join('\n')
}

/**
 * 浏览器环境：用原生 DOMParser 解析 HTML 表格。
 * @param {string} html 含 <table> 的 HTML 片段
 * @returns {string}
 */
export function htmlTableToMd(html) {
  if (typeof DOMParser === 'undefined') return ''
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  const table = doc.querySelector('table')
  if (!table) return ''
  const rows = Array.from(table.querySelectorAll('tr')).map(tr =>
    Array.from(tr.querySelectorAll('td, th')).map(td => (td.textContent || '').trim())
  )
  return tableRowsToMd(rows)
}
