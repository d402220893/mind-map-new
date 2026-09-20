// CG 组合根层（migrations/）：迁移公共工具。
// 单独成文件是**硬要求**：m001–m003 若从 index.js 取工具，会与 index.js 形成 import 环，
// 被 scripts/check-arch.mjs 的 DFS 三色环检测（断言⑧）拦截。
import { ok, fail, err } from '../errors.js'

export const CURRENT_INDEX_SCHEMA = 1
export const INDEX_DIR = '.mindlink'

export function rootOf(ctx) {
  const ws = ctx && ctx.services && ctx.services.workspaceService
  if (ws && typeof ws.getRoot === 'function') return ws.getRoot() || ''
  return (ctx && ctx.root) || ''
}

export function indexAbs(root, name) {
  const r = String(root || '').replace(/\\/g, '/').replace(/\/+$/, '')
  return (r ? r + '/' : '') + INDEX_DIR + '/' + name
}

export function ts() { return new Date().toISOString().replace(/[:.]/g, '-') }

const INDEX_NAMES = new Set(['meta.json', 'sections.json', 'refs.json', 'migrate.log'])

/** 迁移前备份：把受影响文件原样复制到 .mindlink/backup/<stepId>/<ts>/（不删原文件，§17.2-2） */
export async function backup(ctx, stepId, relFiles) {
  const { fsApi } = ctx.io
  const root = rootOf(ctx)
  const dir = indexAbs(root, 'backup/' + stepId + '/' + ts())
  const written = []
  for (const rel of relFiles) {
    // 索引三件套位于 .mindlink/ 下，不能当工作区相对路径拼
    const resolved = INDEX_NAMES.has(rel) ? indexAbs(root, rel) : rel
    const src = String(resolved).startsWith('/') || /^[A-Za-z]:/.test(resolved)
      ? resolved
      : (root ? root + '/' + resolved : resolved)
    const r = await fsApi.readText(src)
    if (!r.ok) continue // 备份失败不阻断迁移（源文件不存在等）
    const dst = dir + '/' + String(rel).split('/').pop()
    const w = await fsApi.writeText(dst, r.data.content)
    if (w.ok) written.push(dst)
  }
  return ok({ dir, written })
}

/** 迁移日志：追加到 .mindlink/migrate.log（含 ts/step/dryRun，§17.2-3）；dryRun 不写盘 */
export async function appendLog(ctx, entries) {
  if (!entries || !entries.length) return ok({ appended: 0 })
  const { fsApi } = ctx.io
  const root = rootOf(ctx)
  const abs = indexAbs(root, 'migrate.log')
  const prev = await fsApi.readText(abs)
  const head = prev.ok ? prev.data.content : ''
  const body = entries.map(e => `[${new Date().toISOString()}] ${e}`).join('\n')
  const w = await fsApi.writeText(abs, (head ? head.replace(/\n*$/, '\n') : '') + body + '\n')
  return w.ok ? ok({ appended: entries.length, abs }) : w
}

/** 目录树 → 相对文件列表（与 workspaceIndex.collectFiles 同构，此处独立实现避免 CG→L3 反向依赖） */
export function flattenTree(nodes, prefix = '') {
  const out = []
  for (const n of (nodes || [])) {
    const name = n.name != null ? n.name : n.path
    const p = (prefix ? prefix + '/' : '') + name
    if (n.isDir) out.push(...flattenTree(n.children || [], p))
    else out.push(p)
  }
  return out
}

export function collectNodes(root) {
  const out = []
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    out.push(n)
    if (Array.isArray(n.children)) n.children.forEach(walk)
  }
  walk(root)
  return out
}

export { ok, fail, err }
