// L1 纯函数：链接解析（resolveLink / resolveEmbed / isExternal / normalizeHref / SUPPORTED）。
// 零依赖、零副作用、无 IO（§7.4.1）；10+ 用例零 mock。
export const SUPPORTED = {
  '.md': 'markdown', '.markdown': 'markdown',
  '.smm': 'mindmap', '.json': 'mindmap',
  '.km': 'mindmap-import', '.xmind': 'mindmap-import',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image',
  '.gif': 'image', '.svg': 'image', '.webp': 'image'
}

const WIN_DRIVE = /^[A-Za-z]:[\\/]/

export function normalizeHref(href) {
  return String(href == null ? '' : href).trim()
}

export function isExternal(href) {
  const h = normalizeHref(href)
  return /^(https?:\/\/|mailto:|tel:|ftp:|file:\/\/)/i.test(h)
}

export function safeDecode(s) {
  try { return decodeURIComponent(String(s == null ? '' : s)) } catch { return String(s == null ? '' : s) }
}

export function dirOf(p) {
  const s = String(p || '').replace(/\\/g, '/')
  const i = s.lastIndexOf('/')
  return i < 0 ? '' : s.slice(0, i)
}

export function extOf(p) {
  const s = String(p || '')
  const i = s.lastIndexOf('.')
  return i < 0 ? '' : s.slice(i).toLowerCase()
}

/** 路径拼接 + `.`/`..` 归正（纯） */
export function joinPath(base, rel) {
  const b = String(base || '').replace(/\\/g, '/')
  const r = String(rel || '').replace(/\\/g, '/')
  const start = r.startsWith('/')
  const parts = (start ? '' : b + '/').split('/').concat(r.split('/'))
  const out = []
  for (const seg of parts) {
    if (!seg || seg === '.') continue
    if (seg === '..') { out.pop(); continue }
    out.push(seg)
  }
  return (start ? '/' : '') + out.join('/')
}

/** 相对 root 的 rel；不在 root 内返回 null（纯） */
export function relPath(root, abs) {
  if (!root) return null
  const r = String(root).replace(/\\/g, '/').replace(/\/+$/, '')
  const a = String(abs || '').replace(/\\/g, '/')
  return a.startsWith(r + '/') ? a.slice(r.length + 1) : null
}

/**
 * 链接解析（纯）。
 * @param {string} fromPath 发起文件（相对工作区根或绝对路径均可）
 * @param {string} href 链接原文
 * @param {{root?:string}} [opts] root：工作区根，用于 `/docs/a.md` 这类根相对链接
 * @returns {{abs:string|null, rel:string|null, kind:string, anchor:string|null, isExternal:boolean, unsupported?:boolean, sameDoc?:boolean, absoluteInput?:boolean}}
 */
export function resolveLink(fromPath, href, { root = null } = {}) {
  const raw = normalizeHref(href)
  // 空串 / 单 `#` → 忽略
  if (!raw || raw === '#') return { kind: 'ignore', abs: null, rel: null, anchor: null, isExternal: false }

  if (isExternal(raw)) return { kind: 'external', abs: raw, rel: null, anchor: null, isExternal: true }

  let anchor = null
  let pathPart = raw
  const i = raw.indexOf('#')
  if (i >= 0) {
    pathPart = raw.slice(0, i)
    anchor = raw.length > i + 1 ? safeDecode(raw.slice(i + 1)) : null
  }

  // 纯 `#本地锚点`：same-doc 滚动（abs 落到真实路径，便于后续 stat）
  if (!pathPart) {
    const self = fromPath || ''
    const selfAbs = !self ? '' : (WIN_DRIVE.test(self) ? self.replace(/\\/g, '/') : joinPath(root || '', self))
    return {
      // ⚠️ kind 必须与 SUPPORTED 口径一致（'.md' → 'markdown'）。此前这里写 'md'，
      // 与其它分支的 'markdown' 不同名 → resolveEmbed 的映射表查不到 'md'，
      // 把"文内锚点"误判成 broken。同名靠 sameDoc 区分，不靠 kind 拼写。
      kind: 'markdown', abs: selfAbs, rel: relPath(root, selfAbs), anchor,
      isExternal: false, sameDoc: true
    }
  }

  const decoded = safeDecode(pathPart)
  const absoluteInput = WIN_DRIVE.test(decoded)
  let abs
  if (absoluteInput) abs = decoded.replace(/\\/g, '/')
  else if (decoded.startsWith('/')) abs = joinPath(root || '', decoded.slice(1))
  else abs = joinPath(dirOf(fromPath) || (root || ''), decoded) // fromPath 无目录时以工作区根为基

  const kind = SUPPORTED[extOf(abs)] || null
  // abs 可能是工作区相对路径（fromPath 相对时），rel 统一按"挂在 root 下"再取一次
  const isRooted = WIN_DRIVE.test(abs) || abs.startsWith('/')
  const rel = isRooted ? relPath(root, abs) : relPath(root, joinPath(root || '', abs))
  const out = {
    abs,
    rel: rel !== null ? rel : (root ? null : abs),
    kind: kind || 'unknown',
    anchor,
    isExternal: false
  }
  if (!kind) out.unsupported = true
  if (absoluteInput) out.absoluteInput = true // 提示用户改为相对路径（不写回 .smm）
  // `../../` 越过工作区根：rel 为 null 是"出去了"的唯一信号，但调用方极易忽略。
  // 注意：当 fromPath 本身是相对路径时，joinPath 会在 `..` 越顶处静默吸收（pop 空数组），
  // 于是 abs 看起来"还在根内"。所以这里必须换一条**全程带根**的独立计算来判越界。
  if (root && !absoluteInput && !decoded.startsWith('/')) {
    const r0 = String(root).replace(/\\/g, '/').replace(/\/+$/, '')
    const fromDir = dirOf(fromPath)
    const base = !fromDir
      ? r0
      : (WIN_DRIVE.test(fromDir) || fromDir.startsWith('/') ? fromDir : joinPath(r0, fromDir))
    const rooted = joinPath(base, decoded)
    if (rooted !== r0 && !rooted.startsWith(r0 + '/')) {
      out.outsideRoot = true
      out.rel = null // rel 的语义统一为"根内相对路径"，越界一律 null（否则会出现"rel 看起来在根内、实际在根外"的假象）
    }
  }
  return out
}

/** 内嵌解析（纯）—— md 渲染器调用 */
export function resolveEmbed(href, fromPath, { root = null } = {}) {
  const r = resolveLink(fromPath, href, { root })
  if (r.kind === 'external') return { kind: 'external', abs: r.abs, anchor: r.anchor }
  if (r.kind === 'ignore') return { kind: 'broken', abs: null, anchor: null }
  const map = { markdown: 'md', mindmap: 'mindmap', 'mindmap-import': 'mindmap', image: 'image' }
  return { kind: map[r.kind] || 'broken', abs: r.abs, anchor: r.anchor }
}
