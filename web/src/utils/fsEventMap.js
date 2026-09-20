// 主进程 `smm:fs-event` 载荷 → 语义化 fs 事件（**纯函数，零 import**）。
//
// 为什么单独抽出来：这个映射的输入是**跨进程契约**（electron-app/main.js 里 smm:watch 的
// payload 形状）。两边形状一旦不一致，事件会**静默丢失** —— 回调照常被调用，只是取不到值，
// 表现是"外部新增/删除文件后侧栏不刷新、搜索缓存不过期"，且不报任何错。
// 抽成零依赖纯函数后，可用零 mock 用例把契约钉死（tests/pure/fsEventMap.test.mjs）。
//
// 主进程载荷（main.js · smm:watch）：
//   { root: <工作区根>, events: [{ type:'add'|'change'|'unlink', path:<绝对>, rel:<相对 root>, ts }] }
// 兼容单事件 / 旧形状：{ type, rel|path }（无 events 数组时按单条处理）。
export const FS_EVENT_KINDS = ['add', 'change', 'unlink']

function toSlash(s) { return String(s == null ? '' : s).replace(/\\/g, '/') }
function trimSlash(s) { return toSlash(s).replace(/\/+$/, '') }

/** 绝对路径 → 相对 root；不在 root 内返回 null（纯） */
export function relToRoot(root, absPath) {
  const r = trimSlash(root)
  const a = toSlash(absPath)
  if (!r || !a) return null
  if (a === r) return ''
  return a.startsWith(r + '/') ? a.slice(r.length + 1) : null
}

/**
 * 归一化 fs 事件载荷 → `[{ kind, absPath, rel }]`（纯，不修改入参）。
 * type 不在白名单内的一律丢弃 —— 宁可少刷一次，也不要把 'rename' 这种原始值当事件派发。
 */
export function mapFsEvents(payload) {
  if (!payload || typeof payload !== 'object') return []
  const root = payload.root || ''
  const raw = Array.isArray(payload.events) ? payload.events : (payload.type ? [payload] : [])
  const out = []
  for (const ev of raw) {
    if (!ev || typeof ev !== 'object') continue
    if (!FS_EVENT_KINDS.includes(ev.type)) continue
    const absPath = toSlash(ev.path) ||
      (ev.rel != null && root ? trimSlash(root) + '/' + toSlash(ev.rel) : '')
    const rel = ev.rel != null ? toSlash(ev.rel) : relToRoot(root, absPath)
    out.push({ kind: ev.type, absPath, rel })
  }
  return out
}
