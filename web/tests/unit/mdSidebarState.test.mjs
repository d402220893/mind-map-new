import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reduceSidebarState, SIDEBAR_STATES } from '../../src/utils/mdSidebarState.js'

test('toggleShow: hidden ↔ icons', () => {
  assert.equal(reduceSidebarState('hidden', { type: 'toggleShow' }), 'icons')
  assert.equal(reduceSidebarState('icons', { type: 'toggleShow' }), 'hidden')
})

test('toggleShow: 面板态也收为 hidden（图标栏整体隐藏）', () => {
  assert.equal(reduceSidebarState('outline', { type: 'toggleShow' }), 'hidden')
  assert.equal(reduceSidebarState('search', { type: 'toggleShow' }), 'hidden')
})

test('trigger: 再点当前项收起回 icons', () => {
  assert.equal(reduceSidebarState('outline', { type: 'trigger', item: 'outline' }), 'icons')
  assert.equal(reduceSidebarState('search', { type: 'trigger', item: 'search' }), 'icons')
})

test('trigger: 从 icons/search 切到 outline', () => {
  assert.equal(reduceSidebarState('icons', { type: 'trigger', item: 'outline' }), 'outline')
  assert.equal(reduceSidebarState('search', { type: 'trigger', item: 'outline' }), 'outline')
})

test('trigger: outline → search', () => {
  assert.equal(reduceSidebarState('outline', { type: 'trigger', item: 'search' }), 'search')
})

test('close: 面板态收起回 icons，非面板态不变', () => {
  assert.equal(reduceSidebarState('outline', { type: 'close' }), 'icons')
  assert.equal(reduceSidebarState('search', { type: 'close' }), 'icons')
  assert.equal(reduceSidebarState('icons', { type: 'close' }), 'icons')
  assert.equal(reduceSidebarState('hidden', { type: 'close' }), 'hidden')
})

test('openOutline: 任意态 → outline', () => {
  assert.equal(reduceSidebarState('icons', { type: 'openOutline' }), 'outline')
  assert.equal(reduceSidebarState('search', { type: 'openOutline' }), 'outline')
})

test('非法 action / 状态原样返回', () => {
  assert.equal(reduceSidebarState('icons', null), 'icons')
  assert.equal(reduceSidebarState('icons', { type: 'nope' }), 'icons')
  assert.equal(reduceSidebarState('bogus', { type: 'toggleShow' }), 'bogus')
})

test('SIDEBAR_STATES 含四态', () => {
  assert.deepEqual(SIDEBAR_STATES, ['hidden', 'icons', 'outline', 'search'])
})
