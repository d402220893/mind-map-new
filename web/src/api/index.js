import exampleData from 'simple-mind-map/example/exampleData'
import { simpleDeepClone } from 'simple-mind-map/src/utils/index'
import vuexStore from '@/store'
import * as WB from './workbookState'
import { isQuotaExceededError } from './storageErrors'
import bus from '@/utils/eventBus'
import { getCurrentData } from '@/utils/global'

const SIMPLE_MIND_MAP_CONFIG = 'SIMPLE_MIND_MAP_CONFIG'
const SIMPLE_MIND_MAP_LANG = 'SIMPLE_MIND_MAP_LANG'

// 初始化纯状态机：用浏览器 localStorage 作为存储，并用真实模板作为空白页数据
WB.initWorkbookStorage(localStorage)
WB.setDefaultSheetData(exampleData)

let mindMapData = null

// ===== 多工作表状态 =====
// sheetState 始终指向“当前激活 workbook”的 sheetState（由 workbookState 托管）。
function loadSheetState() {
  return WB.getActiveSheetState()
}

function saveSheetState() {
  // 单一权威写入：整个 workbook 状态（含当前激活 workbook 的 sheetState）由
  // workbookState.persistState() 写入 SIMPLE_MIND_MAP_WORKBOOKS。
  // 历史上的 SIMPLE_MIND_MAP_SHEETS / SIMPLE_MIND_MAP_DATA 冗余键在 web/src 中
  // 已无任何读取方，移除后每次编辑减少 2 次重复序列化与写入，降低大图撞配额风险。
  WB.persistState()
}

function getActiveSheet() {
  const st = loadSheetState()
  let sheet = st.sheets.find(s => s.id === st.activeId)
  if (!sheet) {
    sheet = st.sheets[0]
    st.activeId = sheet.id
  }
  return sheet
}

// 获取缓存的思维导图数据
export const getData = () => {
  // 接管模式
  if (window.takeOverApp) {
    mindMapData = window.takeOverAppMethods.getMindMapData()
    return mindMapData
  }
  // 操作本地文件模式
  if (vuexStore.state.isHandleLocalFile) {
    return getCurrentData()
  }
  // 多工作表模式：返回当前激活工作表的数据
  return getActiveSheet().data
}

// 存储思维导图数据
export const storeData = data => {
  try {
    let originData = null
    if (window.takeOverApp) {
      originData = mindMapData
    } else {
      // 多工作表模式：合并到当前激活工作表（属于当前激活 workbook）
      originData = getActiveSheet().data
    }
    if (!originData) {
      originData = {}
    }
    originData = {
      ...originData,
      ...data
    }
    if (window.takeOverApp) {
      mindMapData = originData
      window.takeOverAppMethods.saveMindMapData(originData)
      return
    }
    // 写回当前激活工作表（即当前激活 workbook 的 sheetState）
    const activeSheet = getActiveSheet()
    activeSheet.data = originData
    saveSheetState()
    bus.$emit('write_local_file', originData)
    if (vuexStore.state.isHandleLocalFile) {
      return
    }
    // 注：不再单独写 SIMPLE_MIND_MAP_DATA 兼容键——web/src 中无读取方，
    // 全部状态已通过 workbookState.persistState() 写入 SIMPLE_MIND_MAP_WORKBOOKS。
  } catch (error) {
    console.log(error)
    if (isQuotaExceededError(error)) {
      bus.$emit('localStorageExceeded')
    }
  }
}

// 获取思维导图配置数据
export const getConfig = () => {
  if (window.takeOverApp) {
    window.takeOverAppMethods.getMindMapConfig()
    return
  }
  let config = localStorage.getItem(SIMPLE_MIND_MAP_CONFIG)
  if (config) {
    return JSON.parse(config)
  }
  return null
}

// 存储思维导图配置数据
export const storeConfig = config => {
  try {
    if (window.takeOverApp) {
      window.takeOverAppMethods.saveMindMapConfig(config)
      return
    }
    localStorage.setItem(SIMPLE_MIND_MAP_CONFIG, JSON.stringify(config))
  } catch (error) {
    console.log(error)
  }
}

// 存储语言
export const storeLang = lang => {
  if (window.takeOverApp) {
    window.takeOverAppMethods.saveLanguage(lang)
    return
  }
  localStorage.setItem(SIMPLE_MIND_MAP_LANG, lang)
}

// 获取存储的语言
export const getLang = () => {
  if (window.takeOverApp) {
    return window.takeOverAppMethods.getLanguage() || 'zh'
  }
  let lang = localStorage.getItem(SIMPLE_MIND_MAP_LANG)
  if (lang) {
    return lang
  }
  storeLang('zh')
  return 'zh'
}

// 本地配置（localStorage）：实现抽至 ./localConfig，专破 api/index.js ⇄ store.js 的 ESM 环。
// store.js 不再 import @/api，改 import @/api/localConfig，从而消除双向依赖。
// 此处 re-export 保持 `@/api` 对外接口不变（Index.vue 等仍从 @/api 取 getLocalConfig）。
export { storeLocalConfig, getLocalConfig } from './localConfig'

// ===== 多工作表对外接口 =====

// 获取工作表列表与激活项：{ activeId, sheets: [{ id, name }] }
export const getSheetList = () => {
  const st = loadSheetState()
  return {
    activeId: st.activeId,
    sheets: st.sheets.map(s => ({
      id: s.id,
      name: s.name
    }))
  }
}

// 设置激活工作表（仅切换标记，不改动数据）
export const setActiveSheetId = id => {
  const st = loadSheetState()
  if (st.sheets.find(s => s.id === id)) {
    st.activeId = id
    saveSheetState()
  }
}

// 获取当前激活工作表的完整数据
export const getActiveSheetData = () => {
  return getActiveSheet().data
}

// 新增工作表，返回新工作表 { id, name }
export const addSheet = name => {
  const st = loadSheetState()
  const defaultName = name || 'Sheet' + (st.sheets.length + 1)
  const sheet = {
    id: 'sheet-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
    name: defaultName,
    data: simpleDeepClone(exampleData)
  }
  st.sheets.push(sheet)
  st.activeId = sheet.id
  saveSheetState()
  return {
    id: sheet.id,
    name: sheet.name
  }
}

// 删除工作表，返回是否成功（仅剩一个时拒绝删除）
export const removeSheet = id => {
  const st = loadSheetState()
  if (st.sheets.length <= 1) {
    return false
  }
  const idx = st.sheets.findIndex(s => s.id === id)
  if (idx === -1) {
    return false
  }
  st.sheets.splice(idx, 1)
  if (st.activeId === id) {
    st.activeId = st.sheets[Math.max(0, idx - 1)].id
  }
  saveSheetState()
  return true
}

// 重命名工作表
export const renameSheet = (id, name) => {
  const st = loadSheetState()
  const sheet = st.sheets.find(s => s.id === id)
  if (sheet) {
    sheet.name = name
    saveSheetState()
  }
}

// 导出全部工作表容器（用于保存到文件）
export const getSheetsContainer = () => {
  const st = loadSheetState()
  return {
    app: 'smm-multisheet',
    version: 1,
    activeId: st.activeId,
    sheets: st.sheets.map(s => ({
      id: s.id,
      name: s.name,
      data: s.data
    }))
  }
}

// 从文件导入工作表容器，返回是否成功
export const loadSheetsContainer = container => {
  if (
    !container ||
    !Array.isArray(container.sheets) ||
    container.sheets.length === 0
  ) {
    return false
  }
  const sheets = container.sheets.map(s => ({
    id: s.id || 'sheet-' + Date.now() + '-' + Math.floor(Math.random() * 1e6),
    name: s.name || 'Sheet',
    data: s.data || simpleDeepClone(exampleData)
  }))
  const activeId =
    container.activeId && sheets.find(s => s.id === container.activeId)
      ? container.activeId
      : sheets[0].id
  WB.setActiveSheetState({
    activeId,
    sheets
  })
  return true
}

// 归一化多工作表容器：认两种形态，统一成 { app:'smm-multisheet', version, activeId, sheets }。
//   ① 本应用保存：{ app:'smm-multisheet', version:1, activeId, sheets:[{id,name,data}] }
//   ② 快照写回/旧容器：{ type:'smms', data:{ sheets:[{id,data}], activeId } }
//      （refService.writeNodeSnapshot 回写 .smm 时用 smmCodec.encode 产出此形态）
// 非容器返回 null（调用方按"单图/未知"处理）。
// ⚠️ 同源 bug（§32.4 Bug①/③）在打开对话框路径的翻版：只认 ① 会把 ② 误当单图 →
//    sheets 丢失、内容错乱。这里统一归一化，两条打开路径（文件树 / 对话框）行为一致。
export const normalizeSheetsContainer = data => {
  if (!data || typeof data !== 'object') return null
  if (data.app === 'smm-multisheet' && Array.isArray(data.sheets)) return data
  if (data.type === 'smms' && data.data && Array.isArray(data.data.sheets)) {
    const sheets = data.data.sheets
    const activeId =
      data.data.activeId && sheets.find(s => s.id === data.data.activeId)
        ? data.data.activeId
        : (sheets[0] && sheets[0].id)
    return { app: 'smm-multisheet', version: 1, activeId, sheets }
  }
  return null
}

// 是否为多工作表文件（两种容器形态皆算）
export const isSheetsFile = data => {
  return normalizeSheetsContainer(data) !== null
}

// ===== 多文件（workbook）管理接口（委托给纯状态机 workbookState）=====

export const isAbsolutePath = p => WB.isAbsolutePath(p)

// 获取当前激活 workbook 的文件路径（空字符串表示尚未保存为文件）
export const getCurrentFilePath = () => WB.getCurrentFilePath()

// 记录当前激活 workbook 的文件路径
export const setCurrentFilePath = p => WB.setCurrentFilePath(p)

// 获取文件列表与激活项：{ activeId, workbooks: [{ id, name, filePath, dirty }] }
export const getWorkbookList = () => WB.getWorkbookList()

// 获取当前激活 workbook 的 id
export const getActiveWorkbookId = () => WB.getActiveWorkbookId()

// 切换到指定 workbook
export const switchWorkbook = id => WB.switchWorkbook(id)

// 新增一个 workbook（可选携带初始 sheetState 与 filePath），并切换为激活
// ⚠️ 本包装层**必须显式转发 `kind`**。曾经这里漏掉了它（只解构 name/filePath/sheetState/
//    skipOldWriteback），于是 workspaceBridge.tabsAdapter.add({kind:'markdown'}) 传下来的
//    kind 被静默丢弃 → WB.normalize() 默认落回 'mindmap' → 打开 .md 文件却渲染成导图。
//    这类"包装层吞字段"的 bug 不会有编译错误（JS 解构多余字段不报错），只能靠转发纪律 +
//    回归守卫（tests/regression/*）拦。新增字段时务必同步此处。
export const addWorkbook = ({ name, filePath, kind, sheetState: initialSheetState, skipOldWriteback = false } = {}) =>
  WB.addWorkbook({ name, filePath, kind, sheetState: initialSheetState, skipOldWriteback })

// 关闭 workbook：至少保留一个；关闭最后一个时新建一个空的替换
export const removeWorkbook = id => WB.removeWorkbook(id)

// 重命名 workbook（newFilePath 为可选参数：传入时同步更新 filePath）
export const renameWorkbook = (id, name, newFilePath) =>
  WB.renameWorkbook(id, name, newFilePath)

// 直接覆盖当前激活 workbook 的 sheetState（用于从文件载入新内容）
export const setActiveWorkbookSheetState = newSheetState =>
  WB.setActiveSheetState(newSheetState)

// 获取当前激活 workbook 的 sheetState 拷贝
export const getActiveWorkbookSheetState = () => WB.getActiveSheetState()

// 获取当前 module-level sheetState（与激活 workbook 的 sheetState 共享引用）
export const getCurrentSheetState = () => WB.getActiveSheetState()

// 未保存标记
export const markDirty = (id, value) => WB.markDirty(id, value)
// Tab 类型（§5.2/D6）：'mindmap' | 'markdown'。视图据此决定渲染导图还是 md 编辑器。
// ⚠️ 漏导出不会有编译错误 —— webpack 只给 warning，产物照出，调用点运行时才 TypeError。
//    （这条曾漏掉，见 .workbuddy/tools/check-api-exports.mjs 与 check-arch 断言⑪）
export const getKind = id => WB.getKind(id)
export const isDirty = id => WB.isDirty(id)
export const markAutosaved = (id, ts) => WB.markAutosaved(id, ts)
export const getLastAutosavedAt = id => WB.getLastAutosavedAt(id)

// 另存为：把当前激活 workbook 重定向到新路径，原文件不受影响
export const applySaveAs = newPath => WB.applySaveAs(newPath)

// 去重：同一绝对路径已在其它标签打开则返回该 workbook
export const findByPath = filePath => WB.findByPath(filePath)
