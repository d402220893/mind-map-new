// 扩展导出：HTML / OPML / FreeMind(mm) / Excel(xlsx) / Word(docx) / PPT(pptx)
// 这些格式基于思维导图节点树或 SVG 直接生成。
// 重依赖（xlsx/docx/pptxgenjs）改为运行时动态 import()，避免打进主包导致构建过慢。
import { walk, nodeRichTextToTextWithWrap } from 'simple-mind-map/src/utils'

// ============ 公共工具 ============

function getRoot(mindMap) {
  const data = mindMap.getData()
  return data && data.root ? data.root : data
}

function getNodeText(data) {
  if (!data) return ''
  const t = data.richText
    ? nodeRichTextToTextWithWrap(data.text || '')
    : data.text || ''
  return (t || '').toString().replace(/\s+/g, ' ').trim()
}

function xmlEscape(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function htmlEscape(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ============ 1. HTML ============

export async function exportHTML(mindMap, name) {
  let svgHTML = ''
  try {
    const res = mindMap.getSvgData({ paddingX: 20, paddingY: 20 })
    svgHTML = (res && res.svgHTML) || ''
  } catch (e) {
    console.warn('getSvgData failed', e)
  }
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${htmlEscape(name)}</title>
<style>
  html, body { margin: 0; padding: 0; background: #ffffff; }
  .mindmap-container { width: 100%; overflow: auto; font-family: -apple-system, "Microsoft YaHei", sans-serif; }
  .mindmap-container svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }
</style>
</head>
<body>
<div class="mindmap-container">${svgHTML}</div>
</body>
</html>`
  return new Blob([html], { type: 'text/html;charset=utf-8' })
}

// ============ 2. OPML ============

export async function exportOPML(mindMap, name) {
  const root = getRoot(mindMap)
  let body = ''
  const build = (node, depth) => {
    const text = xmlEscape(getNodeText(node.data))
    const note =
      node.data && node.data.note
        ? ` _note="${xmlEscape(node.data.note)}"`
        : ''
    const children = node.children || []
    if (children.length === 0) {
      body += `${'  '.repeat(depth)}<outline text="${text}"${note}/>\n`
    } else {
      body += `${'  '.repeat(depth)}<outline text="${text}"${note}>\n`
      children.forEach((c) => build(c, depth + 1))
      body += `${'  '.repeat(depth)}</outline>\n`
    }
  }
  build(root, 1)
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${xmlEscape(name)}</title>
  </head>
  <body>
${body}  </body>
</opml>`
  return new Blob([xml], { type: 'text/x-opml;charset=utf-8' })
}

// ============ 3. FreeMind (mm) ============

export async function exportMM(mindMap, name) {
  const root = getRoot(mindMap)
  let body = ''
  const build = (node, depth) => {
    const text = xmlEscape(getNodeText(node.data))
    const note =
      node.data && node.data.note
        ? `\n${'  '.repeat(depth + 1)}<note>${xmlEscape(node.data.note)}</note>`
        : ''
    const children = node.children || []
    if (children.length === 0) {
      body += `${'  '.repeat(depth)}<node TEXT="${text}"${note}/>\n`
    } else {
      body += `${'  '.repeat(depth)}<node TEXT="${text}"${note}>\n`
      children.forEach((c) => build(c, depth + 1))
      body += `${'  '.repeat(depth)}</node>\n`
    }
  }
  build(root, 1)
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.0.1">
${body}</map>`
  return new Blob([xml], { type: 'application/x-freemind;charset=utf-8' })
}

// ============ 4. Excel (xlsx, 层级缩进表) ============
// 输出：每行对应该节点，列深 = 节点层级（L0/L1/...）。
// 根节点单独占第 1 行；其余行的某个祖先列只有当该祖先在
// 「first-child chain」(节点沿父亲链一路是父的首子) 上时才填入。
// 例：Idea → A → A1 → A1a / A1b，A2 / A3，B → B1 / B2
//  Excel 显示：
//   | Idea | A  | A1 | A1a |
//   |      |    |    | A1b |  (sibling 不在 first-chain, 祖宗列全空, last col 填自己)
//   |      |    | A2 |     |
//   |      |    | A3 |     |
//   |      | B  | B1 |     |
//   |      |    | B2 |     |
export async function exportXLSX(mindMap, name) {
  const XLSXmod = await import('xlsx')
  const XLSX = XLSXmod.default || XLSXmod
  const root = getRoot(mindMap)

  // 1) 第一遍 DFS 算最大层级
  let maxLevel = 0
  const visitLevels = new Map() // node -> level
  function measure(node, level) {
    visitLevels.set(node, level)
    if (level > maxLevel) maxLevel = level
    const children = node.children || []
    for (const child of children) measure(child, level + 1)
  }
  measure(root, 0)

  // 2) 第二遍生成行：先序遍历，trace 跟踪当前 first-child chain 各层文本
  const rows = []
  const trace = []
  function writeRow(node, level, isFirstChain) {
    const text = getNodeText(node.data)
    const row = new Array(maxLevel + 1).fill('')
    row[level] = text
    if (isFirstChain) {
      // 继承 first-chain 祖先列 (depth < level)
      for (let d = 0; d < level; d++) row[d] = trace[d]
    }
    rows.push(row)

    // 进入子节点前，把 first-chain 上的本层文本放入 trace
    if (isFirstChain) trace[level] = text

    const children = node.children || []
    children.forEach((c, idx) => {
      writeRow(c, level + 1, isFirstChain && idx === 0)
    })

    if (isFirstChain) trace[level] = '' // 退出本层（保持 trace 长度匹配但值清空，避免越界访问）
  }

  writeRow(root, 0, true)

  // 3) 加表头 L0/L1/.../Ln，加备注列（每个节点独立一行的格式没必要另加备注列，
  //    因为备注和节点不再是一对一挤压在同 level；这里依然按行存 note 便于筛选）。
  const headerRow = []
  for (let i = 0; i <= maxLevel; i++) headerRow.push(`L${i}`)
  const data = [headerRow, ...rows]

  const ws = XLSX.utils.aoa_to_sheet(data)
  // 列宽：每层 14 字符宽
  ws['!cols'] = Array(maxLevel + 1).fill({ wch: 16 })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '思维导图')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
}

// ============ 5. Word (docx) ============

export async function exportDOCX(mindMap, name) {
  const { Document, Packer, Paragraph, HeadingLevel } = await import('docx')
  const root = getRoot(mindMap)
  const headingMap = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
    5: HeadingLevel.HEADING_5,
    6: HeadingLevel.HEADING_6,
    7: HeadingLevel.HEADING_7,
    8: HeadingLevel.HEADING_8,
    9: HeadingLevel.HEADING_9
  }
  const children = []
  walk(
    root,
    null,
    (node, parent, isRoot, layerIndex) => {
      const level = Math.min(layerIndex + 1, 9)
      children.push(
        new Paragraph({
          text: getNodeText(node.data) || ' ',
          heading: headingMap[level]
        })
      )
      if (node.data && node.data.note) {
        children.push(
          new Paragraph({
            text: node.data.note,
            bullet: { level: 0 }
          })
        )
      }
    },
    () => {},
    true
  )
  const doc = new Document({
    sections: [{ children: children.length ? children : [new Paragraph(' ')] }]
  })
  return await Packer.toBlob(doc)
}

// ============ 6. PPT (pptx) ============

export async function exportPPTX(mindMap, name) {
  const pptxgenMod = await import('pptxgenjs')
  const pptxgen = pptxgenMod.default || pptxgenMod
  const root = getRoot(mindMap)
  const pptx = new pptxgen()
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 })
  pptx.layout = 'WIDE'

  // 第一页：整图概览
  const slide0 = pptx.addSlide()
  slide0.addText(name, { x: 0.4, y: 0.25, fontSize: 22, bold: true })
  try {
    const pngDataUrl = await mindMap.doExport.png(name, false, null, false)
    slide0.addImage({ data: pngDataUrl, x: 0.4, y: 0.9, w: 12.5, h: 6.3 })
  } catch (e) {
    console.warn('pptx overview png failed', e)
  }

  // 后续：按一级分支分页，列出层级文本
  const topChildren = root.children || []
  topChildren.forEach((child) => {
    const slide = pptx.addSlide()
    slide.addText(getNodeText(root.data), {
      x: 0.4,
      y: 0.25,
      fontSize: 18,
      bold: true,
      color: '333333'
    })
    slide.addText(getNodeText(child.data), {
      x: 0.4,
      y: 0.8,
      fontSize: 20,
      bold: true,
      color: '409EFF'
    })
    const lines = []
    walk(
      child,
      null,
      (node, parent, isRoot, layerIndex) => {
        if (isRoot) return
        lines.push({
          text: '  '.repeat(Math.max(layerIndex - 2, 0)) + '• ' + getNodeText(node.data),
          options: { fontSize: 14, breakLine: true }
        })
      },
      () => {},
      true
    )
    if (lines.length) {
      slide.addText(lines, { x: 0.7, y: 1.5, w: 12.0, h: 5.6 })
    }
  })

  return await pptx.write('blob')
}

// ============ 统一分发 ============

export const EXTRA_TYPES = ['html', 'opml', 'mm', 'xlsx', 'docx', 'pptx']

const HANDLER = {
  html: exportHTML,
  opml: exportOPML,
  mm: exportMM,
  xlsx: exportXLSX,
  docx: exportDOCX,
  pptx: exportPPTX
}

// 返回 { blob, ext }
export async function extraExport(type, mindMap, name) {
  const fn = HANDLER[type]
  if (!fn) return null
  const blob = await fn(mindMap, name)
  return { blob, ext: type }
}

export { downloadBlob }
