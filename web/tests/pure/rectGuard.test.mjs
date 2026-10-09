import { test } from 'node:test'
import assert from 'node:assert'
import { isRectUsable, isElVisible } from '../../src/utils/rectGuard.js'

// 契约背景（v2.0.42 全屏报错修复）：
// simple-mind-map index.js#getElRectInfo 在容器宽高 ≤0 时
// throw「容器元素el的宽高不能为0」，沿 window error 冒泡弹致命错误框。
// 全屏进入/退出过渡瞬间容器可能短暂为 0 尺寸，所有 resize 入口必须过守卫。

test('isRectUsable: 正常尺寸放行', () => {
  assert.strictEqual(isRectUsable({ width: 100, height: 50 }), true)
  assert.strictEqual(isRectUsable({ width: 1, height: 1 }), true)
})

test('isRectUsable: 0 尺寸/负尺寸拒绝（事故形状：全屏过渡态）', () => {
  assert.strictEqual(isRectUsable({ width: 0, height: 0 }), false)
  assert.strictEqual(isRectUsable({ width: 100, height: 0 }), false)
  assert.strictEqual(isRectUsable({ width: 0, height: 100 }), false)
  assert.strictEqual(isRectUsable({ width: -1, height: 100 }), false)
})

test('isRectUsable: 空值拒绝（display:none 容器可能取不到 rect）', () => {
  assert.strictEqual(isRectUsable(null), false)
  assert.strictEqual(isRectUsable(undefined), false)
})

test('isElVisible: el 带 getBoundingClientRect 时按 rect 判定', () => {
  const visible = { getBoundingClientRect: () => ({ width: 10, height: 10 }) }
  const hidden = { getBoundingClientRect: () => ({ width: 0, height: 0 }) }
  assert.strictEqual(isElVisible(visible), true)
  assert.strictEqual(isElVisible(hidden), false)
})

test('isElVisible: el 为 null / 缺 getBoundingClientRect 时安全拒绝', () => {
  assert.strictEqual(isElVisible(null), false)
  assert.strictEqual(isElVisible(undefined), false)
  assert.strictEqual(isElVisible({}), false)
})
