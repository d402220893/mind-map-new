import test from 'node:test'
import assert from 'node:assert'
import { diffLines, splitLines } from '../../src/utils/diff.js'

test('① 完全相同 → 全部 same，无增删', () => {
  const d = diffLines('a\nb\nc', 'a\nb\nc')
  assert.strictEqual(d.mine.length, 3)
  assert.ok(d.mine.every(l => l.type === 'same'))
  assert.ok(d.current.every(l => l.type === 'same'))
})

test('② 新增行 → current 侧 add', () => {
  const d = diffLines('a\nb', 'a\nb\nc')
  const adds = d.current.filter(l => l.type === 'add')
  assert.strictEqual(adds.length, 1)
  assert.strictEqual(adds[0].text, 'c')
})

test('③ 删除行 → mine 侧 del', () => {
  const d = diffLines('a\nb\nc', 'a\nc')
  const dels = d.mine.filter(l => l.type === 'del')
  assert.strictEqual(dels.length, 1)
  assert.strictEqual(dels[0].text, 'b')
})

test('④ 修改行 → 双侧 mod（del+add 折叠）', () => {
  const d = diffLines('a\nb\nc', 'a\nB\nc')
  const m = d.mine.find(l => l.type === 'mod')
  const c = d.current.find(l => l.type === 'mod')
  assert.ok(m && c, '两侧都应出现 mod')
  assert.strictEqual(m.text, 'b')
  assert.strictEqual(c.text, 'B')
})

test('⑤ merged 左优先：删/改采用「你的修改」', () => {
  const d = diffLines('mine\nkeep', 'other\nkeep')
  assert.strictEqual(d.merged.includes('mine'), true)
})

test('⑥ 空 vs 非空：全 add', () => {
  const d = diffLines('', 'a\nb')
  assert.strictEqual(d.mine.length, 0)
  assert.strictEqual(d.current.filter(l => l.type === 'add').length, 2)
})

test('⑦ 非空 vs 空：全 del', () => {
  const d = diffLines('a\nb', '')
  assert.strictEqual(d.current.length, 0)
  assert.strictEqual(d.mine.filter(l => l.type === 'del').length, 2)
})

test('⑧ 两侧皆空 → 空结果不抛', () => {
  const d = diffLines('', '')
  assert.strictEqual(d.mine.length, 0)
  assert.strictEqual(d.merged, '')
})

test('⑨ CRLF 归一化：\\r\\n 与 \\n 视为相同行', () => {
  const d = diffLines('a\r\nb', 'a\nb')
  assert.ok(d.mine.every(l => l.type === 'same'))
})

test('⑩ 尾部换行不产生幽灵空行差异以外的错配', () => {
  const d = diffLines('a\nb\n', 'a\nb')
  assert.ok(d.mine.length >= 2)
})

test('⑪ 顺序保持：diff 输出行序与输入一致', () => {
  const d = diffLines('x\ny\nz', 'x\nQ\nz')
  assert.strictEqual(d.mine[0].text, 'x')
  assert.strictEqual(d.mine[2].text, 'z')
})

test('⑫ 多行块替换：2 删 2 增 → 2 mod', () => {
  const d = diffLines('a\nb\nc\nd', 'a\nX\nY\nd')
  assert.strictEqual(d.mine.filter(l => l.type === 'mod').length, 2)
})

test('⑬ 删多增少：多余的一侧保留为 del', () => {
  const d = diffLines('a\nb\nc', 'a\nX')
  assert.strictEqual(d.mine.filter(l => l.type === 'mod').length, 1)
  assert.strictEqual(d.mine.filter(l => l.type === 'del').length, 1)
})

test('⑭ splitLines 对 null/undefined/空串 返回 []', () => {
  assert.deepStrictEqual(splitLines(null), [])
  assert.deepStrictEqual(splitLines(undefined), [])
  assert.deepStrictEqual(splitLines(''), [])
})

test('⑮ 中文与 emoji 行正常 diff', () => {
  const d = diffLines('需求分析\n设计', '需求分析\n设计（新）')
  assert.strictEqual(d.current.filter(l => l.type === 'mod').length, 1)
})

test('⑯ merged 不含冲突标记（三路初值可直用）', () => {
  const d = diffLines('a\nb', 'a\nc')
  assert.strictEqual(d.merged.includes('<<<<<<<'), false)
})

test('⑰ 大输入不爆栈（200×200 LCS）', () => {
  const a = Array.from({ length: 200 }, (_, i) => 'l' + i).join('\n')
  const b = a.replace('l100', 'L100')
  const d = diffLines(a, b)
  assert.ok(d.mine.length >= 200)
})

test('⑱ 行内空白差异也算不同行', () => {
  const d = diffLines('a b', 'a  b')
  assert.ok(d.mine.some(l => l.type !== 'same'))
})
