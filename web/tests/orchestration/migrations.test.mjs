import { test } from 'node:test'
import assert from 'node:assert'
import { runMigrations, MIGRATIONS } from '../../src/services/migrations/index.js'
import { extractLegacyRefs } from '../../src/services/migrations/m002_mindlink_legacy_note.js'
import { encode, decodeSmm } from '../../src/services/smmCodec.js'
import { makeFakeFsApi, makeFakeWorkspaceIndex, makeFakeLog } from './helpers.js'

const ROOT = 'D:/ws'
const IDX = ROOT + '/.mindlink/'

function setup({ meta = { v: 1 }, indexOpts = {}, tree = [], files = {}, confirm } = {}) {
  const fsApi = makeFakeFsApi({ tree, dirs: [ROOT, IDX.slice(0, -1)] })
  for (const [k, v] of Object.entries(files)) fsApi.files.set(k, v)
  const workspaceIndex = makeFakeWorkspaceIndex({ meta, ...indexOpts })
  const ctx = { io: { fsApi, workspaceIndex }, root: ROOT, log: makeFakeLog() }
  if (confirm) ctx.confirm = confirm
  return { fsApi, workspaceIndex, ctx }
}

test('① 幂等：第二次执行全部 skipped', async () => {
  const { ctx } = setup({ meta: { v: 1 } })
  const r1 = await runMigrations(ctx, { meta: { v: 1 } })
  assert.ok(r1.ok, JSON.stringify(r1.error))
  const r2 = await runMigrations(ctx, { meta: r1.data.meta || { v: 1 } })
  assert.ok(r2.ok)
  assert.strictEqual(r2.data.applied.length, 0, '第二次不应再有应用项：' + JSON.stringify(r2.data))
  assert.ok(r2.data.skipped.length >= 2)
})

test('② dryRun 零写入（不写索引、不写日志、不备份）', async () => {
  const { fsApi, workspaceIndex, ctx } = setup({ meta: { v: 0 } })
  const r = await runMigrations(ctx, { dryRun: true, meta: { v: 0 } })
  assert.ok(r.ok)
  assert.ok(r.data.applied.includes('m001_index_v0_to_v1'), 'dryRun 也应给出计划')
  assert.strictEqual(workspaceIndex.calls.write.length, 0, '不得写索引')
  assert.strictEqual(fsApi.calls.filter(c => c[0] === 'writeText').length, 0, '不得写任何文件')
})

test('③ 单步失败不污染后续（m002 抛错 → m003 仍执行）', async () => {
  const { fsApi, ctx } = setup({ meta: { v: 1 } })
  fsApi.readTree = async () => { throw new Error('boom') }
  const r = await runMigrations(ctx, { meta: { v: 1 } })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'E_MIGRATE_FAILED')
  assert.ok(String(r.error.steps).includes('m002_mindlink_legacy_note'), JSON.stringify(r.error))
  assert.ok(r.error.applied.includes('m003_meta_schema'), '后续步骤仍应执行')
})

test('④ 迁移前备份：文件存在且内容一致', async () => {
  const orig = JSON.stringify({ v: 0 })
  const { fsApi, ctx } = setup({ meta: { v: 0 }, files: { [IDX + 'meta.json']: orig } })
  const r = await runMigrations(ctx, { meta: { v: 0 } })
  assert.ok(r.ok, JSON.stringify(r.error))
  const backupKey = [...fsApi.files.keys()].find(k => k.includes('/backup/m001_index_v0_to_v1/') && k.endsWith('/meta.json'))
  assert.ok(backupKey, '应生成备份：' + [...fsApi.files.keys()].join(','))
  assert.strictEqual(fsApi.files.get(backupKey), orig)
})

test('⑤ 日志追加到 .mindlink/migrate.log', async () => {
  const { fsApi, ctx } = setup({ meta: { v: 0 }, files: { [IDX + 'meta.json']: '{"v":0}' } })
  await runMigrations(ctx, { meta: { v: 0 } })
  const log = fsApi.files.get(IDX + 'migrate.log')
  assert.ok(log, '应写迁移日志')
  assert.ok(log.includes('m001'), log)
})

test('⑥ 单步失败报 E_MIGRATE_FAILED 且含 step id（写盘失败）', async () => {
  const { ctx } = setup({ meta: { v: 0 }, indexOpts: { failWrite: true } })
  const r = await runMigrations(ctx, { meta: { v: 0 } })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'E_MIGRATE_FAILED')
  assert.ok(r.error.step)
})

test('⑦ target 只跑指定步', async () => {
  const { ctx } = setup({ meta: { v: 1 } })
  const r = await runMigrations(ctx, { meta: { v: 1 }, target: 'm003_meta_schema' })
  assert.ok(r.ok)
  assert.deepStrictEqual(r.data.applied, ['m003_meta_schema'])
  assert.ok(r.data.skipped.includes('m001_index_v0_to_v1'))
})

test('⑧ m002 无 confirm 时安全跳过（不擅自改 .smm）', async () => {
  const smm = encode(null, {
    sheets: [{ id: 'r', data: { id: 'r', data: { text: 'root' }, children: [{ id: 'n1', data: { note: 'x\n<!-- ref:{"file":"a.md","sectionId":"s"} -->\ny' }, children: [] }] } }],
    activeId: 'r'
  })
  const { fsApi, ctx } = setup({ meta: { v: 1 }, tree: ['map.smm'], files: { [ROOT + '/map.smm']: smm } })
  const r = await runMigrations(ctx, { meta: { v: 1 } })
  assert.ok(r.ok)
  assert.strictEqual(fsApi.files.get(ROOT + '/map.smm'), smm, '未确认不得改写 .smm')
})

test('⑨ m002 用户确认后迁移：note 清干净 + _mindlink.refs 落位', async () => {
  const smm = encode(null, {
    sheets: [{ id: 'r', data: { id: 'r', data: { text: 'root' }, children: [{ id: 'n1', data: { note: 'x\n<!-- ref:{"file":"a.md","sectionId":"s"} -->\ny' }, children: [] }] } }],
    activeId: 'r'
  })
  const { fsApi, ctx } = setup({
    meta: { v: 1 }, tree: ['map.smm'], files: { [ROOT + '/map.smm']: smm },
    confirm: async () => true
  })
  const r = await runMigrations(ctx, { meta: { v: 1 } })
  assert.ok(r.ok, JSON.stringify(r.error))
  assert.ok(r.data.applied.includes('m002_mindlink_legacy_note'))
  const { sheets } = decodeSmm(fsApi.files.get(ROOT + '/map.smm'))
  const n1 = sheets[0].data.children[0]
  assert.strictEqual(n1.data.note.includes('<!--'), false, 'note 里的 legacy 注释应被移除')
  assert.strictEqual(n1.data._mindlink.refs.length, 1)
  assert.strictEqual(n1.data._mindlink.refs[0].file, 'a.md')
})

test('⑩ extractLegacyRefs 纯解析：坏 JSON 保留原样', () => {
  const r = extractLegacyRefs('a\n<!-- ref:{bad json} -->\nb')
  assert.strictEqual(r.refs.length, 0)
  assert.ok(r.cleanedNote.includes('<!-- ref:{bad json} -->'))
})

test('⑪ 注册表顺序与 id 完整', () => {
  assert.deepStrictEqual(MIGRATIONS.map(m => m.id), [
    'm001_index_v0_to_v1', 'm002_mindlink_legacy_note', 'm003_meta_schema', 'm004_note_ref_exclusive'
  ])
})

// ── m004：v1.5 note+refs 共存 → v1.6 二选一互斥（§v1.6 四）──

// 造一个「note 非空 + refs 非空 + 无 mode」的共存 .smm
function conflictedSmm() {
  return encode(null, {
    sheets: [{
      id: 'r',
      data: { id: 'r', data: { text: 'root' }, children: [{ id: 'n1', data: { text: '任务', note: '旧备注', _mindlink: { refs: [{ file: 'a.md', sectionId: 's1' }] } }, children: [] }] }
    }],
    activeId: 'r'
  })
}

test('⑫ m004 幂等：meta 已标 migrated_v1_6 → 整步跳过（不改 .smm 不写盘）', async () => {
  const smm = conflictedSmm()
  const { fsApi, workspaceIndex, ctx } = setup({
    meta: { v: 1, lastOpenedTabs: [], settings: {}, migrated_v1_6: true },
    tree: ['map.smm'], files: { [ROOT + '/map.smm']: smm }
  })
  const r = await runMigrations(ctx, { meta: { v: 1, lastOpenedTabs: [], settings: {}, migrated_v1_6: true } })
  assert.ok(r.ok)
  assert.strictEqual(fsApi.files.get(ROOT + '/map.smm'), smm, '已迁移过不得再动 .smm')
  assert.strictEqual(workspaceIndex.calls.write.length, 0, '不得写索引')
})

test('⑬ m004 无共存节点：直接打标 migrated_v1_6（不再每次扫描）', async () => {
  const { workspaceIndex, ctx } = setup({ meta: { v: 1, lastOpenedTabs: [], settings: {} }, tree: [] })
  const r = await runMigrations(ctx, { meta: { v: 1, lastOpenedTabs: [], settings: {} } })
  assert.ok(r.ok, JSON.stringify(r.error))
  assert.ok(r.data.applied.includes('m004_note_ref_exclusive'))
  assert.strictEqual(workspaceIndex.calls.write.length, 1, '应写一次 meta.json')
  assert.strictEqual(workspaceIndex.calls.write[0][1].migrated_v1_6, true)
})

test('⑭ m004 用户选「保留引用」：note 置 null + mode=ref + refs 原样', async () => {
  const { fsApi, ctx } = setup({
    meta: { v: 1, lastOpenedTabs: [], settings: {} }, tree: ['map.smm'], files: { [ROOT + '/map.smm']: conflictedSmm() },
    confirm: async (p) => (p.kind === 'migrateNoteRefExclusive' ? 'ref' : true)
  })
  const r = await runMigrations(ctx, { meta: { v: 1, lastOpenedTabs: [], settings: {} } })
  assert.ok(r.ok, JSON.stringify(r.error))
  const { sheets } = decodeSmm(fsApi.files.get(ROOT + '/map.smm'))
  const n1 = sheets[0].data.children[0]
  assert.strictEqual(n1.data.note, null, 'note 应置 null（保留字段）')
  assert.strictEqual(n1.data._mindlink.mode, 'ref')
  assert.strictEqual(n1.data._mindlink.refs.length, 1, 'refs 应原样保留')
  // 快照备份存在
  assert.ok([...fsApi.files.keys()].some(k => k.includes('/backup/m004_note_ref_exclusive/') && k.endsWith('/map.smm')), '应有迁移前备份')
})

test('⑮ m004 用户拒绝：.smm 原样不动、meta 不打标（下次再问）', async () => {
  const smm = conflictedSmm()
  const { fsApi, workspaceIndex, ctx } = setup({
    meta: { v: 1, lastOpenedTabs: [], settings: {} }, tree: ['map.smm'], files: { [ROOT + '/map.smm']: smm },
    confirm: async () => false
  })
  const r = await runMigrations(ctx, { meta: { v: 1, lastOpenedTabs: [], settings: {} } })
  assert.ok(r.ok)
  assert.strictEqual(fsApi.files.get(ROOT + '/map.smm'), smm, '用户拒绝不得改写 .smm')
  assert.strictEqual(workspaceIndex.calls.write.length, 0, '用户拒绝不得打标')
})

test('⑯ m004 逐个确认（each）：按单节点选择分流保留', async () => {
  const smm = encode(null, {
    sheets: [{
      id: 'r',
      data: {
        id: 'r', data: { text: 'root' },
        children: [
          { id: 'n1', data: { text: 'A', note: '备注A', _mindlink: { refs: [{ file: 'a.md' }] } }, children: [] },
          { id: 'n2', data: { text: 'B', note: '备注B', _mindlink: { refs: [{ file: 'b.md' }] } }, children: [] }
        ]
      }
    }],
    activeId: 'r'
  })
  const answers = [] // 逐个确认的应答记录：n1 保留引用，n2 保留备注
  const { fsApi, ctx } = setup({
    meta: { v: 1, lastOpenedTabs: [], settings: {} }, tree: ['map.smm'], files: { [ROOT + '/map.smm']: smm },
    confirm: async (p) => {
      if (p.kind === 'migrateNoteRefExclusive') return 'each'
      answers.push(p.text)
      return p.text === 'A' // A=true→保引用；B=false→保备注
    }
  })
  const r = await runMigrations(ctx, { meta: { v: 1, lastOpenedTabs: [], settings: {} } })
  assert.ok(r.ok, JSON.stringify(r.error))
  assert.deepStrictEqual(answers, ['A', 'B'], '应逐个询问两个节点')
  const { sheets } = decodeSmm(fsApi.files.get(ROOT + '/map.smm'))
  const [n1, n2] = sheets[0].data.children
  assert.strictEqual(n1.data._mindlink.mode, 'ref')
  assert.strictEqual(n1.data.note, null)
  assert.strictEqual(n2.data._mindlink.mode, 'note')
  assert.deepStrictEqual(n2.data._mindlink.refs, [])
  assert.strictEqual(n2.data.note, '备注B')
})
