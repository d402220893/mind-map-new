// m001：索引 schema v0 → v1。触发：meta.json 的 v 缺失或 ≠ CURRENT_INDEX_SCHEMA。
// 5 条纪律：幂等（靠 v 判断）/ 迁移前备份 / 日志 / dryRun 不写盘 / 单步失败报 E_MIGRATE_FAILED。
// ⚠️ 不用 this（调用方可能解构 up），统一用模块级 ID 常量。
import { ok, fail, err, CURRENT_INDEX_SCHEMA, backup } from './_util.js'

const ID = 'm001_index_v0_to_v1'

export const m001 = {
  id: ID,
  from: 0,
  to: CURRENT_INDEX_SCHEMA,

  async up(ctx, { dryRun = false, meta = null } = {}) {
    const io = ctx && ctx.io
    if (!io || !io.workspaceIndex) return fail(err('E_MIGRATE_NO_CTX', { step: ID }))
    const { workspaceIndex } = io
    const root = (ctx && ctx.root) || ''
    const cur = meta && typeof meta === 'object' ? meta : null
    const v = cur ? cur.v : null

    // ① 幂等
    if (v === CURRENT_INDEX_SCHEMA) return ok({ skipped: true, reason: 'already-v' + v })

    const changed = [
      `meta.json: v=${v == null ? 'none' : v} → ${CURRENT_INDEX_SCHEMA}`,
      'workspaceIndex.rebuild({full:true})'
    ]
    // ④ dryRun：只算差异，不写盘
    if (dryRun) return ok({ changed, meta: { ...(cur || {}), v: CURRENT_INDEX_SCHEMA } })

    // ② 备份（失败不阻断）
    await backup(ctx, ID, ['meta.json', 'sections.json', 'refs.json'])

    const w = await workspaceIndex.write('meta.json', { ...(cur || {}), v: CURRENT_INDEX_SCHEMA }, { root })
    if (!w.ok) return fail(err('E_MIGRATE_FAILED', { step: ID, reason: 'meta-write', error: w.error }))
    const rb = await workspaceIndex.rebuild({ full: true, root })
    if (!rb.ok) return fail(err('E_MIGRATE_FAILED', { step: ID, reason: 'rebuild', error: rb.error }))

    return ok({ changed, meta: { ...(cur || {}), v: CURRENT_INDEX_SCHEMA }, rebuilt: rb.data })
  }
}
