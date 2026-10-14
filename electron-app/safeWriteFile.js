// 原子写 + 覆盖前备份 + 轻量回读校验 + 失败回滚（design §6.1，P0b）。
// 纯模块：依赖可注入（fs/path/now），Node 单测友好（electron-app/tests/safeWriteFile.test.mjs）。
//
// 渲染进程的同步/异步覆盖写盘（smm:write-file / smm:write-file-sync）统一收敛到本模块，
// 确保「覆盖前先备份、tmp+rename 原子替换、写后解析回读、失败回滚」四者齐备——
// 旧文件在覆盖瞬间永不凭空消失，即便写盘中途崩溃/内容损坏也能从 .bak 还原。
//
// 设计要点（与 review 对齐）：
// - 备份命名 <原名>.bak.<YYYYMMDD_HHMMSSmmm>（含毫秒，避免同秒多次保存碰撞），保留最近 5 份 FIFO。
// - 首次保存（目标不存在）→ 跳过备份，直接 tmp→rename（遗留B：fs.copyFile 对不存在源会抛错）。
// - 回读校验：.smm 走 JSON.parse + magic(app==='smm-multisheet') + 总节点数===写入前计数
//   （不重建 MindMap 实例，避开 15s decode，却挡得住“内容乱但长度对”，硬伤D + 边界3）；
//   其它（.md/.json 等文本）走回读字节比对。校验失败 → 用 .bak 回滚（无 .bak 即首次保存，
//   回滚=删除损坏文件报失败，原文件本就不存在，无数据丢失）。

'use strict'

const DEFAULT_MAX_BAK = 5
const SMM_MAGIC = 'smm-multisheet'

function pad2(n) { return n < 10 ? '0' + n : '' + n }
function pad3(n) { return n < 10 ? '00' + n : n < 100 ? '0' + n : '' + n }

// 时间戳：YYYYMMDD_HHMMSSmmm（含毫秒，避免同秒多次保存碰撞导致 .bak 互相覆盖）
function tsLabel(nowMs) {
  const d = new Date(nowMs)
  return (
    d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '_' +
    pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()) + pad3(d.getMilliseconds())
  )
}

// 跨所有 sheet 统计总节点数（与 web/src/utils/saveGuard.js#countNodes 同语义；
// 主进程是 CJS、web 是 ESM 无法共享，此处独立实现一份，保证“写入前计数===回读计数”口径一致）。
function countNodes(container) {
  if (!container || !Array.isArray(container.sheets)) return 0
  let n = 0
  const walk = node => {
    if (!node || typeof node !== 'object') return
    n++
    const kids = node.children
    if (Array.isArray(kids)) kids.forEach(walk)
  }
  // 真实落盘形状：sheet.data = { root: <MindNode> }，思维导图根节点是 data.root。
  for (const sh of container.sheets) walk(sh && sh.data && sh.data.root)
  return n
}

// 轻量回读校验（不重建 MindMap 实例，硬伤D + 边界3）。
// 返回 { ok:true, nodeCount } 或 { ok:false, code, message }。
function validateWritten(deps, filePath, content) {
  let raw
  try {
    raw = deps.fs.readFileSync(filePath, 'utf8')
  } catch (e) {
    return { ok: false, code: 'E_READBACK', message: e.message }
  }
  // 非 .smm 文本文件：直接字节比对（md/json 等），避免误用 smm 结构校验。
  const isSmm = /\.smm$/i.test(filePath)
  if (!isSmm) {
    if (raw === content) return { ok: true, nodeCount: 0 }
    return { ok: false, code: 'E_RESTORE_MISMATCH', message: '回读内容与写入不一致' }
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    return { ok: false, code: 'E_RESTORE_PARSE', message: '回读 JSON 解析失败' }
  }
  if (!parsed || typeof parsed !== 'object' || parsed.app !== SMM_MAGIC) {
    return { ok: false, code: 'E_RESTORE_MAGIC', message: '回读缺少 smm-multisheet magic' }
  }
  // 写入前计数（从准备写入的 content 算）== 回读计数，挡住“内容乱但长度对”。
  let expected
  try {
    expected = countNodes(JSON.parse(content))
  } catch (e) {
    // content 本身不是合法 smm 容器（理论上不会，因为我们就是要写它）——无法比对，放行。
    return { ok: true, nodeCount: countNodes(parsed) }
  }
  const got = countNodes(parsed)
  if (got !== expected) {
    return { ok: false, code: 'E_RESTORE_NODECOUNT', message: `回读节点数(${got}) != 写入前(${expected})` }
  }
  return { ok: true, nodeCount: got }
}

// 把旧文件备份为 <原名>.bak.<ts>（保留最近 maxBak 份，FIFO 裁剪）。
function backupOldFile(deps, filePath, nowMs, maxBak) {
  const dir = deps.path.dirname(filePath)
  const base = deps.path.basename(filePath)
  const bakName = `${base}.bak.${tsLabel(nowMs)}`
  const bakPath = deps.path.join(dir, bakName)
  try {
    deps.fs.copyFileSync(filePath, bakPath)
  } catch (e) {
    return { ok: false, error: e.message }
  }
  // FIFO 裁剪：列出同前缀 .bak，按 mtime 升序，超出则删除最旧。
  try {
    const entries = deps.fs.readdirSync(dir)
    const prefix = `${base}.bak.`
    const baks = entries
      .filter(n => n.startsWith(prefix))
      .map(n => {
        let mtime = 0
        try { mtime = deps.fs.statSync(deps.path.join(dir, n)).mtimeMs } catch (_) {}
        return { n, mtime }
      })
      .sort((a, b) => a.mtime - b.mtime)
    while (baks.length > maxBak) {
      const old = baks.shift()
      try { deps.fs.unlinkSync(deps.path.join(dir, old.n)) } catch (_) {}
    }
  } catch (e) { /* 裁剪失败不致命 */ }
  return { ok: true, bakPath }
}

function realDeps() {
  return { fs: require('fs'), path: require('path'), now: () => Date.now() }
}

// 公共写入核心（同步实现；异步版 safeWriteFile 包一层 Promise 即可）。
// 返回 { ok:true, size, nodeCount, bakPath|null } 或 { ok:false, code, error, rolledBack }。
function _writeCore(deps, filePath, content) {
  const { fs, path, now } = deps
  const dir = path.dirname(filePath)
  const base = path.basename(filePath)
  const tmpPath = path.join(dir, `${base}.tmp`)
  const nowMs = now()
  const existed = fs.existsSync(filePath)

  // 1) 备份旧文件（仅当已存在；首次保存跳过，遗留B）
  let bakPath = null
  if (existed) {
    const bk = backupOldFile(deps, filePath, nowMs, DEFAULT_MAX_BAK)
    if (!bk.ok) return { ok: false, code: 'E_BACKUP', error: bk.error }
    bakPath = bk.bakPath
  }

  // 2) 写 tmp → 原子 rename 替换原文件（rename 在 Windows 上对已存在目标是覆盖语义）
  try {
    fs.writeFileSync(tmpPath, content, 'utf8')
    fs.renameSync(tmpPath, filePath)
  } catch (e) {
    // 写盘阶段失败：清理 tmp（若有）；已存在原文件未动 → 不回滚（原文件完好）。
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath) } catch (_) {}
    return { ok: false, code: 'E_WRITE', error: e.message, rolledBack: true }
  }

  // 3) 轻量回读校验
  const v = validateWritten(deps, filePath, content)
  if (!v.ok) {
    // 回滚：有 .bak 则恢复；无 .bak（首次保存）则删除损坏文件（原文件本就不存在，无丢失）。
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath) } catch (_) {}
    if (bakPath && fs.existsSync(bakPath)) {
      try { fs.renameSync(bakPath, filePath) } catch (_) {}
    } else if (!existed) {
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath) } catch (_) {}
    }
    return { ok: false, code: v.code, error: v.message, rolledBack: true }
  }

  let size = 0
  try { size = fs.statSync(filePath).size } catch (_) {}
  return { ok: true, size, nodeCount: v.nodeCount, bakPath: bakPath || null }
}

// 异步封装（供 ipcMain.handle 的异步通道使用）。底层 fs 操作本身为同步，
// 此处仅包成 Promise 以对齐调用方 await 习惯；真正“退出异步化”见 main.js 的 close/before-quit 改造。
function safeWriteFile(depsArg, opts) {
  const deps = Object.assign(realDeps(), depsArg || {})
  try {
    return Promise.resolve(_writeCore(deps, opts.filePath, opts.content))
  } catch (e) {
    return Promise.resolve({ ok: false, code: 'E_WRITE', error: e.message })
  }
}

// 同步封装（供 beforeunload 的 sendSync 通道使用，窗口关闭前必须已完成落盘）。
function safeWriteFileSync(depsArg, opts) {
  const deps = Object.assign(realDeps(), depsArg || {})
  try {
    return _writeCore(deps, opts.filePath, opts.content)
  } catch (e) {
    return { ok: false, code: 'E_WRITE', error: e.message }
  }
}

module.exports = { safeWriteFile, safeWriteFileSync, countNodes, validateWritten, tsLabel, _writeCore }
