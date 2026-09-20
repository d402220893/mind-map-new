// L0 基础层：所有新增事件的唯一声明处 + createEventBus
// 零依赖、零业务；视图与 L4 都从这里拿事件名，禁止在别处硬编码字符串事件名。
export const EVT = {
  // 工作区
  WS_OPENED: 'workspace:opened',
  WS_CLOSED: 'workspace:closed',
  WS_TREE_CHANGED: 'workspace:treeChanged',
  WS_INDEX_PROGRESS: 'workspace:indexProgress',
  // 文件（fs.watch → 语义化，§7.8 表）
  FILE_CHANGED: 'file:changed',
  FILE_RENAMED: 'file:renamed',
  FILE_DELETED: 'file:deleted',
  FS_ADD: 'fs:add',
  FS_CHANGE: 'fs:change',
  FS_UNLINK: 'fs:unlink',
  FILE_SAVED: 'file-saved', // {path, kind}
  // 引用
  REF_ADDED: 'ref:added',
  REF_REMOVED: 'ref:removed',
  REF_SNAPSHOT_SYNCED: 'ref:snapshotSynced',
  REF_CONFLICT: 'ref:conflict',
  // 章节（⚠️ section:updated 载荷禁止 source/origin 字段 —— 回声抑制只由 suppressionRegistry 负责）
  SECTION_COMMITTED: 'section:committed',
  SECTION_MISSING: 'section:missing',
  SECTION_UPDATED: 'section:updated', // {file, sectionId, rev, hash}
  // 导航 / 链接
  LINK_MISSING: 'link-missing', // {href, fromPath, abs}
  MD_SCROLL_TO_ANCHOR: 'md-scroll-to-anchor', // {anchor, line}
  MD_OUTLINE_CHANGED: 'md-outline-changed', // {sections}
  CONTEXT_CHANGED: 'context-changed', // {kind, tabId}
  TAB_REFRESH_REQUEST: 'tab-refresh-request', // {path, kind}
  INDEX_REBUILDING: 'index:rebuilding', // {phase,scanned,total} | {done:true}
  // 文档
  DOC_DIRTY: 'doc:dirty',
  DOC_SAVED: 'doc:saved'
}

// 已声明事件集合：emit 未在 EVT 中声明的事件名 → 开发期抛错（§16.7-1）
const DECLARED = new Set(Object.values(EVT))

/**
 * 应用业务事件总线（与既有 $bus 分开，§16.7-5）。
 * ⚠️ 本文件属 L0，禁 import L1（含 errors.js）→ 未声明事件只能抛原生 Error，不用 appError。
 */
export function createEventBus(logger) {
  const map = new Map() // event → Set<fn>
  const counts = new Map() // event → 触发次数（测试可断言）
  function assertDeclared(ev) {
    if (!DECLARED.has(ev)) throw new Error('E_EVENT_UNDECLARED: ' + ev)
  }
  function on(type, fn) {
    assertDeclared(type)
    if (!map.has(type)) map.set(type, new Set())
    map.get(type).add(fn)
    return () => map.get(type) && map.get(type).delete(fn)
  }
  function off(type, fn) { if (map.has(type)) map.get(type).delete(fn) }
  function emit(type, payload) {
    assertDeclared(type)
    counts.set(type, (counts.get(type) || 0) + 1)
    for (const fn of map.get(type) || []) {
      try { fn(payload) } catch (e) {
        if (logger && logger.error) logger.error('bus.handler', { ev: type, message: e && e.message })
        else console.error('[eventBus]', type, e)
      }
    }
  }
  function count(type) { return counts.get(type) || 0 }
  function reset() { map.clear(); counts.clear() }
  return { on, off, emit, clear: reset, reset, count }
}
