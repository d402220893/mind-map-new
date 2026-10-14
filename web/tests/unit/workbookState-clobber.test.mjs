// 回归护城河：打开/新建/导入不得冲掉「当前正在编辑的文件」（HANDOVER §13 同类 bug）。
//
// 核心不变量：loadSheetsContainer / setActiveSheetState 永远只作用在「当前激活 workbook」。
// 因此任何「载入新内容」的操作都**必须**先 addWorkbook 切到新标签，再写；否则会直接覆盖
// 当前正在编辑的文件（这正是 newWorkbook 曾踩的坑，现已修复）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as WB from '../../src/api/workbookState.js'

function makeStorage() {
  const map = new Map()
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k)
  }
}

function setup() {
  const s = makeStorage()
  WB.initWorkbookStorage(s)
  WB.__resetForTest()
  WB.__initEmpty()
  WB.setDefaultSheetData({ root: { data: { text: '默认' }, children: [] } })
  return s
}

const A_DATA = { root: { data: { text: 'A中心' }, children: [{ data: { text: 'A子' } }] } }
const B_DATA = { root: { data: { text: 'B中心' }, children: [{ data: { text: 'B子' } }] } }

function sheetStateOf(data, name) {
  const sid = 'sheet-' + name
  return { activeId: sid, sheets: [{ id: sid, name, data }] }
}

test('危险样本：当前激活 A 时直接 setActiveSheetState(B) 会冲掉 A（记录缺陷类，确保修复方向正确）', () => {
  setup()
  WB.addWorkbook({ name: 'A', filePath: 'E:/a.smm' }) // active=A
  WB.setActiveSheetState(sheetStateOf(A_DATA, 'A')) // A 已载入

  // 模拟「未 addWorkbook 就 loadSheetsContainer」的隐患
  WB.setActiveSheetState(sheetStateOf(B_DATA, 'B'))

  // 此时激活的还是 A（没有新标签），所以 A 的 sheetState 被 B 覆盖
  assert.equal(WB.getActiveSheetState().sheets[0].data.root.data.text, 'B中心', 'A 被 B 覆盖')
  assert.equal(WB.getWorkbookList().workbooks.length, 1, '没有产生新标签，却覆盖了当前文件')
})

test('修复后：先 addWorkbook(B) 再 setActiveSheetState(B)，A 不受影响、B 正确创建', () => {
  setup()
  const aId = WB.addWorkbook({ name: 'A', filePath: 'E:/a.smm' }).id // active=A
  WB.setActiveSheetState(sheetStateOf(A_DATA, 'A'))

  // 正确顺序：先开新标签
  const bId = WB.addWorkbook({ name: 'B', filePath: 'E:/b.smm' }).id // active=B
  WB.setActiveSheetState(sheetStateOf(B_DATA, 'B'))

  // 切回 A 验证其内容完好
  WB.switchWorkbook(aId)
  assert.equal(WB.getActiveSheetState().sheets[0].data.root.data.text, 'A中心', 'A 内容完好')
  // B 标签存在且内容正确
  WB.switchWorkbook(bId)
  assert.equal(WB.getActiveSheetState().sheets[0].data.root.data.text, 'B中心', 'B 内容正确')
  assert.equal(WB.getWorkbookList().workbooks.length, 2, 'A、B 两个标签都在')
})

test('修复后：打开/新建时即便当前文件有未保存编辑，也不会串到新文件', () => {
  setup()
  const aId = WB.addWorkbook({ name: 'A', filePath: 'E:/a.smm' }).id
  WB.setActiveSheetState(sheetStateOf(A_DATA, 'A'))
  // 模拟 A 在编辑中（sheetState 已是 A_DATA），此时新建 B
  const bId = WB.addWorkbook({ name: 'B', filePath: 'E:/b.smm' }).id
  WB.setActiveSheetState(sheetStateOf(B_DATA, 'B'))
  // A 的 sheetState 不被 B 的载入触碰
  WB.switchWorkbook(aId)
  assert.equal(WB.getActiveSheetState().sheets[0].data.root.data.text, 'A中心')
})
