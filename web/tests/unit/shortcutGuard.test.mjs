// 全局快捷键焦点守卫单测（回归《详细设计_全量改造.md》模块7 中危项）
// 焦点在输入框/文本域时，F2/Ctrl+O 等全局快捷键不应误触发。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isEditableTarget, shouldFireGlobalShortcut } from '../../src/utils/shortcutGuard.js'

test('isEditableTarget：INPUT/TEXTAREA/SELECT 视为可编辑', () => {
  assert.equal(isEditableTarget({ tagName: 'INPUT' }), true)
  assert.equal(isEditableTarget({ tagName: 'TEXTAREA' }), true)
  assert.equal(isEditableTarget({ tagName: 'SELECT' }), true)
})

test('isEditableTarget：contentEditable 视为可编辑', () => {
  assert.equal(isEditableTarget({ tagName: 'DIV', isContentEditable: true }), true)
})

test('isEditableTarget：普通元素 / 空值视为不可编辑', () => {
  assert.equal(isEditableTarget({ tagName: 'DIV', isContentEditable: false }), false)
  assert.equal(isEditableTarget(null), false)
  assert.equal(isEditableTarget(undefined), false)
})

test('shouldFireGlobalShortcut：焦点在输入框时默认拦截', () => {
  const inputEl = { tagName: 'INPUT' }
  assert.equal(shouldFireGlobalShortcut(inputEl), false)
})

test('shouldFireGlobalShortcut：焦点在普通元素时放行', () => {
  const bodyEl = { tagName: 'BODY' }
  assert.equal(shouldFireGlobalShortcut(bodyEl), true)
})

test('shouldFireGlobalShortcut：allowInInput=true 时输入框也放行', () => {
  const inputEl = { tagName: 'TEXTAREA' }
  assert.equal(shouldFireGlobalShortcut(inputEl, { allowInInput: true }), true)
})
