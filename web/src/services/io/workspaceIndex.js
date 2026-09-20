// L3 IO 层：sections.json / refs.json / meta.json 的唯一读写者。
// 含缓存/失效/重建；进度经 onProgress 回调上抛，自身不 emit（§6.3.1-3）。
// 依赖：../errors（L1）、../events（L0，允许）、../sectionParser（L1）、../smmCodec（L1）、../refData（L1）、../hash（L1）。
// fsApi 经 ctx 注入；不得 import revisionService（破 v1.0 双向环）。
import { ok, fail, err } from '../errors.js'
import { parseSections } from '../sectionParser.js'
import { decodeSmm } from '../smmCodec.js'
import { getNodeRefs } from '../refData.js'
import { sha1hex, normalizeForHash } from '../hash.js'

const CURRENT_INDEX_SCHEMA = 1
const INDEX_DIR = '.mindlink'
const SCAN_BATCH = 50

function joinPath(root, name) {
  return (root ? root.replace(/\\/g, '/') + '/' : '') + INDEX_DIR + '/' + name
}

function indexDirOf(root) {
  return (root ? String(root).replace(/\\/g, '/').replace(/\/+$/, '') + '/' : '') + INDEX_DIR
}

function collectFiles(nodes, prefix = '') {
  const out = []
  for (const n of (nodes || [])) {
    const name = n.name != null ? n.name : n.path
    const p = (prefix ? prefix + '/' : '') + name
    if (n.isDir) out.push(...collectFiles(n.children || [], p))
    else out.push(p)
  }
  return out
}

function collectNodes(root) {
  const out = []
  function walk(n) {
    if (!n || typeof n !== 'object') return
    out.push(n)
    if (Array.isArray(n.children)) n.children.forEach(walk)
  }
  walk(root)
  return out
}

export const createWorkspaceIndex = (ctx = {}) => {
  const { fsApi } = ctx
  const cache = new Map() // name@root -> parsed json
  const rebuildFlight = new Map() // root -> Promise（single-flight）
  let writeLock = Promise.resolve() // 互斥门：rebuild 持锁期间写操作排队

  function cacheKey(name, root) { return name + '@' + (root || '') }

  // 首次写索引前确保 .mindlink/ 目录存在（记忆化，每个 root 只 mkdirp 一次）。
  // ⚠️ 设计 §7.3 写的是「workspaceIndex.init 内部 mkdirp + 原子写」，实现曾漏掉 mkdirp：
  //    全新目录下 .mindlink/ 并不存在 → fs.writeFileSync('…/.mindlink/meta.json') 直接 ENOENT
  //    → init 失败 → open() 落 readonly-index（UI 显示「未建立索引，点此重建」），
  //    而且「点此重建」走的 rebuild 同样写不进去 → 永久失败、无法自愈。
  //    放在 write() 这个唯一写入口做，可一次性覆盖 init / rebuild / updateSection / updateRefEntries。
  const dirReady = new Set()
  async function ensureIndexDir(root) {
    const key = root || ''
    if (dirReady.has(key)) return ok({ absPath: indexDirOf(root) })
    // 老宿主 / 单测 fake 无 mkdirp 通道 → 跳过（让紧随其后的 write 如实报错，不在此静默吞掉）
    if (!fsApi || typeof fsApi.mkdirp !== 'function') return ok({ absPath: indexDirOf(root) })
    const r = await fsApi.mkdirp(indexDirOf(root))
    if (r && r.ok !== false) dirReady.add(key)
    return ok({ absPath: indexDirOf(root) })
  }

  async function read(name, { root = '' } = {}) {
    const absPath = joinPath(root, name)
    const r = await fsApi.readText(absPath)
    if (!r.ok) return r
    try {
      const data = JSON.parse(r.data.content)
      cache.set(cacheKey(name, root), data)
      return ok(data)
    } catch (e) {
      return fail(err('E_INDEX_PARSE', { name, message: e.message }))
    }
  }

  // 原子写：先写 tmp，再写 final（final 仅在 tmp 成功后覆盖；final 失败则保留旧值）
  async function write(name, data, { root = '' } = {}) {
    const absPath = joinPath(root, name)
    const content = JSON.stringify(data, null, 2)
    await ensureIndexDir(root) // 见上方说明：全新工作区必须先建 .mindlink/，否则整条索引写入链 ENOENT
    const tmp = absPath + '.tmp-' + Math.random().toString(36).slice(2, 8)
    const w1 = await fsApi.writeText(tmp, content)
    if (!w1.ok) { dirReady.delete(root || ''); return w1 }
    const w2 = await fsApi.writeText(absPath, content)
    if (!w2.ok) { dirReady.delete(root || ''); return w2 }
    cache.set(cacheKey(name, root), data)
    return ok({ absPath })
  }

  function invalidate(name, root) {
    if (name) cache.delete(cacheKey(name, root))
    else cache.clear()
  }

  // 首次建索引：创建 .mindlink/ 三件套（mkdir 由 IPC 负责；此处仅写文件）
  async function init(root, meta = {}) {
    const m = { v: CURRENT_INDEX_SCHEMA, createdAt: Date.now(), ...meta }
    const w1 = await write('meta.json', m, { root })
    if (!w1.ok) return w1
    const w2 = await write('sections.json', { v: CURRENT_INDEX_SCHEMA, files: {} }, { root })
    if (!w2.ok) return w2
    const w3 = await write('refs.json', { v: CURRENT_INDEX_SCHEMA, refs: [] }, { root })
    if (!w3.ok) return w3
    return ok({ root, schema: CURRENT_INDEX_SCHEMA })
  }

  // 单章节写回（只经此处；revisionService 步骤⑥调用）
  async function updateSection(file, patch, { root = '' } = {}) {
    await writeLock
    const r = await read('sections.json', { root })
    const idx = r.ok ? r.data : { v: CURRENT_INDEX_SCHEMA, files: {} }
    if (!idx.files) idx.files = {}
    if (!idx.files[file]) idx.files[file] = { sections: {} }
    const id = patch.id
    if (!id) return fail(err('E_INDEX_NO_ID', { file }))
    idx.files[file].sections[id] = { ...(idx.files[file].sections[id] || {}), ...patch }
    const w = await write('sections.json', idx, { root })
    return w.ok ? ok({ file, id }) : w
  }

  // 批量标记 refs.json 条目（惰性同步：snapshotPending/pendingRev/pendingHash）
  // targets: [{file, sectionId, nodeId}]；patch: 要合并的字段
  async function updateRefEntries(targets, patch, { root = '' } = {}) {
    await writeLock
    const r = await read('refs.json', { root })
    const idx = r.ok ? r.data : { v: CURRENT_INDEX_SCHEMA, refs: [] }
    if (!idx.refs) idx.refs = []
    const matched = new Set(targets.map(t => (t.file || '') + '#' + (t.sectionId || '') + '#' + (t.nodeId || '')))
    idx.refs = idx.refs.map(e => {
      const k = (e.file || '') + '#' + (e.sectionId || '') + '#' + (e.nodeId || '')
      return matched.has(k) ? { ...e, ...patch } : e
    })
    const w = await write('refs.json', idx, { root })
    return w.ok ? ok({ updated: targets.length }) : w
  }

  // 重建索引（§6.3.1）：single-flight + 写锁 + 原子写 + onProgress 不 emit + 可中断 + 幂等
  async function rebuild(opts = {}) {
    const { root = '', full = false, signal, onProgress } = opts
    if (rebuildFlight.has(root)) return rebuildFlight.get(root) // 单飞：并发只跑一次
    const run = (async () => {
      const prevLock = writeLock
      let release
      writeLock = new Promise(res => { release = res })
      try {
        await prevLock // 等之前的写完成
        const t0 = Date.now()
        const treeR = await fsApi.readTree(root, {
          ignore: ['node_modules', '.git', '.mindlink', '_trash', 'dist-electron', 'dist-electron2']
        })
        if (!treeR.ok) return fail(treeR.error)
        const files = collectFiles(treeR.data.tree || treeR.data)
        const total = files.length
        let scanned = 0
        const newSections = { v: CURRENT_INDEX_SCHEMA, files: {} }
        const newRefs = { v: CURRENT_INDEX_SCHEMA, refs: [] }
        for (const f of files) {
          if (signal && signal.aborted) {
            return ok({ mode: full ? 'full' : 'incremental', aborted: true, scanned, files: total })
          }
          if (scanned % SCAN_BATCH === 0 && onProgress) onProgress({ phase: 'scan', scanned, total })
          const abs = root + '/' + f
          if (f.endsWith('.md')) {
            const r = await fsApi.readText(abs)
            if (r.ok) {
              const secs = parseSections(r.data.content, { file: f })
              const fileHash = 'sha1:' + sha1hex(normalizeForHash(r.data.content)).slice(0, 12)
              const map = {}
              for (const s of secs) map[s.id] = s
              newSections.files[f] = { fileHash, sections: map }
            }
          } else if (f.endsWith('.smm')) {
            const r = await fsApi.readText(abs)
            if (r.ok) {
              try {
                const { sheets } = decodeSmm(r.data.content)
                for (const sh of sheets) {
                  for (const nd of collectNodes(sh.data)) {
                    for (const ref of getNodeRefs(nd)) {
                      newRefs.refs.push({
                        file: ref.file, sectionId: ref.sectionId, nodeId: nd.id || ref.nodeId,
                        mode: ref.mode, source: f, baseHash: ref.baseHash, baseRev: ref.baseRev
                      })
                    }
                  }
                }
              } catch { /* 坏 smm 跳过 */ }
            }
          }
          scanned++
        }
        if (onProgress) onProgress({ phase: 'write', scanned, total })
        const w1 = await write('sections.json', newSections, { root })
        const w2 = await write('refs.json', newRefs, { root })
        const w3 = await write('meta.json', { v: CURRENT_INDEX_SCHEMA, rebuiltAt: Date.now() }, { root })
        if (!w1.ok || !w2.ok || !w3.ok) return fail(err('E_INDEX_WRITE', { root }))
        return ok({
          mode: full ? 'full' : 'incremental', scanned, files: total,
          refs: newRefs.refs.length, ms: Date.now() - t0
        })
      } finally {
        release()
      }
    })()
    rebuildFlight.set(root, run)
    try { return await run } finally { rebuildFlight.delete(root) }
  }

  // 坏索引备份为 *.bad-<ts>（不删），供 open() 调用
  async function backupBad(name, { root = '' } = {}) {
    const absPath = joinPath(root, name)
    const r = await fsApi.readText(absPath)
    if (!r.ok) return r
    const bad = absPath + '.bad-' + Date.now()
    const w = await fsApi.writeText(bad, r.data.content)
    return w.ok ? ok({ backup: bad }) : w
  }

  return {
    read, write, invalidate, init, rebuild,
    updateSection, updateRefEntries, backupBad,
    _cache: cache, _schema: CURRENT_INDEX_SCHEMA
  }
}
