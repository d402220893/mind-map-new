// CG 组合根层：迁移注册表 + 唯一入口 runMigrations(ctx, {dryRun, target, meta})（§17.2）。
// 调用点：workspaceService.open() 的第 ① 步（读索引之后、决定新建/降级之前）。
// 5 条纪律：① 幂等 ② 迁移前备份 ③ 日志（.mindlink/migrate.log 追加 + log.info）
//          ④ dryRun 不写盘 ⑤ 单步失败报 E_MIGRATE_FAILED（含 step id），不污染后续步骤。
import { ok, fail, err, rootOf, appendLog, CURRENT_INDEX_SCHEMA } from './_util.js'
import { m001 } from './m001_index_v0_to_v1.js'
import { m002 } from './m002_mindlink_legacy_note.js'
import { m003 } from './m003_meta_schema.js'
import { m004 } from './m004_note_ref_exclusive.js'

export const MIGRATIONS = [m001, m002, m003, m004]
export { CURRENT_INDEX_SCHEMA }

export async function runMigrations(ctx, { dryRun = false, target = null, meta = null } = {}) {
  const root = rootOf(ctx)
  const mctx = { ...(ctx || {}), root } // 注入 root，避免各步自行解析（CG 允许）
  const log = (ctx && ctx.log) || null
  const applied = []
  const skipped = []
  const lines = []
  const failedSteps = []

  let current = meta && typeof meta === 'object' ? meta : null

  for (const m of MIGRATIONS) {
    if (target && m.id !== target) { skipped.push(m.id); continue }
    let r
    try {
      r = await m.up(mctx, { dryRun, meta: current })
    } catch (e) {
      r = fail(err('E_MIGRATE_FAILED', { step: m.id, reason: String((e && e.message) || e) }))
    }

    if (!r || r.ok === false) {
      const info = (r && r.error) || {}
      failedSteps.push(m.id)
      lines.push(`FAIL ${m.id} ${info.reason || info.code || ''}`)
      if (log && log.warn) log.warn('migrate.failed', { step: m.id, dryRun, error: info })
      continue // ⑤ 不污染后续：继续跑，最后统一报失败
    }

    const d = r.data || {}
    if (d.skipped) {
      skipped.push(m.id)
      lines.push(`SKIP ${m.id} (${d.reason || 'noop'})`)
    } else {
      applied.push(m.id)
      lines.push(`${dryRun ? 'PLAN' : 'OK  '} ${m.id} ${(d.changed || []).length} change(s)`)
      if (d.meta) current = d.meta
    }
    if (log && log.info) log.info('migrate.step', { step: m.id, dryRun, skipped: !!d.skipped })
  }

  // ③ 日志（dryRun 零写入）
  if (!dryRun) await appendLog(mctx, lines)

  if (failedSteps.length) {
    // step / steps 提到顶层，消费方（workspaceService / UI）无需再钻 info
    return fail({
      ...err('E_MIGRATE_FAILED', { steps: failedSteps, applied, skipped, log: lines }),
      step: failedSteps[0],
      steps: failedSteps,
      applied,
      skipped
    })
  }
  return ok({ applied, skipped, log: lines, dryRun, meta: current })
}
