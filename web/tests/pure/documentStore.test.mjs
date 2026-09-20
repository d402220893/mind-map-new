// §11.2 A′ 预算：≥8（本文件 16）
// L2 状态层：文档内容按 tabId 索引。它是"切 Tab 不丢未保存内容"的唯一载体，
// 故重点在 ensure/get/setContent/markSaved/markDirty/drop 与 serialize/hydrate 往返。
import { test } from 'node:test'
import assert from 'node:assert'
import { createDocumentStore } from '../../src/services/state/documentStore.js'

test('① get 未载入的 tab 返回 null（不抛）', () => {
  const s = createDocumentStore()
  assert.strictEqual(s.get('ghost'), null)
})

test('② ensure 幂等：同 tabId 多次调用返回同一对象', () => {
  const s = createDocumentStore()
  const a = s.ensure('t1')
  const b = s.ensure('t1')
  assert.strictEqual(a, b)
})

test('③ ensure 的初始状态：空内容、不脏、rev 0', () => {
  const s = createDocumentStore()
  const d = s.ensure('t1')
  assert.strictEqual(d.content, '')
  assert.strictEqual(d.dirty, false)
  assert.strictEqual(d.rev, 0)
})

test('④ setContent 打脏是唯一入口语义（内容 + dirty 同时变）', () => {
  const s = createDocumentStore()
  s.setContent('t1', '# A')
  const d = s.get('t1')
  assert.strictEqual(d.content, '# A')
  assert.strictEqual(d.dirty, true)
})

test('⑤ setContent 对未 ensure 的 tab 自动建条目', () => {
  const s = createDocumentStore()
  s.setContent('fresh', 'x')
  assert.ok(s.get('fresh'))
})

test('⑥ markSaved 清脏并同步 savedContent', () => {
  const s = createDocumentStore()
  s.setContent('t1', '# A')
  s.markSaved('t1')
  const d = s.get('t1')
  assert.strictEqual(d.dirty, false)
  assert.strictEqual(d.savedContent, '# A')
})

test('⑦ markSaved 可同时写入 rev', () => {
  const s = createDocumentStore()
  s.ensure('t1')
  s.markSaved('t1', { rev: 4 })
  assert.strictEqual(s.get('t1').rev, 4)
})

test('⑧ markSaved 不带 rev 时不覆盖既有 rev', () => {
  const s = createDocumentStore()
  s.ensure('t1')
  s.markSaved('t1', { rev: 4 })
  s.markSaved('t1')
  assert.strictEqual(s.get('t1').rev, 4)
})

test('⑨ markSaved 对未载入 tab 返回 null（不崩）', () => {
  const s = createDocumentStore()
  assert.strictEqual(s.markSaved('ghost'), null)
})

test('⑩ markDirty 单独改脏标记而不动内容（冲突场景用）', () => {
  const s = createDocumentStore()
  s.setContent('t1', 'body')
  s.markDirty('t1', false)
  assert.strictEqual(s.isDirty('t1'), false)
  assert.strictEqual(s.get('t1').content, 'body')
})

test('⑪ isDirty 对未载入 tab 返回 false', () => {
  const s = createDocumentStore()
  assert.strictEqual(s.isDirty('ghost'), false)
})

test('⑫ set 是浅合并：未传字段保持原值', () => {
  const s = createDocumentStore()
  s.setContent('t1', 'body')
  s.set('t1', { encodingSuspect: true })
  assert.strictEqual(s.get('t1').content, 'body', '未传 content 必须保留')
  assert.strictEqual(s.get('t1').encodingSuspect, true)
})

test('⑬ set 显式传 dirty:false 时不被默认打脏覆盖', () => {
  const s = createDocumentStore()
  s.set('t1', { content: 'x', dirty: false })
  assert.strictEqual(s.get('t1').dirty, false)
})

test('⑭ drop 清理该 tab，其余 tab 不受影响', () => {
  const s = createDocumentStore()
  s.setContent('t1', 'a')
  s.setContent('t2', 'b')
  s.drop('t1')
  assert.strictEqual(s.get('t1'), null)
  assert.strictEqual(s.get('t2').content, 'b')
})

test('⑮ serialize / hydrate 往返保持内容与脏标记', () => {
  const s = createDocumentStore()
  s.setContent('t1', '# round')
  const json = s.serialize('t1')
  const s2 = createDocumentStore()
  s2.hydrate('t9', json)
  assert.strictEqual(s2.get('t9').content, '# round')
  assert.strictEqual(s2.isDirty('t9'), true)
})

test('⑯ hydrate 传 null / undefined 不抛也不建条目', () => {
  const s = createDocumentStore()
  assert.doesNotThrow(() => s.hydrate('t1', null))
  assert.strictEqual(s.get('t1'), null)
})
