import { test } from 'node:test'
import assert from 'node:assert'
import { createWorkspaceService } from '../../src/services/workspaceService.js'
import { createWorkspaceStore } from '../../src/services/state/workspaceStore.js'
import { EVT } from '../../src/services/events.js'
import { makeFakeFsApi, makeFakeWorkspaceIndex, makeFakeLog } from './helpers.js'

const ROOT = 'D:/ws'

function setup({ meta, indexOpts = {}, confirm, fsOpts = {} } = {}) {
  const fsApi = makeFakeFsApi({
    tree: ['doc.md', 'map.smm'],
    dirs: [ROOT, ROOT + '/.mindlink'],
    ...fsOpts
  })
  const workspaceIndex = makeFakeWorkspaceIndex({ meta, ...indexOpts })
  const events = { emitted: [], on: () => () => {}, emit: (t, p) => events.emitted.push({ t, p }) }
  const ctx = { io: { fsApi, workspaceIndex }, stores: { workspace: createWorkspaceStore() }, events, log: makeFakeLog() }
  if (confirm) ctx.confirm = confirm
  const ws = createWorkspaceService(ctx)
  return { fsApi, workspaceIndex, events, ctx, ws }
}

test('① open 成功：迁移跳过 → indexStatus=ok，emit WS_OPENED', async () => {
  const { ws, events } = setup({ meta: { v: 1 } })
  const r = await ws.open(ROOT)
  assert.ok(r.ok)
  assert.strictEqual(r.data.indexStatus, 'ok')
  assert.strictEqual(events.emitted.some(e => e.t === EVT.WS_OPENED), true)
})

test('② 非目录 → E_NOT_DIR', async () => {
  const fsApi = makeFakeFsApi({ tree: [] }) // 无 dirs → isDir false
  const workspaceIndex = makeFakeWorkspaceIndex({})
  const ws = createWorkspaceService({ io: { fsApi, workspaceIndex }, stores: { workspace: createWorkspaceStore() }, log: makeFakeLog() })
  const r = await ws.open(ROOT)
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'E_NOT_DIR')
})

test('③ meta 缺失 + 用户确认 → 建索引 indexStatus=created', async () => {
  const { ws, workspaceIndex } = setup({ meta: null, confirm: async () => true })
  const r = await ws.open(ROOT)
  assert.strictEqual(r.data.indexStatus, 'created')
  assert.strictEqual(workspaceIndex.calls.init.length, 1)
})

test('④ meta 缺失 + 用户拒绝 → readonly-index 且不建索引', async () => {
  const { ws, workspaceIndex } = setup({ meta: null, confirm: async () => false })
  const r = await ws.open(ROOT)
  assert.strictEqual(r.data.indexStatus, 'readonly-index')
  assert.strictEqual(workspaceIndex.calls.init.length, 0)
})

test('⑤ 迁移失败 + 重建也失败 → readonly-index（不阻断打开）', async () => {
  // meta.v=0 触发 m001；写盘失败使迁移失败；rebuild 也失败 → 降级只读
  const { ws, workspaceIndex } = setup({ meta: { v: 0 }, indexOpts: { failWrite: true, failRebuild: true } })
  const r = await ws.open(ROOT)
  assert.ok(r.ok, '迁移/重建失败不得阻断打开')
  assert.strictEqual(r.data.indexStatus, 'readonly-index')
  assert.ok(workspaceIndex.calls.rebuild.length >= 1)
})

test('⑥ 迁移失败但重建成功 → indexStatus=rebuilt', async () => {
  const { ws } = setup({ meta: { v: 0 }, indexOpts: { failWrite: true } })
  const r = await ws.open(ROOT)
  assert.strictEqual(r.data.indexStatus, 'rebuilt')
})

test('⑦ close 清 root 并 emit WS_CLOSED', async () => {
  const { ws, events } = setup({ meta: { v: 1 } })
  await ws.open(ROOT)
  assert.strictEqual(ws.getRoot(), ROOT)
  await ws.close()
  assert.strictEqual(ws.getRoot(), '')
  assert.strictEqual(events.emitted.some(e => e.t === EVT.WS_CLOSED), true)
})

test('⑧ refresh 重扫并 emit TREE_CHANGED', async () => {
  const { ws, events } = setup({ meta: { v: 1 } })
  await ws.open(ROOT)
  const r = await ws.refresh()
  assert.ok(r.ok)
  assert.strictEqual(events.emitted.some(e => e.t === EVT.WS_TREE_CHANGED), true)
})

test('⑨ abs/rel 与 root 联动；未打开时 rel 返回 null', () => {
  const { ws } = setup({ meta: { v: 1 } })
  assert.strictEqual(ws.rel(ROOT + '/a.md'), null, '未打开工作区时 rel 为 null')
  ws.open(ROOT)
  return ws.open(ROOT).then(() => {
    assert.strictEqual(ws.abs('a.md'), ROOT + '/a.md')
    assert.strictEqual(ws.rel(ROOT + '/a.md'), 'a.md')
    assert.strictEqual(ws.rel('E:/other/a.md'), null)
  })
})

test('⑩ rebuildIndex 转发 onProgress → emit INDEX_REBUILDING（L3 自身不 emit）', async () => {
  const { ws, workspaceIndex, events } = setup({ meta: { v: 1 } })
  await ws.open(ROOT)
  workspaceIndex.rebuild = async (opts) => { if (opts.onProgress) opts.onProgress({ phase: 'scan', scanned: 1, total: 2 }); return { ok: true, data: {} } }
  const r = await ws.rebuildIndex({ full: true })
  assert.ok(r.ok)
  const p = events.emitted.find(e => e.t === EVT.INDEX_REBUILDING)
  assert.ok(p, '应转发进度事件')
  assert.strictEqual(p.p.phase, 'scan')
})

test('⑪ readIndex/writeIndex 薄委托到 workspaceIndex', async () => {
  const { ws, workspaceIndex } = setup({ meta: { v: 1 } })
  await ws.open(ROOT)
  await ws.readIndex('refs.json')
  await ws.writeIndex('refs.json', { v: 1, refs: [] })
  assert.strictEqual(workspaceIndex.calls.read.includes('refs.json'), true)
  assert.strictEqual(workspaceIndex.calls.write.some(c => c[0] === 'refs.json'), true)
})

test('⑫ inferRootFor 向上找 .mindlink，找不到返回文件所在目录', async () => {
  const { ws, fsApi } = setup({ meta: { v: 1 } })
  fsApi.files.set(ROOT + '/sub/.mindlink/meta.json', '{}')
  const hit = await ws.inferRootFor(ROOT + '/sub/deep/note.md')
  assert.strictEqual(hit, ROOT + '/sub')
  const miss = await ws.inferRootFor('E:/x/y/note.md')
  assert.strictEqual(miss, 'E:/x/y')
})

test('⑬ fs 语义订阅返回 unsubscribe 且不抛', async () => {
  const { ws } = setup({ meta: { v: 1 } })
  const off = ws.onFsChange(() => {})
  assert.strictEqual(typeof off, 'function')
  off()
})

test('⑭ open 启动 watch', async () => {
  const { ws, fsApi } = setup({ meta: { v: 1 } })
  await ws.open(ROOT)
  assert.strictEqual(fsApi.calls.some(c => c[0] === 'watch'), true)
})

// ── pickDirectory：打开文件夹的唯一入口（曾因字段名不匹配而"选完却没反应"）──
function pickService(fsApi) {
  return createWorkspaceService({
    io: { fsApi },
    stores: { workspace: createWorkspaceStore() },
    log: makeFakeLog()
  })
}

test('⑮ pickDirectory 把 fsApi 的 {dirPath} 归一为 {absPath}', async () => {
  // 回归：fsApi.pickDirectory 返回 ok({ dirPath })，若实现只认 absPath/path 就会误判成
  // E_NOT_SUPPORTED，UI 静默忽略 → 用户"选完文件夹什么都没打开"。
  const ws = pickService({ pickDirectory: async () => ({ ok: true, data: { dirPath: 'D:/picked/ws' } }) })
  const r = await ws.pickDirectory()
  assert.ok(r.ok, '必须为 ok —— 否则 UI 会静默不打开工作区')
  assert.strictEqual(r.data.absPath, 'D:/picked/ws')
})

test('⑯ pickDirectory 取消 → E_CANCELED 原样透传（不算错误弹窗）', async () => {
  const ws = pickService({ pickDirectory: async () => ({ ok: false, error: { code: 'E_CANCELED' } }) })
  const r = await ws.pickDirectory()
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'E_CANCELED')
})

test('⑰ pickDirectory 宿主缺能力 → E_NOT_SUPPORTED', async () => {
  const ws = pickService({})
  const r = await ws.pickDirectory()
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'E_NOT_SUPPORTED')
})

// ── 工作区树过滤：导航树只列文档（回归「无关文件显示出来」）──
function filterSetup(tree) {
  const fsApi = makeFakeFsApi({ tree, dirs: [ROOT, ROOT + '/.mindlink'] })
  const ws = createWorkspaceService({
    io: { fsApi, workspaceIndex: makeFakeWorkspaceIndex({ meta: { v: 1 } }) },
    stores: { workspace: createWorkspaceStore() },
    events: { on: () => () => {}, emit: () => {} },
    log: makeFakeLog()
  })
  return { ws, fsApi }
}

test('⑱ open 过滤无关文件：只留 .md/.smm，图片等不进树', async () => {
  const { ws } = filterSetup(['doc.md', 'map.smm', 'pic.png', 'flow.gif', 'data.json'])
  const r = await ws.open(ROOT)
  assert.ok(r.ok)
  assert.deepStrictEqual(r.data.tree.map(n => n.name), ['doc.md', 'map.smm'])
  assert.deepStrictEqual(ws.files().map(n => n.name), ['doc.md', 'map.smm'], 'store 里也应是过滤后的树')
})

test('⑲ refresh 同样过滤（外部新增文件走这条链路）', async () => {
  const { ws, fsApi } = filterSetup(['doc.md'])
  await ws.open(ROOT)
  fsApi.tree.push('new.smm', 'shot.png') // 模拟外部新增（readTree 每次读同一数组）
  const r = await ws.refresh()
  assert.deepStrictEqual(r.data.tree.map(n => n.name), ['doc.md', 'new.smm'])
})
