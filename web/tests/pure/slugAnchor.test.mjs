// §11.2 A′ 预算：≥12（本文件 16）
// slug / anchor 属"跨文件引用"的地基：file.md#anchor 能否命中全看这两个函数，
// 故等价类要覆盖中/英/数/符/emoji/重复/大小写/前后空白/markdown 标记剥离。
import { test } from 'node:test'
import assert from 'node:assert'
import { slugify, buildAnchorMap, parseSections } from '../../src/services/sectionParser.js'

test('① 英文标题空格转连字符并小写', () => {
  assert.strictEqual(slugify('Hello World'), 'hello-world')
})

test('② 中文标题保留汉字', () => {
  assert.strictEqual(slugify('需求分析'), '需求分析')
})

test('③ 中英混合不丢任一侧', () => {
  const s = slugify('API 设计说明')
  assert.ok(s.includes('api'))
  assert.ok(s.includes('设计说明'))
})

test('④ 纯数字标题可用', () => {
  assert.strictEqual(slugify('2026'), '2026')
})

test('⑤ 剥离 markdown 行内标记（** / ` / _）', () => {
  assert.strictEqual(slugify('**粗体**与`代码`'), '粗体与代码')
})

test('⑥ 符号转连字符并压掉连续连字符', () => {
  assert.strictEqual(slugify('a --- b'), 'a-b')
})

test('⑦ 前后空白被 trim（不产生首尾连字符）', () => {
  const s = slugify('  spaced  ')
  assert.strictEqual(s, 'spaced')
})

test('⑧ 全空白标题不抛，返回空串', () => {
  assert.strictEqual(slugify('   '), '')
})

test('⑨ 空串 / null 输入不抛', () => {
  assert.strictEqual(slugify(''), '')
  assert.doesNotThrow(() => slugify(null))
  assert.doesNotThrow(() => slugify(undefined))
})

test('⑩ 重复标题由 used 集合追加 -1 / -2', () => {
  const used = new Set()
  const a = slugify('Dup', used)
  const b = slugify('Dup', used)
  const c = slugify('Dup', used)
  assert.strictEqual(a, 'dup')
  assert.strictEqual(b, 'dup-1')
  assert.strictEqual(c, 'dup-2')
})

test('⑪ 不传 used 集合时重复标题互不影响（各次独立）', () => {
  assert.strictEqual(slugify('X'), slugify('X'))
})

test('⑫ emoji 标题不抛且可作为 anchor', () => {
  assert.doesNotThrow(() => slugify('🚀 发布'))
})

test('⑬ buildAnchorMap 映射 anchor → 起始行号', () => {
  const secs = parseSections('# 需求分析\n\n正文\n## 功能列表\n\n正文\n', { file: 'a.md' })
  const map = buildAnchorMap(secs)
  assert.strictEqual(map.size, 2)
  const list = secs.find(s => s.title === '功能列表')
  assert.strictEqual(map.get(list.anchor), list.startLine)
})

test('⑭ buildAnchorMap 对空数组 / null 输入都返回空 Map（不抛）', () => {
  assert.strictEqual(buildAnchorMap([]).size, 0)
  assert.strictEqual(buildAnchorMap(null).size, 0)
  assert.strictEqual(buildAnchorMap(undefined).size, 0)
})

test('⑮ buildAnchorMap 重复 anchor 时后到覆盖先到', () => {
  const map = buildAnchorMap([{ anchor: 'x', startLine: 3 }, { anchor: 'x', startLine: 9 }])
  assert.strictEqual(map.size, 1)
  assert.strictEqual(map.get('x'), 9)
})

test('⑯ parseSections 产出的 anchor 与 slugify 同口径（改标题即改 anchor）', () => {
  const secs = parseSections('# 需求分析\n\nx\n', { file: 'a.md' })
  assert.strictEqual(secs[0].anchor, slugify('需求分析'))
})
