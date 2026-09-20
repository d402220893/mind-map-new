import { test } from 'node:test'
import assert from 'node:assert'
import { parseSections, slugify, samePath, buildAnchorMap, skipBlankLines } from '../../src/services/sectionParser.js'

test('解析单级标题，提取标题与内容', () => {
  const secs = parseSections('# 标题\n\n正文内容')
  assert.strictEqual(secs.length, 1)
  assert.strictEqual(secs[0].title, '标题')
  assert.strictEqual(secs[0].level, 1)
  assert.strictEqual(secs[0].content.includes('正文内容'), true)
})

test('多级嵌套路径', () => {
  const secs = parseSections('# A\n\n## B\n\n### C\n')
  assert.strictEqual(secs.length, 3)
  assert.deepStrictEqual(secs[0].path, ['A'])
  assert.deepStrictEqual(secs[1].path, ['A', 'B'])
  assert.deepStrictEqual(secs[2].path, ['A', 'B', 'C'])
})

test('代码块内的 # 不误判为标题', () => {
  const secs = parseSections('# 真标题\n\n```\n# 这是注释不是标题\n```\n')
  assert.strictEqual(secs.length, 1)
  assert.strictEqual(secs[0].title, '真标题')
})

test('章节结束 = 下一个同级或更高级标题', () => {
  const secs = parseSections('# A\n正文A\n## B\n正文B\n# C\n正文C')
  assert.strictEqual(secs.length, 3)
  assert.strictEqual(secs[0].content.includes('正文A'), true)
  assert.strictEqual(secs[0].content.includes('正文B'), true)
  assert.strictEqual(secs[2].content.includes('正文C'), true)
})

test('startLine 指向标题行（0-based）', () => {
  const secs = parseSections('intro\n\n# A\n')
  assert.strictEqual(secs.length, 1)
  assert.strictEqual(secs[0].startLine, 2)
})

test('contentHash 对归一化内容稳定（尾空白不影响）', () => {
  const a = parseSections('# A\n\n正文')
  const b = parseSections('# A\n\n正文  ')
  assert.strictEqual(a[0].contentHash, b[0].contentHash)
})

test('contentHash 不同内容不同', () => {
  const a = parseSections('# A\n\n正文1')
  const b = parseSections('# A\n\n正文2')
  assert.notStrictEqual(a[0].contentHash, b[0].contentHash)
})

test('无 prevIndex 时 id 由 file+path+level 稳定生成', () => {
  const a = parseSections('# A\n', { file: 'docs/x.md' })
  const b = parseSections('# A\n', { file: 'docs/x.md' })
  assert.strictEqual(a[0].id, b[0].id)
})

test('改名（path 变、位置不变）经行区间重叠复用旧 id', () => {
  const first = parseSections('# 需求分析\n\n内容', { file: 'docs/x.md' })
  const id0 = first[0].id
  const prevIndex = { files: { 'docs/x.md': { fileHash: 'h', sections: { [id0]: { level: 1, startLine: 0, headingLineCount: 1, endLine: 3, path: ['需求分析'] } } } } }
  const second = parseSections('# 需求分析（含非功能）\n\n内容', { file: 'docs/x.md', prevIndex })
  assert.strictEqual(second[0].id, id0)
})

test('位置移动（行区间不重叠）保持 id 稳定', () => {
  // 设计：id 由 file+path+level 决定，复用判据是"行区间重叠+同级"。
  // 移动（位置变、path/level 不变）→ 无重叠 → 不复用旧 id，但 base 仍相同 → id 不变。
  // 正是双链期望：章节移动后旧反链仍可解析。
  const first = parseSections('# A\n\n内容', { file: 'docs/x.md' })
  const id0 = first[0].id
  const prevIndex = { files: { 'docs/x.md': { fileHash: 'h', sections: { [id0]: { level: 1, startLine: 0, headingLineCount: 1, endLine: 3, path: ['A'] } } } } }
  const second = parseSections('l0\nl1\nl2\nl3\nl4\nl5\n# A\n\n内容', { file: 'docs/x.md', prevIndex })
  assert.strictEqual(second[0].id, id0)
})

test('同名标题多次出现 id 去重 -1', () => {
  const secs = parseSections('# A\n\n## A\n\n# A\n')
  const ids = secs.map(s => s.id)
  assert.notStrictEqual(ids[0], ids[1])
  assert.notStrictEqual(ids[0], ids[2])
  assert.ok(ids[2].endsWith('-1'))
})

test('slugify 基本转换', () => { assert.strictEqual(slugify('Hello World'), 'hello-world') })
test('slugify 去 markdown 标记', () => { assert.strictEqual(slugify('**Bold** 文本'), 'bold-文本') })
test('slugify 同名追加 -1', () => {
  const used = new Set()
  assert.strictEqual(slugify('Title', used), 'title')
  assert.strictEqual(slugify('Title', used), 'title-1')
})
test('slugify 去标点', () => { assert.strictEqual(slugify('A&B#C'), 'abc') })

test('samePath 比较', () => {
  assert.strictEqual(samePath(['A', 'B'], ['A', 'B']), true)
  assert.strictEqual(samePath(['A', 'B'], ['A', 'C']), false)
  assert.strictEqual(samePath(['A'], ['A', 'B']), false)
})

test('buildAnchorMap 锚点→行号', () => {
  const secs = parseSections('# A\n\n## B\n')
  const m = buildAnchorMap(secs)
  assert.strictEqual(m.get(secs[0].anchor), secs[0].startLine)
  assert.strictEqual(m.get(secs[1].anchor), secs[1].startLine)
})

test('anchor 与标题对应', () => {
  const secs = parseSections('# 我的章节\n')
  assert.strictEqual(secs[0].anchor, '我的章节')
})

test('Setext 标题（headingLineCount=2）', () => {
  const secs = parseSections('A Title\n=======\n\nbody')
  assert.strictEqual(secs.length, 1)
  assert.strictEqual(secs[0].level, 1)
  assert.strictEqual(secs[0].headingLineCount, 2)
})

test('CRLF 行尾正确切分', () => {
  const secs = parseSections('# A\r\n\r\nbody')
  assert.strictEqual(secs.length, 1)
  assert.strictEqual(secs[0].startLine, 0)
})

test('空文档', () => { assert.deepStrictEqual(parseSections(''), []) })
test('只有正文无标题', () => { assert.deepStrictEqual(parseSections('just text\nno heading'), []) })
test('多个同级标题各自独立 id', () => {
  const secs = parseSections('# A\n\n# B\n\n# C\n')
  assert.strictEqual(new Set(secs.map(s => s.id)).size, 3)
})
test('content 不含标题行', () => {
  const secs = parseSections('# A\n\nbody')
  assert.strictEqual(secs[0].content.startsWith('# A'), false)
})
test('endLine 为开区间（指向下一标题）', () => {
  const secs = parseSections('# A\n\nbody\n# B\n')
  assert.strictEqual(secs[0].endLine, 3)
})
test('anchor 同级同名唯一', () => {
  const secs = parseSections('# A\n\n# A\n')
  assert.notStrictEqual(secs[0].anchor, secs[1].anchor)
})
test('prevIndex 缺失字段不崩溃', () => {
  const secs = parseSections('# A\n', { file: 'f.md', prevIndex: { files: { 'f.md': {} } } })
  assert.strictEqual(secs.length, 1)
})
test('id 为 "h" + 6 位', () => {
  const secs = parseSections('# A\n', { file: 'docs/x.md' })
  assert.strictEqual(secs[0].id.length, 7)
})
test('深层级 path 正确', () => {
  const secs = parseSections('# A\n## B\n### C\n#### D\n')
  assert.deepStrictEqual(secs[3].path, ['A', 'B', 'C', 'D'])
})
test('解析 100 标题性能可接受', () => {
  const md = Array.from({ length: 100 }, (_, i) => `# H${i}\n\nbody${i}`).join('\n')
  assert.strictEqual(parseSections(md).length, 100)
})
test('id 复用后对同一 file 稳定', () => {
  const s1 = parseSections('# A\n', { file: 'f.md' })
  const s2 = parseSections('# A\n', { file: 'f.md' })
  assert.strictEqual(s1[0].id, s2[0].id)
})
test('不同 file 同 path 不同 id', () => {
  const a = parseSections('# A\n', { file: 'a.md' })
  const b = parseSections('# A\n', { file: 'b.md' })
  assert.notStrictEqual(a[0].id, b[0].id)
})

// ── 标题后空行不再计入正文（与 sectionWriter 共用 skipBlankLines）──
test('content 不含标题后的空分隔行', () => {
  const secs = parseSections('# A\n\nbody\n')
  assert.strictEqual(secs[0].content, 'body')
})
test('content 无前导换行', () => {
  assert.strictEqual(parseSections('# A\n\nbody\n')[0].content.startsWith('\n'), false)
})
test('skipBlankLines 跳过连续空行', () => {
  assert.strictEqual(skipBlankLines(['', '', 'x'], 0, 3), 2)
})
test('skipBlankLines 全空时回退起点', () => {
  assert.strictEqual(skipBlankLines(['', ''], 0, 2), 0)
})
test('skipBlankLines 首行非空时不跳', () => {
  assert.strictEqual(skipBlankLines(['x', ''], 0, 2), 0)
})

// ── slugify ──
test('slugify 去反引号代码', () => { assert.strictEqual(slugify('`code` 标题'), 'code-标题') })
test('slugify 去链接语法保留文字', () => { assert.strictEqual(slugify('[文字](http://x)'), '文字') })
test('slugify 连续空白压成单连字符', () => { assert.strictEqual(slugify('a   b'), 'a-b') })
test('slugify 去首尾连字符', () => { assert.strictEqual(slugify('-abc-'), 'abc') })
test('slugify 中文保留', () => { assert.strictEqual(slugify('需求 分析'), '需求-分析') })
test('slugify 同名第三次追加 -2', () => {
  const used = new Set()
  slugify('T', used); slugify('T', used)
  assert.strictEqual(slugify('T', used), 't-2')
})
test('slugify 去斜杠与等号', () => { assert.strictEqual(slugify('a/b=c'), 'abc') })
test('slugify 空串', () => { assert.strictEqual(slugify(''), '') })
test('slugify null → 空串', () => { assert.strictEqual(slugify(null), '') })
test('slugify 大小写归一', () => { assert.strictEqual(slugify('ABC'), 'abc') })

// ── samePath ──
test('samePath 空数组相等', () => { assert.strictEqual(samePath([], []), true) })
test('samePath 长度不同 → false', () => { assert.strictEqual(samePath(['A'], ['A', '']), false) })
test('samePath null → false', () => { assert.strictEqual(samePath(null, ['A']), false) })
test('samePath 顺序敏感', () => { assert.strictEqual(samePath(['A', 'B'], ['B', 'A']), false) })

// ── buildAnchorMap ──
test('buildAnchorMap 空章节 → 空 Map', () => { assert.strictEqual(buildAnchorMap([]).size, 0) })
test('buildAnchorMap 跳过无 anchor 项', () => {
  assert.strictEqual(buildAnchorMap([{ startLine: 0 }]).size, 0)
})
test('buildAnchorMap 后到达覆盖先到', () => {
  const m = buildAnchorMap([{ anchor: 'a', startLine: 1 }, { anchor: 'a', startLine: 5 }])
  assert.strictEqual(m.get('a'), 5)
})

// ── parseSections 边界 ──
test('无标题但有围栏代码块', () => {
  assert.deepStrictEqual(parseSections('```\n# x\n```\n'), [])
})
test('标题在代码块之后仍被识别', () => {
  const secs = parseSections('```\ncode\n```\n\n# 真\n\nbody')
  assert.strictEqual(secs.length, 1)
  assert.strictEqual(secs[0].title, '真')
})
test('h1→h3 跳级 path 正确', () => {
  const secs = parseSections('# A\n\n### C\n')
  assert.deepStrictEqual(secs[1].path, ['A', 'C'])
})
test('h3→h1 回退 path 截断', () => {
  const secs = parseSections('### C\n\n# A\n')
  assert.deepStrictEqual(secs[1].path, ['A'])
})
test('章节内容含多行与列表', () => {
  const secs = parseSections('# A\n\n- 1\n- 2\n\ntext\n')
  assert.strictEqual(secs[0].content.includes('- 1'), true)
  assert.strictEqual(secs[0].content.includes('text'), true)
})
test('文末无换行的最后章节', () => {
  const secs = parseSections('# A\n\nbody')
  assert.strictEqual(secs[0].content, 'body')
})
test('空章节（标题后无正文）content 为空串', () => {
  const secs = parseSections('# A\n\n# B\n\nb\n')
  assert.strictEqual(secs[0].content, '')
})
test('endLine 末章指向文末行数', () => {
  const md = '# A\n\nbody\n'
  assert.strictEqual(parseSections(md)[0].endLine, md.split('\n').length)
})
test('level 由 tag 推导', () => {
  const secs = parseSections('## B\n')
  assert.strictEqual(secs[0].level, 2)
})
test('contentHash 前缀 sha1:', () => {
  assert.ok(parseSections('# A\n\nx')[0].contentHash.startsWith('sha1:'))
})
test('contentHash 长度固定 17（sha1: + 12 位）', () => {
  assert.strictEqual(parseSections('# A\n\nx')[0].contentHash.length, 17)
})
test('prevIndex 复用后 usedIds 不冲突（同文件多章）', () => {
  const s = parseSections('# A\n\n## B\n\n# C\n', { file: 'f.md' })
  assert.strictEqual(new Set(s.map(x => x.id)).size, 3)
})
test('file 为空时 id 仍稳定', () => {
  assert.strictEqual(parseSections('# A\n')[0].id, parseSections('# A\n')[0].id)
})
test('anchor 与 slugify 输出一致', () => {
  const secs = parseSections('# Hello World\n')
  assert.strictEqual(secs[0].anchor, 'hello-world')
})
test('Setext 二级标题（---）', () => {
  const secs = parseSections('Sub\n---\n\nbody')
  assert.strictEqual(secs[0].level, 2)
  assert.strictEqual(secs[0].headingLineCount, 2)
})

// ── 稳定 id 复用（§6.4）：只要章节还在，id 就不该变 ──
// 这些不变量是"引用不失联"的地基：refs/节点快照存的是 sectionId，
// id 一变，所有引用它的节点立刻变 missing，用户看到"引用全断了"。
const DOC = '# 标题\n\n正文一\n## 子节\n\n正文二\n'
function idxOf(md) {
  const secs = parseSections(md, { file: 'a.md' })
  return { secs, prevIndex: { files: { 'a.md': { fileHash: 'x', sections: Object.fromEntries(secs.map(s => [s.id, s])) } } } }
}
function idOf(secs, title) {
  const s = secs.find(x => x.title === title)
  return s && s.id
}

test('改标题（path 变、位置不变）→ 复用旧 id', () => {
  const { secs, prevIndex } = idxOf(DOC)
  const next = parseSections('# 标题改名了\n\n正文一\n## 子节\n\n正文二\n', { file: 'a.md', prevIndex })
  assert.strictEqual(idOf(next, '标题改名了'), idOf(secs, '标题'))
  assert.strictEqual(idOf(next, '子节'), idOf(secs, '子节'))
})

test('在文档开头插入新章节 → 原有章节全部复用 id，新章节拿新 id', () => {
  // 曾经的缺陷：新章节行区间正好落在旧第一章的旧区间内，按文档顺序先被处理而**抢走**其 id，
  // 真正的第一章因 startLine 移出旧区间只能新建 → 其后所有引用集体失联。
  const { secs, prevIndex } = idxOf(DOC)
  const next = parseSections('# 新章节\n\nxx\n# 标题\n\n正文一\n## 子节\n\n正文二\n', { file: 'a.md', prevIndex })
  assert.strictEqual(idOf(next, '标题'), idOf(secs, '标题'))
  assert.strictEqual(idOf(next, '子节'), idOf(secs, '子节'))
  const oldIds = new Set(secs.map(s => s.id))
  assert.strictEqual(oldIds.has(idOf(next, '新章节')), false, '新章节不得占用既有 id')
})

test('末尾追加章节不影响既有 id', () => {
  const { secs, prevIndex } = idxOf(DOC)
  const next = parseSections(DOC + '# 追加\n\nzz\n', { file: 'a.md', prevIndex })
  assert.strictEqual(idOf(next, '标题'), idOf(secs, '标题'))
  assert.strictEqual(idOf(next, '子节'), idOf(secs, '子节'))
})

test('删除中间章节后，剩余章节仍复用 id', () => {
  const { secs, prevIndex } = idxOf(DOC)
  const next = parseSections('# 标题\n\n正文一\n', { file: 'a.md', prevIndex })
  assert.strictEqual(idOf(next, '标题'), idOf(secs, '标题'))
})

test('二级章节改名同样复用 id（父级未动）', () => {
  const { secs, prevIndex } = idxOf(DOC)
  const next = parseSections('# 标题\n\n正文一\n## 子节改名\n\n正文二\n', { file: 'a.md', prevIndex })
  assert.strictEqual(idOf(next, '子节改名'), idOf(secs, '子节'))
})

test('无 prevIndex 时 id 由 file+path+level 决定（可复现，不随机）', () => {
  const a = parseSections(DOC, { file: 'a.md' })
  const b = parseSections(DOC, { file: 'a.md' })
  assert.deepStrictEqual(a.map(s => s.id), b.map(s => s.id))
  const c = parseSections(DOC, { file: 'b.md' })
  assert.notStrictEqual(a[0].id, c[0].id, '不同文件必须得到不同 id')
})

test('同名标题各自稳定（第二次出现加后缀，不互相覆盖）', () => {
  const secs = parseSections('# Dup\n\na\n# Dup\n\nb\n', { file: 'a.md' })
  assert.strictEqual(secs.length, 2)
  assert.notStrictEqual(secs[0].id, secs[1].id)
})

test('livePaths 精确性：新章节与旧章节同名时，旧 id 归该名字的章节', () => {
  const { secs, prevIndex } = idxOf('# 甲\n\nA\n# 乙\n\nB\n')
  // 把"甲"删掉、在末尾新增同为"甲"的章节：path 匹配应把旧 id 给新的"甲"
  const next = parseSections('# 乙\n\nB\n# 甲\n\nA2\n', { file: 'a.md', prevIndex })
  assert.strictEqual(idOf(next, '乙'), idOf(secs, '乙'))
  assert.strictEqual(idOf(next, '甲'), idOf(secs, '甲'))
})
