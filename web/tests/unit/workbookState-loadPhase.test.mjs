// 加载态（loadPhase）状态机单测（node --test 运行）
// 锁定 P0a 闸门 A 依赖的状态机语义，以及“启动首载重灌默认 loaded”的缺口
// （该缺口由 Edit.vue.initLoadGuard 在启动时补偿为 loading，否则闸门在恢复窗口敞开）。
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

test('addWorkbook：打开已有文件（绝对路径）=> loadPhase loading（须受闸门保护）', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  assert.equal(WB.getLoadPhase(a.id), 'loading')
  assert.equal(WB.getActiveLoadPhase(), 'loading')
})

test('addWorkbook：新建空白（无路径）=> loadPhase loaded（可信空态，不参与异步加载）', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A' })
  assert.equal(WB.getLoadPhase(a.id), 'loaded')
})

test('setLoadPhase / getLoadPhase：四态往返正确', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH })
  for (const p of ['loading', 'loaded', 'failed', 'idle']) {
    WB.setLoadPhase(a.id, p)
    assert.equal(WB.getLoadPhase(a.id), p)
  }
})

test('getActiveLoadPhase：反映当前激活 workbook 的相位', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: A_PATH }) // loading
  assert.equal(WB.getActiveLoadPhase(), 'loading')
  WB.setLoadPhase(a.id, 'loaded')
  assert.equal(WB.getActiveLoadPhase(), 'loaded')
})

test('normalize 缺口：重灌状态缺 loadPhase 时默认 loaded（首载须由 initLoadGuard 补偿为 loading）', () => {
  // 复现 loadState 的持久化形状——workbook 不带 loadPhase 字段，
  // normalize 会默认置 'loaded'（见 workbookState.js normalize）。
  freshStorage()
  const s = makeStorage()
  WB.initWorkbookStorage(s)
  // 直接塞一个缺 loadPhase 的持久化状态
  s.setItem(
    'SIMPLE_MIND_MAP_WORKBOOKS',
    JSON.stringify({
      activeId: 'wb-1',
      workbooks: [
        { id: 'wb-1', name: 'A', filePath: A_PATH, dirty: false, kind: 'mindmap', sheetState: { activeId: 's1', sheets: [{ id: 's1', name: 'Sheet1', data: { root: { data: { text: 'x' }, children: [] } } }] } }
      ]
    })
  )
  WB.__resetForTest()
  const st = WB.loadState()
  assert.equal(st.workbooks[0].loadPhase, 'loaded') // 缺口：默认 loaded
  // 补偿（initLoadGuard 在启动首载应执行）：把激活簿置 loading，闸门随即关闭
  WB.setLoadPhase('wb-1', 'loading')
  assert.equal(WB.getActiveLoadPhase(), 'loading')
})
