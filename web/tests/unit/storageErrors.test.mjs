// 存储异常判定单测（回归《详细设计_全量改造.md》模块1 低危项）
// 原代码用 `if ('exceeded')` 字符串常量恒真，任何写入异常都会误报超限。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isQuotaExceededError } from '../../src/api/storageErrors.js'

test('配额超限：标准 QuotaExceededError', () => {
  assert.equal(isQuotaExceededError({ name: 'QuotaExceededError' }), true)
})

test('配额超限：Firefox 码 22 / Safari 码 1014', () => {
  assert.equal(isQuotaExceededError({ code: 22 }), true)
  assert.equal(isQuotaExceededError({ code: 1014 }), true)
})

test('配额超限：IE/旧 Edge number', () => {
  assert.equal(isQuotaExceededError({ number: 0x8007000e }), true)
})

test('非配额异常：返回 false（不应误报超限）', () => {
  assert.equal(isQuotaExceededError({ name: 'TypeError' }), false)
  assert.equal(isQuotaExceededError({ name: 'SyntaxError' }), false)
  assert.equal(isQuotaExceededError(null), false)
  assert.equal(isQuotaExceededError(undefined), false)
})
