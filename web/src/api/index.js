import exampleData from 'simple-mind-map/example/exampleData'
import { simpleDeepClone } from 'simple-mind-map/src/utils/index'
import Vue from 'vue'
import vuexStore from '@/store'

const SIMPLE_MIND_MAP_DATA = 'SIMPLE_MIND_MAP_DATA'
const SIMPLE_MIND_MAP_CONFIG = 'SIMPLE_MIND_MAP_CONFIG'
const SIMPLE_MIND_MAP_LANG = 'SIMPLE_MIND_MAP_LANG'
const SIMPLE_MIND_MAP_LOCAL_CONFIG = 'SIMPLE_MIND_MAP_LOCAL_CONFIG'
// 多工作表容器存储键（兼容旧版本：单一 workbook 时代使用）
const SIMPLE_MIND_MAP_SHEETS = 'SIMPLE_MIND_MAP_SHEETS'
// 多文件容器存储键（新：多个 workbook 同时打开）
const SIMPLE_MIND_MAP_WORKBOOKS = 'SIMPLE_MIND_MAP_WORKBOOKS'
// 最近一次保存/打开的文件路径（兼容旧版本；新版改为存到 workbook 内）
const SIMPLE_MIND_MAP_LAST_FILE = 'SIMPLE_MIND_MAP_LAST_FILE'

let mindMapData = null

// ===== 多工作表状态管理 =====
// sheetState 结构：{ activeId, sheets: [{ id, name, data: { root, theme, layout, config, view } }] }
// 模块级 sheetState 始终指向当前激活 workbook 的 sheetState（切换 workbook 时重新指向）
let sheetState = null

// ===== 多文件（workbook）状态管理 =====
// workbookState 结构：{ activeId, workbooks: [{ id, name, filePath, sheetState }] }
let workbookState = null

function uid() {
  return 'sheet-' + Date.now() + '-' + Math.floor(Math.random() * 1e6)
}

function wbUid() {
  return 'wb-' + Date.now() + '-' + Math.floor(Math.random() * 1e6)
}

function createDefaultSheet(name) {
  return {
    id: uid(),
    name: name || 'Sheet1',
    data: simpleDeepClone(exampleData)
  }
}

function createDefaultSheetState() {
  const sheet = createDefaultSheet('Sheet1')
  return {
    activeId: sheet.id,
    sheets: [sheet]
  }
}

function createDefaultWorkbook(name, filePath) {
  return {
    id: wbUid(),
    name: name || '未命名',
    filePath: filePath || '',
    sheetState: createDefaultSheetState()
  }
}

// 加载/保存 workbook 列表
function loadWorkbookState() {
  if (workbookState) return workbookState
  const raw = localStorage.getItem(SIMPLE_MIND_MAP_WORKBOOKS)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (
        parsed &&
        Array.isArray(parsed.workbooks) &&
        parsed.workbooks.length > 0
      ) {
        // 兜底：每个 workbook 都需要有完整的 sheetState
        parsed.workbooks.forEach(w => {
          if (!w.sheetState || !Array.isArray(w.sheetState.sheets)) {
            w.sheetState = createDefaultSheetState()
          }
        })
        workbookState = parsed
        return workbookState
      }
    } catch (e) {
      console.warn('解析多文件数据失败，使用默认', e)
    }
  }
  // 兼容旧版本：从单个 sheetState 迁移为一个 workbook
  let oldSheetState = null
  const oldRaw = localStorage.getItem(SIMPLE_MIND_MAP_SHEETS)
  if (oldRaw) {
    try {
      oldSheetState = JSON.parse(oldRaw)
    } catch (e) {}
  }
  if (!oldSheetState || !Array.isArray(oldSheetState.sheets)) {
    oldSheetState = createDefaultSheetState()
  }
  workbookState = {
    activeId: 'wb-1',
    workbooks: [
      {
        id: 'wb-1',
        name: '未命名-1',
        filePath: localStorage.getItem(SIMPLE_MIND_MAP_LAST_FILE) || '',
        sheetState: oldSheetState
      }
    ]
  }
  saveWorkbookState()
  return workbookState
}

function saveWorkbookState() {
  if (workbookState) {
    try {
      localStorage.setItem(
        SIMPLE_MIND_MAP_WORKBOOKS,
        JSON.stringify(workbookState)
      )
    } catch (e) {
      console.warn('保存多文件数据失败', e)
    }
  }
}

// sheetState 的加载/保存改为始终指向当前激活 workbook
function loadSheetState() {
  if (sheetState) return sheetState
  const wbState = loadWorkbookState()
  const activeWb =
    wbState.workbooks.find(w => w.id === wbState.activeId) ||
    wbState.workbooks[0]
  sheetState = activeWb.sheetState
  return sheetState
}

function saveSheetState() {
  if (sheetState) {
    // 同步写回当前激活 workbook 的 sheetState
    const wbState = loadWorkbookState()
    const activeWb = wbState.workbooks.find(
      w => w.id === wbState.activeId
    )
    if (activeWb) {
      activeWb.sheetState = sheetState
    }
    try {
      localStorage.setItem(
        SIMPLE_MIND_MAP_SHEETS,
        JSON.stringify(sheetState)
      )
    } catch (e) {}
    saveWorkbookState()
  }
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
    return Vue.prototype.getCurrentData()
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
      // 多工作表模式：合并到当前激活工作表
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
    // 写回当前激活工作表
    const activeSheet = getActiveSheet()
    activeSheet.data = originData
    saveSheetState()
    Vue.prototype.$bus.$emit('write_local_file', originData)
    if (vuexStore.state.isHandleLocalFile) {
      return
    }
    // 兼容：同时保留单条数据键，便于其它工具读取最新内容
    localStorage.setItem(SIMPLE_MIND_MAP_DATA, JSON.stringify(originData))
  } catch (error) {
    console.log(error)
    if ('exceeded') {
      Vue.prototype.$bus.$emit('localStorageExceeded')
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

// 存储本地配置
export const storeLocalConfig = config => {
  if (window.takeOverApp) {
    return window.takeOverAppMethods.saveLocalConfig(config)
  }
  localStorage.setItem(SIMPLE_MIND_MAP_LOCAL_CONFIG, JSON.stringify(config))
}

// 获取本地配置
export const getLocalConfig = () => {
  if (window.takeOverApp) {
    return window.takeOverAppMethods.getLocalConfig()
  }
  let config = localStorage.getItem(SIMPLE_MIND_MAP_LOCAL_CONFIG)
  if (config) {
    return JSON.parse(config)
  }
  return null
}

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
  const defaultName =
    name || 'Sheet' + (st.sheets.length + 1)
  const sheet = {
    id: uid(),
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
    id: s.id || uid(),
    name: s.name || 'Sheet',
    data: s.data || simpleDeepClone(exampleData)
  }))
  const activeId =
    container.activeId && sheets.find(s => s.id === container.activeId)
      ? container.activeId
      : sheets[0].id
  sheetState = {
    activeId,
    sheets
  }
  saveSheetState()
  return true
}

// 是否为多工作表文件
export const isSheetsFile = data => {
  return (
    data &&
    typeof data === 'object' &&
    data.app === 'smm-multisheet' &&
    Array.isArray(data.sheets)
  )
}

// 获取当前激活 workbook 的文件路径（空字符串表示尚未保存为文件）
export const getCurrentFilePath = () => {
  try {
    const wbState = loadWorkbookState()
    const activeWb = wbState.workbooks.find(
      w => w.id === wbState.activeId
    )
    // 只返回当前激活 workbook 自身记录的绝对路径；
    // 不再回退到全局 SIMPLE_MIND_MAP_LAST_FILE，否则切换到空路径文件
    //（拖拽打开/新建未保存）时会把内容错写到上一次保存的文件。
    if (activeWb && isAbsolutePath(activeWb.filePath)) return activeWb.filePath
    return ''
  } catch (e) {
    return ''
  }
}

// 判断是否为绝对路径（Windows 盘符路径或 Unix 绝对路径）
function isAbsolutePath(p) {
  if (!p || typeof p !== 'string') return false
  return /^[a-zA-Z]:[\\/]/.test(p) || /^\//.test(p)
}

// 记录当前激活 workbook 的文件路径
export const setCurrentFilePath = p => {
  try {
    const wbState = loadWorkbookState()
    const activeWb = wbState.workbooks.find(
      w => w.id === wbState.activeId
    )
    // 只接受绝对路径或空：避免把裸文件名/相对路径写进持久化状态
    const safePath = isAbsolutePath(p) ? p : ''
    if (activeWb) {
      activeWb.filePath = safePath
    }
    saveWorkbookState()
    // 兼容旧版本：同步写到独立存储键
    if (safePath) {
      localStorage.setItem(SIMPLE_MIND_MAP_LAST_FILE, safePath)
    } else {
      localStorage.removeItem(SIMPLE_MIND_MAP_LAST_FILE)
    }
  } catch (e) {}
}

// ===== 多文件（workbook）管理接口 =====

// 获取文件列表与激活项：{ activeId, workbooks: [{ id, name, filePath }] }
export const getWorkbookList = () => {
  const wbState = loadWorkbookState()
  return {
    activeId: wbState.activeId,
    workbooks: wbState.workbooks.map(w => ({
      id: w.id,
      name: w.name,
      filePath: w.filePath
    }))
  }
}

// 获取当前激活 workbook 的 id
export const getActiveWorkbookId = () => {
  const wbState = loadWorkbookState()
  return wbState.activeId
}

// 切换到指定 workbook：先把当前 sheetState 写回旧 workbook，再把目标 workbook 的 sheetState 装载为模块变量
export const switchWorkbook = id => {
  const wbState = loadWorkbookState()
  const target = wbState.workbooks.find(w => w.id === id)
  if (!target || id === wbState.activeId) return false
  // 写回旧 workbook
  const oldWb = wbState.workbooks.find(w => w.id === wbState.activeId)
  if (oldWb && sheetState) {
    oldWb.sheetState = sheetState
  }
  wbState.activeId = id
  // 指向新 workbook 的 sheetState（直接引用对象，便于切换工作表后保存能写回 workbook）
  sheetState = target.sheetState
  try {
    localStorage.setItem(
      SIMPLE_MIND_MAP_SHEETS,
      JSON.stringify(sheetState)
    )
  } catch (e) {}
  saveWorkbookState()
  return true
}

// 新增一个 workbook（可选携带初始 sheetState 与 filePath），并切换为激活
// skipOldWriteback=true 时不会把当前 module-level sheetState 写回旧 workbook
// —— 用于"打开文件"场景：module-level 已被新文件数据覆盖，不应回写到旧 workbook
export const addWorkbook = ({ name, filePath, sheetState: initialSheetState, skipOldWriteback = false } = {}) => {
  const wbState = loadWorkbookState()
  const newWb = {
    id: wbUid(),
    name: name || `未命名-${wbState.workbooks.length + 1}`,
    filePath: filePath || '',
    sheetState: initialSheetState || createDefaultSheetState()
  }
  wbState.workbooks.push(newWb)
  // 把当前 sheetState 写回旧 workbook（保持数据一致）
  // skipOldWriteback=true 时跳过：调用方自己负责旧 workbook 的数据持久化
  if (!skipOldWriteback) {
    const oldWb = wbState.workbooks.find(w => w.id === wbState.activeId)
    if (oldWb && sheetState) {
      oldWb.sheetState = sheetState
    }
  }
  wbState.activeId = newWb.id
  sheetState = newWb.sheetState
  try {
    localStorage.setItem(
      SIMPLE_MIND_MAP_SHEETS,
      JSON.stringify(sheetState)
    )
  } catch (e) {}
  saveWorkbookState()
  return { id: newWb.id, name: newWb.name, filePath: newWb.filePath }
}

// 关闭 workbook：至少保留一个；关闭最后一个时新建一个空的替换
export const removeWorkbook = id => {
  const wbState = loadWorkbookState()
  if (wbState.workbooks.length <= 1) {
    const newWb = createDefaultWorkbook('未命名-1')
    const oldId = wbState.workbooks[0].id
    wbState.workbooks = [newWb]
    wbState.activeId = newWb.id
    sheetState = newWb.sheetState
    try {
      localStorage.setItem(
        SIMPLE_MIND_MAP_SHEETS,
        JSON.stringify(sheetState)
      )
    } catch (e) {}
    saveWorkbookState()
    return { removed: oldId, newActiveId: newWb.id }
  }
  const idx = wbState.workbooks.findIndex(w => w.id === id)
  if (idx === -1) return null
  wbState.workbooks.splice(idx, 1)
  if (wbState.activeId === id) {
    const newActive = wbState.workbooks[Math.max(0, idx - 1)]
    wbState.activeId = newActive.id
    sheetState = newActive.sheetState
    try {
      localStorage.setItem(
        SIMPLE_MIND_MAP_SHEETS,
        JSON.stringify(sheetState)
      )
    } catch (e) {}
  }
  saveWorkbookState()
  return { removed: id, newActiveId: wbState.activeId }
}

// 重命名 workbook
export const renameWorkbook = (id, name) => {
  if (!name) return
  const wbState = loadWorkbookState()
  const w = wbState.workbooks.find(w => w.id === id)
  if (w) {
    w.name = name
    saveWorkbookState()
  }
}

// 直接覆盖当前激活 workbook 的 sheetState（用于从文件载入新内容）
export const setActiveWorkbookSheetState = newSheetState => {
  const wbState = loadWorkbookState()
  const activeWb = wbState.workbooks.find(
    w => w.id === wbState.activeId
  )
  if (activeWb && newSheetState) {
    activeWb.sheetState = newSheetState
    sheetState = newSheetState
    try {
      localStorage.setItem(
        SIMPLE_MIND_MAP_SHEETS,
        JSON.stringify(sheetState)
      )
    } catch (e) {}
    saveWorkbookState()
  }
}

// 把当前激活 workbook 的 sheetState 拷贝一份返回（切换前持久化用）
export const getActiveWorkbookSheetState = () => {
  const wbState = loadWorkbookState()
  const activeWb = wbState.workbooks.find(
    w => w.id === wbState.activeId
  )
  return activeWb ? activeWb.sheetState : null
}

// 获取当前 module-level sheetState（与激活 workbook 的 sheetState 共享引用）
// 用于：刚通过 loadSheetsContainer 载入新数据后，把该数据作为新 workbook 的初始内容
export const getCurrentSheetState = () => sheetState
