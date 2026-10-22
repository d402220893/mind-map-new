// tableSelectionModel DOM 层单测：合并单元格检测 + getMatrix 换行保留。
// 用精简 DOM mock（childNodes / querySelector），不依赖 jsdom。
import assert from 'node:assert'
import test from 'node:test'
import { hasMergedCells, getMatrix } from '../../src/utils/tableSelectionModel.js'

// ── hasMergedCells ────────────────────────────────────────────────
test('hasMergedCells：无表格/无 querySelector → false', () => {
  assert.strictEqual(hasMergedCells(null), false)
  assert.strictEqual(hasMergedCells({}), false)
  assert.strictEqual(hasMergedCells({ querySelector: () => null }), false)
})

test('hasMergedCells：含 rowspan/colspan > 1 → true', () => {
  const td = { getAttribute: n => (n === 'rowspan' ? '2' : null) }
  assert.strictEqual(hasMergedCells({ querySelector: sel => (sel.includes('rowspan') || sel.includes('colspan')) ? td : null }), true)
  const td2 = { getAttribute: n => (n === 'colspan' ? '3' : null) }
  assert.strictEqual(hasMergedCells({ querySelector: sel => (sel.includes('rowspan') || sel.includes('colspan')) ? td2 : null }), true)
})

test('hasMergedCells：colspan/rowspan = 1（默认）不算合并', () => {
  const td = { getAttribute: n => (n === 'colspan' ? '1' : null) }
  assert.strictEqual(hasMergedCells({ querySelector: sel => (sel.includes('rowspan') || sel.includes('colspan')) ? td : null }), false)
})

// ── getMatrix 换行保留（现象 2） ──────────────────────────────────
function makeCell(kids) { return { childNodes: kids } }
const text = t => ({ nodeType: 3, nodeValue: t, childNodes: [] })
const br = { nodeType: 1, nodeName: 'BR', childNodes: [] }
const p = kids => ({ nodeType: 1, nodeName: 'P', childNodes: kids })

function makeTableWithNodes(rowsCells) {
  const rows = rowsCells.map(cells => ({ children: cells.map(makeCell) }))
  return { querySelectorAll: sel => (sel === 'tr' ? rows : []) }
}

test('getMatrix：<br> 还原为 \n，保留单元格内换行', () => {
  const tableEl = makeTableWithNodes([
    [ [text('a'), br, text('b')], [text('c')] ],
    [ [text('d')], [text('e')] ]
  ])
  assert.deepStrictEqual(getMatrix(tableEl), [['a\nb', 'c'], ['d', 'e']])
})

test('getMatrix：<p> 块级换行（首尾补 \n，块间不空行）', () => {
  const tableEl = makeTableWithNodes([
    [ [p([text('x'), br, text('y')]), text('tail')] ]
  ])
  assert.deepStrictEqual(getMatrix(tableEl), [['x\ny\ntail']])
})

test('getMatrix：普通文本表格（childNodes 不存在时回退 textContent）', () => {
  const tableEl = {
    querySelectorAll: sel => (sel === 'tr'
      ? [{ children: [{ textContent: 'A' }, { textContent: 'B' }] }, { children: [{ textContent: '1' }, { textContent: '2' }] }]
      : [])
  }
  assert.deepStrictEqual(getMatrix(tableEl), [['A', 'B'], ['1', '2']])
})
