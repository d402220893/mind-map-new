// 良性告警白名单：识别必须**窄**（只放行已知模式），否则会把真错误一起吞掉——
// 这正是当初「创建 .smm 弹两次错误」的根因所在，故用测试钉死边界。
import { test } from 'node:test'
import assert from 'node:assert'
import {
  isBenignError,
  BENIGN_ERROR_PATTERNS
} from '../../src/utils/benignErrors.js'

test('识别 Chromium 原样消息（limit exceeded）', () => {
  assert.equal(isBenignError('ResizeObserver loop limit exceeded'), true)
})

test('带尾句点的变体同样识别', () => {
  assert.equal(isBenignError('ResizeObserver loop limit exceeded.'), true)
})

test('新版措辞 completed with undelivered notifications 同样识别', () => {
  assert.equal(isBenignError('ResizeObserver loop completed with undelivered notifications.'), true)
})

test('完整 stack 文本（真实上报形态）也能识别', () => {
  const stack =
    'Error: ResizeObserver loop limit exceeded\n' +
    '    at http://127.0.0.1:51888/dist/js/chunk-vendors.js:48:1'
  assert.equal(isBenignError(stack), true)
})

test('Error 实例入参也能识别（describe 之外的第二道保险）', () => {
  assert.equal(isBenignError(new Error('ResizeObserver loop limit exceeded')), true)
})

test('非良性错误不得被吞掉', () => {
  const cases = [
    'TypeError: Cannot read properties of null (reading resize)',
    '容器元素el的宽高不能为0',
    'Error: ResizeObserver disconnect is not a function',
    'window.error: some other thing'
  ]
  for (const c of cases) {
    assert.equal(isBenignError(c), false, '不应放行: ' + c)
  }
})

test('空值/非字符串入参安全返回 false', () => {
  assert.equal(isBenignError(null), false)
  assert.equal(isBenignError(undefined), false)
  assert.equal(isBenignError(''), false)
})

test('白名单模式非空且均为 RegExp（防误删后静默失效）', () => {
  assert.ok(Array.isArray(BENIGN_ERROR_PATTERNS) && BENIGN_ERROR_PATTERNS.length >= 1)
  for (const re of BENIGN_ERROR_PATTERNS) assert.ok(re instanceof RegExp)
})
