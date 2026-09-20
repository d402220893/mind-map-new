// m002：legacy 备注注释 → data._mindlink（§7.6.5 / §17.2）。
// 触发：节点 note 内含独占一行的 `<!-- ref:{...} -->`；**按需 + 用户确认**（ctx.confirm）。
// 迁移：把 JSON 写入 data._mindlink.refs，并从 note 移除该行；迁移前写快照备份。
import { ok, fail, err, backup, rootOf, flattenTree, collectNodes } from './_util.js'
import { decodeSmm, encode } from '../smmCodec.js'

const ID = 'm002_mindlink_legacy_note'
const REF_COMMENT_RE = /^[ \t]*<!--\s*ref:\s*(\{[\s\S]*?\})\s*-->[ \t]*$/gm

/** 找出单个 note 里的 legacy 引用注释（返回 {refs, cleanedNote}） */
export function extractLegacyRefs(note) {
  const src = String(note || '')
  const refs = []
  let cleaned = src
  let m
  REF_COMMENT_RE.lastIndex = 0
  while ((m = REF_COMMENT_RE.exec(src))) {
    try {
      const parsed = JSON.parse(m[1])
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      for (const r of arr) if (r && r.file) refs.push(r)
      cleaned = cleaned.replace(m[0], '')
    } catch { /* 坏 JSON：保留原样，不迁移 */ }
  }
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '')
  return { refs, cleanedNote: cleaned }
}

export const m002 = {
  id: ID,
  from: null,
  to: null,

  async up(ctx, { dryRun = false } = {}) {
    const io = ctx && ctx.io
    if (!io || !io.fsApi) return fail(err('E_MIGRATE_NO_CTX', { step: ID }))
    const { fsApi } = io
    const root = rootOf(ctx)
    const treeR = await fsApi.readTree(root, {
      ignore: ['node_modules', '.git', '.mindlink', '_trash', 'dist-electron', 'dist-electron2']
    })
    if (!treeR.ok) return treeR

    const smms = flattenTree(treeR.data.tree || treeR.data).filter(f => f.endsWith('.smm'))
    const plan = [] // {file, nodeId, refs}
    const touchedFiles = []
    for (const f of smms) {
      const abs = root ? root + '/' + f : f
      const r = await fsApi.readText(abs)
      if (!r.ok) continue
      let sheets, activeId
      try { ({ sheets, activeId } = decodeSmm(r.data.content)) } catch { continue }
      let touched = false
      for (const sh of sheets) {
        for (const nd of collectNodes(sh.data)) {
          const data = nd.data || {}
          const note = data.note
          if (!note) continue
          const { refs, cleanedNote } = extractLegacyRefs(note)
          if (!refs.length) continue
          plan.push({ file: f, nodeId: nd.id, refs })
          data.note = cleanedNote
          const ml = data._mindlink || {}
          ml.refs = (ml.refs || []).concat(refs)
          data._mindlink = ml
          touched = true
        }
      }
      if (touched) touchedFiles.push({ file: f, abs, text: encode(null, { sheets, activeId }) })
    }

    if (!plan.length) return ok({ skipped: true, reason: 'no-legacy-note' })

    // 按需 + 用户确认（§7.6.5）：无 confirm 时默认不执行（安全默认）
    const confirm = ctx && typeof ctx.confirm === 'function' ? ctx.confirm : null
    if (!confirm) return ok({ skipped: true, reason: 'no-confirm', candidates: plan.length })

    const changed = plan.map(p => `${p.file}#${p.nodeId}: +${p.refs.length} ref(s)`)
    if (dryRun) return ok({ changed, candidates: plan.length })

    const yes = await confirm({ kind: 'migrateLegacyNote', count: plan.length, files: touchedFiles.length })
    if (yes !== true) return ok({ skipped: true, reason: 'user-declined', candidates: plan.length })

    // ② 迁移前备份（原 .smm 快照）
    await backup(ctx, ID, touchedFiles.map(t => t.file))
    const written = []
    for (const t of touchedFiles) {
      const w = await fsApi.writeText(t.abs, t.text)
      if (!w.ok) return fail(err('E_MIGRATE_FAILED', { step: ID, reason: 'smm-write', file: t.file, error: w.error }))
      written.push(t.file)
    }
    return ok({ changed, written, migrated: plan.length })
  }
}
