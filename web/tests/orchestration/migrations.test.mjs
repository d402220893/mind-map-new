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
    'm001_index_v0_to_v1', 'm002_mindlink_legacy_note', 'm003_meta_schema'
  ])
})
