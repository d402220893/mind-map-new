import { test } from 'node:test'
import assert from 'node:assert'
import { createRegistry } from '../../src/services/commandRegistry.js'

function reg() {
  const r = createRegistry()
  r.register({ id: 'file.open', title: '打开文件', shortcuts: ['Ctrl+O'] })
  r.register({ id: 'file.save', title: '保存', shortcuts: ['Ctrl+S', 'F2'] })
  r.register({ id: 'ref.remove', title: '移除引用', enabled: false })
  r.register({ id: 'view.zen', title: '禅模式' })
  return r
}

test('register 返回 id', () => {
  const r = createRegistry()
  assert.strictEqual(r.register({ id: 'a', title: 'A' }), 'a')
})

test('get 命中', () => { assert.strictEqual(reg().get('file.open').title, '打开文件') })
test('get 未命中 → null', () => { assert.strictEqual(reg().get('nope'), null) })
test('list 返回全部', () => { assert.strictEqual(reg().list().length, 4) })
test('默认 enabled=true', () => { assert.strictEqual(reg().isEnabled('file.open'), true) })
test('显式 enabled=false → false', () => { assert.strictEqual(reg().isEnabled('ref.remove'), false) })
test('isEnabled 未注册 → false', () => { assert.strictEqual(reg().isEnabled('ghost'), false) })
test('重复注册覆盖（不重复计数）', () => {
  const r = createRegistry()
  r.register({ id: 'a', title: 'v1' })
  r.register({ id: 'a', title: 'v2' })
  assert.strictEqual(r.list().length, 1)
  assert.strictEqual(r.get('a').title, 'v2')
})
test('findByShortcut 命中单个', () => {
  const hit = reg().findByShortcut('Ctrl+O')
  assert.strictEqual(hit.length, 1)
  assert.strictEqual(hit[0].id, 'file.open')
})
test('findByShortcut 多快捷键都能命中', () => {
  const r = reg()
  assert.strictEqual(r.findByShortcut('Ctrl+S')[0].id, 'file.save')
  assert.strictEqual(r.findByShortcut('F2')[0].id, 'file.save')
})
test('findByShortcut 未命中 → 空数组', () => {
  assert.deepStrictEqual(reg().findByShortcut('Ctrl+Z'), [])
})
test('无 shortcuts 的命令不被 shortcut 命中', () => {
  assert.deepStrictEqual(reg().findByShortcut(''), [])
})
test('shortcutsTable 含 id/title/shortcuts', () => {
  const t = reg().shortcutsTable()
  assert.strictEqual(t.length, 4)
  assert.deepStrictEqual(Object.keys(t[0]).sort(), ['id', 'shortcuts', 'title'])
})
test('shortcutsTable 缺 shortcuts → 空数组', () => {
  const t = reg().shortcutsTable().find(x => x.id === 'view.zen')
  assert.deepStrictEqual(t.shortcuts, [])
})
test('shortcutsTable 可直接渲染（自动导出，免手工维护）', () => {
  const t = reg().shortcutsTable()
  assert.ok(t.every(x => typeof x.title === 'string'))
})
test('registry 之间互相隔离', () => {
  const a = createRegistry(); const b = createRegistry()
  a.register({ id: 'x', title: 'X' })
  assert.strictEqual(a.list().length, 1)
  assert.strictEqual(b.list().length, 0)
})
test('register 保留额外字段', () => {
  const r = createRegistry()
  r.register({ id: 'a', title: 'A', group: 'file' })
  assert.strictEqual(r.get('a').group, 'file')
})
test('enabled 显式 true', () => {
  const r = createRegistry()
  r.register({ id: 'a', title: 'A', enabled: true })
  assert.strictEqual(r.isEnabled('a'), true)
})
test('list 顺序 = 注册顺序', () => {
  assert.deepStrictEqual(reg().list().map(c => c.id), ['file.open', 'file.save', 'ref.remove', 'view.zen'])
})
