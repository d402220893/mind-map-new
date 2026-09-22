// L4 编排：open/close/refresh/abs/rel/inferRootFor + 迁移调用 + 索引薄委托 + fs 语义订阅。
// ⚠️ A1 硬规约：工厂内部一律闭包，禁止 this（check-arch 断言⑤）。
// ⚠️ 索引读写只经 io/workspaceIndex.js（§6.3.1）——本文件不出现任何索引文件名的拼接写盘。
import { ok, fail, err } from './errors.js'
import { EVT } from './events.js'
import { runMigrations } from './migrations/index.js'
import { createWorkspaceStore } from './state/workspaceStore.js'

export const IGNORE_DIRS = ['node_modules', '.git', '.mindlink', '_trash', 'dist-electron', 'dist-electron2']

// ── 工作区树过滤（纯）───────────────────────────────────────────────
// 导航树只列"文档"：`.md` / `.markdown` / `.smm`。图片（png/gif/jpg/…）等工作区资产
// 不进树 —— 它们是 md 内嵌物，不是可导航文档；全量列出会让面板被无关文件淹没
// （2026-09-20 用户反馈「无关文件显示出来了」，截图为 img/ 下一堆 png/gif）。
// 依据：导图+md.md §6.1「递归扫描根目录，按扩展名过滤，生成 FileNode[]」。
// 规则：文件按扩展名白名单保留；目录仅当**存在可见后代**时保留（避免只剩图片的 img/ 变空壳）。
const DOC_EXT_RE = /\.(md|markdown|smm)$/i

/** 是否为工作区文档（纯） */
export function isWorkspaceDoc(name) {
  return DOC_EXT_RE.test(String(name == null ? '' : name))
}

/** 过滤工作区树到"文档 + 含文档的目录"，返回新树（纯，不修改入参） */
export function filterWorkspaceTree(nodes) {
  const out = []
  for (const n of Array.isArray(nodes) ? nodes : []) {
    if (!n || typeof n !== 'object') continue
    if (n.isDir) {
      const children = filterWorkspaceTree(n.children)
      if (children.length) out.push({ ...n, children })
    } else if (isWorkspaceDoc(n.name)) {
      out.push(n)
    }
  }
  return out
}

export const createWorkspaceService = (ctx = {}) => {
  const { io = {}, stores = {}, events, log } = ctx
  const { fsApi, workspaceIndex } = io
  const workspace = stores.workspace || createWorkspaceStore()

  const rootOfState = () => (workspace.get() || {}).root || ''
  const emit = (ev, payload) => { if (events && events.emit) events.emit(ev, payload) }

  // 私有：索引视图的进度回调 → 转发为 L4 的 emit（L3 自身不 emit，§6.3.1-3）
  const progressRelay = (p) => emit(EVT.INDEX_REBUILDING, p)

  // 私有：首次建索引需用户确认。无 confirm 钩子时默认允许（单测可注入决定行为）
  async function confirmCreateIndex(dirPath) {
    const confirm = ctx.confirm
    if (typeof confirm !== 'function') return true
    const r = await confirm({ kind: 'createIndex', dirPath })
    return r === true
  }
  /** 运行时补挂确认钩子（默认单例创建时 UI 尚未就绪） */
  function setConfirm(fn) { ctx.confirm = fn }

  function abs(p) {
    const s = String(p || '')
    if (/^[A-Za-z]:[\\/]/.test(s) || s.startsWith('/')) return s
    const root = rootOfState()
    return root ? root.replace(/\\/g, '/').replace(/\/+$/, '') + '/' + s : s
  }

  function rel(p) {
    const root = rootOfState()
    if (!root) return null
    const r = root.replace(/\\/g, '/').replace(/\/+$/, '')
    const s = String(p || '').replace(/\\/g, '/')
    return s.startsWith(r + '/') ? s.slice(r.length + 1) : null
  }

  function getRoot() { return rootOfState() }

  // 打开工作区：迁移 → 扫描 → 建/读 .mindlink → 建索引 → 启动监听。失败可回滚（§7.3）
  async function open(dirPath, { createIndexIfMissing = true } = {}) {
    const t0 = Date.now()
    const st = await fsApi.stat(dirPath)
    if (!st.ok) return fail(st.error)
    if (!st.data || !st.data.isDir) return fail(err('E_NOT_DIR', { path: dirPath }))

    const treeR = await fsApi.readTree(dirPath, { ignore: IGNORE_DIRS })
    if (!treeR.ok) return fail(treeR.error)
    const tree = filterWorkspaceTree(treeR.data.tree || treeR.data || [])

    let indexStatus = 'ok'
    const meta = await workspaceIndex.read('meta.json', { root: dirPath })

    // ① 索引已存在 → 先迁移（§17.2：建索引之前；已读到的 meta 直接传入，避免二次 IO）
    if (meta.ok) {
      const mig = await runMigrations({ ...ctx, root: dirPath }, { dryRun: false, meta: meta.data })
      if (!mig.ok) {
        if (log && log.warn) log.warn('migrate.failed', { dirPath, error: mig.error })
        // 【v1.3-D3】对齐 §6.3.1：迁移失败先尝试整索引重建，仍失败才降级只读
        const rb = await workspaceIndex.rebuild({ full: true, root: dirPath, onProgress: progressRelay })
        indexStatus = rb.ok ? 'rebuilt' : 'readonly-index'
      }
    }

    // ② 再决定"新建索引"或"只读降级"（不阻断打开，§10-27）
    if (!meta.ok) {
      if (createIndexIfMissing && await confirmCreateIndex(dirPath)) {
        const init = await workspaceIndex.init(dirPath, { createdAt: Date.now() })
        indexStatus = init.ok ? 'created' : 'readonly-index'
      } else {
        indexStatus = 'readonly-index'
      }
    }

    workspace.setRoot(dirPath)
    workspace.setTree(tree)
    await fsApi.watch(dirPath)
    emit(EVT.WS_OPENED, { root: dirPath, tree, indexStatus })
    if (log && log.info) log.info('workspace.open', { dirPath, indexStatus, durMs: Date.now() - t0 })
    return ok({ root: dirPath, tree, indexStatus })
  }

  async function close() {
    const root = rootOfState()
    if (fsApi && typeof fsApi.unwatch === 'function') await fsApi.unwatch(root)
    workspace.reset()
    emit(EVT.WS_CLOSED, { root })
    return ok({ root })
  }

  async function refresh() {
    const root = rootOfState()
    if (!root) return fail(err('E_WS_NOT_OPEN', {}))
    const treeR = await fsApi.readTree(root, { ignore: IGNORE_DIRS })
    if (!treeR.ok) return fail(treeR.error)
    const tree = filterWorkspaceTree(treeR.data.tree || treeR.data || [])
    workspace.setTree(tree)
    emit(EVT.WS_TREE_CHANGED, { root, tree })
    return ok({ root, tree })
  }

  // 单文件模式下推断根：向上找 .mindlink/，找不到用文件所在目录（§7.3 空态与降级）
  async function inferRootFor(filePath) {
    const p = String(filePath || '').replace(/\\/g, '/')
    const startDir = p.replace(/\/[^/]*$/, '')
    let dir = startDir
    for (let i = 0; i < 8; i++) {
      if (!dir) break
      const e = await fsApi.exists(dir + '/.mindlink/meta.json')
      if (e.ok && e.data && e.data.exists) return dir
      const parent = dir.replace(/\/[^/]*$/, '')
      if (!parent || parent === dir) break
      dir = parent
    }
    return startDir // 单文件模式兜底：文件所在目录
  }

  const FS_EVENT = { add: EVT.FS_ADD, change: EVT.FS_CHANGE, unlink: EVT.FS_UNLINK }
  function subscribe(kind, cb) { return events && events.on ? events.on(FS_EVENT[kind] || EVT.FILE_CHANGED, cb) : () => {} }
  function onFsAdd(cb) { return subscribe('add', cb) }
  function onFsChange(cb) { return subscribe('change', cb) }
  function onFsUnlink(cb) { return subscribe('unlink', cb) }

  // ── 视图需要的薄 IO 委托（视图不得直连 io/fsApi，一律经本层）──
  /** 弹出"选择文件夹"对话框，返回绝对路径；环境不支持时返回 E_NOT_SUPPORTED */
  async function pickDirectory() {
    if (!fsApi || typeof fsApi.pickDirectory !== 'function') {
      return fail(err('E_NOT_SUPPORTED', { method: 'pickDirectory' }))
    }
    const r = await fsApi.pickDirectory()
    if (!r.ok) return r
    // ⚠️ fsApi.pickDirectory 返回的是 ok({ dirPath })，不是字符串！
    //    这里必须显式取 dirPath —— 曾经漏了它（只认 absPath/path/裸字符串），
    //    于是即使原生对话框已让用户选好目录，也一律被当成"不支持"返回 E_NOT_SUPPORTED，
    //    而 UI 对 E_NOT_SUPPORTED 是**静默忽略**的 → 用户看到"选完文件夹却什么都没打开"。
    const p = r.data && (r.data.absPath || r.data.dirPath || r.data.path || r.data)
    return typeof p === 'string' ? ok({ absPath: p }) : fail(err('E_NOT_SUPPORTED', { method: 'pickDirectory' }))
  }
  async function readText(abs) { return fsApi.readText(abs) }
  async function writeText(abs, text, opts = {}) { return fsApi.writeText(abs, text, opts) }
  /** 写二进制（base64 字符串或 Uint8Array），用于 md 粘贴图片落盘 */
  async function writeBinary(abs, data, opts = {}) {
    if (!fsApi || typeof fsApi.writeBinary !== 'function') {
      return fail(err('E_NOT_SUPPORTED', { method: 'writeBinary' }))
    }
    return fsApi.writeBinary(abs, data, opts)
  }
  async function reveal(abs) {
    if (fsApi && typeof fsApi.revealInFolder === 'function') return fsApi.revealInFolder(abs)
    return fail(err('E_NOT_SUPPORTED', { method: 'revealInFolder' }))
  }
  /** 文件/目录元信息（右键菜单「属性」用） */
  async function stat(abs) { return fsApi.stat(abs) }
  /** 递归创建目录（右键菜单「新建文件夹」用） */
  async function mkdirp(dir) {
    if (!fsApi || typeof fsApi.mkdirp !== 'function') {
      return fail(err('E_NOT_SUPPORTED', { method: 'mkdirp' }))
    }
    return fsApi.mkdirp(dir)
  }
  /** 移动/重命名（右键菜单「重命名」用） */
  async function move(from, to) {
    if (!fsApi || typeof fsApi.move !== 'function') {
      return fail(err('E_NOT_SUPPORTED', { method: 'move' }))
    }
    return fsApi.move(from, to)
  }
  /** 移入系统回收站（右键菜单「删除文件」用；可恢复，不直接物理删除） */
  async function trash(paths) {
    if (!fsApi || typeof fsApi.trash !== 'function') {
      return fail(err('E_NOT_SUPPORTED', { method: 'trash' }))
    }
    return fsApi.trash(paths)
  }
  /** 当前工作区文件列表（来自 L2 workspaceStore，非重复扫盘） */
  function files() {
    const st = workspace.get() || {}
    return Array.isArray(st.tree) ? st.tree : []
  }

  // 索引视图（薄委托，不含实现）
  function readIndex(name, opts = {}) { return workspaceIndex.read(name, { root: rootOfState(), ...opts }) }
  function writeIndex(name, data, opts = {}) { return workspaceIndex.write(name, data, { root: rootOfState(), ...opts }) }
  function rebuildIndex(opts = {}) { return workspaceIndex.rebuild({ ...opts, root: rootOfState(), onProgress: progressRelay }) }

  return {
    open, close, refresh, getRoot, abs, rel, inferRootFor,
    onFsAdd, onFsChange, onFsUnlink,
    readIndex, writeIndex, rebuildIndex,
    pickDirectory, readText, writeText, writeBinary, reveal, stat, mkdirp, move, trash, files, setConfirm
  }
}
