// useTableSelection 控制器单测（mock DOM / ProseMirror view，不依赖真实浏览器）。
// 重点验证：拖动矩形选区状态、复制到 TSV+HTML+MD、列头/行头、Ctrl+A 两段式、Shift+方向键扩展。
import assert from 'node:assert'
import test from 'node:test'
import { createTableSelection } from '../../src/composables/useTableSelection.js'

// ── 测试环境全局桩 ────────────────────────────────────────────────
global.requestAnimationFrame = cb => { cb(); return 0 }
global.window = {
  addEventListener() {},
  removeEventListener() {},
  getSelection() { return { isCollapsed: true, anchorNode: null } }
}
global.document = {
  createElement() {
    return { style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, className: '' }
  },
  body: { appendChild() {} }
}

// 构造假 <table>（行/列用 children 数组，closest 走 tagName 匹配）
function makeTable(grid) {
  const rows = grid.map(cells => {
    const tr = { children: [] }
    cells.forEach(text => {
      const td = { tagName: 'TD', textContent: text, parentNode: tr }
      td.closest = sel => {
        if (sel === 'td, th') return td
        if (sel === 'table') return tableEl
        return null
      }
      tr.children.push(td)
    })
    tr.querySelectorAll = () => []
    return tr
  })
  const tableEl = {
    querySelectorAll: sel => (sel === 'tr' ? rows : []),
    contains: node => rows.some(r => r.children.includes(node)) || rows.includes(node)
  }
  rows.forEach(r => { r.parentNode = tableEl })
  return { tableEl, rows }
}

function makeThRow(cells, tableEl) {
  const tr = { children: [] }
  cells.forEach(text => {
    const th = { tagName: 'TH', textContent: text, parentNode: tr }
    th.closest = sel => {
      if (sel === 'td, th') return th
      if (sel === 'th') return th
      if (sel === 'table') return tableEl
      return null
    }
    tr.children.push(th)
  })
  return tr
}

function makeHost() {
  const listeners = {}
  return {
    listeners,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn) },
    removeEventListener(type, fn) {
      if (listeners[type]) listeners[type] = listeners[type].filter(f => f !== fn)
    },
    fire(type, e) { (listeners[type] || []).forEach(fn => fn(e)) }
  }
}

function makeEditor(tableEl) {
  const setCellCalls = []
  const inst = {
    __toastPatched: true,
    setCellSelection(a, b) { setCellCalls.push([a, b]) }
  }
  const selection = {
    $from: { depth: 2, node(d) { return d === 1 ? { type: { name: 'table' } } : { type: { name: 'paragraph' } } } }
  }
  const view = {
    state: { doc: { resolve: p => ({ pos: p }) }, selection },
    posAtDOM: () => 42,
    pluginViews: [inst]
  }
  const editor = {
    wwEditor: { view }
  }
  return { editor, view, inst, setCellCalls, selection }
}

const GRID = [
  ['A', 'B', 'C'],
  ['1', '2', '3'],
  ['x', 'y', 'z']
]

test('mousedown 在单元格 → 激活选区并驱动原生 CellSelection', () => {
  const { tableEl } = makeTable(GRID)
  const { editor, setCellCalls } = makeEditor(tableEl)
  const host = makeHost()
  const sel = createTableSelection({ getEditor: () => editor, host })
  sel.bind()
  const td = tableEl.querySelectorAll('tr')[0].children[1] // B
  host.fire('mousedown', { button: 0, target: td, preventDefault() {}, stopPropagation() {} })
  assert.strictEqual(sel.state.active, true)
  assert.deepStrictEqual(sel.state.anchor, { r: 0, c: 1 })
  assert.strictEqual(setCellCalls.length, 1)
  sel.unbind()
})

test('拖动：mousedown→mousemove→mouseup 形成矩形选区', () => {
  const { tableEl } = makeTable(GRID)
  const { editor, setCellCalls } = makeEditor(tableEl)
  const host = makeHost()
  const sel = createTableSelection({ getEditor: () => editor, host })
  sel.bind()
  const r0 = tableEl.querySelectorAll('tr')[0].children[0] // A
  const r2c2 = tableEl.querySelectorAll('tr')[2].children[2] // z
  host.fire('mousedown', { button: 0, target: r0, preventDefault() {}, stopPropagation() {} })
  host.fire('mousemove', { target: r2c2, preventDefault() {}, stopPropagation() {} })
  assert.deepStrictEqual(sel.state.anchor, { r: 0, c: 0 })
  assert.deepStrictEqual(sel.state.focus, { r: 2, c: 2 })
  assert.strictEqual(setCellCalls.length, 2)
  host.fire('mouseup', {})
  sel.unbind()
})

test('copySelection：返回 TSV + HTML + MD', () => {
  const { tableEl } = makeTable(GRID)
  const { editor } = makeEditor(tableEl)
  const host = makeHost()
  const sel = createTableSelection({ getEditor: () => editor, host })
  sel.bind()
  host.fire('mousedown', { button: 0, target: tableEl.querySelectorAll('tr')[0].children[0], preventDefault() {}, stopPropagation() {} })
  host.fire('mousemove', { target: tableEl.querySelectorAll('tr')[2].children[2], preventDefault() {}, stopPropagation() {} })
  const data = sel.copySelection()
  assert.strictEqual(data.tsv, 'A\tB\tC\n1\t2\t3\nx\ty\tz')
  assert.strictEqual(data.html, '<table><tr><td>A</td><td>B</td><td>C</td></tr><tr><td>1</td><td>2</td><td>3</td></tr><tr><td>x</td><td>y</td><td>z</td></tr></table>')
  assert.strictEqual(data.md, '| A | B | C |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| x | y | z |')
  sel.unbind()
})

test('列头点击 → 选整列；selectRow → 选整行', () => {
  const { tableEl, rows } = makeTable(GRID)
  const header = makeThRow(['A', 'B', 'C'], tableEl)
  rows.unshift(header)
  tableEl.querySelectorAll = sel => (sel === 'tr' ? rows : [])
  const { editor, setCellCalls } = makeEditor(tableEl)
  const host = makeHost()
  const sel = createTableSelection({ getEditor: () => editor, host })
  sel.bind()
  // onClick 模拟点首行 th 的第 2 列（B）
  const th = rows[0].children[1]
  host.fire('click', { target: th, preventDefault() {}, stopPropagation() {} })
  assert.deepStrictEqual(sel.state.anchor, { r: 0, c: 1 })
  assert.deepStrictEqual(sel.state.focus, { r: 3, c: 1 }) // 含表头共 4 行
  sel.selectRow(2)
  assert.deepStrictEqual(sel.state.focus, { r: 2, c: 2 })
  sel.unbind()
})

test('selectAllTable / extendSelection', () => {
  const { tableEl } = makeTable(GRID)
  const { editor, setCellCalls } = makeEditor(tableEl)
  const host = makeHost()
  const sel = createTableSelection({ getEditor: () => editor, host })
  sel.bind()
  sel.state.tableEl = tableEl // 模拟已知表格 DOM（mousedown / 光标反查）
  sel.selectAllTable()
  assert.deepStrictEqual(sel.state.anchor, { r: 0, c: 0 })
  assert.deepStrictEqual(sel.state.focus, { r: 2, c: 2 })
  sel.state.focus = { r: 0, c: 0 } // 单格后向右扩展
  const ok = sel.extendSelection('right')
  assert.strictEqual(ok, true)
  assert.deepStrictEqual(sel.state.focus, { r: 0, c: 1 })
  const okUp = sel.extendSelection('up') // 已到顶，应钳制返回 true 但不变
  assert.strictEqual(okUp, true)
  assert.deepStrictEqual(sel.state.focus, { r: 0, c: 1 })
  sel.unbind()
})

test('Ctrl+A 两段式：首次选表并返回 true，再次返回 false（放行全文档）', () => {
  const { tableEl } = makeTable(GRID)
  const { editor, selection } = makeEditor(tableEl)
  const host = makeHost()
  const sel = createTableSelection({ getEditor: () => editor, host })
  sel.bind()
  sel.state.tableEl = tableEl // 模拟已知表格 DOM（mousedown / 光标反查）
  const e1 = { key: 'a', ctrlKey: true, preventDefault() {} }
  assert.strictEqual(sel.handleCtrlA(e1), true)
  assert.strictEqual(sel.state.active, true) // 已选表
  const e2 = { key: 'a', ctrlKey: true, preventDefault() {} }
  assert.strictEqual(sel.handleCtrlA(e2), false) // 第二次放行
  // 光标不在表内 → 直接放行
  selection.$from = { depth: 2, node(d) { return { type: { name: 'paragraph' } } } }
  const e3 = { key: 'a', ctrlKey: true, preventDefault() {} }
  assert.strictEqual(sel.handleCtrlA(e3), false)
  sel.unbind()
})

test('reset 清空选区状态', () => {
  const { tableEl } = makeTable(GRID)
  const { editor } = makeEditor(tableEl)
  const host = makeHost()
  const sel = createTableSelection({ getEditor: () => editor, host })
  sel.bind()
  host.fire('mousedown', { button: 0, target: tableEl.querySelectorAll('tr')[0].children[0], preventDefault() {}, stopPropagation() {} })
  assert.strictEqual(sel.state.active, true)
  sel.reset()
  assert.strictEqual(sel.state.active, false)
  assert.strictEqual(sel.state.anchor, null)
  sel.unbind()
})
