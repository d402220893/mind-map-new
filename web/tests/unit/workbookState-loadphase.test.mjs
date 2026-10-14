// P0a 回归测试：加载态状态机（loadPhase）+ 保存闸门（saveGuard）。
// 纯 Node 单测，不依赖 Vue / DOM / simple-mind-map。
import test from 'node:test'
import assert from 'node:assert/strict'
import * as WB from '../../src/api/workbookState.js'
import { isSaveAllowed, countNodes, contentHash } from '../../src/utils/saveGuard.js'

test('isSaveAllowed: 仅 loaded 放行，其余一律拒绝', () => {
  for (const p of ['idle', 'loading', 'failed', undefined, null, '', 'LOADED']) {
    assert.equal(isSaveAllowed(p), false)
  }
  assert.equal(isSaveAllowed('loaded'), true)
})

test('countNodes: 跨所有 sheet 求总节点数', () => {
  const container = {
    app: 'smm-multisheet', version: 1, activeId: 's1',
    sheets: [
      { id: 's1', name: 'A', data: { root: { text: 'r', children: [{ text: 'a' }, { text: 'b', children: [{ text: 'c' }] }] } } },
      { id: 's2', name: 'B', data: { root: { text: 'r2', children: [] } } }
    ]
  }
  // s1: r,a,b,c = 4 ; s2: r2 = 1 → 5
  assert.equal(countNodes(container), 5)
})

test('countNodes: 单个合法空 sheet 不误判（边界1：按总数而非任一为 0）', () => {
  const container = {
    app: 'smm-multisheet', version: 1, activeId: 's1',
    sheets: [
      { id: 's1', name: 'A', data: { root: { text: 'r', children: [{ text: 'a' }] } } },
      { id: 's2', name: 'B', data: { root: { text: 'empty', children: [] } } }
    ]
  }
  // 总数 = 3（非空），即便 s2 为空 sheet，也不应被当作“全空”。
  assert.equal(countNodes(container), 3)
})

test('countNodes: 非法/空容器返回 0', () => {
  assert.equal(countNodes(null), 0)
  assert.equal(countNodes(undefined), 0)
  assert.equal(countNodes({}), 0)
  assert.equal(countNodes({ sheets: 'not-array' }), 0)
})

test('contentHash: 同内容同哈希，不同内容不同哈希', () => {
  const a = { sheets: [{ data: { text: 'x' } }] }
  assert.equal(contentHash(a), contentHash(a))
  assert.notEqual(contentHash(a), contentHash({ sheets: [{ data: { text: 'y' } }] }))
})

test('addWorkbook: 有绝对路径 → loading；无路径（新建空白簿）→ loaded', () => {
  WB.__initEmpty()
  const opened = WB.addWorkbook({ name: 'A', filePath: 'C:/x/1.smm', kind: 'mindmap' })
  assert.equal(WB.getLoadPhase(opened.id), 'loading')
  const blank = WB.addWorkbook({ name: 'B', filePath: '', kind: 'mindmap' })
  assert.equal(WB.getLoadPhase(blank.id), 'loaded')
})

test('setLoadPhase / getActiveLoadPhase: 切换与激活读取', () => {
  WB.__initEmpty()
  const a = WB.addWorkbook({ name: 'A', filePath: 'C:/x/1.smm' })
  // a 成为激活，初始 loading
  assert.equal(WB.getActiveLoadPhase(), 'loading')
  WB.setLoadPhase(a.id, 'failed')
  assert.equal(WB.getLoadPhase(a.id), 'failed')
  // 仍激活 → getActiveLoadPhase 同步
  assert.equal(WB.getActiveLoadPhase(), 'failed')
  WB.setLoadPhase(a.id, 'loaded')
  assert.equal(WB.getActiveLoadPhase(), 'loaded')
})

test('seedBaseline: 落库三字段不抛错（兼容部分字段）', () => {
  WB.__initEmpty()
  const a = WB.addWorkbook({ name: 'A', filePath: 'C:/x/1.smm' })
  assert.doesNotThrow(() => WB.seedBaseline(a.id, { size: 1234, hash: 'habc', nodeCount: 7 }))
  assert.doesNotThrow(() => WB.seedBaseline(a.id, { hash: 'hdef' }))
  // 不存在的 id 也不应抛错
  assert.doesNotThrow(() => WB.seedBaseline('nope', { size: 1 }))
})

test('未加载完（loading）闸门拒绝保存：模拟“打开中写盘被拦”', () => {
  WB.__initEmpty()
  const a = WB.addWorkbook({ name: 'A', filePath: 'C:/x/1.smm' }) // loading
  // 这正是 P0a 止血点：打开文件尚未渲染结束（loading）时，任何保存入口都须被闸门拦下。
  assert.equal(isSaveAllowed(WB.getLoadPhase(a.id)), false)
  // 渲染结束（onRenderEnd 的职责）置 loaded 后才放行
  WB.setLoadPhase(a.id, 'loaded')
  assert.equal(isSaveAllowed(WB.getLoadPhase(a.id)), true)
})
