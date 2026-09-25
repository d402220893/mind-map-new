/* 思维导图 MdEditor 的跳转定位辅助。
 * 把「markdown 行号」准确映射到 WYSIWYG 顶层块，修正原 scrollToLine
 * 用 data-nodeid 全量节点按行号索引导致的落点错位。
 * 纯函数，便于无头单测。CJS/ESM 双兼容。 */
(function (root, factory) {
  const mod = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = mod
  else if (typeof define === 'function' && define.amd) define(mod)
  else root.mdScroll = mod
})(typeof self !== 'undefined' ? self : this, function () {
  // 识别 markdown 中每个「顶层块」的起始行（fence/表格/引用/列表/标题/段落各算一块）
  function detectBlockStarts(mdText) {
    const lines = String(mdText || '').split('\n')
    const n = lines.length
    const starts = []
    let i = 0
    const reFence = /^\s*```/
    const reTable = /^\s*\|.*\|\s*$/
    const reQuote = /^\s*>\s?/
    const reList = /^\s*([-*+]|\d+[.)])\s+/
    while (i < n) {
      const ln = lines[i]
      if (reFence.test(ln)) {
        starts.push(i); i++
        while (i < n && !reFence.test(lines[i])) i++
        if (i < n) i++ // 跳过收尾 ```
        continue
      }
      if (ln.trim() === '') { i++; continue }
      if (reTable.test(ln)) {
        starts.push(i)
        while (i < n && reTable.test(lines[i])) i++
        continue
      }
      if (reQuote.test(ln)) {
        starts.push(i)
        while (i < n && reQuote.test(lines[i])) i++
        continue
      }
      if (reList.test(ln)) {
        starts.push(i)
        while (i < n && reList.test(lines[i])) i++
        continue
      }
      // 标题 / 分割线 / 普通段落：直到空行或下一块起点
      starts.push(i)
      i++
      while (
        i < n && lines[i].trim() !== '' &&
        !reList.test(lines[i]) && !reQuote.test(lines[i]) &&
        !reTable.test(lines[i]) && !reFence.test(lines[i])
      ) i++
    }
    return starts
  }

  // 给定 markdown 行号，返回其所属顶层块的序号（与 DOM 顶层块数组对齐）
  function resolveBlockIndex(mdText, line) {
    const starts = detectBlockStarts(mdText)
    if (!starts.length) return 0
    let idx = 0
    for (let k = 0; k < starts.length; k++) {
      if (starts[k] <= line) idx = k
      else break
    }
    return idx
  }

  // 取 WYSIWYG 容器里的顶层块元素（与 detectBlockStarts 的数量对齐）
  function getTopLevelBlocks(host) {
    if (!host) return []
    const root = host.querySelector('.toastui-editor-ww-container .toastui-editor-contents') ||
      host.querySelector('.toastui-editor-ww-container')
    if (!root) return []
    return Array.from(root.children)
  }

  // 把一行 markdown 剥成纯文本（用于内容锚定跳转）
  function plainTextOfLine(line) {
    return String(line || '')
      .replace(/^#{1,6}\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/^\s*([-*+]|\d+[.)])\s+/, '')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\*+([^*]+)\*+/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[_~]/g, '')
      .trim()
  }

  // 给定 markdown 行号，返回应滚动到的顶层块索引。
  // 优先用「行文本匹配块文本」做内容锚定（对图片/表格等块数漂移鲁棒），
  // 匹配不到（如空行/普通段落首行）再回退到块序号近似。
  function findBlockIndex(mdText, blocks, line) {
    if (!blocks || !blocks.length) return 0
    const lines = String(mdText || '').split('\n')
    const want = plainTextOfLine(lines[Math.max(0, Math.min(line | 0, lines.length - 1))])
    if (want) {
      for (let i = 0; i < blocks.length; i++) {
        const t = (blocks[i].textContent || '').replace(/\s+/g, ' ').trim()
        if (t && (t.includes(want) || want.includes(t))) return i
      }
    }
    return resolveBlockIndex(mdText, line)
  }

  return { detectBlockStarts, resolveBlockIndex, getTopLevelBlocks, plainTextOfLine, findBlockIndex }
})
