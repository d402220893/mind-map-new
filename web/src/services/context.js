// L0 基础层：上下文工厂（零依赖）。
// createWorkspaceContext：纯数据容器 + abs/rel/isInside 路径工具（越界返回 null，不抛）。
// createDocumentContext：文档脏标记唯一入口（§6.6）。
import { join as joinPosix } from 'path'

function norm(p) { return String(p || '').replace(/\\/g, '/') }
function isAbs(p) { return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('/') }

export function createWorkspaceContext({ root = '', tree = [], indexCache = null } = {}) {
  const _root = norm(root)
  function abs(rel) {
    if (!rel) return _root
    if (isAbs(rel)) return norm(rel)
    return _root ? norm(_root + '/' + rel) : norm(rel)
  }
  function rel(p) {
    const np = norm(p)
    if (!_root) return np
    const r = norm(_root)
    if (np === r) return ''
    if (np.startsWith(r + '/')) return np.slice(r.length + 1)
    return null // 不在工作区内（越界）
  }
  function isInside(p) {
    const np = norm(p)
    if (!_root) return false
    return np === norm(_root) || np.startsWith(norm(_root) + '/')
  }
  function inferRootFor(filePath) {
    const np = norm(filePath)
    if (!_root) {
      // 单文件模式：向上找 .mindlink，找不到用文件所在目录
      const idx = np.lastIndexOf('/')
      return idx >= 0 ? np.slice(0, idx) : ''
    }
    return _root
  }
  return { kind: 'workspace', root: _root, tree, indexCache, abs, rel, isInside, inferRootFor }
}

export function createDocumentContext({ tabId = '', content = '' } = {}) {
  let _dirty = false
  function markDirty(d) { _dirty = !!d; return _dirty }
  function isDirty() { return _dirty }
  return { kind: 'document', tabId, content, markDirty, isDirty }
}
