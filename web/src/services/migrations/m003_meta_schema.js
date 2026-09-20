// m003：meta.json 补默认字段（向后兼容的字段填充，§17.2）。
// 幂等：缺什么补什么，已存在则跳过。dryRun 不写盘。
import { ok, fail, err, CURRENT_INDEX_SCHEMA, backup } from './_util.js'

const ID = 'm003_meta_schema'

const DEFAULTS = {
  lastOpenedTabs: [],
  settings: { searchInclude: ['md', 'smm'], autosaveMs: 1500 }
}

export const m003 = {
  id: ID,
  from: null,
  to: null,

  async up(ctx, { dryRun = false, meta = null } = {}) {
    const io = ctx && ctx.io
    if (!io || !io.workspaceIndex) return fail(err('E_MIGRATE_NO_CTX', { step: ID }))
    const { workspaceIndex } = io
    const root = (ctx && ctx.root) || ''

    let cur = meta && typeof meta === 'object' ? { ...meta } : null
    if (!cur) {
      const r = await workspaceIndex.read('meta.json', { root })
      cur = r.ok ? { ...r.data } : null
    }
    const base = cur || { v: CURRENT_INDEX_SCHEMA }

    const missing = []
    for (const k of Object.keys(DEFAULTS)) {
      if (base[k] === undefined || base[k] === null) missing.push(k)
    }
    // ① 幂等
    if (!missing.length) return ok({ skipped: true, reason: 'schema-complete' })

    const next = { ...base, v: CURRENT_INDEX_SCHEMA }
    for (const k of missing) next[k] = DEFAULTS[k]
    const changed = missing.map(k => `meta.json: +${k}`)
    if (dryRun) return ok({ changed, meta: next })

    // ② 备份
    await backup(ctx, ID, ['meta.json'])
    const w = await workspaceIndex.write('meta.json', next, { root })
    if (!w.ok) return fail(err('E_MIGRATE_FAILED', { step: ID, reason: 'meta-write', error: w.error }))
    return ok({ changed, meta: next })
  }
}
