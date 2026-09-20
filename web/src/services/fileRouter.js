// L4 编排：链接跳转 / 打开文件 / .km 导入（§7.4.2）。
// ⚠️ 解析一律转发 L1 linkResolver（本文件只承担副作用）；不得监听"自己造成"的事件做抑制。
// ⚠️ 不得反向 import revisionService 以外的 L4 服务（§7.4.2 依赖方向纪律）。
import { ok, fail, err } from './errors.js'
import { EVT } from './events.js'
import { resolveLink as resolveLinkPure, resolveEmbed as resolveEmbedPure, SUPPORTED, extOf } from './linkResolver.js'

function kindOf(abs) { return SUPPORTED[extOf(abs)] || 'unknown' }
function nameOf(abs) {
  const s = String(abs || '').replace(/\\/g, '/')
  return s.split('/').pop() || s
}

// §10-#13 循环链接保护：同一时间窗内的连续跳转深度上限
const MAX_JUMP_DEPTH = 5
const JUMP_WINDOW_MS = 2000

export const createFileRouter = (ctx = {}) => {
  const { io = {}, services = {}, events, log } = ctx
  const { fsApi } = io
  const { workspaceService, refService } = services
  const emit = (ev, payload) => { if (events && events.emit) events.emit(ev, payload) }
  const root = () => (workspaceService && workspaceService.getRoot ? workspaceService.getRoot() : null) || null
  // 最近跳转栈（循环链接保护用，§10-#13）
  let jumpStack = []
  const toAbs = (p) => (workspaceService && workspaceService.abs ? workspaceService.abs(p) : p)

  /** 入口 2：链接跳转（md 内点击 / 导图节点点击）—— 副作用集中在此 */
  async function navigate(href, fromPath) {
    // §10-#13：循环链接保护（a.md → b.smm → a.md …）。只按"最近 2s 内的跳转深度"判定，
    // 用时间窗而非永久计数，避免用户正常来回跳几次就被误伤。
    const now = Date.now()
    jumpStack = jumpStack.filter(it => now - it.at < JUMP_WINDOW_MS)
    if (jumpStack.length >= MAX_JUMP_DEPTH) {
      if (log && log.warn) log.warn('router.tooDeep', { href, fromPath, depth: jumpStack.length })
      emit(EVT.LINK_MISSING, { href, fromPath, reason: 'too-deep' })
      return fail(err('E_LINK_TOO_DEEP', { href, depth: jumpStack.length }))
    }
    jumpStack.push({ href, at: now })

    const r = resolveLinkPure(fromPath, href, { root: root() })
    if (r.kind === 'external') {
      const res = await fsApi.openExternal(r.abs)
      return res.ok ? ok({ action: 'external', abs: r.abs }) : res
    }
    if (r.kind === 'ignore') return ok({ action: 'ignore' })

    const abs = toAbs(r.abs)
    const st = await fsApi.stat(abs)
    if (!st.ok || !st.data || !st.data.exists) {
      emit(EVT.LINK_MISSING, { href, fromPath, abs })
      return fail(err('E_LINK_MISSING', { path: abs }))
    }
    if (r.kind === 'mindmap-import') return importAsNew(abs)
    return open(abs, { anchor: r.anchor })
  }

  /** 入口 1：打开文件（Tab 内），已打开则激活 + 定位锚点 */
  async function open(pathOrAbs, { anchor = null, sheetId = null } = {}) {
    const abs = toAbs(pathOrAbs)
    const kind = kindOf(abs)
    const st = await fsApi.exists(abs)
    if (!st.ok || !st.data || !st.data.exists) {
      emit(EVT.LINK_MISSING, { href: pathOrAbs, fromPath: null, abs })
      return fail(err('E_LINK_MISSING', { path: abs }))
    }

    // ⚠️ C3：.smm 打开时，必须在 decode→渲染之前校准 pending 快照，否则会闪出假 stale 徽标
    if (kind === 'mindmap' && refService && typeof refService.calibratePendingSnapshots === 'function') {
      const cal = await refService.calibratePendingSnapshots({ abs })
      if (!cal.ok && log && log.warn) log.warn('router.calibrate', { abs, error: cal.error })
    }

    const tabs = ctx.tabs
    let reused = false
    let tabId = null
    if (tabs && typeof tabs.findByPath === 'function') {
      const hit = await tabs.findByPath(abs)
      if (hit) {
        reused = true
        tabId = hit && hit.id != null ? hit.id : hit
      }
    }
    if (reused) {
      if (tabs && typeof tabs.switch === 'function') await tabs.switch(tabId)
      if (anchor) emit(EVT.MD_SCROLL_TO_ANCHOR, { anchor, abs, tabId })
      return ok({ tabId, reused, abs, kind, anchor })
    }
    if (tabs && typeof tabs.add === 'function') {
      tabId = await tabs.add({ kind, name: nameOf(abs), filePath: abs, sheetId, anchor })
    }
    return ok({ tabId, reused, abs, kind, anchor })
  }

  /** .km / .xmind → 既有导入流（由组合根注入 importer，未注入则降级提示） */
  async function importAsNew(abs) {
    const importer = ctx.importer
    if (typeof importer !== 'function') {
      return fail(err('E_IMPORT_UNAVAILABLE', { path: abs }))
    }
    const r = await importer({ abs })
    return r && r.ok === false ? r : ok({ action: 'import', abs, data: r && r.data })
  }

  /** 入口 3：内嵌解析（纯逻辑转发 linkResolver） */
  function resolveEmbed(href, fromPath) { return resolveEmbedPure(href, fromPath, { root: root() }) }
  /** 兼容转发：老调用方仍可用；新代码应直接 import linkResolver */
  function resolveLink(fromPath, href) { return resolveLinkPure(fromPath, href, { root: root() }) }

  // 组合根默认单例创建时视图尚未就绪，tabs/importer 只能在运行时补挂（§16.2 注入纪律）
  function setTabs(t) { ctx.tabs = t }
  function setImporter(fn) { ctx.importer = fn }

  return { open, navigate, importAsNew, resolveEmbed, resolveLink, setTabs, setImporter }
}
