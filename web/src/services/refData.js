// L1 纯函数：引用元数据增删改查（节点 data._mindlink.refs 上操作，无 IO）。
// 零依赖、无副作用；node 由调用方传入（L4 refService 转发）。
const REF_KEY = '_mindlink'

export function getNodeRefs(node) {
  const data = (node && node.data) || {}
  const ml = data[REF_KEY]
  if (!ml || !Array.isArray(ml.refs)) return []
  return ml.refs.map((r, i) => ({ ...r, refId: r.refId || ('r' + i) }))
}

export function setNodeRefs(node, refs) {
  if (!node || !node.data) return false
  const ml = node.data[REF_KEY] || {}
  // 写入时剥离内部 refId（仅运行时标识，不持久化）
  ml.refs = (refs || []).map(r => {
    const { refId, ...rest } = r
    return rest
  })
  node.data[REF_KEY] = ml
  return true
}

// 去重：同 file + sectionId + mode 视为同一引用
export function addRef(node, { file, sectionId = null, sectionPath = [], mode = 'content', baseHash = '', baseRev = 0, title = '', cachedContent = '' } = {}) {
  const existing = getNodeRefs(node)
  const dup = existing.find(r => r.file === file && r.sectionId === sectionId && r.mode === mode)
  if (dup) {
    // 命中既有引用时，仍把可能更新的 title/cachedContent 回填，保证内容可见（§32.4 Bug②）
    if (title && !dup.title) {
      const patched = existing.map(r => (r === dup ? { ...r, title } : r))
      setNodeRefs(node, patched)
    }
    return dup
  }
  // 生成运行时稳定 refId（与 getNodeRefs 的合成规则一致：'r' + 序号）。
  // 返回对象携带 refId，使调用方（removeRef/updateRefSnapshot）能据其定位。
  // 注意：写入时由 setNodeRefs 剥离 refId（仅运行时标识，不持久化）。
  // title/cachedContent 一并持久化：RefBlock 的 displayContent/toNote/冲突弹窗依赖它们，
  // 原 addRef 漏传导致引用后备注看不到被引用内容（§32.4 Bug②）。
  const refId = 'r' + existing.length
  const ref = { refId, file, sectionId, sectionPath, mode, baseHash, baseRev, title, cachedContent }
  setNodeRefs(node, existing.concat(ref))
  return ref
}

export function removeRef(node, refId) {
  const before = getNodeRefs(node)
  const after = before.filter(r => r.refId !== refId)
  setNodeRefs(node, after)
  return after.length < before.length
}

// 旧版备注里 "📌 引用自 xxx.md · 需求分析" 行只读解析（legacy，不写回）
export function parseLegacyRefs(note) {
  const out = []
  const re = /引用自\s+([^\s·]+)(?:\s*·\s*([^\n]+))?/g
  let m
  while ((m = re.exec(String(note || '')))) {
    out.push({
      file: m[1],
      sectionId: null,
      sectionPath: m[2] ? m[2].split('/').map(s => s.trim()) : [],
      mode: 'content',
      legacy: true
    })
  }
  return out
}

// 校准 baseHash / baseRev（供 syncRefSnapshots 用，A4）
export function updateRefSnapshot(node, refId, { baseHash, baseRev }) {
  const refs = getNodeRefs(node).map(r => (r.refId === refId ? { ...r, baseHash, baseRev } : r))
  setNodeRefs(node, refs)
  return true
}
