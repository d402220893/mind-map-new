// L4 编排：md 载入 / 脏标记 / 保存（含防抖自动保存）+ documentStore 持久化出入口（§6.6）。
// ⚠️ 脏标记唯一入口在本文件（store 只提供原语）；持久化由 serialize/hydrate 完成，store 自身不落盘。
import { ok, fail, err } from './errors.js'
import { EVT } from './events.js'

export const createMdDocument = (ctx = {}) => {
  const { io = {}, stores = {}, services = {}, events, log } = ctx
  const { fsApi } = io
  const store = (stores && (stores.document || stores.documents)) ||
    (services && services.documentStore) || null
  const timers = new Map() // tabId -> timeout handle

  const emit = (ev, payload) => { if (events && events.emit) events.emit(ev, payload) }
  const S = (fn, ...a) => (store && typeof store[fn] === 'function' ? store[fn](...a) : null)

  async function load(tabId, absPath) {
    const r = await fsApi.readText(absPath)
    if (!r.ok) return r
    // §10-#12：疑似非 UTF-8（U+FFFD 比例过高）→ 打只读标记，禁止写回以免毁掉原文件
    const suspect = !!r.data.encodingSuspect
    S('set', tabId, {
      content: r.data.content,
      savedContent: r.data.content,
      rev: 0,
      dirty: false,
      encodingSuspect: suspect,
      replacementRatio: r.data.replacementRatio || 0
    })
    return ok({
      content: r.data.content, tabId, absPath,
      encodingSuspect: suspect, replacementRatio: r.data.replacementRatio || 0
    })
  }

  /** 编辑入口：改内容 + 打脏（唯一入口） */
  function setContent(tabId, content) {
    const doc = S('setContent', tabId, content)
    emit(EVT.DOC_DIRTY, { tabId, dirty: true })
    return ok({ tabId, dirty: true, doc })
  }

  function isDirty(tabId) { return !!S('isDirty', tabId) }
  function get(tabId) { return S('get', tabId) }

  async function save(tabId, absPath) {
    const doc = S('get', tabId)
    if (!doc) return fail(err('E_DOC_NOT_LOADED', { tabId }))
    // §10-#12：疑似非 UTF-8 的文件**拒绝写回**——解码已丢字符，写回等于毁原文件。
    // 用户若要保存，需显式另存为新文件（避免静默破坏）。
    if (doc.encodingSuspect) return fail(err('E_ENCODING_SUSPECT', { tabId, absPath }))
    const w = await fsApi.writeText(absPath, doc.content)
    if (!w.ok) return w
    S('markSaved', tabId, {})
    emit(EVT.DOC_SAVED, { tabId, absPath })
    emit(EVT.FILE_SAVED, { path: absPath, kind: 'markdown' })
    return ok({ tabId, absPath, bytes: doc.content.length })
  }

  /** 防抖自动保存（§6.6）；flush 立即落盘并清定时器 */
  function scheduleSave(tabId, absPath, ms = 1500) {
    if (timers.has(tabId)) clearTimeout(timers.get(tabId))
    const h = setTimeout(async () => {
      timers.delete(tabId)
      if (!isDirty(tabId)) return
      const r = await save(tabId, absPath)
      if (!r.ok && log && log.warn) log.warn('doc.autosave.failed', { tabId, absPath, error: r.error })
    }, ms)
    timers.set(tabId, h)
    return ok({ scheduled: true, ms })
  }

  function cancelSave(tabId) {
    if (timers.has(tabId)) { clearTimeout(timers.get(tabId)); timers.delete(tabId) }
    return ok({ canceled: true })
  }

  function serialize(tabId) { return S('serialize', tabId) }
  function hydrate(tabId, json) { S('hydrate', tabId, json); return ok({ tabId }) }
  function drop(tabId) { cancelSave(tabId); S('drop', tabId); return ok({ tabId }) }

  return { load, save, setContent, isDirty, get, scheduleSave, cancelSave, serialize, hydrate, drop }
}
