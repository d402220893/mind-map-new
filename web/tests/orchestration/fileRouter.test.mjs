import { test } from 'node:test'
import assert from 'node:assert'
import { createFileRouter } from '../../src/services/fileRouter.js'
import { EVT } from '../../src/services/events.js'
import { makeFakeFsApi, makeFakeLog } from './helpers.js'

const ROOT = 'D:/ws'

function setup({ files = {}, tabs, importer, refService } = {}) {
  const fsApi = makeFakeFsApi({ tree: Object.keys(files), dirs: [ROOT] })
  for (const [k, v] of Object.entries(files)) fsApi.files.set(k, v)
  const events = { emitted: [], on: () => () => {}, emit: (t, p) => events.emitted.push({ t, p }) }
  const workspaceService = {
    getRoot: () => ROOT,
    abs: (p) => (/^[A-Za-z]:[\\/]/.test(p) ? p : ROOT + '/' + p),
    rel: (p) => (p.startsWith(ROOT + '/') ? p.slice(ROOT.length + 1) : null)
  }
  const ctx = {
    io: { fsApi },
    services: { workspaceService, refService },
    events,
    log: makeFakeLog()
  }
  if (tabs) ctx.tabs = tabs
  if (importer) ctx.importer = importer
  const router = createFileRouter(ctx)
  return { fsApi, events, router }
}

test('① 外部链接 → openExternal，不落盘', async () => {
  const { fsApi, router } = setup({})
  const r = await router.navigate('https://x.com/p', 'note.md')
  assert.ok(r.ok)
  assert.strictEqual(r.data.action, 'external')
  assert.strictEqual(fsApi.calls.some(c => c[0] === 'openExternal'), true)
})

test('② 目标文件不存在 → emit LINK_MISSING + E_LINK_MISSING', async () => {
  const { events, router } = setup({})
  const r = await router.navigate('docs/ghost.md', 'note.md')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'E_LINK_MISSING')
  assert.strictEqual(events.emitted.some(e => e.t === EVT.LINK_MISSING), true)
})

test('③ .km 走导入流（importer 被调用）', async () => {
  let called = null
  const imported = async ({ abs }) => { called = abs; return { ok: true, data: { node: 1 } } }
  const { router } = setup({ files: { [ROOT + '/old.km']: 'x' }, importer: imported })
  const r = await router.navigate('old.km', 'note.md')
  assert.ok(r.ok)
  assert.strictEqual(r.data.action, 'import')
  assert.strictEqual(called, ROOT + '/old.km')
})

test('④ 无 importer → E_IMPORT_UNAVAILABLE（不静默成功）', async () => {
  const { router } = setup({ files: { [ROOT + '/old.xmind']: 'x' } })
  const r = await router.navigate('old.xmind', 'note.md')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'E_IMPORT_UNAVAILABLE')
})

test('⑤ Tab 去重：已打开则复用 + 定位锚点', async () => {
  let switched = null
  const tabs = {
    findByPath: async (abs) => (abs === ROOT + '/doc.md' ? { id: 't1' } : null),
    switch: async (id) => { switched = id },
    add: async () => { throw new Error('不应新建') }
  }
  const { events, router } = setup({ files: { [ROOT + '/doc.md']: '# A' }, tabs })
  const r = await router.open('doc.md', { anchor: 'A' })
  assert.ok(r.ok)
  assert.strictEqual(r.data.reused, true)
  assert.strictEqual(switched, 't1')
  assert.strictEqual(events.emitted.some(e => e.t === EVT.MD_SCROLL_TO_ANCHOR), true)
})

test('⑥ 未打开则 addWorkbook', async () => {
  let added = null
  const tabs = { findByPath: async () => null, add: async (spec) => { added = spec; return 't9' } }
  const { router } = setup({ files: { [ROOT + '/doc.md']: '# A' }, tabs })
  const r = await router.open('doc.md')
  assert.ok(r.ok)
  assert.strictEqual(r.data.tabId, 't9')
  assert.strictEqual(added.kind, 'markdown')
  assert.strictEqual(added.filePath, ROOT + '/doc.md')
})

test('⑦ .smm 打开时先校准 pending 快照（C3：渲染前）', async () => {
  const order = []
  const refService = {
    calibratePendingSnapshots: async ({ abs }) => { order.push('calibrate:' + abs); return { ok: true, data: { calibrated: 1 } } }
  }
  const tabs = { findByPath: async () => null, add: async () => { order.push('add'); return 't1' } }
  const { router } = setup({ files: { [ROOT + '/map.smm']: '{}' }, tabs, refService })
  const r = await router.open('map.smm')
  assert.ok(r.ok)
  assert.deepStrictEqual(order, ['calibrate:' + ROOT + '/map.smm', 'add'])
})

test('⑧ 校准失败不阻断打开', async () => {
  const refService = { calibratePendingSnapshots: async () => ({ ok: false, error: { code: 'E_X' } }) }
  const { router } = setup({ files: { [ROOT + '/map.smm']: '{}' }, refService })
  const r = await router.open('map.smm')
  assert.ok(r.ok, '校准失败不得阻断打开')
})

test('⑨ resolveEmbed / resolveLink 转发 linkResolver 且 root 生效', () => {
  const { router } = setup({})
  assert.strictEqual(router.resolveEmbed('a.smm', 'note.md').kind, 'mindmap')
  assert.strictEqual(router.resolveLink('note.md', '/docs/b.md').abs, ROOT + '/docs/b.md')
})

test('⑩ md 内锚点跳转（同文件）走 open + 不报缺失', async () => {
  const tabs = { findByPath: async () => ({ id: 't1' }), switch: async () => {} }
  const { router } = setup({ files: { [ROOT + '/doc.md']: '# A\n\nbody' }, tabs })
  const r = await router.navigate('#A', 'doc.md')
  assert.ok(r.ok, JSON.stringify(r.error))
  assert.strictEqual(r.data.reused, true, 'same-doc 应复用当前 tab')
  assert.strictEqual(r.data.anchor, 'A')
})

test('⑪ 空链接被忽略（不报缺失）', async () => {
  const { router } = setup({})
  const r = await router.navigate('#', 'note.md')
  assert.ok(r.ok)
  assert.strictEqual(r.data.action, 'ignore')
})

// ── §10-#13 循环链接保护 ────────────────────────────────────────────────

test('⑫ 连续跳转超过 5 次（2s 窗口内）→ E_LINK_TOO_DEEP 并停跳', async () => {
  const { router } = setup({ files: { [ROOT + '/a.md']: '# A\n' } })
  const results = []
  for (let i = 0; i < 8; i++) results.push(await router.navigate('a.md', 'a.md'))
  const deep = results.filter(r => !r.ok && r.error.code === 'E_LINK_TOO_DEEP')
  assert.ok(deep.length >= 3, '第 6 次起必须被拦住，实际拦截 ' + deep.length + ' 次')
})

test('⑬ 循环链接被拦时不打开外部程序、不误报缺失', async () => {
  const { router, events } = setup({ files: { [ROOT + '/a.md']: '# A\n' } })
  for (let i = 0; i < 6; i++) await router.navigate('a.md', 'a.md')
  const r = await router.navigate('a.md', 'a.md')
  assert.strictEqual(r.error.code, 'E_LINK_TOO_DEEP')
  assert.strictEqual(
    events.emitted.some(e => e.t === EVT.LINK_MISSING && e.p && e.p.reason === 'too-deep'),
    true,
    '应带 reason=too-deep 广播，便于 UI 提示"链接层级过深"'
  )
})

test('⑭ 未超深度阈值的正常跳转不受影响', async () => {
  const { router } = setup({ files: { [ROOT + '/a.md']: '# A\n' } })
  const r = await router.navigate('a.md', 'a.md')
  assert.ok(r.ok, '首次跳转必须放行')
})
