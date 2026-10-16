import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tableRowsToMd } from '../../src/utils/htmlTableToMd.js'

test('标准 3x3 表格，分隔线在首行之后', () => {
  const md = tableRowsToMd([['A', 'B', 'C'], ['1', '2', '3'], ['4', '5', '6']])
  const lines = md.split('\n')
  assert.equal(lines[0], '| A | B | C |')
  assert.equal(lines[1], '| --- | --- | --- |')
  assert.equal(lines[2], '| 1 | 2 | 3 |')
  assert.equal(lines[3], '| 4 | 5 | 6 |')
})

test('单元格含 | 转义为 \\|', () => {
  assert.equal(tableRowsToMd([['a|b', 'c']]).split('\n')[0], '| a\\|b | c |')
})

test('空单元格占位空格', () => {
  assert.equal(tableRowsToMd([['', 'x']]).split('\n')[0], '|   | x |')
})

test('空输入返回空串', () => {
  assert.equal(tableRowsToMd([]), '')
  assert.equal(tableRowsToMd(null), '')
  assert.equal(tableRowsToMd(undefined), '')
})

test('列数不齐用首行列数生成分隔线', () => {
  const md = tableRowsToMd([['a', 'b'], ['c']])
  const lines = md.split('\n')
  assert.equal(lines[1], '| --- | --- |')
})

test('单行表格也生成分隔线', () => {
  const md = tableRowsToMd([['h1', 'h2']])
  const lines = md.split('\n')
  assert.equal(lines[0], '| h1 | h2 |')
  assert.equal(lines[1], '| --- | --- |')
})

test('单元格前后空白被 trim', () => {
  assert.equal(tableRowsToMd([['  x  ', 'y']]).split('\n')[0], '| x | y |')
})
