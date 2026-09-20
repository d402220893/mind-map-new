// L1 纯函数：章节解析（AST 行号切块，禁止正则）。
// 依赖：markdown-it（运行时依赖，已显式声明于 web/package.json dependencies）、./hash。
import MarkdownIt from 'markdown-it'
import { contentHashOf, reuseOrCreateId, levelPathKey } from './hash.js'

const mdit = new MarkdownIt({ html: true, linkify: false })

// slug（与 GitHub 尽量一致，供 file.md#anchor 跳转）：去 markdown 标记、空格→'-'、同名追加 -1/-2
export function slugify(title, used = new Set()) {
  let s = String(title || '').trim().toLowerCase()
  s = s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  s = s.replace(/\s+/g, '-')
  s = s.replace(/[#%&?/\\=.]/g, '')
  s = s.replace(/-+/g, '-').replace(/^-|-$/g, '')
  let out = s
  let n = 1
  while (used.has(out)) out = s + '-' + (n++)
  used.add(out)
  return out
}

// 跳过标题后的空行（保持 '#' 与正文之间的空分隔行不被计入正文）。
// 若整段都是空行则回退到原起点（空章节不能把边界推到 endLine）。
// sectionWriter 用同一函数计算写回起点，保证"解析边界"与"写回边界"永远一致。
export function skipBlankLines(lines, from, to) {
  let i = from
  while (i < to && String(lines[i] == null ? '' : lines[i]).trim() === '') i++
  return i < to ? i : from
}

export function samePath(a, b) {
  if (!a || !b || a.length !== b.length) return false
  return a.every((x, i) => x === b[i])
}

export function buildAnchorMap(sections) {
  const m = new Map()
  // `sections || []`：调用方可能传 null（未解析出来时），不该因此抛
  for (const s of sections || []) if (s && s.anchor) m.set(s.anchor, s.startLine)
  return m
}

// 解析全文 → 章节列表（§7.5.3）
export function parseSections(mdText, { file = '', prevIndex = null } = {}) {
  const lines = String(mdText).split(/\r?\n/)
  const tokens = mdit.parse(mdText, {})
  const headings = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.type !== 'heading_open') continue
    const [s, e] = t.map // [startLine, endLine)
    const inline = tokens[i + 1]
    headings.push({
      level: Number(t.tag.slice(1)),
      title: inline && inline.type === 'inline' ? inline.content.trim() : '',
      startLine: s,
      headingLineCount: Math.max(1, e - s)
    })
  }
  const out = []
  const usedIds = new Set()
  const usedAnchors = new Set()
  // 预计算每个标题的 path，得到"本次解析里活着的 path 集合"。
  // reuseOrCreateId 靠它区分"这个旧 id 还有主人"与"这个旧 id 的主人被改名了"，
  // 否则在文档开头插入新章节会抢走原第一章的 id（见 hash.js reuseOrCreateId 注释）。
  const paths = []
  {
    const stack = []
    for (const h of headings) {
      stack.length = h.level - 1
      stack[h.level - 1] = h.title
      paths.push(stack.slice(0, h.level).filter(Boolean))
    }
  }
  const livePaths = new Set(paths.map((p, i) => levelPathKey(headings[i].level, p)))
  headings.forEach((h, idx) => {
    const path = paths[idx]
    const next = headings.slice(idx + 1).find(x => x.level <= h.level)
    const endLine = next ? next.startLine : lines.length
    const contentStart = skipBlankLines(lines, h.startLine + h.headingLineCount, endLine)
    const content = lines.slice(contentStart, endLine).join('\n').replace(/\s+$/, '')
    const contentHash = contentHashOf(content)
    const id = reuseOrCreateId(
      { file, path, level: h.level, startLine: h.startLine, headingLineCount: h.headingLineCount, endLine },
      prevIndex, usedIds, livePaths
    )
    const anchor = slugify(h.title, usedAnchors)
    out.push({
      id, level: h.level, title: h.title, path, startLine: h.startLine,
      headingLineCount: h.headingLineCount, endLine, content, contentHash, anchor
    })
  })
  return out
}
