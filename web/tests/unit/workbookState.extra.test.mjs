// 多文件工作区状态机 —— 补充用例（node --test 运行）
// 聚焦：默认命名、切换边界、关闭回落、dirty 独立、重命名边界、
// 去重大小写、另存为不影响其它文件、路径校验、损坏恢复、信息隐藏。
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
const B_PATH = 'E:/b.smm'

// ---------- 新增 / 命名 ----------
test('addWorkbook 无参时得到默认未命名名（未命名-N）', () => {
  freshStorage()
  const r = WB.addWorkbook({})
  assert.match(r.name, /^未命名-\d+$/)
})

test('addWorkbook 完成后新文件自动成为激活', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  assert.equal(WB.getActiveWorkbookId(), a.id)
})

// ---------- 切换边界 ----------
test('switchWorkbook 切换到已激活 id 返回 false（不重复切换）', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  assert.equal(WB.switchWorkbook(a.id), false)
})

test('switchWorkbook 不存在的 id 返回 false', () => {
  freshStorage()
  WB.addWorkbook({ name: 'A', filePath: A_PATH })
  assert.equal(WB.switchWorkbook('no-such-id'), false)
})

// ---------- 关闭回落 ----------
test('removeWorkbook 多文件时激活态回落到相邻（idx-1）', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  const b = WB.addWorkbook({ name: 'B', filePath: B_PATH })
  // 当前激活 b（idx=1），关闭 b 后应落到 a（idx-1）
  const res = WB.removeWorkbook(b.id)
  assert.equal(res.newActiveId, a.id)
})

test('removeWorkbook 不存在的 id 返回 null（多 workbook 场景）', () => {
  freshStorage()
  WB.addWorkbook({ name: 'A', filePath: A_PATH })
  WB.addWorkbook({ name: 'B', filePath: B_PATH })
  assert.equal(WB.removeWorkbook('no-such-id'), null)
})

// ---------- dirty 标记独立 ----------
test('markDirty/isDirty 各 workbook 独立，不互相污染', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  const b = WB.addWorkbook({ name: 'B', filePath: B_PATH })
  WB.markDirty(a.id, true)
  assert.equal(WB.isDirty(a.id), true)
  assert.equal(WB.isDirty(b.id), false)
  WB.markDirty(b.id, true)
  assert.equal(WB.isDirty(b.id), true)
})

// ---------- 重命名边界 ----------
test('renameWorkbook 只改名不改路径', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  const r = WB.renameWorkbook(a.id, 'A改名')
  assert.equal(r.oldName, 'A')
  assert.equal(r.newPath, A_PATH) // 路径保留
  assert.equal(WB.getWorkbookList().workbooks[0].name, 'A改名')
})

test('renameWorkbook 空 name 返回 null', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  assert.equal(WB.renameWorkbook(a.id, ''), null)
  assert.equal(WB.renameWorkbook(a.id, null), null)
})

test('renameWorkbook 不存在的 id 返回 null', () => {
  freshStorage()
  assert.equal(WB.renameWorkbook('no-such-id', 'X'), null)
})

// ---------- 去重大小写 ----------
test('findByPath 路径大小写不敏感', () => {
  freshStorage()
  WB.addWorkbook({ name: 'A', filePath: A_PATH })
  assert.ok(WB.findByPath('e:/A.SMM'))
  assert.ok(WB.findByPath('E:/a.smm'))
})

// ---------- 另存为隔离 ----------
test('applySaveAs 只改当前文件，其它文件 filePath 不受影响', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  const b = WB.addWorkbook({ name: 'B', filePath: B_PATH })
  WB.switchWorkbook(a.id)
  WB.applySaveAs('E:/a-saved.smm')
  // B 的原路径保持不动（原文件不被影响）
  assert.equal(WB.findByPath(B_PATH).filePath, B_PATH)
  // A 已重定向
  assert.equal(WB.findByPath('E:/a-saved.smm').filePath, 'E:/a-saved.smm')
})

test('applySaveAs 相对路径返回 null（不修改）', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  WB.switchWorkbook(a.id)
  assert.equal(WB.applySaveAs('relative.smm'), null)
  assert.equal(WB.getWorkbookList().workbooks[0].filePath, A_PATH)
})

// ---------- 路径校验 ----------
test('setCurrentFilePath 传入相对路径时保留原绝对路径（不误清）', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  WB.switchWorkbook(a.id)
  WB.setCurrentFilePath('relative.smm') // 非法 -> 忽略
  assert.equal(WB.getCurrentFilePath(), A_PATH) // 原值保留
})

test('setCurrentFilePath 显式空串会清空为未保存路径（新建空白语义）', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  WB.switchWorkbook(a.id)
  WB.setCurrentFilePath('') // 新建空白
  assert.equal(WB.getCurrentFilePath(), '')
})

test('getCurrentFilePath 当激活文件为相对路径时返回空串', () => {
  freshStorage()
  WB.addWorkbook({ name: 'A' }) // 无 filePath
  assert.equal(WB.getCurrentFilePath(), '')
})

// ---------- 信息隐藏 ----------
test('getWorkbookList 不返回 sheet 数据（防大对象泄漏到 UI）', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  WB.setActiveSheetState({
    activeId: 's1',
    sheets: [{ id: 's1', name: 'Sheet1', data: { root: { data: { text: 'x' } } } }]
  })
  const item = WB.getWorkbookList().workbooks.find(w => w.id === a.id)
  assert.equal(item.sheetState, undefined)
  assert.equal(item.sheets, undefined)
})

// ---------- 持久化健壮性 ----------
function throwingStorage() {
  const map = new Map()
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: () => { throw new Error('quota exceeded') },
    removeItem: k => map.delete(k)
  }
}

test('storage.setItem 抛错时被内部吞掉（addWorkbook 不向上抛）', () => {
  const s = throwingStorage()
  WB.initWorkbookStorage(s)
  WB.__resetForTest()
  WB.__initEmpty()
  // 不应抛
  assert.doesNotThrow(() => WB.addWorkbook({ name: 'A', filePath: A_PATH }))
})

test('loadState 遇到损坏 JSON 时重建默认单空白', () => {
  const s = makeStorage()
  WB.initWorkbookStorage(s)
  WB.__resetForTest()
  s.setItem('SIMPLE_MIND_MAP_WORKBOOKS', '{ this is not json ')
  const st = WB.loadState()
  assert.equal(st.workbooks.length, 1)
  assert.ok(st.workbooks[0].id)
})

test('loadState 正常读取已持久化的多 workbook', () => {
  const s = makeStorage()
  WB.initWorkbookStorage(s)
  WB.__resetForTest()
  WB.__initEmpty()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  const b = WB.addWorkbook({ name: 'B', filePath: B_PATH })
  // 清空内存态，模拟重启
  WB.__resetForTest()
  const st = WB.loadState()
  assert.equal(st.workbooks.length, 2)
  assert.ok(st.workbooks.some(w => w.id === a.id && w.name === 'A'))
  assert.ok(st.workbooks.some(w => w.id === b.id && w.name === 'B'))
})

// ---------- 多文件数据隔离（回归“数据串”核心 bug） ----------
test('切换 workbook 后 getActiveSheetState 返回的是对应文件数据（不串）', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  const b = WB.addWorkbook({ name: 'B', filePath: B_PATH })
  WB.switchWorkbook(a.id)
  WB.setActiveSheetState({
    activeId: 'sa',
    sheets: [{ id: 'sa', name: 'Sheet1', data: { root: { data: { text: 'A专属' }, children: [] } } }]
  })
  WB.switchWorkbook(b.id)
  WB.setActiveSheetState({
    activeId: 'sb',
    sheets: [{ id: 'sb', name: 'Sheet1', data: { root: { data: { text: 'B专属' }, children: [] } } }]
  })
  WB.switchWorkbook(a.id)
  assert.equal(WB.getActiveSheetState().sheets[0].data.root.data.text, 'A专属')
  WB.switchWorkbook(b.id)
  assert.equal(WB.getActiveSheetState().sheets[0].data.root.data.text, 'B专属')
})
