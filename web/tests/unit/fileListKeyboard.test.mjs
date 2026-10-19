// 文件列表键盘快捷键决策函数单测（纯逻辑，无 Vue/DOM）。
import assert from 'node:assert'
import test from 'node:test'
import { resolveFileListKey } from '../../src/utils/fileListKeyboard.js'

const baseState = { root: 'D:/ws', hasSelection: false, editingPath: '', fileCount: 5 }
const ev = (key, extra = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, ...extra })

test('Ctrl+C/V/X/A 组合键 → 对应动作且 preventDefault', () => {
  assert.deepStrictEqual(resolveFileListKey(ev('c', { ctrlKey: true }), baseState), { action: 'copy', preventDefault: true })
  assert.deepStrictEqual(resolveFileListKey(ev('x', { ctrlKey: true }), baseState), { action: 'cut', preventDefault: true })
  assert.deepStrictEqual(resolveFileListKey(ev('v', { ctrlKey: true }), baseState), { action: 'paste', preventDefault: true })
  assert.deepStrictEqual(resolveFileListKey(ev('a', { ctrlKey: true }), baseState), { action: 'selectAll', preventDefault: true })
})

test('Cmd(Meta) 组合键同样生效（mac 习惯）', () => {
  assert.deepStrictEqual(resolveFileListKey(ev('c', { metaKey: true }), baseState), { action: 'copy', preventDefault: true })
})

test('F2 → 重命名（非编辑态）', () => {
  assert.deepStrictEqual(resolveFileListKey(ev('F2'), baseState), { action: 'rename', preventDefault: true })
})

test('F2 在重命名内联编辑态下不触发（交由输入框 esc 处理）', () => {
  assert.deepStrictEqual(resolveFileListKey(ev('F2'), { ...baseState, editingPath: 'D:/ws/a.md' }), { action: null, preventDefault: false })
})

test('Delete 仅在有选区时触发删除', () => {
  assert.deepStrictEqual(resolveFileListKey(ev('Delete'), { ...baseState, hasSelection: true }), { action: 'delete', preventDefault: true })
  assert.deepStrictEqual(resolveFileListKey(ev('Delete'), baseState), { action: null, preventDefault: false })
})

test('Enter 仅在有选区时打开', () => {
  assert.deepStrictEqual(resolveFileListKey(ev('Enter'), { ...baseState, hasSelection: true }), { action: 'open', preventDefault: true })
  assert.deepStrictEqual(resolveFileListKey(ev('Enter'), baseState), { action: null, preventDefault: false })
})

test('Escape → 清选区（非编辑态）', () => {
  assert.deepStrictEqual(resolveFileListKey(ev('Escape'), baseState), { action: 'clearSelection', preventDefault: false })
})

test('F5 → 刷新', () => {
  assert.deepStrictEqual(resolveFileListKey(ev('F5'), baseState), { action: 'refresh', preventDefault: true })
})

test('Home/End 仅在文件非空时生效', () => {
  assert.deepStrictEqual(resolveFileListKey(ev('Home'), baseState), { action: 'home', preventDefault: true })
  assert.deepStrictEqual(resolveFileListKey(ev('End'), baseState), { action: 'end', preventDefault: true })
  assert.deepStrictEqual(resolveFileListKey(ev('Home'), { ...baseState, fileCount: 0 }), { action: null, preventDefault: false })
})

test('ArrowUp/Down：Shift=扩展选区；无选区普通方向键不触发', () => {
  assert.deepStrictEqual(resolveFileListKey(ev('ArrowUp', { shiftKey: true }), baseState), { action: 'extendUp', preventDefault: true })
  assert.deepStrictEqual(resolveFileListKey(ev('ArrowDown', { shiftKey: true }), baseState), { action: 'extendDown', preventDefault: true })
  assert.deepStrictEqual(resolveFileListKey(ev('ArrowUp', { shiftKey: true }), { ...baseState, hasSelection: true }), { action: 'extendUp', preventDefault: true })
  assert.deepStrictEqual(resolveFileListKey(ev('ArrowUp'), { ...baseState, hasSelection: true }), { action: 'moveUp', preventDefault: true })
  assert.deepStrictEqual(resolveFileListKey(ev('ArrowDown'), { ...baseState, hasSelection: true }), { action: 'moveDown', preventDefault: true })
  assert.deepStrictEqual(resolveFileListKey(ev('ArrowUp'), baseState), { action: null, preventDefault: false })
})

test('无工作区 root → 全部不触发', () => {
  const s = { root: '', hasSelection: true, editingPath: '', fileCount: 0 }
  for (const key of ['F2', 'Delete', 'Enter', 'Escape', 'F5', 'Home', 'End', 'ArrowUp', 'ArrowDown']) {
    assert.deepStrictEqual(resolveFileListKey(ev(key), s), { action: null, preventDefault: false }, 'key=' + key)
  }
})

test('未知键 → 不触发', () => {
  assert.deepStrictEqual(resolveFileListKey(ev('a'), baseState), { action: null, preventDefault: false })
})
