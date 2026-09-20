import { test } from 'node:test'
import assert from 'node:assert'
import { createWorkspaceContext, createDocumentContext } from '../../src/services/context.js'

const ROOT = 'D:/ws'

function ws(root = ROOT) { return createWorkspaceContext({ root }) }

// ── abs ──
test('abs 相对路径拼 root', () => { assert.strictEqual(ws().abs('a.md'), ROOT + '/a.md') })
test('abs 绝对路径原样返回', () => { assert.strictEqual(ws().abs('E:/x/a.md'), 'E:/x/a.md') })
test('abs 反斜杠归正', () => { assert.strictEqual(ws().abs('a\\b.md'), ROOT + '/a/b.md') })
test('abs 空 → root', () => { assert.strictEqual(ws().abs(''), ROOT) })
test('abs root 为空时原样', () => { assert.strictEqual(ws('').abs('a.md'), 'a.md') })

// ── rel ──
test('rel 根内相对路径', () => { assert.strictEqual(ws().rel(ROOT + '/a/b.md'), 'a/b.md') })
test('rel 越界 → null（不抛）', () => { assert.strictEqual(ws().rel('E:/other/a.md'), null) })
test('rel 等于 root → 空串', () => { assert.strictEqual(ws().rel(ROOT), '') })
test('rel root 为空 → 原样', () => { assert.strictEqual(ws('').rel('a.md'), 'a.md') })
test('rel 反斜杠归正', () => { assert.strictEqual(ws().rel(ROOT + '\\a.md'), 'a.md') })
test('rel 同前缀但非目录边界 → null', () => {
  assert.strictEqual(ws().rel(ROOT + 'extra/a.md'), null)
})

// ── isInside ──
test('isInside 根内文件', () => { assert.strictEqual(ws().isInside(ROOT + '/a.md'), true) })
test('isInside root 自身', () => { assert.strictEqual(ws().isInside(ROOT), true) })
test('isInside 越界', () => { assert.strictEqual(ws().isInside('E:/other'), false) })
test('isInside root 空 → false', () => { assert.strictEqual(ws('').isInside('a.md'), false) })

// ── inferRootFor ──
test('inferRootFor 有 root → root', () => { assert.strictEqual(ws().inferRootFor(ROOT + '/a/b.md'), ROOT) })
test('inferRootFor 单文件模式 → 文件所在目录', () => {
  assert.strictEqual(ws('').inferRootFor('E:/x/y/n.md'), 'E:/x/y')
})
test('inferRootFor 无目录 → 空', () => { assert.strictEqual(ws('').inferRootFor('n.md'), '') })

// ── 容器字段 ──
test('kind 为 workspace', () => { assert.strictEqual(ws().kind, 'workspace') })
test('root/tree/indexCache 透传', () => {
  const c = createWorkspaceContext({ root: ROOT, tree: [{ name: 'a.md' }], indexCache: { v: 1 } })
  assert.strictEqual(c.root, ROOT)
  assert.strictEqual(c.tree.length, 1)
  assert.deepStrictEqual(c.indexCache, { v: 1 })
})

// ── createDocumentContext ──
test('document kind/tabId/content', () => {
  const d = createDocumentContext({ tabId: 't1', content: 'abc' })
  assert.strictEqual(d.kind, 'document')
  assert.strictEqual(d.tabId, 't1')
  assert.strictEqual(d.content, 'abc')
})
test('初始不脏', () => { assert.strictEqual(createDocumentContext({}).isDirty(), false) })
test('markDirty(true)', () => {
  const d = createDocumentContext({})
  assert.strictEqual(d.markDirty(true), true)
  assert.strictEqual(d.isDirty(), true)
})
test('markDirty(false) 清脏', () => {
  const d = createDocumentContext({})
  d.markDirty(true)
  d.markDirty(false)
  assert.strictEqual(d.isDirty(), false)
})
test('markDirty 非布尔按真值转换', () => {
  const d = createDocumentContext({})
  assert.strictEqual(d.markDirty('x'), true)
  assert.strictEqual(d.markDirty(0), false)
})
test('两个 document 上下文互不干扰', () => {
  const a = createDocumentContext({ tabId: 'a' })
  const b = createDocumentContext({ tabId: 'b' })
  a.markDirty(true)
  assert.strictEqual(b.isDirty(), false)
})

// ── 路径工具的越界与前缀陷阱（这类 bug 会静默放行工作区外文件）──
test('isInside 不被同前缀兄弟目录骗过（D:/wsx 不属于 D:/ws）', () => {
  const c = ws('D:/ws')
  assert.strictEqual(c.isInside('D:/ws/a.md'), true)
  assert.strictEqual(c.isInside('D:/ws/b/c.md'), true)
  assert.strictEqual(c.isInside('D:/ws'), true, '根目录自身算在界内')
  assert.strictEqual(c.isInside('D:/wsx/b.md'), false, '同前缀必须用 / 边界判定，不能 startsWith(root)')
})

test('rel 越界返回 null（不是抛错、也不是原样返回）', () => {
  const c = ws('D:/ws')
  assert.strictEqual(c.rel('C:/other/x.md'), null)
  assert.strictEqual(c.rel('D:/wsx/x.md'), null)
})

test('rel 根自身返回空串（区别于越界的 null）', () => {
  assert.strictEqual(ws('D:/ws').rel('D:/ws'), '')
})

test('rel 反斜杠路径归一后仍能取到相对路径', () => {
  assert.strictEqual(ws('D:/ws').rel('D:\\ws\\a\\b.md'), 'a/b.md')
})

test('abs 对绝对路径原样归一（不重复拼根）', () => {
  const c = ws('D:/ws')
  assert.strictEqual(c.abs('C:/x/y.md'), 'C:/x/y.md')
  assert.strictEqual(c.abs('D:/ws/a.md'), 'D:/ws/a.md')
  assert.strictEqual(c.abs('a\\b.md'), 'D:/ws/a/b.md')
})

test('abs 传空返回根自身；无根时退化为相对路径（不抛）', () => {
  assert.strictEqual(ws('D:/ws').abs(''), 'D:/ws')
  assert.strictEqual(createWorkspaceContext({}).abs('a/b.md'), 'a/b.md')
})

test('无根上下文：rel 原样返回、isInside 恒 false（单文件模式不存在"界"）', () => {
  const c = createWorkspaceContext({})
  assert.strictEqual(c.rel('D:/ws/a.md'), 'D:/ws/a.md')
  assert.strictEqual(c.isInside('D:/ws/a.md'), false)
})

test('无根时 inferRootFor 退化为文件所在目录', () => {
  assert.strictEqual(createWorkspaceContext({}).inferRootFor('D:/ws/docs/a.md'), 'D:/ws/docs')
  assert.strictEqual(createWorkspaceContext({}).inferRootFor('a.md'), '')
})

test('有根时 inferRootFor 恒返回工作区根（文件在别的盘也归到根）', () => {
  assert.strictEqual(ws('D:/ws').inferRootFor('C:/else/a.md'), 'D:/ws')
})

test('上下文对象携带 kind/root 标识，且 tree/indexCache 原样挂载', () => {
  const c = createWorkspaceContext({ root: 'D:/ws', tree: [{ name: 'a.md' }], indexCache: { v: 9 } })
  assert.strictEqual(c.kind, 'workspace')
  assert.strictEqual(c.root, 'D:/ws')
  assert.strictEqual(c.tree.length, 1)
  assert.strictEqual(c.indexCache.v, 9)
})
