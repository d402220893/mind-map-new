import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reducePanelView, PANEL_VIEW_STATES } from '../../src/utils/panelViewState.js'

test('showOutline: md 模式（outlineEnabled）下切到大纲', () => {
  assert.equal(reducePanelView('files', { type: 'showOutline', outlineEnabled: true }), 'outline')
})

test('showOutline: 非 md 模式（outlineEnabled=false）原地不动（导图模式无大纲）', () => {
  assert.equal(reducePanelView('files', { type: 'showOutline', outlineEnabled: false }), 'files')
  assert.equal(reducePanelView('outline', { type: 'showOutline', outlineEnabled: false }), 'outline')
})

test('showFiles: 任意态切回文件树（发起搜索时强制切回的场景）', () => {
  assert.equal(reducePanelView('outline', { type: 'showFiles' }), 'files')
  assert.equal(reducePanelView('files', { type: 'showFiles' }), 'files')
})

test('大纲与文件树二选一：来回切换幂等', () => {
  let v = 'files'
  v = reducePanelView(v, { type: 'showOutline', outlineEnabled: true })
  assert.equal(v, 'outline')
  v = reducePanelView(v, { type: 'showOutline', outlineEnabled: true })
  assert.equal(v, 'outline') // 重复切大纲不变
  v = reducePanelView(v, { type: 'showFiles' })
  assert.equal(v, 'files')
})

test('非法 action / 状态原样返回', () => {
  assert.equal(reducePanelView('files', null), 'files')
  assert.equal(reducePanelView('files', { type: 'nope' }), 'files')
  assert.equal(reducePanelView('bogus', { type: 'showFiles' }), 'bogus')
})

test('PANEL_VIEW_STATES 含两态', () => {
  assert.deepEqual(PANEL_VIEW_STATES, ['files', 'outline'])
})
