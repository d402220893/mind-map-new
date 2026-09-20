import { test } from 'node:test'
import assert from 'node:assert'
import { parseSections } from '../../src/services/sectionParser.js'
import { replaceSectionInText } from '../../src/services/sectionWriter.js'
import { appError } from '../../src/services/errors.js'

test('替换章节正文返回新文本且 verified', () => {
  const md = '# A\n\nbody A\n# B\n\nbody B\n'
  const secs = parseSections(md)
  const { text, verified } = replaceSectionInText(md, secs, secs[0].id, 'new body A')
  assert.strictEqual(verified, true)
  assert.strictEqual(text.includes('new body A'), true)
})

test('保留其它章节不被改动', () => {
  const md = '# A\n\nbody A\n# B\n\nbody B\n'
  const secs = parseSections(md)
  const { text } = replaceSectionInText(md, secs, secs[0].id, 'new body A')
  assert.strictEqual(text.includes('body B'), true)
  assert.strictEqual(text.includes('# B'), true)
})

test('缺失 id 抛 E_SECTION_MISSING', () => {
  const md = '# A\n\nbody\n'
  const secs = parseSections(md)
  assert.throws(() => replaceSectionInText(md, secs, 'nope', 'x'), (e) => e.code === 'E_SECTION_MISSING')
})

test('replaceTitle=true 连同标题行替换', () => {
  const md = '# A\n\nbody\n'
  const secs = parseSections(md)
  const { text } = replaceSectionInText(md, secs, secs[0].id, '# AA\n\nbody', { replaceTitle: true })
  assert.strictEqual(text.startsWith('# AA'), true)
})

test('replaceTitle=false 标题行保留', () => {
  const md = '# A\n\nbody\n'
  const secs = parseSections(md)
  const { text } = replaceSectionInText(md, secs, secs[0].id, 'new body')
  assert.strictEqual(text.startsWith('# A'), true)
})

test('新内容出现在正确位置', () => {
  const md = '# A\n\nbody A\n# B\n\nbody B\n'
  const secs = parseSections(md)
  const { text } = replaceSectionInText(md, secs, secs[1].id, 'updated B')
  const idx = text.indexOf('updated B')
  const idxA = text.indexOf('body A')
  assert.ok(idx > idxA) // B 在 A 之后
})

test('尾空白不影响自校验', () => {
  const md = '# A\n\nbody\n'
  const secs = parseSections(md)
  const { verified } = replaceSectionInText(md, secs, secs[0].id, 'body  ')
  assert.strictEqual(verified, true)
})

test('多章节文档逐个替换独立', () => {
  const md = '# A\n\na\n# B\n\nb\n# C\n\nc\n'
  const secs = parseSections(md)
  const { text } = replaceSectionInText(md, secs, secs[1].id, 'B2')
  assert.strictEqual(text.includes('a'), true)
  assert.strictEqual(text.includes('B2'), true)
  assert.strictEqual(text.includes('c'), true)
})

test('返回对象含 text 与 verified', () => {
  const md = '# A\n\nb\n'
  const secs = parseSections(md)
  const r = replaceSectionInText(md, secs, secs[0].id, 'x')
  assert.ok('text' in r && 'verified' in r)
})

test('不改写无关正文', () => {
  const md = '# A\n\nbody A\n# B\n\nbody B\n'
  const secs = parseSections(md)
  const { text } = replaceSectionInText(md, secs, secs[0].id, 'x')
  assert.strictEqual(text.split('\n').filter(l => l.includes('body B')).length, 1)
})

test('替换后章节数不变', () => {
  const md = '# A\n\na\n# B\n\nb\n'
  const secs = parseSections(md)
  const { text } = replaceSectionInText(md, secs, secs[0].id, 'x')
  assert.strictEqual(parseSections(text).length, 2)
})

test('空新内容也可写回', () => {
  const md = '# A\n\nbody\n'
  const secs = parseSections(md)
  const { verified } = replaceSectionInText(md, secs, secs[0].id, '')
  assert.strictEqual(verified, true)
})

// ── 自校验 / 边界（§7.5.1）──
test('多行新内容整体落位', () => {
  const md = '# A\n\nbody\n# B\n\nb2\n'
  const secs = parseSections(md)
  const { text } = replaceSectionInText(md, secs, secs[0].id, 'l1\nl2\nl3')
  assert.strictEqual(text.split('\n').slice(0, 4).join('|'), '# A||l1|l2')
})

test('最后一章 endLine=全文末行：其尾部内容属该章，替换时一并覆盖', () => {
  const md = '# A\n\na\n# B\n\nb\n\ntail\n'
  const secs = parseSections(md)
  assert.strictEqual(secs[1].endLine, md.split('\n').length, '最后一章 endLine 到文末')
  const { text } = replaceSectionInText(md, secs, secs[1].id, 'B2')
  assert.strictEqual(text.includes('B2'), true)
  assert.strictEqual(text.includes('b\n'), false, '尾部内容属该章，被替换')
  assert.strictEqual(text.includes('a'), true, '前一章不受影响')
})

test('替换首章保留后续所有章节', () => {
  const md = '# A\n\na\n# B\n\nb\n# C\n\nc\n'
  const secs = parseSections(md)
  const { text } = replaceSectionInText(md, secs, secs[0].id, 'A2')
  assert.strictEqual(parseSections(text).length, 3)
})

test('嵌套标题（## 子章）可单独替换', () => {
  const md = '# A\n\n## A1\n\na1\n## A2\n\na2\n'
  const secs = parseSections(md)
  const a1 = secs.find(s => s.title === 'A1')
  const { text } = replaceSectionInText(md, secs, a1.id, 'new a1')
  assert.strictEqual(text.includes('new a1'), true)
  assert.strictEqual(text.includes('a2'), true)
})

test('替换子章不影响父章正文', () => {
  const md = '# A\n\nintro\n## A1\n\na1\n'
  const secs = parseSections(md)
  const a1 = secs.find(s => s.title === 'A1')
  const { text } = replaceSectionInText(md, secs, a1.id, 'x')
  assert.strictEqual(text.includes('intro'), true)
})

test('CRLF 文档可写回且不炸自校验', () => {
  const md = '# A\r\n\r\nbody\r\n'
  const secs = parseSections(md)
  const r = replaceSectionInText(md, secs, secs[0].id, 'newbody')
  assert.strictEqual(r.verified, true)
})

test('新内容含 markdown 标记不影响校验', () => {
  const md = '# A\n\nbody\n'
  const secs = parseSections(md)
  const { verified } = replaceSectionInText(md, secs, secs[0].id, '- 列表\n- 项2\n\n`代码`')
  assert.strictEqual(verified, true)
})

test('新内容与旧内容相同也可写回（幂等）', () => {
  const md = '# A\n\nbody\n'
  const secs = parseSections(md)
  const r1 = replaceSectionInText(md, secs, secs[0].id, 'body')
  const { text } = r1
  const secs2 = parseSections(text)
  const r2 = replaceSectionInText(text, secs2, secs2[0].id, 'body')
  assert.strictEqual(r2.verified, true)
})

test('替换后重新解析的 id 仍可定位（不改 id）', () => {
  const md = '# A\n\nbody\n# B\n\nb\n'
  const secs = parseSections(md)
  const { text } = replaceSectionInText(md, secs, secs[0].id, 'x')
  const again = parseSections(text)
  assert.strictEqual(again[0].id, secs[0].id)
})

test('E_SECTION_MISSING 的 info 含 sectionId', () => {
  const md = '# A\n\nbody\n'
  const secs = parseSections(md)
  assert.throws(() => replaceSectionInText(md, secs, 'ghost', 'x'), (e) => {
    assert.strictEqual(e.code, 'E_SECTION_MISSING')
    assert.strictEqual(e.info.sectionId, 'ghost')
    return true
  })
})

test('sections 为空数组 → 抛 E_SECTION_MISSING（不静默）', () => {
  assert.throws(() => replaceSectionInText('# A\n\nb\n', [], 'x', { replaceTitle: false }),
    (e) => e.code === 'E_SECTION_MISSING')
})

test('replaceTitle=true 改标题后仍能自校验', () => {
  const md = '# A\n\nbody\n# B\n\nb\n'
  const secs = parseSections(md)
  const { text, verified } = replaceSectionInText(md, secs, secs[0].id, '# Renamed\n\nbody', { replaceTitle: true })
  assert.strictEqual(verified, true)
  assert.strictEqual(parseSections(text)[0].title, 'Renamed')
})

test('替换不产生重复空行爆炸', () => {
  const md = '# A\n\nbody\n# B\n\nb\n'
  const secs = parseSections(md)
  const { text } = replaceSectionInText(md, secs, secs[0].id, 'x')
  assert.strictEqual(/\n{4,}/.test(text), false)
})

test('原文不被修改（纯函数，返回新串）', () => {
  const md = '# A\n\nbody\n'
  const secs = parseSections(md)
  replaceSectionInText(md, secs, secs[0].id, 'x')
  assert.strictEqual(md, '# A\n\nbody\n')
})
