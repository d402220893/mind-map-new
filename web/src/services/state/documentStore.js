// L2 状态层：文档内容按 tabId 索引（无 IO、不碰 localStorage）。
// 持久化由 L4 mdDocument 调 serialize()/hydrate() 完成（§6.6）。
export function createDocumentStore() {
  const docs = new Map()
  function ensure(tabId, initDoc = {}) {
    if (!docs.has(tabId)) docs.set(tabId, { content: '', savedContent: '', rev: 0, dirty: false, ...initDoc })
    return docs.get(tabId)
  }
  function get(tabId) { return docs.get(tabId) || null }
  // setContent：设置内容并标记 dirty（脏标记唯一入口在 L4 mdDocument，此处提供原语）
  function set(tabId, doc) {
    const cur = docs.get(tabId) || { content: '', savedContent: '', rev: 0, dirty: false }
    docs.set(tabId, { ...cur, ...doc, dirty: doc.dirty != null ? doc.dirty : true })
    return docs.get(tabId)
  }
  function setContent(tabId, content) {
    const cur = ensure(tabId)
    cur.content = content
    cur.dirty = true
    return cur
  }
  // markSaved：写盘成功后清脏（savedContent 同步为 content）
  function markSaved(tabId, { rev } = {}) {
    const cur = docs.get(tabId)
    if (!cur) return null
    cur.savedContent = cur.content
    cur.dirty = false
    if (rev != null) cur.rev = rev
    return cur
  }
  function markDirty(tabId, dirty) { const d = docs.get(tabId); if (d) d.dirty = dirty }
  function isDirty(tabId) { const d = docs.get(tabId); return !!(d && d.dirty) }
  function drop(tabId) { docs.delete(tabId) }
  function serialize(tabId) { return docs.get(tabId) || null }
  function hydrate(tabId, json) { if (json) docs.set(tabId, { content: '', savedContent: '', rev: 0, dirty: false, ...json }) }
  return { ensure, get, set, setContent, markSaved, markDirty, isDirty, drop, serialize, hydrate }
}
