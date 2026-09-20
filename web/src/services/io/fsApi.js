// L3 IO 层：封装 window.smmApi，统一 Result/ErrorInfo（§16.5）。
// 唯一 IO 出口；"回声抑制唯一登记点"（suppressionRegistry 经 ctx 注入，避免 io 内部环）。
// L3 允许引用 window.smmApi（§16.1 矩阵）。
//
// 通道映射（详设 §7.2）：优先用工作区新通道（`smm:read-text` / `write-text` / `stat-many` …），
// 新通道缺失时回退旧通道（`readFile` / `writeFile` / `exists`），保证老包体也能启动。
import { ok, fail, err } from '../errors.js'

// §10-#9：Windows 文件被占用时的退避重试表（设计规定 200/600/1500ms，共 3 次重试）
const WRITE_RETRY_DELAYS = [200, 600, 1500]
const RETRYABLE = new Set(['E_LOCKED', 'EBUSY'])
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function retryCodeOf(e) {
  const c = (e && (e.code || e.errno)) || ''
  if (c === 'EBUSY') return 'E_LOCKED'
  return c || 'E_WRITE_FAILED'
}

/**
 * §10-#12 编码探测：Node 以 utf8 解码非法字节时会产生 U+FFFD（替换字符）。
 * 极少数 U+FFFD 可能是正文里的正当字符，故用阈值（≥3 个）判定"疑似非 UTF-8"，
 * 命中后只读打开、不写回，避免把用户的 GBK 文件毁掉。
 */
function detectEncoding(content) {
  const s = String(content == null ? '' : content)
  if (!s.length) return { encodingSuspect: false, replacementRatio: 0 }
  let n = 0
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 0xFFFD) n++
  return { encodingSuspect: n >= 3, replacementRatio: n / s.length }
}

export const createFsApi = (ctx = {}) => {
  const reg = ctx.suppressionRegistry || null
  function api() {
    if (typeof window === 'undefined' || !window.smmApi) return null
    return window.smmApi
  }
  async function readText(absPath) {
    const a = api()
    if (!a) return fail(err('E_NO_IPC', { absPath }))
    try {
      // 新通道返回 {ok, content, mtimeMs}；旧通道直接返回字符串
      if (typeof a.readText === 'function') {
        const r = await a.readText(absPath)
        if (r && r.ok === false) return fail(err(r.code || 'E_READ_FAILED', { absPath, message: r.message }))
        const content = r && r.content != null ? r.content : ''
        return ok({ content, mtimeMs: r && r.mtimeMs, ...detectEncoding(content) })
      }
      const content = await a.readFile(absPath, 'utf8')
      return ok({ content, ...detectEncoding(content) })
    } catch (e) {
      return fail(err('E_READ_FAILED', { absPath, message: e.message }))
    }
  }
  async function writeText(absPath, content) {
    const a = api()
    if (!a) return fail(err('E_NO_IPC', { absPath }))
    // 回声抑制登记点（业务层不得手动 register；消费端用 suppression.hit）
    if (reg && typeof reg.register === 'function') reg.register(absPath, content)
    // §10-#9：Windows 文件被占用（EBUSY / 主进程归一为 E_LOCKED）→ 重试 3 次（200/600/1500ms）。
    // 只在"可重试"错误码上退避：EACCES/EPERM 多为真·只读，重试只会让用户多等 2.3s。
    let lastErr = null
    for (let attempt = 0; attempt <= WRITE_RETRY_DELAYS.length; attempt++) {
      try {
        if (typeof a.writeText === 'function') {
          const r = await a.writeText(absPath, content)
          // E_MTIME_CHANGED 属"告警不阻断"：盘已写（written:true），仍按成功返回并透出告警码
          if (r && r.ok === false && r.code !== 'E_MTIME_CHANGED') {
            const code = r.code || 'E_WRITE_FAILED'
            if (RETRYABLE.has(code) && attempt < WRITE_RETRY_DELAYS.length) {
              lastErr = err(code, { absPath, message: r.message, attempt })
              await sleep(WRITE_RETRY_DELAYS[attempt])
              continue
            }
            return fail(err(code, { absPath, message: r.message }))
          }
          return ok({ absPath, mtimeMs: r && r.mtimeMs, warned: r && r.code, attempts: attempt + 1 })
        }
        await a.writeFile(absPath, content)
        return ok({ absPath, attempts: attempt + 1 })
      } catch (e) {
        const code = retryCodeOf(e)
        if (RETRYABLE.has(code) && attempt < WRITE_RETRY_DELAYS.length) {
          lastErr = err(code, { absPath, message: e && e.message, attempt })
          await sleep(WRITE_RETRY_DELAYS[attempt])
          continue
        }
        return fail(err(code, { absPath, message: e && e.message }))
      }
    }
    return fail(lastErr || err('E_WRITE_FAILED', { absPath }))
  }
  async function writeBinary(absPath, buf) {
    const a = api()
    if (!a) return fail(err('E_NO_IPC', { absPath }))
    try {
      if (reg && typeof reg.register === 'function') reg.register(absPath, String(buf && buf.length))
      if (typeof a.writeBinary === 'function') {
        const base64 = b64encode(buf)
        const r = await a.writeBinary(absPath, base64)
        if (r && r.ok === false) return fail(err(r.code || 'E_WRITE_FAILED', { absPath, message: r.message }))
        return ok({ absPath, size: r && r.size })
      }
      await a.writeFileBinary(absPath, buf)
      return ok({ absPath })
    } catch (e) {
      return fail(err('E_WRITE_FAILED', { absPath, message: e.message }))
    }
  }
  async function exists(absPath) {
    const r = await stat(absPath)
    if (!r.ok) return r
    return ok({ exists: !!r.data.exists })
  }
  async function stat(absPath) {
    const a = api()
    if (!a) return fail(err('E_NO_IPC', { absPath }))
    try {
      if (typeof a.statMany === 'function') {
        const r = await a.statMany([absPath])
        const s = r && r.stats ? r.stats[absPath] : null
        if (!s) return fail(err('E_STAT_FAILED', { absPath }))
        return ok({ isDir: !!s.isDir, exists: !!s.exists, mtimeMs: s.mtimeMs, size: s.size })
      }
      if (typeof a.stat !== 'function') return fail(err('E_NOT_SUPPORTED', { absPath, method: 'stat' }))
      const st = await a.stat(absPath)
      return ok({ isDir: !!(st && st.isDirectory), exists: true, ...st })
    } catch (e) {
      return fail(err('E_STAT_FAILED', { absPath, message: e.message }))
    }
  }
  async function readTree(dirPath, opts = {}) {
    const a = api()
    if (!a) return fail(err('E_NO_IPC', { dirPath }))
    if (typeof a.readTree !== 'function') return fail(err('E_NOT_SUPPORTED', { dirPath, method: 'readTree' }))
    try {
      const r = await a.readTree(dirPath, opts)
      if (r && r.ok === false) return fail(err(r.code || 'E_READ_TREE_FAILED', { dirPath, message: r.message }))
      return ok({ tree: (r && r.tree) || [] })
    } catch (e) {
      return fail(err('E_READ_TREE_FAILED', { dirPath, message: e.message }))
    }
  }
  async function watch(dirPath, opts = {}) {
    const a = api()
    if (!a) return fail(err('E_NO_IPC', { dirPath }))
    if (typeof a.watch !== 'function') return fail(err('E_NOT_SUPPORTED', { dirPath, method: 'watch' }))
    try {
      const r = await a.watch(dirPath, opts)
      if (r && r.ok === false) return fail(err(r.code || 'E_WATCH_FAILED', { dirPath, message: r.message }))
      return ok({ handle: r })
    } catch (e) {
      return fail(err('E_WATCH_FAILED', { dirPath, message: e.message }))
    }
  }
  async function unwatch() {
    const a = api()
    if (!a || typeof a.unwatch !== 'function') return ok({})
    return ok(await a.unwatch())
  }
  async function openExternal(url, opts = {}) {
    const a = api()
    if (!a) return fail(err('E_NO_IPC', { absPath: url }))
    if (typeof a.openExternal !== 'function') return fail(err('E_NOT_SUPPORTED', { absPath: url, method: 'openExternal' }))
    try {
      const r = await a.openExternal(url, opts)
      if (r && r.ok === false) return fail(err(r.code || 'E_OPEN_EXTERNAL_FAILED', { absPath: url, message: r.message }))
      return ok({})
    } catch (e) {
      return fail(err('E_OPEN_EXTERNAL_FAILED', { absPath: url, message: e.message }))
    }
  }
  // ── 工作区辅助通道（可选；缺失时返回 E_NOT_SUPPORTED，不阻断主流程）──
  async function mkdirp(dirPath) {
    const a = api()
    if (!a || typeof a.mkdirp !== 'function') return fail(err('E_NOT_SUPPORTED', { absPath: dirPath, method: 'mkdirp' }))
    const r = await a.mkdirp(dirPath)
    return r && r.ok === false ? fail(err(r.code || 'E_MKDIR', { absPath: dirPath })) : ok({ absPath: dirPath })
  }
  async function move(from, to) {
    const a = api()
    if (!a || typeof a.move !== 'function') return fail(err('E_NOT_SUPPORTED', { absPath: from, method: 'move' }))
    const r = await a.move(from, to)
    return r && r.ok === false ? fail(err(r.code || 'E_MOVE', { absPath: from })) : ok({ from, to })
  }
  async function trash(paths) {
    const a = api()
    if (!a || typeof a.trash !== 'function') return fail(err('E_NOT_SUPPORTED', { method: 'trash' }))
    const r = await a.trash(paths)
    return r && r.ok === false ? fail(err(r.code || 'E_TRASH', { paths })) : ok({ paths })
  }
  async function revealInFolder(absPath) {
    const a = api()
    if (!a || typeof a.revealInFolder !== 'function') return fail(err('E_NOT_SUPPORTED', { absPath, method: 'revealInFolder' }))
    await a.revealInFolder(absPath)
    return ok({ absPath })
  }
  async function pickDirectory(opts = {}) {
    const a = api()
    if (!a || typeof a.pickDirectory !== 'function') return fail(err('E_NOT_SUPPORTED', { method: 'pickDirectory' }))
    const r = await a.pickDirectory(opts)
    return r && r.canceled ? fail(err('E_CANCELED', {})) : ok({ dirPath: r && r.dirPath })
  }
  return {
    readText, writeText, writeBinary, exists, stat, readTree,
    watch, unwatch, openExternal,
    mkdirp, move, trash, revealInFolder, pickDirectory
  }
}

// Uint8Array/Buffer → base64（不引第三方；浏览器与 Node 双端可用的最小实现）
function b64encode(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf || [])
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(bytes).toString('base64')
}
