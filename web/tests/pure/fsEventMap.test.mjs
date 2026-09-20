import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapFsEvents, relToRoot, FS_EVENT_KINDS } from '../../src/utils/fsEventMap.js'

const ROOT = 'D:/ws'

test('批量载荷：normalize 成 [{kind,absPath,rel}]，顺序不变', () => {
  const payload = {
    root: ROOT,
    events: [
      { type: 'add', path: 'D:\\ws\\a.md', rel: 'a.md', ts: 1 },
      { type: 'change', path: 'D:\\ws\\sub\\b.md', rel: 'sub/b.md', ts: 2 },
      { type: 'unlink', path: 'D:\\ws\\c.smm', rel: 'c.smm', ts: 3 }
    ]
  }
  const out = mapFsEvents(payload)
  assert.strictEqual(out.length, 3)
  assert.deepStrictEqual(out.map(e => e.kind), ['add', 'change', 'unlink'])
  assert.strictEqual(out[0].absPath, 'D:/ws/a.md', '反斜杠必须归正为 /')
  assert.strictEqual(out[1].rel, 'sub/b.md')
})

test('丢弃原始 type（rename 等非白名单值不得被当作事件派发）', () => {
  // 早期 bug 的另一半：main.js 直接透传 fs.watch 的 'rename'，
  // 渲染端把 'rename' 当事件名查表 → undefined → 静默丢事件。
  const out = mapFsEvents({ root: ROOT, events: [{ type: 'rename', rel: 'x.md' }] })
  assert.deepStrictEqual(out, [])
  assert.ok(!FS_EVENT_KINDS.includes('rename'))
})

test('兼容单事件旧形状 {type, rel}（无 events 数组）', () => {
  const out = mapFsEvents({ root: ROOT, type: 'add', rel: 'new.md' })
  assert.strictEqual(out.length, 1)
  assert.strictEqual(out[0].kind, 'add')
  assert.strictEqual(out[0].rel, 'new.md')
  assert.strictEqual(out[0].absPath, 'D:/ws/new.md', '缺 path 时用 root + rel 兜底')
})

test('rel 可由 path 反推；root 之外的路径 rel 为 null', () => {
  const out = mapFsEvents({
    root: ROOT,
    events: [
      { type: 'change', path: 'D:/ws/deep/note.md' },
      { type: 'change', path: 'E:/other/away.md' }
    ]
  })
  assert.strictEqual(out[0].rel, 'deep/note.md')
  assert.strictEqual(out[1].rel, null, '工作区外 → rel 为 null（避免搜索缓存按错误 key 失效）')
})

test('非法载荷一律返回空数组（不抛）', () => {
  assert.deepStrictEqual(mapFsEvents(null), [])
  assert.deepStrictEqual(mapFsEvents(undefined), [])
  assert.deepStrictEqual(mapFsEvents('nope'), [])
  assert.deepStrictEqual(mapFsEvents({}), [])
  assert.deepStrictEqual(mapFsEvents({ root: ROOT, events: [null, 1, 'x', {}] }), [])
})

test('relToRoot：同根返回空串，越界返回 null，大小写与斜杠无关', () => {
  assert.strictEqual(relToRoot(ROOT, 'D:\\ws\\a.md'), 'a.md')
  assert.strictEqual(relToRoot('D:/ws/', 'D:/ws/a.md'), 'a.md', 'root 末尾斜杠应被裁掉')
  assert.strictEqual(relToRoot(ROOT, ROOT), '')
  assert.strictEqual(relToRoot(ROOT, 'D:/wsx/a.md'), null, 'wsx 不是 ws 的子路径')
  assert.strictEqual(relToRoot('', 'D:/ws/a.md'), null)
})
