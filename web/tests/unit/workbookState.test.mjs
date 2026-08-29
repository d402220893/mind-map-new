// 纯状态机单测（node --test 运行）
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as WB from '../../src/api/workbookState.js'

// 内存版 localStorage 模拟
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

// 状态机只认绝对路径（见 getCurrentFilePath），统一用绝对路径构造用例
const A_PATH = 'E:/a.smm'
const B_PATH = 'E:/b.smm'
const A2_PATH = 'E:/a2.smm'
const SAVED_PATH = 'E:/a-saved.smm'

function sheetStateWith(name, text) {
  return {
    activeId: 's_' + name,
    sheets: [{ id: 's_' + name, name, data: { root: { data: { text }, children: [] } } }]
  }
}

test('__initEmpty 后为空状态（0 个 workbook）', () => {
  freshStorage()
  const { workbooks } = WB.getWorkbookList()
  assert.equal(workbooks.length, 0)
})

test('新增 workbook 后各自持有独立 sheetState（隔离）', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  const b = WB.addWorkbook({ name: 'B', filePath: B_PATH })
  assert.equal(WB.getWorkbookList().workbooks.length, 2)
  // 给 A 写入数据，B 不应受影响
  WB.switchWorkbook(a.id)
  WB.setActiveSheetState(sheetStateWith('A', 'A-root'))
  WB.switchWorkbook(b.id)
  const bs = WB.getActiveSheetState()
  assert.notEqual(bs.sheets[0].data.root.data.text, 'A-root')
})

test('切换 workbook 后激活态正确', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  const b = WB.addWorkbook({ name: 'B', filePath: B_PATH })
  WB.switchWorkbook(b.id)
  assert.equal(WB.getActiveWorkbookId(), b.id)
})

test('重命名 workbook 同步更新 filePath', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  WB.renameWorkbook(a.id, 'A2', A2_PATH)
  const wb = WB.getWorkbookList().workbooks.find(w => w.id === a.id)
  assert.equal(wb.name, 'A2')
  assert.equal(wb.filePath, A2_PATH)
})

test('findByPath 去重：同绝对路径可命中，相对路径不命中', () => {
  freshStorage()
  WB.addWorkbook({ name: 'A', filePath: A_PATH })
  assert.ok(WB.findByPath(A_PATH))
  assert.equal(WB.findByPath('not-exist.smm'), null)
  assert.equal(WB.findByPath('a.smm'), null) // 相对路径不识别，返回 null
})

test('removeWorkbook 在仅剩一个时自动重建空白（保持 >=1）', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  WB.removeWorkbook(a.id)
  const wbs = WB.getWorkbookList().workbooks
  assert.equal(wbs.length, 1)
  assert.notEqual(wbs[0].id, a.id) // 已被新空白替换
})

test('removeWorkbook 多 workbook 时真正移除', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  const b = WB.addWorkbook({ name: 'B', filePath: B_PATH })
  const before = WB.getWorkbookList().workbooks.length
  WB.removeWorkbook(a.id)
  assert.equal(WB.getWorkbookList().workbooks.length, before - 1)
  assert.equal(WB.findByPath(A_PATH), null)
})

test('applySaveAs 更新当前激活 workbook 的 name/path', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  WB.switchWorkbook(a.id)
  const newName = WB.applySaveAs(SAVED_PATH)
  const wb = WB.getWorkbookList().workbooks.find(w => w.id === a.id)
  assert.equal(wb.filePath, SAVED_PATH)
  assert.equal(wb.name, newName)
})

test('getCurrentFilePath 返回当前激活 workbook 的绝对路径', () => {
  freshStorage()
  WB.addWorkbook({ name: 'A', filePath: A_PATH })
  WB.setCurrentFilePath(A_PATH)
  assert.equal(WB.getCurrentFilePath(), A_PATH)
})

test('persistState / loadState 往返一致', () => {
  const s = freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  WB.switchWorkbook(a.id)
  WB.setActiveSheetState(sheetStateWith('A', 'persist-me'))
  WB.persistState()
  // 用同一存储重建状态机，应当读回
  WB.__resetForTest()
  WB.initWorkbookStorage(s)
  WB.loadState()
  const bs = WB.getActiveSheetState()
  assert.equal(bs.sheets[0].data.root.data.text, 'persist-me')
})

// ---------- 自动保存时间戳 ----------
test('getLastAutosavedAt：未自动保存时默认 0', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  assert.equal(WB.getLastAutosavedAt(a.id), 0)
})

test('markAutosaved 设置时间戳并持久化（重启后仍可读回）', () => {
  const s = freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  const ts = 1700000000000
  WB.markAutosaved(a.id, ts)
  assert.equal(WB.getLastAutosavedAt(a.id), ts)
  // 持久化往返
  WB.__resetForTest()
  WB.initWorkbookStorage(s)
  WB.loadState()
  assert.equal(WB.getLastAutosavedAt(a.id), ts)
})

test('markAutosaved 不传 ts 时用当前时间（数字）', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  WB.markAutosaved(a.id)
  const v = WB.getLastAutosavedAt(a.id)
  assert.equal(typeof v, 'number')
  assert.ok(v > 0)
})

test('getLastAutosavedAt 不存在的 id 返回 0', () => {
  freshStorage()
  WB.addWorkbook({ name: 'A', filePath: A_PATH })
  assert.equal(WB.getLastAutosavedAt('no-such'), 0)
})
