import assert from 'node:assert/strict'
import test from 'node:test'
import { clampMenuPosition } from '../../src/utils/menuPosition.js'

test('正常位置（不溢出）原样返回', () => {
  const p = clampMenuPosition(100, 100, 160, 200, 1920, 1080)
  assert.deepEqual(p, { x: 100, y: 100 })
})

test('右缘溢出 → 翻到内侧（vw - pad - w）', () => {
  // x + w = 1880 + 160 = 2040 > 1920 - 8 = 1912
  const p = clampMenuPosition(1880, 100, 160, 200, 1920, 1080, 8)
  assert.strictEqual(p.x, 1920 - 8 - 160) // 1752
  assert.strictEqual(p.y, 100)
})

test('底缘溢出 → 翻到内侧（vh - pad - h）', () => {
  const p = clampMenuPosition(100, 1000, 160, 200, 1920, 1080, 8)
  assert.strictEqual(p.y, 1080 - 8 - 200) // 872
  assert.strictEqual(p.x, 100)
})

test('左右/上下同时溢出 → 双向翻转', () => {
  const p = clampMenuPosition(1900, 1050, 160, 200, 1920, 1080, 8)
  assert.strictEqual(p.x, 1752)
  assert.strictEqual(p.y, 872)
})

test('左上角负值（x<pad）→ 夹到安全间距', () => {
  const p = clampMenuPosition(-50, -30, 160, 200, 1920, 1080, 8)
  assert.strictEqual(p.x, 8)
  assert.strictEqual(p.y, 8)
})

test('菜单宽大于视口（w > vw - 2*pad）→ 夹到 pad（左对齐优先）', () => {
  const p = clampMenuPosition(10, 100, 3000, 200, 1920, 1080, 8)
  assert.strictEqual(p.x, 8) // max(pad, vw - pad - w) = max(8, 负值) = 8
  assert.strictEqual(p.y, 100)
})

test('自定义 pad 生效', () => {
  const p = clampMenuPosition(1900, 100, 160, 200, 1920, 1080, 20)
  assert.strictEqual(p.x, 1920 - 20 - 160) // 1740
})

test('pad 非法（负数/NaN）→ 回退默认 8', () => {
  const neg = clampMenuPosition(1900, 100, 160, 200, 1920, 1080, -5)
  assert.strictEqual(neg.x, 1920 - 8 - 160)
  const nan = clampMenuPosition(1900, 100, 160, 200, 1920, 1080, NaN)
  assert.strictEqual(nan.x, 1920 - 8 - 160)
})

test('menuW/menuH 为 0 或非法 → 不翻转（视作无尺寸）', () => {
  const p = clampMenuPosition(1900, 100, 0, 0, 1920, 1080, 8)
  assert.strictEqual(p.x, 1900) // w=0 不溢出
  assert.strictEqual(p.y, 100)
})

test('vw/vh 极小（菜单必溢出）→ 夹到 pad', () => {
  const p = clampMenuPosition(5, 5, 300, 400, 320, 480, 8)
  assert.strictEqual(p.x, 8)
  assert.strictEqual(p.y, 8)
})
