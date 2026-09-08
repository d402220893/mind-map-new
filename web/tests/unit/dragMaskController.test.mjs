// web/tests/unit/dragMaskController.test.mjs
//
// 回归 v1.0.x 历史 bug：从系统拖入文件后 ".dragMask" 提示框不消失。
// 该 bug 修复必须满足以下契约，否则画布被覆盖、鼠标变禁止手势、必须刷新页面。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reduceDragMask } from '../../src/utils/dragMaskController.js'

const opts = { enableDragImport: true }

test('enter: 允许拖入时显示遮罩（false→true）', () => {
  assert.equal(reduceDragMask(false, 'enter', opts), true)
})

test('enter: 用户关闭 "允许拖入" 时，不显示遮罩（已关闭状态维持）', () => {
  // 这是用户偏好必须遵守，不能因为有人乱拖就硬开遮罩
  assert.equal(
    reduceDragMask(false, 'enter', { enableDragImport: false }),
    false
  )
  assert.equal(
    reduceDragMask(true, 'enter', { enableDragImport: false }),
    true
  )
})

test('enter: 正在拖大纲树节点时不显示遮罩', () => {
  assert.equal(
    reduceDragMask(false, 'enter', {
      enableDragImport: true,
      isDragOutlineTreeNode: true
    }),
    false
  )
})

test('leave: 关闭遮罩', () => {
  assert.equal(reduceDragMask(true, 'leave'), false)
})

test('leave: 已经关着再 leave 仍保持关闭（幂等）', () => {
  assert.equal(reduceDragMask(false, 'leave'), false)
})

test('drop: 关键回归 —— 已显示遮罩时被 drop 必关闭', () => {
  // 这是用户报障的核心路径：从系统拖 .smm → 拖入显示遮罩 → 在遮罩上 release
  // 必须立刻让出画布。原版此处不重置，导致 mask 永远卡住。
  assert.equal(reduceDragMask(true, 'drop'), false)
})

test('drop: 没显示遮罩时 drop 仍是 false（不影响其他状态）', () => {
  assert.equal(reduceDragMask(false, 'drop'), false)
})

test('drop: 任意其它 action 后的 drop 都能正确关闭', () => {
  // 即便上层错误地把状态搞错，drop 路径也能兜底
  assert.equal(reduceDragMask(true, 'drop'), false)
  assert.equal(reduceDragMask(false, 'drop'), false)
  assert.equal(reduceDragMask(true, 'leave'), false)
})

test('reset: 测试用强制关闭', () => {
  assert.equal(reduceDragMask(true, 'reset'), false)
  assert.equal(reduceDragMask(false, 'reset'), false)
})

test('未知 action: 维持当前状态（保守原则）', () => {
  assert.equal(reduceDragMask(true, 'dragover'), true)
  assert.equal(reduceDragMask(true, 'drag'), true)
  assert.equal(reduceDragMask(false, 'unknown'), false)
  assert.equal(reduceDragMask(true, ''), true)
  assert.equal(reduceDragMask(true, undefined), true)
})

test('场景剧本：完整拖入 → drop → 关闭，应不再卡住', () => {
  // 模拟完整流程：初始 false → 进入拖入 → 在遮罩上释放 → 期待 false
  let state = false
  state = reduceDragMask(state, 'enter', opts)
  assert.equal(state, true, '进入后应为 true')

  state = reduceDragMask(state, 'drop')
  assert.equal(state, false, 'drop 后必须回到 false —— 这是修复的关键断言')

  // 再来一次拖入仍能正常打开
  state = reduceDragMask(state, 'enter', opts)
  assert.equal(state, true, '第二次拖入仍能正常显示')

  // 第二轮也能干净地关闭
  state = reduceDragMask(state, 'leave')
  assert.equal(state, false, 'leave 仍能关闭')
})
