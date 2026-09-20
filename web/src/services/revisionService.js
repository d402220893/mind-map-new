// L4 编排：**全系统唯一提交入口** commitEdit / resolveConflict / snapshot / listHistory / restore。
// 依赖 refService / sectionService（经 ctx），不反向被 refService import（DAG，破 v1.0 双向环）。
// 回声抑制由 fsApi.writeText 内部登记（本服务不手动 register）；广播载荷不含 source（§7.7）。
import { ok, fail, err } from './errors.js'
import { parseSections, samePath } from './sectionParser.js'
import { replaceSectionInText } from './sectionWriter.js'
import { normalizeForHash, contentHashOf } from './hash.js'
import { strategies, isKnownStrategy } from './conflictStrategies.js'
import { EVT } from './events.js'

export const createRevisionService = (ctx = {}) => {
  const { io, services, events, log } = ctx
  const { fsApi, workspaceIndex } = io
  const { refService, sectionService, workspaceService } = services
  const { emit } = events

  // 串行化：同一 file+sectionId 的提交排队（防抖窗口内连发不产生并发写）
  const queue = new Map()
  function serialize(key, task) {
    const prev = queue.get(key) || Promise.resolve()
    const next = prev.then(task, task)
    queue.set(key, next.catch(() => {}))
    return next
  }

  // 冲突结果：同时给 error.code（机器判定）与 error.kind（UI 文案）。
  // ⚠️ err() 会把附加字段塞进 error.info；但视图（RefBlock/ConflictDialog）要直接读
  //    error.current / error.newContent 做 diff，所以这里必须把 extra **同时提升到顶层**，
  //    否则弹窗拿到 undefined（"打开冲突弹窗是空白"类 bug）。
  function conflictResult(kind, extra, rebound) {
    return fail({
      ...err('E_CONFLICT_' + kind, extra),
      ...(extra || {}),
      kind, recoverable: true,
      rebound: !!rebound,
      suggestedAction: kind === 'ambiguous' ? 'pickFromCandidates' : 'reload'
    })
  }

  // 覆盖前快照 → .mindlink/history/（best-effort，失败不阻断提交）
  async function snapshot(file, sectionId, content) {
    const rel = (file || '').replace(/[\\/]/g, '_')
    const path = workspaceService.abs('.mindlink/history/' + rel + '@' + sectionId + '.md')
    try { await fsApi.writeText(path, content) } catch { /* 快照失败不阻断 */ }
    return ok({})
  }

  // 重绑：只换 id / path，不动 baseHash / baseRev（§7.7.1，C1/C2）
  async function rebind(refCtx, newSection) {
    const from = refCtx.sectionId
    refCtx.sectionId = newSection.id
    refCtx.sectionPath = [...(newSection.path || [])] // 必须同步（C2 后半）
    refCtx.rebound = true
    if (log && log.info) log.info('revision.rebind', { file: refCtx.file, from, to: newSection.id })
  }

  // 写盘 + 索引 + 同步引用快照 + 广播（keep-mine/manual-merge/整文件共用；text 为完整 md）
  async function writeAndBroadcast(refCtx, text, rev) {
    const w = await fsApi.writeText(workspaceService.abs(refCtx.file), text)
    if (!w.ok) return w
    const wholeFile = refCtx.sectionId == null
    let newHash
    if (wholeFile) {
      // 整文件引用（v1.5 I4）：无章节可定位，hash/rev 直接对应整个文件
      newHash = contentHashOf(text)
    } else {
      const after = parseSections(text, { file: refCtx.file })
      const updated = after.find(s => s.id === refCtx.sectionId)
      if (!updated) return fail(err('E_WRITE_VERIFY_FAILED', { path: refCtx.file, sectionId: refCtx.sectionId }))
      const root = workspaceService.getRoot()
      await workspaceIndex.updateSection(refCtx.file, { ...updated, rev }, { root })
      newHash = updated.contentHash
    }
    // A4 + I3：校准引用方 baseHash/baseRev；sectionPath 变了也一并同步
    if (refService && refService.syncRefSnapshots) {
      await refService.syncRefSnapshots({
        file: refCtx.file, sectionId: refCtx.sectionId, rev, hash: newHash,
        sectionPath: wholeFile ? null : refCtx.sectionPath
      })
    }
    emit(EVT.SECTION_UPDATED, { file: refCtx.file, sectionId: refCtx.sectionId, rev, hash: newHash })
    return ok({ newRev: rev, newHash, rebound: !!refCtx.rebound })
  }

  // 全系统唯一提交入口（防重入后由视图层调用）→ Result<{newRev?,newHash?,noop?,conflict?,rebound?}>
  async function commitEdit(refCtx, newContent) {
    const key = refCtx.file + '#' + refCtx.sectionId
    if (refCtx.__serialized !== key) {
      return serialize(key, () => commitEdit({ ...refCtx, __serialized: key }, newContent))
    }
    return doCommitEdit(refCtx, newContent)
  }

  async function doCommitEdit(refCtx, newContent) {
    const { file, sectionId, baseHash, baseRev } = refCtx
    const t0 = Date.now()
    // ① 内容未变 → 直接成功（避免"打开就脏"、避免空 rev+1）
    if (normalizeForHash(newContent) === normalizeForHash(refCtx.lastContent || '')) {
      return ok({ noop: true })
    }
    // ② 读盘 → 解析（永远以磁盘为真相源，不用缓存文本）
    const read = await fsApi.readText(workspaceService.abs(file))
    if (!read.ok) return read
    const fullText = read.data.content

    // ②′ 整文件引用（sectionId === null，v1.5 I4）：跳过章节定位/重绑，
    //     乐观锁与 rev 都对应**整个文件**；newContent 即"完整文件新内容"。
    if (sectionId == null) {
      const fileHash = contentHashOf(fullText)
      if (baseHash && fileHash !== baseHash) {
        return conflictResult('stale', {
          current: { content: fullText, contentHash: fileHash, rev: baseRev || 0 },
          newContent
        }, !!refCtx.rebound)
      }
      await snapshot(file, 'whole', fullText)
      const newRev = (baseRev || 0) + 1
      const wb = await writeAndBroadcast({ ...refCtx, sectionId: null, sectionPath: null }, newContent, newRev)
      if (!wb.ok) return wb
      if (log && log.info) log.info('revision.commit', {
        file, sectionId: null, rev: newRev, wholeFile: true, durMs: Date.now() - t0
      })
      return ok({ newRev, newHash: contentHashOf(newContent), rebound: !!refCtx.rebound })
    }

    const prev = await workspaceIndex.read('sections.json', { root: workspaceService.getRoot() })
    const prevIndex = prev.ok && prev.data.files ? { files: prev.data.files } : null
    const sections = parseSections(fullText, { file, prevIndex })
    let current = sections.find(s => s.id === sectionId) // let：步骤③ 会重绑

    // ③ 失效校验
    if (!current) {
      const byPath = sections.filter(s => samePath(s.path, refCtx.sectionPath))
      if (!byPath.length) return conflictResult('missing', { sections }, !!refCtx.rebound)
      if (byPath.length > 1) return conflictResult('ambiguous', { candidates: byPath }, !!refCtx.rebound)
      await rebind(refCtx, byPath[0])
      current = sections.find(s => s.id === refCtx.sectionId) // A11 修复：重绑后必须重新取
      if (!current) return fail(err('E_SECTION_MISSING', { path: file, sectionId: refCtx.sectionId }))
    }

    // ④ 乐观锁：hash 为主，rev 为辅（current 必非空）
    if (current.contentHash !== baseHash) return conflictResult('stale', { current, newContent }, !!refCtx.rebound)
    if (typeof baseRev === 'number' && current.rev !== baseRev) {
      refCtx.baseRev = current.rev // 曾被改回原内容 → 仅同步 rev
    }

    // ⑤ 快照 + 写盘（纯函数产文本，verify 通过才落盘）
    await snapshot(file, sectionId, current.content)
    const { text } = replaceSectionInText(fullText, sections, current.id, newContent)
    const w = await fsApi.writeText(workspaceService.abs(file), text)
    if (!w.ok) return w

    // ⑥ 更新索引 + 同步引用快照 + 广播（载荷只表达"发生了什么"，不含 source）
    const after = parseSections(text, { file, prevIndex })
    const updated = after.find(s => s.id === current.id)
    if (!updated) return fail(err('E_WRITE_VERIFY_FAILED', { path: file, sectionId: current.id }))
    const newRev = (current.rev || 0) + 1
    const wb = await writeAndBroadcast({ ...refCtx, sectionId: current.id }, text, newRev)
    if (!wb.ok) return wb
    if (log && log.info) log.info('revision.commit', {
      file, sectionId: current.id, rev: newRev, rebound: !!refCtx.rebound, durMs: Date.now() - t0
    })
    return ok({ newRev, newHash: updated.contentHash, rebound: !!refCtx.rebound })
  }

  // 冲突四分支分发（策略表在 L1 conflictStrategies；本方法只分发 + 持久化）
  async function resolveConflict(refCtx, { choice, current, mine } = {}) {
    if (!isKnownStrategy(choice)) return fail(err('E_UNKNOWN_STRATEGY', { choice }))
    const r = strategies[choice]({
      mine: mine != null ? mine : refCtx.draft,
      current: current || refCtx.current,
      base: refCtx.baseContent
    })
    if (r.canceled) return ok({ canceled: true })
    if (r.noop) return ok({ newHash: (current && current.contentHash) || refCtx.baseHash })
    const read = await fsApi.readText(workspaceService.abs(refCtx.file))
    if (!read.ok) return read
    // 整文件引用（v1.5 I4）：无章节可替换，策略产出的 r.text 即完整文件内容
    if (refCtx.sectionId == null) return writeAndBroadcast(refCtx, r.text, r.rev)
    const sections = parseSections(read.data.content, { file: refCtx.file })
    const { text } = replaceSectionInText(read.data.content, sections, refCtx.sectionId, r.text)
    return writeAndBroadcast(refCtx, text, r.rev)
  }

  async function cancelEdit() { return ok({ canceled: true }) }
  async function listHistory() { return ok({ history: [] }) }
  async function restore() { return ok({}) }

  return { commitEdit, resolveConflict, cancelEdit, snapshot, listHistory, restore }
}
