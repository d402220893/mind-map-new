// 思维导图（.smm）内容搜索 —— L1 纯函数，零依赖、可在 Node 下单测。
//
// 背景：工作区索引只索引 md 文件，导致「全文搜索搜不到 smm 文件」。
// 这里直接对 decodeSmm 产出的 { sheets:[{id,name,data}], activeId } 做内存遍历，
// 匹配节点 text / 备注 note / 引用 _mindlink.refs 的 title+cachedContent（大小写不敏感）。
//
// 输入节点为「裸数据」形状（{ data:{text,note,...}, children:[...] }），
// 与 decodeSmm / decodeSmm 单图包装产物一致；对 MindMapNode 实例请先在调用侧取 data。

/** 去掉富文本标签并压缩空白（smm 的 text/note 可能含 HTML） */
export function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 截断到 n 字符并加省略号 */
export function truncate(str, n = 80) {
  str = String(str || '').replace(/\s+/g, ' ').trim()
  return str.length > n ? str.slice(0, n) + '…' : str
}

/**
 * 收集一个节点的可搜索文本（text + note + refs 的 title/cachedContent）。
 * @param {object} data 裸节点的 data 字段（node.data）
 * @returns {{text:string, note:string, refText:string, hay:string}}
 */
export function nodeSearchText(data) {
  const d = data && typeof data === 'object' ? data : {}
  const text = stripHtml(d.text || '')
  const note = stripHtml(d.note || '')
  const refs =
    d._mindlink && Array.isArray(d._mindlink.refs) ? d._mindlink.refs : []
  const refText = refs
    .map(r => [stripHtml(r && r.title), stripHtml(r && r.cachedContent)].filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n')
  return { text, note, refText, hay: (text + '\n' + note + '\n' + refText).toLowerCase() }
}

/**
 * 遍历一棵裸节点树，返回命中列表。
 * @param {object} rootNode 裸根节点（{ data:{...}, children:[...] }）
 * @param {string} q 关键词（调用前自行 trim；大小写不敏感在这里统一处理）
 * @returns {Array<{uid:string, path:string, preview:string, source:string}>}
 */
export function searchMindTree(rootNode, q) {
  const needle = String(q || '').trim().toLowerCase()
  if (!needle || !rootNode || typeof rootNode !== 'object') return []
  const results = []
  const walk = (node, ancestors) => {
    if (!node || typeof node !== 'object') return
    const data = node.data && typeof node.data === 'object' ? node.data : {}
    const { text, note, refText, hay } = nodeSearchText(data)
    if (hay.includes(needle)) {
      const preview = note ? truncate(note) : refText ? truncate(refText) : truncate(text)
      results.push({
        uid: data.uid || '',
        path: ancestors.concat([text]).filter(Boolean).join(' > ') || '(未命名节点)',
        preview,
        source: text
      })
    }
    const children = Array.isArray(node.children) ? node.children : []
    children.forEach(c => walk(c, ancestors.concat([text]).filter(Boolean)))
  }
  walk(rootNode, [])
  return results
}

/**
 * 解包 sheet.data 到裸根节点。
 * ⚠️ 真实落盘的 sheet.data 是 simple-mind-map `getData(true)` 的**包装形状**
 *    `{ layout, root, theme, view }`（root 才是节点树）；直接用包装对象 walk，
 *    它没有 .data/.children → 整棵树被跳过 → 磁盘上的 .smm 全部零命中，
 *    只剩当前打开文件的内存实时遍历有结果（2026-09-22 用户反馈
 *    「搜索只能搜到一个思维导图」即此根因）。
 * 兼容：裸节点 / {root:节点} / {data:{root:节点}} / {data:节点}（extractMindmapData 的各形态）。
 */
export function unwrapRootNode(d) {
  if (!d || typeof d !== 'object') return d
  if (Array.isArray(d.children) || (d.data && typeof d.data === 'object' && 'text' in d.data)) return d
  if (d.root && typeof d.root === 'object') return unwrapRootNode(d.root)
  if (d.data && typeof d.data === 'object' && !('text' in d.data)) return unwrapRootNode(d.data)
  return d
}

/**
 * 遍历 decodeSmm 产物的全部 sheet，返回带 sheet 归属的命中列表。
 * @param {{sheets:Array<{id:string,name?:string,data:object}>, activeId?:string}} decoded
 * @param {string} q 关键词
 * @returns {Array<{uid:string, path:string, preview:string, source:string, sheetId:string, sheetName:string}>}
 */
export function searchSmmContainer(decoded, q) {
  if (!decoded || !Array.isArray(decoded.sheets)) return []
  const out = []
  decoded.sheets.forEach((sheet, idx) => {
    const sheetName = sheet.name || 'Sheet' + (idx + 1)
    searchMindTree(unwrapRootNode(sheet.data), q).forEach(h => {
      out.push({ ...h, sheetId: sheet.id || '', sheetName })
    })
  })
  return out
}
