// L4 编排：引用元数据增删改查与反链 + 快照校准（syncRefSnapshots 校准 baseHash/baseRev）。
// 永不触发章节写盘（章节写盘唯一入口是 revisionService.commitEdit）；不 import revisionService（破 v1.0 双向环）。
// 允许写 .smm 节点数据（A4），但仍不写 .md。
import { ok, fail, err } from './errors.js'
import { getNodeRefs, setNodeRefs, addRef, removeRef, updateRefSnapshot, parseLegacyRefs } from './refData.js'
import { decodeSmm, encode } from './smmCodec.js'
import { parseSections, samePath } from './sectionParser.js'
import { contentHashOf } from './hash.js'
import { EVT } from './events.js'

const IMMEDIATE_LIMIT = 10

export const createRefService = (ctx = {}) => {
  const { io, services, log } = ctx
  const { fsApi, workspaceIndex } = io
  const { sectionService, workspaceService } = services

  function getNodeRefs_(node) { return getNodeRefs(node) }
  function setNodeRefs_(node, refs) { return setNodeRefs(node, refs) }
  function addRef_(node, spec) { return addRef(node, spec) }
  function removeRef_(node, refId) { return removeRef(node, refId) }

  // 反链查询（§7.6）。sectionId 语义（v1.5 I4）：
  //   undefined → 该文件的**全部**引用（syncRefSnapshots 整文件分支用）
  //   null      → 只匹配「整文件引用」（sectionId 为 null 的 ref）
  //   'sid'     → 只匹配该章节的引用
  // 注意不能用 `sectionId == null || ...` 把「不过滤」与「整文件」混为一谈。
  async function findBacklinks({ file, sectionId }) {
    const r = await workspaceIndex.read('refs.json', { root: workspaceService.getRoot() })
    if (!r.ok) return r
    const refs = r.data.refs || []
    const back = refs.filter(x => x.file === file
      && (sectionId === undefined ? true : x.sectionId === sectionId))
    return ok({ backlinks: back })
  }

  // 反链重建：委托 workspaceIndex（§7.6.1 refs 真源是 .smm，refs.json 只是反向索引缓存）
  async function rebuildIndex(opts = {}) {
    return workspaceIndex.rebuild({ ...opts, root: workspaceService.getRoot() })
  }

  function nodeById(sheets, nodeId) {
    function walk(n) {
      if (!n || typeof n !== 'object') return null
      if (n.id === nodeId) return n
      for (const c of (n.children || [])) {
        const f = walk(c)
        if (f) return f
      }
      return null
    }
    for (const sh of sheets) { const f = walk(sh.data); if (f) return f }
    return null
  }

  // 把 baseHash/baseRev（及可选 sectionPath）写回某个 .smm 节点的引用（A4：写 .smm，不写 .md）
  async function writeNodeSnapshot(source, nodeId, { file, sectionId, baseHash, baseRev, sectionPath }) {
    const abs = workspaceService.abs(source)
    const read = await fsApi.readText(abs)
    if (!read.ok) return read
    let sheets, activeId
    try { ({ sheets, activeId } = decodeSmm(read.data.content)) } catch (e) { return fail(err('E_SMM_INVALID', { source })) }
    const node = nodeById(sheets, nodeId)
    if (!node) return fail(err('E_NODE_MISSING', { source, nodeId }))
    const refs = getNodeRefs(node)
    const i = refs.findIndex(r => r.file === file && r.sectionId === sectionId)
    if (i < 0) return fail(err('E_REF_MISSING', { source, nodeId, sectionId }))
    const newRefs = refs.map((r, k) => k === i
      ? { ...r, baseHash, baseRev, ...(sectionPath && !samePath(sectionPath, r.sectionPath) ? { sectionPath } : {}) }
      : r)
    setNodeRefs(node, newRefs)
    const w = await fsApi.writeText(abs, encode(null, { sheets, activeId }))
    return w.ok ? ok({ source, nodeId }) : w
  }

  // 校准引用快照（§7.6 / §7.6.6）。scope='section'(默认) | 'smm' | 'workspace'(隐含 force)
  // 整文件提交（sectionId == null）：文件被整体重写 → 引用该文件的**每个** ref 都要重新校准，
  // 但各自取"它真正在看的那个值"：整文件 ref 用文件整体 hash；按章节 ref 用该章节当前 hash。
  // 若一律盖成文件 hash，会把章节 ref 的 baseHash 写成它从未见过的值 → 假"已同步"。
  async function syncRefSnapshots({ file, sectionId, rev, hash, force = false, scope = 'section', sectionPath, smmFile } = {}) {
    const wholeFile = sectionId == null
    const back = await findBacklinks({ file, sectionId: wholeFile ? undefined : sectionId })
    if (!back.ok) {
      if (log && log.warn) log.warn('ref.sync.skipped', { file, sectionId, error: back.error })
      return ok({ updated: 0, deferred: 0, failed: [], scope, force }) // 反查失败不阻断提交
    }
    let entries = back.data.backlinks
    if (scope === 'smm' && smmFile) entries = entries.filter(e => e.source === smmFile)

    // 目标值解析器：返回 null 表示"这个 ref 已经没有对应内容了"（跳过，不写坏快照）
    let targetOf = () => ({ hash, rev, sectionPath })
    if (wholeFile) {
      const read = await fsApi.readText(workspaceService.abs(file))
      if (!read.ok) return read
      const text = read.data.content
      const fileHash = hash || contentHashOf(text)
      const secs = parseSections(text, { file })
      targetOf = (r) => {
        // 真·整文件引用（无 id 也无 path）→ 文件整体 hash
        if (r.sectionId == null && !(r.sectionPath || []).length) {
          return { hash: fileHash, rev, sectionPath: null }
        }
        // 按 id 找；legacy 引用（id 为 null）退化为按 path 找，避免"永远同步不到"
        const s = secs.find(x => x.id === r.sectionId) || secs.find(x => samePath(x.path, r.sectionPath))
        return s ? { hash: s.contentHash, rev: s.rev, sectionPath: s.path } : null
      }
    }
    const writeOne = async (bl) => {
      const t = targetOf(bl)
      if (!t) return false
      const r = await writeNodeSnapshot(bl.source, bl.nodeId, {
        file, sectionId: bl.sectionId, baseHash: t.hash, baseRev: t.rev, sectionPath: t.sectionPath
      })
      return r.ok
    }

    const ignoreThreshold = force || scope === 'workspace'
    let updated = 0, deferred = 0
    const failed = []
    if (entries.length <= IMMEDIATE_LIMIT || ignoreThreshold) {
      for (const bl of entries) {
        if (await writeOne(bl)) { updated++ } else { failed.push(bl.nodeId) }
      }
    } else {
      const targets = entries.slice(0, IMMEDIATE_LIMIT)
      const rest = entries.slice(IMMEDIATE_LIMIT)
      for (const bl of targets) {
        if (await writeOne(bl)) { updated++ } else { failed.push(bl.nodeId) }
      }
      // 惰性同步：其余只打标记，不碰 .smm（§7.6.6-①）
      await workspaceIndex.updateRefEntries(rest, { snapshotPending: true, pendingRev: rev, pendingHash: hash }, { root: workspaceService.getRoot() })
      deferred = rest.length
      if (log && log.info) log.info('ref.sync.deferred', { file, sectionId, immediate: targets.length, deferred })
    }
    return ok({ updated, deferred, failed, scope, force })
  }

  // 打开 .smm 时只读校准：把带 snapshotPending 标记引用的 baseHash/baseRev 覆盖为 pending 值并清除标记（C3）
  async function calibratePendingSnapshots({ abs }) {
    const rel = workspaceService.rel(abs) || abs
    const pending = await workspaceIndex.read('refs.json', { root: workspaceService.getRoot() })
    if (!pending.ok) return pending
    const markers = (pending.data.refs || []).filter(e => e.source === rel && e.snapshotPending)
    if (!markers.length) return ok({ calibrated: 0, cleared: 0 })
    const read = await fsApi.readText(abs)
    if (!read.ok) return read
    let sheets, activeId
    try { ({ sheets, activeId } = decodeSmm(read.data.content)) } catch (e) { return fail(err('E_SMM_INVALID', { abs })) }
    let calibrated = 0
    for (const m of markers) {
      const node = nodeById(sheets, m.nodeId)
      if (!node) continue
      const refs = getNodeRefs(node)
      const i = refs.findIndex(r => r.file === m.file && r.sectionId === m.sectionId)
      if (i < 0) continue
      const newRefs = refs.map((r, k) => k === i ? { ...r, baseHash: m.pendingHash, baseRev: m.pendingRev } : r)
      setNodeRefs(node, newRefs)
      calibrated++
    }
    const w = await fsApi.writeText(abs, encode(null, { sheets, activeId }))
    if (!w.ok) return w
    // 清除 refs.json 标记
    const cleared = await workspaceIndex.updateRefEntries(markers, { snapshotPending: false, pendingRev: null, pendingHash: null }, { root: workspaceService.getRoot() })
    return ok({ calibrated, cleared: cleared.ok ? markers.length : 0 })
  }

  // 失效检测（批量）：ok/stale/missing/file-missing/ambiguous
  async function checkValidity(file, refs) {
    const abs = workspaceService.abs(file)
    const existsR = await fsApi.exists(abs)
    if (!existsR.ok || !existsR.data.exists) {
      return ok({ results: (refs || []).map(r => ({ sectionId: r.sectionId, status: 'file-missing', current: null })) })
    }
    const read = await fsApi.readText(abs)
    if (!read.ok) return fail(read.error)
    const sections = parseSections(read.data.content, { file })
    const fileHash = contentHashOf(read.data.content)
    const results = (refs || []).map(r => {
      // 整文件引用（sectionId === null 且无 sectionPath，v1.5 I4）：无章节语义，比整文件 hash。
      // ⚠️ legacy 引用（parseLegacyRefs）也是 sectionId === null，但它带 sectionPath，
      //    语义是"按标题找章节" —— 不能当成整文件，否则会丢掉唯一的定位线索。
      const wholeRef = r.sectionId == null && !(r.sectionPath || []).length
      if (wholeRef) {
        const watched = r.baseHash || r.contentHash
        if (!watched || watched === fileHash) {
          return { sectionId: null, status: 'ok', current: { content: read.data.content, contentHash: fileHash } }
        }
        return { sectionId: null, status: 'stale', current: { content: read.data.content, contentHash: fileHash } }
      }
      const byId = sections.find(s => s.id === r.sectionId)
      if (byId) {
        if (byId.contentHash === (r.baseHash || r.contentHash)) return { sectionId: r.sectionId, status: 'ok', current: byId }
        return { sectionId: r.sectionId, status: 'stale', current: byId }
      }
      const byPath = sections.filter(s => samePath(s.path, r.sectionPath))
      if (!byPath.length) return { sectionId: r.sectionId, status: 'missing', current: null }
      if (byPath.length > 1) return { sectionId: r.sectionId, status: 'ambiguous', current: byPath }
      return { sectionId: r.sectionId, status: 'stale', current: byPath[0] }
    })
    return ok({ results })
  }

  const parseLegacyRefs_ = (note) => parseLegacyRefs(note)
  return {
    getNodeRefs: getNodeRefs_, setNodeRefs: setNodeRefs_, addRef: addRef_, removeRef: removeRef_,
    findBacklinks, rebuildIndex, checkValidity,
    syncRefSnapshots, calibratePendingSnapshots, parseLegacyRefs: parseLegacyRefs_,
    updateRefSnapshot
  }
}
