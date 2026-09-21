// m004：v1.5「note 与 refs 共存」→ v1.6 二选一互斥（§v1.6 四）。
// 触发：节点 note 非空 且 _mindlink.refs 非空 且 _mindlink.mode 未定义（v1.5 遗留）。
// 策略：**按需 + 用户选择**（ctx.confirm，kind='migrateNoteRefExclusive'）——
//   'note' 统一保留备注（清空 refs） | 'ref' 统一保留引用（note 置 null） | 'each' 逐个确认。
// 迁移前快照备份（.mindlink/backup/m004.../）；完成后 meta.json 记 migrated_v1_6: true（幂等）。
// ⚠️ 只改 .smm 内元数据，绝不动 .md 源文件（§v1.6 六）。
import { ok, fail, err, backup, rootOf, flattenTree, collectNodes, CURRENT_INDEX_SCHEMA } from './_util.js'
import { decodeSmm, encode } from '../smmCodec.js'

const ID = 'm004_note_ref_exclusive'

/** 单节点是否为 v1.5 遗留共存（note 非空 + refs 非空 + 未标记 mode） */
export function hasNoteRefConflict(nd) {
  const data = (nd && nd.data) || {}
  const note = typeof data.note === 'string' ? data.note.trim() : ''
  const ml = data._mindlink
  const refCount = ml && Array.isArray(ml.refs) ? ml.refs.length : 0
  const hasMode = !!(ml && (ml.mode === 'note' || ml.mode === 'ref'))
  return !!note && refCount > 0 && !hasMode
}

export const m004 = {
  id: ID,
  from: null,
  to: null,

  async up(ctx, { dryRun = false, meta = null } = {}) {
    const io = ctx && ctx.io
    if (!io || !io.fsApi || !io.workspaceIndex) return fail(err('E_MIGRATE_NO_CTX', { step: ID }))
    const { fsApi, workspaceIndex } = io
    const root = rootOf(ctx)

    // ① 幂等：已标记 migrated_v1_6 → 整步跳过（含扫描）
    let cur = meta && typeof meta === 'object' ? { ...meta } : null
    if (!cur) {
      const r = await workspaceIndex.read('meta.json', { root })
      cur = r.ok ? { ...r.data } : null
    }
    if (cur && cur.migrated_v1_6 === true) return ok({ skipped: true, reason: 'migrated_v1_6' })

    // ② 扫描 .smm 找共存节点（与其他迁移一致的目录忽略口径）
    const treeR = await fsApi.readTree(root, {
      ignore: ['node_modules', '.git', '.mindlink', '_trash', 'dist-electron', 'dist-electron2']
    })
    if (!treeR.ok) return treeR
    const smms = flattenTree(treeR.data.tree || treeR.data).filter(f => f.endsWith('.smm'))

    const conflicts = [] // {file, nodeId, text, noteLen, refCount}
    const fileMap = new Map() // file -> {abs, sheets, activeId, nodes}
    for (const f of smms) {
      const abs = root ? root + '/' + f : f
      const r = await fsApi.readText(abs)
      if (!r.ok) continue
      let sheets, activeId
      try { ({ sheets, activeId } = decodeSmm(r.data.content)) } catch { continue }
      let nodes = null
      for (const sh of sheets) {
        for (const nd of collectNodes(sh.data)) {
          if (!hasNoteRefConflict(nd)) continue
          if (!nodes) nodes = []
          nodes.push(nd)
          const d = nd.data || {}
          conflicts.push({
            file: f,
            nodeId: nd.id,
            text: d.text || '',
            noteLen: (typeof d.note === 'string' ? d.note : '').trim().length,
            refCount: (d._mindlink && Array.isArray(d._mindlink.refs) ? d._mindlink.refs : []).length
          })
        }
      }
      if (nodes) fileMap.set(f, { abs, sheets, activeId, nodes })
    }

    // ③ 无共存节点：直接打标（避免每次打开都全量扫描）
    if (!conflicts.length) {
      if (dryRun) return ok({ changed: [], meta: { ...(cur || {}), migrated_v1_6: true } })
      const next = { ...(cur || { v: CURRENT_INDEX_SCHEMA }), migrated_v1_6: true }
      const w = await workspaceIndex.write('meta.json', next, { root })
      if (!w.ok) return fail(err('E_MIGRATE_FAILED', { step: ID, reason: 'meta-write', error: w.error }))
      return ok({ changed: ['meta.json: +migrated_v1_6'], meta: next })
    }

    // ④ 用户选择（§v1.6 四：保留备注 / 保留引用 / 逐个确认；无 confirm 时安全默认=不动）
    const confirm = ctx && typeof ctx.confirm === 'function' ? ctx.confirm : null
    if (!confirm) return ok({ skipped: true, reason: 'no-confirm', candidates: conflicts.length })
    if (dryRun) return ok({ changed: conflicts.map(c => `${c.file}#${c.nodeId}`), candidates: conflicts.length })

    const choice = await confirm({
      kind: 'migrateNoteRefExclusive',
      count: conflicts.length,
      files: fileMap.size
    })
    if (choice !== 'note' && choice !== 'ref' && choice !== 'each') {
      return ok({ skipped: true, reason: 'user-declined', candidates: conflicts.length })
    }

    // ⑤ 迁移前快照备份（受影响 .smm 原样备份；失败不阻断，与 m002 口径一致）
    await backup(ctx, ID, [...fileMap.keys()])

    // ⑥ 执行互斥化：保留一方、清另一方（只改 .smm 元数据）
    const changed = []
    for (const [f, entry] of fileMap) {
      for (const nd of entry.nodes) {
        let keep = choice
        if (choice === 'each') {
          const c = conflicts.find(x => x.file === f && x.nodeId === nd.id)
          // true = 保留引用（ref）/ false = 保留备注（note）
          keep = await confirm({
            kind: 'migrateNoteRefEach',
            file: f,
            text: c ? c.text : '',
            noteLen: c ? c.noteLen : 0,
            refCount: c ? c.refCount : 0
          }) ? 'ref' : 'note'
        }
        const ml = { v: 1, ...(nd.data._mindlink || {}) }
        if (keep === 'ref') {
          ml.mode = 'ref'
          nd.data.note = null // 保留字段，仅置 null（§v1.6 一：不 delete data.note）
        } else {
          ml.mode = 'note'
          ml.refs = []
        }
        nd.data._mindlink = ml
        changed.push(`${f}#${nd.id}: keep=${keep}`)
      }
      const w = await fsApi.writeText(entry.abs, encode(null, { sheets: entry.sheets, activeId: entry.activeId }))
      if (!w.ok) return fail(err('E_MIGRATE_FAILED', { step: ID, reason: 'smm-write', file: f, error: w.error }))
    }

    // ⑦ meta 标记（迁移完成才打标；用户拒绝则不打标，下次打开再询问）
    const next = { ...(cur || {}), migrated_v1_6: true }
    const w = await workspaceIndex.write('meta.json', next, { root })
    if (!w.ok) return fail(err('E_MIGRATE_FAILED', { step: ID, reason: 'meta-write', error: w.error }))
    return ok({ changed, written: [...fileMap.keys()], migrated: changed.length, meta: next })
  }
}
