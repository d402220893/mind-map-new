import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveMdCommand } from '../../src/utils/mdCommands.js'

// 假 Toast UI Editor：记录 exec 调用
function fakeEditor() {
  const calls = []
  return { exec: (...args) => calls.push(args), calls }
}

test('heading1 调 exec(heading, { level: 1 })', () => {
  const e = fakeEditor()
  const fn = resolveMdCommand('heading1', e)
  assert.equal(typeof fn, 'function')
  fn(e)
  assert.deepEqual(e.calls, [['heading', { level: 1 }]])
})

test('heading2 / heading3 层级正确', () => {
  const e = fakeEditor()
  resolveMdCommand('heading2', e)(e)
  resolveMdCommand('heading3', e)(e)
  assert.deepEqual(e.calls, [['heading', { level: 2 }], ['heading', { level: 3 }]])
})

test('普通命令透传 Toast UI 原生命令名（含 blockQuote/addTable/addImage/addLink）', () => {
  const e = fakeEditor()
  const names = ['bold', 'italic', 'strike', 'code', 'blockQuote', 'bulletList',
    'taskList', 'addTable', 'codeBlock', 'hr', 'addImage', 'addLink', 'undo', 'redo']
  for (const c of names) resolveMdCommand(c, e)(e)
  assert.deepEqual(e.calls, names.map(n => [n]))
})

test('未知命令返回 null', () => {
  assert.equal(resolveMdCommand('nope', fakeEditor()), null)
})
