// L1 纯函数：正文替换（给原文与章节 → 返回新全文），便于单测（§7.5.1 / §7.5.3）。
import { parseSections, skipBlankLines } from './sectionParser.js'
import { normalizeForHash } from './hash.js'
import { appError } from './errors.js'

function splitLines(s) { return String(s == null ? '' : s).split(/\r?\n/) }

// 数 lines[from, to) 末尾的连续空行数（段落与下一章之间的空行属本段"尾部空白"）
function countTrailingBlanks(lines, from, to) {
  let n = 0
  for (let i = to - 1; i >= from; i--) {
    if (lines[i] === '') n++
    else break
  }
  return n
}

// 剥掉正文自身的尾部空行（尾部空行由 countTrailingBlanks 单独还原，避免重复叠加）
function stripTrailingBlanks(arr) {
  const out = arr.slice()
  while (out.length && out[out.length - 1] === '') out.pop()
  return out
}

// 正文替换（纯函数，位于 L1）。replaceTitle=true 时连同标题行一起替换。
export function replaceSectionInText(mdText, sections, sectionId, newContent, { replaceTitle = false } = {}) {
  const src = String(mdText)
  const sec = sections.find(s => s.id === sectionId)
  // 纯函数只对"调用方用错了"这种编程错误抛异常；业务失败一律走 Result（§16.5）
  if (!sec) throw appError('E_SECTION_MISSING', { sectionId })
  // 内容与解析结果逐字相同 = 真无修改：直接原样返回，绝不产生写盘抖动。
  // 这一步让"空编辑"在海量边缘场景（行尾空格、末尾换行、CRLF）下都零改动。
  if (!replaceTitle && newContent === sec.content) return { text: src, verified: true }
  const lines = src.split(/\r?\n/)
  // 行尾风格必须跟随原文件：CRLF 文件按 LF 写回会把每一行都标记为改动
  // （diff 爆炸 + 乐观锁 baseHash 全变 + 其它引用该文件的节点集体报 stale）
  const EOL = /\r\n/.test(src) ? '\r\n' : '\n'
  // 与 parseSections 用同一 skipBlankLines：标题后的空分隔行保留，不落在正文里
  const headingStart = sec.startLine + (replaceTitle ? 0 : sec.headingLineCount)
  const bodyStart = replaceTitle ? headingStart : skipBlankLines(lines, headingStart, sec.endLine)
  // 段末空行（下一章标题前的那行空白）parseSections 会从 content 里剥掉，
  // 写回时必须原样补回，否则每编辑一次就吃掉一行空行（反复编辑持续吞行）
  const tailBlanks = countTrailingBlanks(lines, bodyStart, sec.endLine)
  const bodyRaw = stripTrailingBlanks(splitLines(newContent))
  const body = bodyRaw.length ? bodyRaw : []
  const sep = body.length ? tailBlanks : 0 // 空正文不补分隔空行（避免堆出空段落）
  const next = [
    ...lines.slice(0, bodyStart),
    ...body,
    ...(sep ? new Array(sep).fill('') : []),
    ...lines.slice(sec.endLine) // 保留章节后的所有内容（含其它章节）
  ]
  const text = next.join(EOL)
  // 自校验：重新解析，确认该 id 仍存在且正文（body）与新内容一致（防越界/串章）。
  // replaceTitle=true 时 newContent 含标题行，需先剥离标题取其 body 再比对，
  // 否则"标题+正文"与解析出的纯 body 永远不相等 → 误报 E_WRITE_VERIFY_FAILED。
  const newBody = replaceTitle
    ? (parseSections(newContent, { prevIndex: null })[0]?.content ?? newContent)
    : newContent
  const re = parseSections(text, { prevIndex: null })
  const again = re.find(s => normalizeForHash(s.content) === normalizeForHash(newBody))
  if (!again) throw appError('E_WRITE_VERIFY_FAILED', { sectionId })
  return { text, verified: true }
}
