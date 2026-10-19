// Markdown 表格选区纯函数单测（string[][] 运算，无 DOM）。
import assert from 'node:assert'
import test from 'node:test'
import { normalizeRect, clampCell, serializeTsv, serializeHtml, serializeMd } from '../../src/utils/tableSelection.js'

test('normalizeRect：正向 / 反向 / 同格', () => {
  assert.deepStrictEqual(normalizeRect({ r: 1, c: 2 }, { r: 3, c: 5 }), { r0: 1, c0: 2, r1: 3, c1: 5 })
  assert.deepStrictEqual(normalizeRect({ r: 3, c: 5 }, { r: 1, c: 2 }), { r0: 1, c0: 2, r1: 3, c1: 5 })
  assert.deepStrictEqual(normalizeRect({ r: 2, c: 2 }, { r: 2, c: 2 }), { r0: 2, c0: 2, r1: 2, c1: 2 })
})

test('clampCell：越界 clamp / 空矩阵返回 null', () => {
  assert.deepStrictEqual(clampCell({ r: -1, c: 0 }, 4, 3), { r: 0, c: 0 })
  assert.deepStrictEqual(clampCell({ r: 9, c: 9 }, 4, 3), { r: 3, c: 2 })
  assert.strictEqual(clampCell(null, 4, 3), null)
  assert.strictEqual(clampCell({ r: 0, c: 0 }, 0, 0), null)
})

const M = [
  ['A', 'B', 'C'],
  ['1', '2', '3'],
  ['x', 'y', 'z']
]

test('serializeTsv：子矩阵 / 单行 / 单列 / 单格', () => {
  assert.strictEqual(serializeTsv(M, { r0: 0, c0: 0, r1: 2, c1: 2 }), 'A\tB\tC\n1\t2\t3\nx\ty\tz')
  assert.strictEqual(serializeTsv(M, { r0: 1, c0: 0, r1: 1, c1: 2 }), '1\t2\t3')
  assert.strictEqual(serializeTsv(M, { r0: 0, c0: 1, r1: 2, c1: 1 }), 'B\n2\ny')
  assert.strictEqual(serializeTsv(M, { r0: 1, c0: 1, r1: 1, c1: 1 }), '2')
})

test('serializeTsv：空 rect / 越界坐标补空串', () => {
  assert.strictEqual(serializeTsv(M, null), '')
  assert.strictEqual(serializeTsv(M, { r0: 0, c0: 0, r1: 3, c1: 2 }), 'A\tB\tC\n1\t2\t3\nx\ty\tz\n\t\t')
})

test('serializeHtml：<table> 片段 + 转义', () => {
  const html = serializeHtml([['a<b', 'c>d']], { r0: 0, c0: 0, r1: 0, c1: 1 })
  assert.strictEqual(html, '<table><tr><td>a&lt;b</td><td>c&gt;d</td></tr></table>')
})

test('serializeMd：首行表头 + 分隔线 + 管道转义', () => {
  const md = serializeMd(
    [['h1', 'h|2'], ['a', 'b'], ['c', 'd']],
    { r0: 0, c0: 0, r1: 2, c1: 1 }
  )
  assert.strictEqual(md, '| h1 | h\\|2 |\n| --- | --- |\n| a | b |\n| c | d |')
})

test('serializeMd：越界补空格', () => {
  const md = serializeMd(M, { r0: 0, c0: 0, r1: 2, c1: 5 })
  assert.strictEqual(md, '| A | B | C |   |   |   |\n| --- | --- | --- | --- | --- | --- |\n| 1 | 2 | 3 |   |   |   |\n| x | y | z |   |   |   |')
})
