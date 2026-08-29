// 单文件多 Sheet 数据模型 —— 状态机层测试（node --test 运行）
// 说明：Sheet 级增删 UI 在 SheetTabs.vue，此处测状态机对“单文件内多 sheet”
// 的持有 / 隔离 / 切换 / 持久化 / 重命名保结构等底层支撑能力。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as WB from '../../src/api/workbookState.js'

function makeStorage() {
  const map = new Map()
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    _map: map
  }
}
function freshStorage() {
  const s = makeStorage()
  WB.initWorkbookStorage(s)
  WB.__resetForTest()
  WB.__initEmpty()
  return s
}

const A_PATH = 'E:/a.smm'

// 构造一个含两个 sheet 的 sheetState
function twoSheetState(text1, text2) {
  return {
    activeId: 's1',
    sheets: [
      { id: 's1', name: 'Sheet1', data: { root: { data: { text: text1 }, children: [] } } },
      { id: 's2', name: 'Sheet2', data: { root: { data: { text: text2 }, children: [] } } }
    ]
  }
}

test('单文件内多 sheet：各页数据互相隔离（不串页）', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  WB.setActiveSheetState(twoSheetState('第一页内容', '第二页内容'))
  const ss = WB.getActiveSheetState()
  assert.equal(ss.sheets.find(s => s.id === 's1').data.root.data.text, '第一页内容')
  assert.equal(ss.sheets.find(s => s.id === 's2').data.root.data.text, '第二页内容')
})

test('单文件内切换激活页后 getActiveSheetState 指向对应页', () => {
  freshStorage()
  WB.addWorkbook({ name: 'A', filePath: A_PATH })
  WB.setActiveSheetState(twoSheetState('P1', 'P2'))
  const cur = WB.getActiveSheetState()
  cur.activeId = 's2'
  WB.setActiveSheetState(cur)
  assert.equal(WB.getActiveSheetState().activeId, 's2')
  assert.equal(WB.getActiveSheetState().sheets.find(s => s.id === 's2').data.root.data.text, 'P2')
})

test('单文件多 sheet：修改某一页数据不影响其它页', () => {
  freshStorage()
  WB.addWorkbook({ name: 'A', filePath: A_PATH })
  WB.setActiveSheetState(twoSheetState('P1', 'P2'))
  const ss = WB.getActiveSheetState()
  ss.sheets.find(s => s.id === 's1').data.root.data.text = 'P1改了'
  WB.setActiveSheetState(ss)
  const after = WB.getActiveSheetState()
  assert.equal(after.sheets.find(s => s.id === 's1').data.root.data.text, 'P1改了')
  assert.equal(after.sheets.find(s => s.id === 's2').data.root.data.text, 'P2') // 不变
})

test('单文件多 sheet 持久化往返一致', () => {
  const s = freshStorage()
  WB.addWorkbook({ name: 'A', filePath: A_PATH })
  WB.setActiveSheetState(twoSheetState('持久1', '持久2'))
  WB.persistState()
  // 模拟重启
  WB.__resetForTest()
  WB.initWorkbookStorage(s)
  WB.loadState()
  const ss = WB.getActiveSheetState()
  assert.equal(ss.sheets.length, 2)
  assert.equal(ss.sheets.find(x => x.id === 's1').data.root.data.text, '持久1')
  assert.equal(ss.sheets.find(x => x.id === 's2').data.root.data.text, '持久2')
})

test('重命名 workbook 不破坏其多 sheet 结构', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  WB.setActiveSheetState(twoSheetState('P1', 'P2'))
  WB.renameWorkbook(a.id, 'A改名')
  const ss = WB.getActiveSheetState()
  assert.equal(ss.sheets.length, 2)
  assert.equal(WB.getWorkbookList().workbooks[0].name, 'A改名')
})

test('多个 workbook 各自持有独立 sheets，互不串', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  const b = WB.addWorkbook({ name: 'B', filePath: 'E:/b.smm' })
  WB.switchWorkbook(a.id)
  WB.setActiveSheetState(twoSheetState('A-P1', 'A-P2'))
  WB.switchWorkbook(b.id)
  WB.setActiveSheetState(twoSheetState('B-P1', 'B-P2'))
  WB.switchWorkbook(a.id)
  const sa = WB.getActiveSheetState()
  assert.equal(sa.sheets.find(x => x.id === 's1').data.root.data.text, 'A-P1')
  WB.switchWorkbook(b.id)
  const sb = WB.getActiveSheetState()
  assert.equal(sb.sheets.find(x => x.id === 's1').data.root.data.text, 'B-P1')
})

test('addWorkbook 注入自定义初始 sheetState 生效', () => {
  freshStorage()
  const r = WB.addWorkbook({
    name: 'A',
    filePath: A_PATH,
    sheetState: { activeId: 'custom', sheets: [{ id: 'custom', name: '自定义页', data: { root: { data: { text: 'X' } } } }] }
  })
  const ss = WB.getActiveSheetState()
  assert.equal(ss.activeId, 'custom')
  assert.equal(ss.sheets[0].name, '自定义页')
})

test('setActiveSheetState 传 null / undefined 不覆盖现有 sheetState（守卫）', () => {
  freshStorage()
  WB.addWorkbook({ name: 'A', filePath: A_PATH })
  WB.setActiveSheetState(twoSheetState('P1', 'P2'))
  const before = WB.getActiveSheetState()
  WB.setActiveSheetState(null)
  WB.setActiveSheetState(undefined)
  const after = WB.getActiveSheetState()
  assert.equal(after.sheets.length, before.sheets.length)
  assert.equal(after.sheets[0].data.root.data.text, 'P1')
})

test('单文件内 3+ sheet：激活态索引切换正确', () => {
  freshStorage()
  WB.addWorkbook({ name: 'A', filePath: A_PATH })
  WB.setActiveSheetState({
    activeId: 's1',
    sheets: [
      { id: 's1', name: 'S1', data: { root: { data: { text: '1' } } } },
      { id: 's2', name: 'S2', data: { root: { data: { text: '2' } } } },
      { id: 's3', name: 'S3', data: { root: { data: { text: '3' } } } }
    ]
  })
  const cur = WB.getActiveSheetState()
  cur.activeId = 's3'
  WB.setActiveSheetState(cur)
  assert.equal(WB.getActiveSheetState().activeId, 's3')
})
