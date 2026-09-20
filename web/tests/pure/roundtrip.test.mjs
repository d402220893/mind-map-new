// §7.5.1 解析/写回守恒不变量（L1 纯函数，零 mock）。
//
// 为什么单独立一个文件：`parseSections` 与 `replaceSectionInText` 是**一对**边界函数，
// 各自单测全绿并不代表拼起来无损。真正的契约是：
//   (a) 恒等：把解析出来的 content 原样写回 → 必须与原文**逐字节相同**；
//   (b) 邻域守恒：改某一段的正文后，该段之外的所有字节（行尾风格、分隔空行、
//       文件末尾换行、其它章节）必须一字不动。
// 这两条一旦破掉，症状是"改一处、整份文件 diff 全红"、乐观锁 baseHash 失效、
// 引用该文件的节点集体报 stale —— 全部是静默的，只有逐字节比对能第一时间拦住。
//
// 本文件建立前该不变量并不成立，实测抓出三个真缺陷（均已修）：
//   ① CRLF 文件按 LF 写回 → 整个文件行尾被重写；
//   ② 段末分隔空行被吃掉 → 反复编辑持续吞行；
//   ③ 末章编辑丢掉文件末尾换行。
import { test } from 'node:test'
import assert from 'node:assert'
import { parseSections } from '../../src/services/sectionParser.js'
import { replaceSectionInText } from '../../src/services/sectionWriter.js'

// 覆盖真实 markdown 形态：行尾风格 / 围栏 / 嵌套 / 空行密度 / 无末尾换行 / 中文
const CORPUS = {
  basic: '# A\n\nbody\n\n# B\n\nbodyB\n',
  noTrailingNl: '# A\n\nbody',
  crlf: '# A\r\n\r\nbody\r\n\r\n# B\r\n\r\nb2\r\n',
  fence: '# A\n\n```js\n# 不是标题\n```\n\n# B\n\nb\n',
  cjk: '# 需求分析\n\n正文\n## 功能列表\n\n- x\n',
  nested: '# A\n\n## A1\n\na1\n## A2\n\na2\n',
  denseBlanks: '# A\n\n\n\nbody\n',
  table: '# A\n\n| a | b |\n| - | - |\n| 1 | 2 |\n',
  setext: 'Title\n=====\n\nbody\n',
  htmlComment: '# A\n\n<!-- c -->\n\nbody\n',
  trailingSpaces: '# A\n\nbody   \n',
  multiBlankSep: '# A\n\nbody\n\n\n# B\n\nb\n',
  deepNest: '# A\n\n## A1\n\n### A1a\n\nx\n\n## A2\n\ny\n'
}

function idsOf(md) {
  return parseSections(md, { file: 'x.md' }).map(s => s.id)
}

for (const [name, md] of Object.entries(CORPUS)) {
  test(`① 恒等：${name} —— 每段 content 原样写回均与原文逐字节相同`, () => {
    const secs = parseSections(md, { file: 'x.md' })
    assert.ok(secs.length > 0, '样本必须至少解析出一个段落')
    for (const s of secs) {
      const { text, verified } = replaceSectionInText(md, secs, s.id, s.content)
      assert.strictEqual(verified, true)
      assert.strictEqual(text, md, `段落「${s.title}」原样写回产生了字节差异`)
    }
  })
}

// ── 邻域守恒（真修改场景）──
const A = '# A\n\nbody\n\n# B\n\nb2\n'

test('② CRLF 文件改写后行尾仍为 CRLF（不得整份重写行尾）', () => {
  const md = A.replace(/\n/g, '\r\n')
  const secs = parseSections(md, { file: 'x.md' })
  const a = secs.find(s => s.title === 'A')
  const { text } = replaceSectionInText(md, secs, a.id, 'body2')
  assert.strictEqual(text, '# A\r\n\r\nbody2\r\n\r\n# B\r\n\r\nb2\r\n')
  assert.strictEqual(/\n(?!\r)/.test(text.replace(/\r\n/g, '')), false, '不得残留裸 LF')
})

test('③ LF 文件不被"顺手"改成 CRLF', () => {
  const secs = parseSections(A, { file: 'x.md' })
  const a = secs.find(s => s.title === 'A')
  assert.strictEqual(replaceSectionInText(A, secs, a.id, 'body2').text, '# A\n\nbody2\n\n# B\n\nb2\n')
})

test('④ 段末分隔空行守恒（改 A 不会吃掉 A 与 B 之间的空行）', () => {
  const secs = parseSections(A, { file: 'x.md' })
  const a = secs.find(s => s.title === 'A')
  assert.strictEqual(replaceSectionInText(A, secs, a.id, 'x').text, '# A\n\nx\n\n# B\n\nb2\n')
})

test('⑤ 末章改写保留文件末尾换行', () => {
  const secs = parseSections(A, { file: 'x.md' })
  const b = secs.find(s => s.title === 'B')
  assert.strictEqual(replaceSectionInText(A, secs, b.id, 'b2x').text, '# A\n\nbody\n\n# B\n\nb2x\n')
})

test('⑥ 原文没有末尾换行，写回也不凭空补一个', () => {
  const md = '# A\n\nbody\n\n# B\n\nb'
  const secs = parseSections(md, { file: 'x.md' })
  const a = secs.find(s => s.title === 'A')
  assert.strictEqual(replaceSectionInText(md, secs, a.id, 'x').text, '# A\n\nx\n\n# B\n\nb')
})

test('⑦ 末章原本无末尾换行，改写后仍无', () => {
  const md = '# A\n\nbody\n\n# B\n\nb'
  const secs = parseSections(md, { file: 'x.md' })
  const b = secs.find(s => s.title === 'B')
  assert.strictEqual(replaceSectionInText(md, secs, b.id, 'b2').text, '# A\n\nbody\n\n# B\n\nb2')
})

test('⑧ 三连空行分隔原样保留（不压缩成一行）', () => {
  const md = '# A\n\nbody\n\n\n# B\n\nb\n'
  const secs = parseSections(md, { file: 'x.md' })
  const a = secs.find(s => s.title === 'A')
  assert.strictEqual(replaceSectionInText(md, secs, a.id, 'x').text, '# A\n\nx\n\n\n# B\n\nb\n')
})

test('⑨ 空正文不堆出空段落（A 段清空后 A/B 之间只剩一行空行）', () => {
  const secs = parseSections(A, { file: 'x.md' })
  const a = secs.find(s => s.title === 'A')
  assert.strictEqual(replaceSectionInText(A, secs, a.id, '').text, '# A\n\n# B\n\nb2\n')
})

test('⑩ 多行正文整体落位', () => {
  const secs = parseSections(A, { file: 'x.md' })
  const a = secs.find(s => s.title === 'A')
  assert.strictEqual(replaceSectionInText(A, secs, a.id, 'l1\nl2').text, '# A\n\nl1\nl2\n\n# B\n\nb2\n')
})

test('⑪ 新正文自带尾部空行不与分隔空行叠加', () => {
  const secs = parseSections(A, { file: 'x.md' })
  const a = secs.find(s => s.title === 'A')
  assert.strictEqual(replaceSectionInText(A, secs, a.id, 'x\n\n').text, '# A\n\nx\n\n# B\n\nb2\n')
})

test('⑫ 改写子章后父章正文与兄弟章一字不动', () => {
  const md = '# A\n\n## A1\n\na1\n\n## A2\n\na2\n'
  const secs = parseSections(md, { file: 'x.md' })
  const a1 = secs.find(s => s.title === 'A1')
  const { text } = replaceSectionInText(md, secs, a1.id, 'a1-new')
  assert.strictEqual(text, '# A\n\n## A1\n\na1-new\n\n## A2\n\na2\n')
})

test('⑬ 改写围栏内的正文不影响围栏本身与后续章节', () => {
  const md = '# A\n\n```js\nlet x = 1\n```\n\n# B\n\nb\n'
  const secs = parseSections(md, { file: 'x.md' })
  const a = secs.find(s => s.title === 'A')
  const { text } = replaceSectionInText(md, secs, a.id, '```js\nlet x = 2\n```')
  assert.strictEqual(text, '# A\n\n```js\nlet x = 2\n```\n\n# B\n\nb\n')
})

test('⑭ 逐段连续改写 N 轮后仍无字节漂移（写盘抖动回归）', () => {
  let md = '# A\n\nbody\n\n# B\n\nb2\n'
  for (let round = 0; round < 3; round++) {
    let secs = parseSections(md, { file: 'x.md' })
    for (const s of secs) {
      // 内容不变 → 必须零改动；这是"用户点了保存但没改东西"的主路径
      md = replaceSectionInText(md, secs, s.id, s.content).text
      secs = parseSections(md, { file: 'x.md' })
    }
    assert.strictEqual(md, '# A\n\nbody\n\n# B\n\nb2\n', `第 ${round + 1} 轮出现漂移`)
  }
})

test('⑮ 真无修改时返回原串（空编辑不做任何字节级改写）', () => {
  const md = '# A\n\nbody   \n\n# B\n\nb\n' // 尾随空格是 markdown 硬换行，属"有意义的字节"
  const secs = parseSections(md, { file: 'x.md' })
  const a = secs.find(s => s.title === 'A')
  const r = replaceSectionInText(md, secs, a.id, a.content)
  assert.strictEqual(r.text, md)
  assert.strictEqual(r.verified, true)
})

test('⑯ 恒等写回不改变各段 id（id 稳定性不得依赖是否发生写入）', () => {
  const md = '# A\n\n## A1\n\nx\n\n# B\n\ny\n'
  const before = idsOf(md)
  const secs = parseSections(md, { file: 'x.md' })
  const out = replaceSectionInText(md, secs, secs[0].id, secs[0].content).text
  assert.deepStrictEqual(idsOf(out), before)
})

test('⑰ 恒等写回不改变各段 contentHash', () => {
  const md = '# A\n\n## A1\n\nx\n\n# B\n\ny\n'
  const before = parseSections(md, { file: 'x.md' }).map(s => s.contentHash)
  const secs = parseSections(md, { file: 'x.md' })
  const out = replaceSectionInText(md, secs, secs[1].id, secs[1].content).text
  assert.deepStrictEqual(parseSections(out, { file: 'x.md' }).map(s => s.contentHash), before)
})

test('⑱ 未知 sectionId 抛 E_SECTION_MISSING（不静默返回原文）', () => {
  const secs = parseSections(A, { file: 'x.md' })
  assert.throws(() => replaceSectionInText(A, secs, 'no-such-id', 'x'), /E_SECTION_MISSING/)
})

test('⑲ replaceTitle=true 时连标题行一起替换（正文不含标题行）', () => {
  const secs = parseSections(A, { file: 'x.md' })
  const a = secs.find(s => s.title === 'A')
  const { text } = replaceSectionInText(A, secs, a.id, '# A2\n\nbody2', { replaceTitle: true })
  assert.strictEqual(text, '# A2\n\nbody2\n\n# B\n\nb2\n')
})

test('⑳ 单段文件（无后续章节）：改写后不产生尾部垃圾行', () => {
  const md = '# 只有一段\n\n正文\n'
  const secs = parseSections(md, { file: 'x.md' })
  assert.strictEqual(replaceSectionInText(md, secs, secs[0].id, '新正文').text, '# 只有一段\n\n新正文\n')
})
