// 视图 ⇄ 服务层的唯一桥（view 侧门面）。
//
// 为什么要这一层：check-arch 断言⑥ 规定「视图不得直连 services/io」，且「已接入 @/services
// 的视图不得再直调 window.smmApi」。而既有 Edit.vue / Toolbar.vue 等大量使用 window.smmApi
// （属遗留债务、本轮不做整体迁移）。若新组件直接 `import from '@/services'`，守卫会因
// 同文件出现 window.smmApi 而报错；若不用服务层则新功能无法落地。
//
// 因此：新组件一律经本桥访问服务（本桥内部持有服务单例 + 既有 @/api 状态机 + 事件总线），
// 既有视图通过 $bus 事件与本桥协作，两边都不触碰对方的私有实现。
//
// ⚠️ 本文件不属于 services/ 分层（不在 check-arch 的 L0–L4 判定范围内），
//    但仍遵守：不直连 services/io，只读 services 暴露的编排方法。
import singleton from '@/services'
import { EVT } from '@/services/events.js'
import { decodeSmm, encode } from '@/services/smmCodec.js'
import bus from '@/utils/eventBus'
import {
  findByPath,
  addWorkbook,
  switchWorkbook,
  getWorkbookList,
  loadSheetsContainer,
  setCurrentFilePath,
  markDirty,
  getKind,
  getCurrentFilePath
} from '@/api'
import { lateNs, nsHas } from './lateBind.js'
import { mapFsEvents } from './fsEventMap.js'

/**
 * 延迟绑定的名字空间（实现见 `./lateBind.js`，含完整事故说明与单测）。
 *
 * ⚠️ 铁律：本模块**不得**对 singleton 做顶层解构或顶层属性读取
 * （`const { services } = singleton` / `export const mdDoc = services.mdDocument`）。
 * 模块求值那一刻取到的值会被**永久冻进闭包** —— 一旦 `@/services` 的装配顺序变化
 * （或与其形成 import 环），`getServices()` 就恒为 undefined，
 * 启动路径立刻 TypeError，而 app.mount 尚未执行 → **整页白屏**（2026-09-20 真实事故）。
 * 所有跨模块引用一律走 lateNs（"用时现取"）。
 */
const services = lateNs(() => singleton && singleton.services)
const events = lateNs(() => singleton && singleton.events)
const log = lateNs(() => singleton && singleton.log)

export function getServices() {
  return services
}
export function getEvents() {
  return events
}
export function getLog() {
  return log
}

// ── 工作区 ──────────────────────────────────────────────────────────
export async function pickAndOpenWorkspace() {
  const r = await services.workspaceService.pickDirectory()
  if (!r.ok) return r
  return openWorkspace(r.data.absPath)
}

export async function openWorkspace(dir) {
  const r = await services.workspaceService.open(dir)
  bus.$emit('workspace-opened', r.ok ? r.data : null, r.error || null)
  return r
}

export function closeWorkspace() {
  return services.workspaceService.close()
}

// ── 打开文件（供侧栏 / 链接 / 搜索结果调用）──────────────────────────
const MD_EXT = /\.(md|markdown|mmd)$/i
const SMM_EXT = /\.smm$/i
const IMPORT_EXT = /\.(km|xmind|json|emmx)$/i

export function baseName(abs) {
  return String(abs || '').replace(/\\/g, '/').split('/').pop() || ''
}

/** 打开绝对路径：按扩展名分派到 md 编辑器 / 导图 / 导入流 / 外部程序 */
export async function openPath(abs, { anchor = null } = {}) {
  if (!abs) return { ok: false, error: { code: 'E_EMPTY_PATH' } }
  if (SMM_EXT.test(abs)) return openMindMap(abs)
  if (MD_EXT.test(abs)) return services.fileRouter.open(abs, { anchor })
  if (IMPORT_EXT.test(abs)) return services.fileRouter.importAsNew(abs)
  // 未知类型：交给 fileRouter 判定（外链 → openExternal，其余报缺失）
  return services.fileRouter.navigate(abs, services.workspaceService.getRoot() || '')
}

/** md 内链接点击 / 导图节点 link 点击 */
export function navigate(href, fromPath) {
  return services.fileRouter.navigate(href, fromPath)
}

/**
 * 只解析不跳转：把 md 里的相对链接/图片 src 解析成绝对路径（§9.5 md 内嵌 .smm 用）。
 * 无副作用，绝不打开文件；解析失败返回空串。
 */
export function resolveAbsLink(fromPath, href) {
  try {
    const r = services.fileRouter.resolveLink(fromPath, href)
    return (r && r.abs) || ''
  } catch (e) {
    return ''
  }
}

async function openMindMap(abs) {
  const existed = findByPath(abs)
  if (existed) {
    activate(existed.id)
    return { ok: true, reused: true, tabId: existed.id, abs }
  }
  const read = await services.workspaceService.readText(abs)
  if (!read.ok) return read
  // ⚠️ decodeSmm 不返回 Result：成功直接返回 {sheets, activeId}；JSON 损坏抛 appError。
  // 旧代码 `if (!decoded.ok) return decoded` 因 decoded.ok 恒为 undefined 而**永远为真**，
  // 导致任何 .smm 都被提前返回、文件打不开（§32.4 Bug① 根因）。
  let decoded
  try {
    decoded = decodeSmm(read.data.content)
  } catch (e) {
    return { ok: false, error: { code: (e && e.code) || 'E_SMM_INVALID', message: e && e.message } }
  }
  const container = decoded // { sheets, activeId }，loadSheetsContainer 期望的形状
  const name = baseName(abs).replace(/\.smm$/i, '')
  const wb = addWorkbook({ name, filePath: abs, kind: 'mindmap' })
  if (!loadSheetsContainer(container)) {
    return { ok: false, error: { code: 'E_BAD_SMM', message: '工作表容器为空' } }
  }
  setCurrentFilePath(abs)
  markDirty(wb.id, false)
  activate(wb.id)
  return { ok: true, reused: false, tabId: wb.id, abs }
}

function activate(id) {
  if (!id) return
  switchWorkbook(id)
  // ⚠️ 必须无条件广播：addWorkbook 已把 activeId 切到新 Tab，switchWorkbook 会返回 false，
  //    若据此不广播，Edit.vue 不会重新载入数据（表现为"打开了文件但画布还是旧的"）。
  bus.$emit('workbook-list-changed')
  bus.$emit('workbook-switched', id)
}

/** 供 fileRouter 注入的 tabs 适配器（把服务层的 Tab 语义映射到既有 workbookState） */
export const tabsAdapter = {
  async findByPath(abs) {
    return findByPath(abs)
  },
  async switch(id) {
    activate(id)
    return { ok: true, tabId: id }
  },
  async add({ kind, name, filePath, anchor }) {
    if (kind === 'mindmap') return openMindMap(filePath)
    const wb = addWorkbook({ name, filePath, kind: 'markdown' })
    const loaded = await services.mdDocument.load(wb.id, filePath)
    if (!loaded.ok) return loaded
    setCurrentFilePath(filePath)
    markDirty(wb.id, false)
    activate(wb.id)
    if (anchor) events.emit('md:scroll-to-anchor', { anchor, abs: filePath, tabId: wb.id })
    return { ok: true, tabId: wb.id, reused: false, abs: filePath, kind }
  },
  activeId() {
    return getWorkbookList().activeId
  },
  kind(id) {
    return getKind(id || this.activeId())
  },
  currentPath() {
    return getCurrentFilePath()
  }
}

// ── 备注引用（RefBlock / SectionPicker 用）───────────────────────────
export function listSections(file) {
  return services.sectionService.listSections(file)
}
export function getRefs(node) {
  return services.refService.getNodeRefs(node)
}
// v1.6 备注互斥模式（note | ref）
export function getMode(node) {
  return services.refService.getMode(node)
}
export function setMode(node, mode) {
  return services.refService.setMode(node, mode)
}
export function addRef(node, spec) {
  return services.refService.addRef(node, spec)
}
export function removeRef(node, refId) {
  return services.refService.removeRef(node, refId)
}
export function findBacklinks(file, sectionId) {
  return services.refService.findBacklinks({ file, sectionId })
}
export function checkValidity(file, refs) {
  return services.refService.checkValidity(file, refs)
}
export function commitEdit(refCtx, content) {
  return services.revisionService.commitEdit(refCtx, content)
}
export function resolveConflict(refCtx, choice, payload) {
  return services.revisionService.resolveConflict(refCtx, choice, payload)
}
/**
 * 「🔄 刷新全部引用」（§7.14 面板级工具条）：校准**当前 .smm** 内所有引用的 baseHash/baseRev。
 * refs.json 是反向索引缓存，按 source 过滤出本文件的引用后逐个 sync（force 使惰性阈值失效）。
 */
export async function refreshAllRefs(smmFile) {
  const ws = services.workspaceService
  const smm = smmFile || tabsAdapter.currentPath()
  const idx = await ws.readIndex('refs.json')
  if (!idx.ok) return idx
  const all = (idx.data && idx.data.refs) || []
  const mine = smm ? all.filter(r => r.source === smm || r.file === smm) : all
  let updated = 0
  const failed = []
  for (const r of mine) {
    const res = await services.refService.syncRefSnapshots({
      file: r.file,
      sectionId: r.sectionId,
      scope: 'smm',
      smmFile: smm,
      force: true
    })
    if (res.ok) updated += res.data.updated || 0
    else failed.push(r.sectionId)
  }
  return { ok: true, data: { updated, failed, total: mine.length } }
}
export function refreshRef(refCtx) {
  return services.refService.syncRefSnapshots({
    file: refCtx.file,
    sectionId: refCtx.sectionId,
    scope: 'section',
    force: true
  })
}

// ── md 文档 ────────────────────────────────────────────────────────
// ⚠️ 同样是延迟绑定（见上方 lateNs 说明）：写成 `export const mdDoc = services.mdDocument`
// 会在模块求值时把当时的取值冻结下来，服务尚未就绪时就是 undefined 且永不恢复。
export const mdDoc = lateNs(() => singleton && singleton.services && singleton.services.mdDocument)

/** 新建 md 文件（SectionPicker 的「+ 新建 md 文件」） */
export async function createMdFile(abs, initialText = '') {
  const r = await services.workspaceService.writeText(abs, initialText)
  return r
}

// ── 事件桥：服务层事件总线 ⇄ 视图 $bus ──────────────────────────────
// 服务层只往自己的 events 发（不依赖 Vue），视图只听 $bus；此处做单向转发，
// 避免视图去 import services/events（也避免 $bus 与 events 两套语义混淆）。
const EVENT_MAP = [
  [EVT.DOC_DIRTY, 'doc:dirty'],
  [EVT.DOC_SAVED, 'doc:saved'],
  [EVT.FILE_SAVED, 'file-saved'],
  [EVT.INDEX_REBUILDING, 'index:rebuilding'],
  [EVT.LINK_MISSING, 'link-missing'],
  [EVT.SECTION_UPDATED, 'section:updated'],
  [EVT.REF_SNAPSHOT_SYNCED, 'ref:snapshotSynced'],
  [EVT.WS_TREE_CHANGED, 'workspace:treeChanged'],
  [EVT.MD_SCROLL_TO_ANCHOR, 'md-scroll-to-anchor']
]

export function startEventBridge() {
  for (const [from, to] of EVENT_MAP) {
    events.on(from, payload => bus.$emit(to, payload))
  }
}

/**
 * 宿主外壳（preload 暴露的 `window.smmApi`）**唯一出口**。
 *
 * 为什么必须收口：视图直接写 `window.smmApi.x` 有两类真实故障 ——
 *   ① 网页端/单测环境没有它，任何一处漏判空就直接 TypeError 崩在渲染里；
 *   ② 视图耦合 preload 的字段布局，主进程改通道名要全仓搜替换。
 * 这里统一做"存在性判定 + 缺能力时返回 Result 形状"，视图只需认 `{ok,error,canceled}`。
 */
function hostApi() {
  return (typeof window !== 'undefined' && window.smmApi) || null
}

function hostCall(name, args) {
  const a = hostApi()
  if (!a || typeof a[name] !== 'function') {
    return Promise.resolve({ ok: false, error: 'E_NO_SHELL', canceled: false })
  }
  try {
    return Promise.resolve(a[name](...(args || [])))
  } catch (e) {
    return Promise.resolve({ ok: false, error: e.message, canceled: false })
  }
}

function hostWindowCall(name) {
  const a = hostApi()
  const wc = a && a.windowControls
  if (!wc || typeof wc[name] !== 'function') return Promise.resolve({ ok: false, error: 'E_NO_SHELL' })
  return Promise.resolve(wc[name]())
}

export const shell = {
  available() { return !!hostApi() },
  has(name) {
    const a = hostApi()
    return !!(a && typeof a[name] === 'function')
  },
  writeFile(abs, data) { return hostCall('writeFile', [abs, data]) },
  // ⚠️ 必须保持**同步**：退出前落盘只允许同步写（异步写会在窗口销毁时被丢弃），
  // 所以这里绝不能包成 Promise。
  writeFileSync(abs, data) {
    const a = hostApi()
    if (!a || typeof a.writeFileSync !== 'function') return { ok: false, error: 'E_NO_SHELL' }
    try { return a.writeFileSync(abs, data) } catch (e) { return { ok: false, error: e.message } }
  },
  saveWorkbook(data, defaultPath) { return hostCall('saveWorkbook', [data, defaultPath]) },
  openWorkbookDialog() { return hostCall('openWorkbookDialog', []) },
  importFileDialog(exts) { return hostCall('importFileDialog', [exts]) },
  renameFile(from, to) { return hostCall('renameFile', [from, to]) },
  setTitle(title) {
    const a = hostApi()
    if (a && typeof a.setTitle === 'function') {
      try { a.setTitle(title) } catch (e) { /* 标题失败不影响业务 */ }
    }
  },
  onMenuCommand(cb) {
    const a = hostApi()
    if (a && typeof a.onMenuCommand === 'function') a.onMenuCommand(cb)
  },
  windowControls: {
    has(name) {
      const a = hostApi()
      return !!(a && a.windowControls && typeof a.windowControls[name] === 'function')
    },
    getState() { return hostWindowCall('getState') },
    minimize() { return hostWindowCall('minimize') },
    maximize() { return hostWindowCall('maximize') },
    close() { return hostWindowCall('close') }
  }
}

/**
 * 主进程 fs 事件 → 服务层事件（FS_ADD/FS_CHANGE/FS_UNLINK）+ 搜索缓存失效。
 * 渲染进程拿不到 fs.watch，只能由主进程推送；这是唯一的入口。
 *
 * ⚠️ 载荷是**批量**的：`{ root, events: [{type,path,rel,ts}] }`（不是单个 {type,rel}）。
 *    早期实现按单个 `payload.type` / `payload.rel` 取值 → 全落空 → 树永不刷新、搜索缓存不过期
 *    （2026-09-20「新增文件未实时显示」）。形状归一化交给纯函数 mapFsEvents，由单测锁住。
 */
export function startFsBridge() {
  const api = hostApi()
  if (!api || typeof api.onFsEvent !== 'function') return false
  const MAP = { add: EVT.FS_ADD, change: EVT.FS_CHANGE, unlink: EVT.FS_UNLINK }
  api.onFsEvent(payload => {
    const root = payload && payload.root
    for (const ev of mapFsEvents(payload)) {
      const name = MAP[ev.kind]
      if (!name) continue
      events.emit(name, { absPath: ev.absPath, rel: ev.rel, root, event: ev.kind })
      if (ev.rel && services.workspaceSearch) {
        services.workspaceSearch.invalidate(ev.rel)
      }
    }
  })
  return true
}

export { encode, decodeSmm }
