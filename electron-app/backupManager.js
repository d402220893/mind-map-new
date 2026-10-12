// 本地分层备份管理器（思绪思维导图 / ThoughtsMindMap）
//
// 设计依据（用户需求）：
//   一、核心原则
//     - 只备份在本地，不涉及云端
//     - 有修改才备份：内容哈希（SHA1）比对，内容相同则跳过
//     - 备份按时间窗口分层，窗口内多次修改只保留该窗口结束时的最新一份
//   二、分层策略
//     - 最近 30 分钟：每 10 分钟，该窗口内有修改才备，保留 3 份
//     - 最近 6 小时 ：每小时，    该小时内有修改才备，保留 6 份
//     - 最近 7 天   ：每天，      当天有修改才备，    保留 7 份
//     - 超过 7 天的快照按轮转清理，不无限保留
//   三、执行逻辑
//     - 保存时：计算内容哈希，与上次哈希比对；不同→标记“有修改”，相同→不做事
//     - 到时间点（每 10 分钟 / 每小时 / 每天）：窗口内有修改→生成一份快照；无修改→跳过
//     - 每份快照携带内容哈希，便于恢复识别与去重
//   四、存储
//     - 快照存于“软件数据目录之外”的另一个本地目录（默认 os.homedir()/ThoughtsMindMapBackups）
//     - 文件命名含时间戳
//     - 格式：源文件原样副本（.smm/.md 可直接打开恢复），文件名内含哈希前缀便于去重
//   五、注意事项
//     - 备份失败必须写日志/提示，禁止静默失败（写入 backup.log + 内存 lastError + console）
//     - 窗口内多次修改只留最后一份，不是每次保存都生成
//
// 依赖可注入（fs/path/crypto/os/now/log），便于在 Node 下单测。

'use strict'

const TIERS = {
  '30min': { bucketMs: 10 * 60 * 1000, max: 3, flag: 'm30' },
  '6h': { bucketMs: 60 * 60 * 1000, max: 6, flag: 'm6h' },
  'day': { bucketMs: 24 * 60 * 60 * 1000, max: 7, flag: 'mday' },
  // 即时快照：打开文件瞬间捕获“修改前”的好版本，防“打开即覆写”。
  // 不走时间窗口 tick、不受窗口去重；仅受 7 天全局清理约束，单文件最多保留 20 份。
  'instant': { bucketMs: 0, max: 20, flag: null }
}
const TIER_ORDER = ['30min', '6h', 'day'] // 仅这三层走时间窗口 tick
const ALL_TIERS = ['30min', '6h', 'day', 'instant']
const MAX_RETENTION_DAYS = 7
const BACKUPABLE_EXT = ['.smm', '.md', '.markdown']
const META_FILE = 'meta.json'
const LOG_FILE = 'backup.log'
const SNAP_NAME_RE = /^(\d{8}_\d{6})_([0-9a-f]{8})\.([^.]+)$/

function blankTiers() {
  return { '30min': [], '6h': [], 'day': [], 'instant': [] }
}

function defaultDeps() {
  const fs = require('fs')
  const path = require('path')
  const crypto = require('crypto')
  const os = require('os')
  return { fs, path, crypto, os }
}

function computeHash(crypto, content) {
  const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : content
  return crypto.createHash('sha1').update(buf).digest('hex')
}

function extOf(path, filePath) {
  const e = path.extname(filePath).toLowerCase()
  return e && e.length > 1 ? e.slice(1) : 'bin'
}

// 计算某层的时间桶起点（毫秒）
// - 30min / 6h：对齐到 epoch 的整桶（10 分钟桶落在 :00/:10/...；小时桶落在整点）
// - day：对齐到本地自然日 0 点（与“每天”语义一致，避开夏令时/时区漂移）
function bucketStart(path, os, tier, now) {
  if (tier === 'day') {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  const b = TIERS[tier].bucketMs
  return Math.floor(now / b) * b
}

function pad2(n) { return n < 10 ? '0' + n : '' + n }

function formatTs(now) {
  const d = new Date(now)
  return (
    d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '_' +
    pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds())
  )
}

function startOfLocalDay(now) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function createBackupManager(injected) {
  const deps = Object.assign(defaultDeps(), injected || {})
  const { fs, path, crypto, os } = deps
  const now = typeof deps.now === 'function' ? deps.now : () => Date.now()
  const logger = deps.log || console

  let enabled = false
  let backupRoot = ''
  let lastProcessed = { '30min': 0, '6h': 0, 'day': 0 }
  // files: key -> { filePath, lastHash, flags:{m30,m6h,mday}, tiers:{ '30min':[entry], ... } }
  let files = {}
  let lastError = null

  // ── 日志（失败绝不静默） ──────────────────────────────────────────────
  function logError(context, err) {
    const at = now()
    const msg = `[${new Date(at).toISOString()}] ERROR [${context}] ${err && err.stack ? err.stack : err}`
    lastError = { at, context, message: err && err.message ? err.message : String(err) }
    try {
      fs.appendFileSync(path.join(backupRoot, LOG_FILE), msg + '\n', 'utf8')
    } catch (e) { /* 日志本身失败也只能放弃，但 lastError 仍在内存 */ }
    try { logger.error('[backup]', context, err) } catch (e) {}
  }

  function logInfo(msg) {
    try {
      fs.appendFileSync(path.join(backupRoot, LOG_FILE), `[${new Date(now()).toISOString()}] INFO ${msg}\n`, 'utf8')
    } catch (e) {}
  }

  // ── 持久化轻量状态（lastHash/flags/lastProcessed） ────────────────────
  // 快照清单本身以磁盘目录为准（扫描重建），meta.json 只存轻量状态，二者分离更鲁棒。
  function persistMeta() {
    if (!enabled) return
    const meta = {
      version: 1,
      lastProcessed,
      files: {}
    }
    for (const key of Object.keys(files)) {
      const f = files[key]
      meta.files[key] = { filePath: f.filePath, lastHash: f.lastHash, flags: f.flags }
    }
    try {
      fs.writeFileSync(path.join(backupRoot, META_FILE), JSON.stringify(meta), 'utf8')
    } catch (e) {
      logError('persistMeta', e)
    }
  }

  function loadMeta() {
    try {
      const raw = fs.readFileSync(path.join(backupRoot, META_FILE), 'utf8')
      return JSON.parse(raw)
    } catch (e) {
      return null
    }
  }

  // 扫描磁盘，重建每个 key 的 tiers 快照清单（与 meta.json 解耦，手动删文件也能反映）
  function scanDisk() {
    const scanned = {}
    let entries = []
    try { entries = fs.readdirSync(backupRoot, { withFileTypes: true }) } catch (e) { return scanned }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue
      const key = ent.name
      const keyDir = path.join(backupRoot, key)
      let filePath = ''
      try { filePath = fs.readFileSync(path.join(keyDir, 'path.txt'), 'utf8').trim() } catch (e) {}
      const tiers = blankTiers()
      for (const tier of TIER_ORDER) {
        const tierDir = path.join(keyDir, tier)
        let fnames = []
        try { fnames = fs.readdirSync(tierDir) } catch (e) { continue }
        for (const fn of fnames) {
          const m = SNAP_NAME_RE.exec(fn)
          if (!m) continue
          const full = path.join(tierDir, fn)
          let st = null
          try { st = fs.statSync(full) } catch (e) { continue }
          tiers[tier].push({
            ts: st.mtimeMs,
            tsLabel: m[1],
            hash: m[2],
            file: [key, tier, fn].join('/'),
            size: st.size
          })
        }
        tiers[tier].sort((a, b) => a.ts - b.ts)
      }
      scanned[key] = { filePath, tiers }
    }
    return scanned
  }

  function writePathTxt(key, filePath) {
    try {
      const keyDir = path.join(backupRoot, key)
      fs.mkdirSync(keyDir, { recursive: true })
      fs.writeFileSync(path.join(keyDir, 'path.txt'), filePath, 'utf8')
    } catch (e) {
      logError('writePathTxt', e)
    }
  }

  function deleteFile(relOrAbs) {
    const p = relOrAbs.indexOf(backupRoot) === 0 ? relOrAbs : path.join(backupRoot, relOrAbs)
    try { fs.unlinkSync(p) } catch (e) { logError('deleteFile', e) }
  }

  // ── 初始化 ───────────────────────────────────────────────────────────
  function init(opts) {
    opts = opts || {}
    backupRoot = opts.backupRoot
    if (!backupRoot) {
      throw new Error('backupManager.init 需要 backupRoot')
    }
    try {
      fs.mkdirSync(backupRoot, { recursive: true })
    } catch (e) {
      logError('init:mkdir', e)
      throw e
    }
    const t = now()
    lastProcessed = {
      '30min': bucketStart(path, os, '30min', t),
      '6h': bucketStart(path, os, '6h', t),
      'day': bucketStart(path, os, 'day', t)
    }
    const scanned = scanDisk()
    const meta = loadMeta()
    const metaFiles = (meta && meta.files) || {}
    if (meta && meta.lastProcessed) {
      // 仅当更旧才覆盖（避免 init 覆盖掉上次运行后的进度）
      for (const tier of TIER_ORDER) {
        if (meta.lastProcessed[tier] && meta.lastProcessed[tier] > lastProcessed[tier]) {
          lastProcessed[tier] = meta.lastProcessed[tier]
        }
      }
    }
    files = {}
    const keys = new Set([...Object.keys(scanned), ...Object.keys(metaFiles)])
    for (const key of keys) {
      const sc = scanned[key] || { filePath: '', tiers: blankTiers() }
      const mf = metaFiles[key] || { filePath: '', lastHash: '', flags: { m30: false, m6h: false, mday: false } }
      files[key] = {
        filePath: mf.filePath || sc.filePath,
        lastHash: mf.lastHash || '',
        flags: {
          m30: !!(mf.flags && mf.flags.m30),
          m6h: !!(mf.flags && mf.flags.m6h),
          mday: !!(mf.flags && mf.flags.mday)
        },
        tiers: sc.tiers
      }
    }
    enabled = true
    persistMeta()
    logInfo('init backupRoot=' + backupRoot + ' tracked=' + Object.keys(files).length)
    return { enabled: true, backupRoot }
  }

  // ── 过滤：是否值得备份 ───────────────────────────────────────────────
  function isBackupable(filePath) {
    return BACKUPABLE_EXT.includes(path.extname(filePath).toLowerCase())
  }

  function isInsideBackupRoot(filePath) {
    const a = path.resolve(filePath)
    const b = path.resolve(backupRoot)
    return a === b || a.startsWith(b + path.sep)
  }

  // ── 保存时通知：算哈希、比对、标记修改 ───────────────────────────────
  function notifyWrite(filePath, content) {
    if (!enabled) return { changed: false, skipped: true, reason: 'disabled' }
    if (!filePath) return { changed: false, skipped: true, reason: 'no-path' }
    if (isInsideBackupRoot(filePath)) return { changed: false, skipped: true, reason: 'self' }
    if (!isBackupable(filePath)) return { changed: false, skipped: true, reason: 'ext' }

    const abs = path.resolve(filePath)
    const key = computeHash(crypto, abs)
    const hash = computeHash(crypto, content)

    let f = files[key]
    if (!f) {
      // 首次跟踪该文件：记录哈希但不置“修改”标志（无上一版可比对，避免无谓快照）
      f = { filePath: abs, lastHash: hash, flags: { m30: false, m6h: false, mday: false }, tiers: blankTiers() }
      files[key] = f
      writePathTxt(key, abs)
      persistMeta()
      return { changed: false, firstSeen: true, hash }
    }
    if (f.lastHash === hash) {
      // 内容未变 → 跳过（满足“内容相同则跳过”）
      return { changed: false, hash }
    }
    // 内容变了 → 标记当前各窗口“有修改”，并更新上次哈希
    f.lastHash = hash
    f.filePath = abs
    f.flags.m30 = true
    f.flags.m6h = true
    f.flags.mday = true
    writePathTxt(key, abs)
    persistMeta()
    return { changed: true, hash }
  }

  // ── 打开即快照：捕获“修改前”的好版本（防打开即覆写） ──────────────────
  // 不走时间窗口，直接落入 instant 层；可传入已读取的内容，确保抓到覆写前版本。
  function snapshotNow(filePath, content) {
    if (!enabled) return { skipped: true, reason: 'disabled' }
    if (!filePath) return { skipped: true, reason: 'no-path' }
    if (isInsideBackupRoot(filePath)) return { skipped: true, reason: 'self' }
    if (!isBackupable(filePath)) return { skipped: true, reason: 'ext' }
    const abs = path.resolve(filePath)
    const key = computeHash(crypto, abs)
    let f = files[key]
    if (!f) {
      f = { filePath: abs, lastHash: '', flags: { m30: false, m6h: false, mday: false }, tiers: blankTiers() }
      files[key] = f
      writePathTxt(key, abs)
    }
    try {
      snapshot(key, 'instant', now(), content)
    } catch (e) {
      logError('snapshotNow', e)
      return { ok: false, error: String(e) }
    }
    persistMeta()
    return { ok: true }
  }

  // ── 生成一份快照（写入磁盘） ─────────────────────────────────────────
  function snapshot(key, tier, ts, contentOverride) {
    const f = files[key]
    if (!f || !f.filePath) return
    let content
    if (contentOverride != null) {
      // 即时快照：直接用调用方提供的“修改前”内容，避免二次读盘、且保证抓到好版本
      content = typeof contentOverride === 'string' ? contentOverride : contentOverride.toString('utf8')
    } else {
      if (!fs.existsSync(f.filePath)) {
        logError('snapshot', new Error('源文件不存在，跳过快照: ' + f.filePath))
        return
      }
      try {
        content = fs.readFileSync(f.filePath, 'utf8')
      } catch (e) {
        logError('snapshot:read', e)
        return
      }
    }
    const hash = computeHash(crypto, content)
    const list = f.tiers[tier]
    // 去重：与该层最近一份哈希相同则跳过写盘（窗口内多次修改只留最后一份的等价保护）
    if (list.length && list[list.length - 1].hash === hash) {
      return
    }
    const ext = extOf(path, f.filePath)
    const tsLabel = formatTs(ts)
    const fname = `${tsLabel}_${hash.slice(0, 8)}.${ext}`
    const tierDir = path.join(backupRoot, key, tier)
    try {
      fs.mkdirSync(tierDir, { recursive: true })
      fs.writeFileSync(path.join(tierDir, fname), content, 'utf8')
    } catch (e) {
      logError('snapshot:write', e)
      return
    }
    const entry = {
      ts,
      tsLabel,
      hash,
      file: [key, tier, fname].join('/'),
      size: Buffer.byteLength(content)
    }
    list.push(entry)
    list.sort((a, b) => a.ts - b.ts)
    // 轮转：超过该层上限则删除最旧
    while (list.length > TIERS[tier].max) {
      const old = list.shift()
      deleteFile(old.file)
    }
    logInfo(`snapshot ${tier} key=${key} hash=${hash.slice(0, 8)} file=${entry.file}`)
  }

  // ── 全局轮转：超过保留天数（7 天）的快照一律清理 ─────────────────────
  function pruneGlobal(ts) {
    const cutoff = ts - MAX_RETENTION_DAYS * 24 * 60 * 60 * 1000
    for (const key of Object.keys(files)) {
      const f = files[key]
      for (const tier of ALL_TIERS) {
        const list = f.tiers[tier]
        if (!list.length) continue
        const keep = []
        for (const e of list) {
          if (e.ts < cutoff) deleteFile(e.file)
          else keep.push(e)
        }
        f.tiers[tier] = keep
      }
    }
  }

  // ── 时间 tick：到点才生成快照 ────────────────────────────────────────
  function tick(ts) {
    if (!enabled) return { processed: 0 }
    const t = ts != null ? ts : now()
    let processed = 0
    for (const tier of TIER_ORDER) {
      const bs = bucketStart(path, os, tier, t)
      if (bs > lastProcessed[tier]) {
        lastProcessed[tier] = bs
        for (const key of Object.keys(files)) {
          const f = files[key]
          if (f.flags[TIERS[tier].flag]) {
            try {
              snapshot(key, tier, t)
            } catch (e) {
              logError('tick:snapshot:' + tier, e)
            }
            f.flags[TIERS[tier].flag] = false
            processed++
          }
        }
      }
    }
    pruneGlobal(t)
    persistMeta()
    return { processed }
  }

  // ── 退出前强制落盘：把所有待修改文件的当前内容快照一遍，避免丢失 ──────
  function flushPending(ts) {
    if (!enabled) return { flushed: 0 }
    const t = ts != null ? ts : now()
    let flushed = 0
    for (const key of Object.keys(files)) {
      const f = files[key]
      for (const tier of TIER_ORDER) {
        if (f.flags[TIERS[tier].flag]) {
          try { snapshot(key, tier, t) } catch (e) { logError('flush:snapshot:' + tier, e) }
          f.flags[TIERS[tier].flag] = false
          flushed++
        }
      }
    }
    persistMeta()
    return { flushed }
  }

  // ── 查询 ─────────────────────────────────────────────────────────────
  function getStatus() {
    const counts = {}
    for (const tier of ALL_TIERS) counts[tier] = 0
    for (const key of Object.keys(files)) {
      for (const tier of ALL_TIERS) counts[tier] += files[key].tiers[tier].length
    }
    return {
      enabled,
      backupRoot,
      lastError,
      tracked: Object.keys(files).length,
      counts
    }
  }

  function listBackups(filePath) {
    if (!enabled || !filePath) return []
    const key = computeHash(crypto, path.resolve(filePath))
    const f = files[key]
    if (!f) return []
    const out = []
    for (const tier of ALL_TIERS) {
      for (const e of f.tiers[tier]) {
        out.push({ tier, ts: e.ts, tsLabel: e.tsLabel, hash: e.hash, size: e.size, file: e.file })
      }
    }
    out.sort((a, b) => b.ts - a.ts)
    return out
  }

  // 恢复：默认非破坏式——复制到 <原名>.restored_<时间戳>.<ext>，不覆盖原文件
  function restoreSnapshot(filePath, snapshotRel, destPath) {
    if (!enabled || !snapshotRel) return { ok: false, error: 'missing' }
    const src = path.join(backupRoot, snapshotRel)
    let content
    try { content = fs.readFileSync(src, 'utf8') } catch (e) {
      return { ok: false, error: e.message }
    }
    const ext = extOf(path, filePath)
    const dest = destPath || (path.resolve(filePath) + '.restored_' + formatTs(now()) + '.' + ext)
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, content, 'utf8')
    } catch (e) {
      return { ok: false, error: e.message }
    }
    return { ok: true, restoredPath: dest }
  }

  function setBackupRoot(root) {
    backupRoot = root
  }

  return {
    init,
    notifyWrite,
    snapshotNow,
    tick,
    flushPending,
    getStatus,
    listBackups,
    restoreSnapshot,
    setBackupRoot,
    // 暴露内部状态便于测试
    _state: () => ({ enabled, backupRoot, lastProcessed, files, lastError }),
    _persistMeta: persistMeta
  }
}

module.exports = { createBackupManager, TIERS, MAX_RETENTION_DAYS, BACKUPABLE_EXT }
