import exampleData from 'simple-mind-map/example/exampleData'
import { simpleDeepClone } from 'simple-mind-map/src/utils/index'
import Vue from 'vue'
import vuexStore from '@/store'

const SIMPLE_MIND_MAP_DATA = 'SIMPLE_MIND_MAP_DATA'
const SIMPLE_MIND_MAP_CONFIG = 'SIMPLE_MIND_MAP_CONFIG'
const SIMPLE_MIND_MAP_LANG = 'SIMPLE_MIND_MAP_LANG'
const SIMPLE_MIND_MAP_LOCAL_CONFIG = 'SIMPLE_MIND_MAP_LOCAL_CONFIG'
// 多工作表容器存储键
const SIMPLE_MIND_MAP_SHEETS = 'SIMPLE_MIND_MAP_SHEETS'
// 最近一次保存/打开的文件路径（用于“保存”时覆盖、以及标题显示）
const SIMPLE_MIND_MAP_LAST_FILE = 'SIMPLE_MIND_MAP_LAST_FILE'

let mindMapData = null

// ===== 多工作表状态管理 =====
// sheetState 结构：{ activeId, sheets: [{ id, name, data: { root, theme, layout, config, view } }] }
let sheetState = null

function uid() {
  return 'sheet-' + Date.now() + '-' + Math.floor(Math.random() * 1e6)
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

function loadSheetState() {
  if (sheetState) return sheetState
  const raw = localStorage.getItem(SIMPLE_MIND_MAP_SHEETS)
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && Array.isArray(parsed.sheets) && parsed.sheets.length) {
        sheetState = parsed
        return sheetState
      }
    } catch (e) {
      console.warn('解析多工作表数据失败，使用默认值', e)
    }
  }
  // 兼容旧版本：把单个思维导图数据迁移为单个工作表
  let data = null
  const oldRaw = localStorage.getItem(SIMPLE_MIND_MAP_DATA)
  if (oldRaw) {
    try {
      data = JSON.parse(oldRaw)
    } catch (e) {
      data = null
    }
  }
  if (!data) {
    data = simpleDeepClone(exampleData)
  }
  const sheet = {
    id: uid(),
    name: 'Sheet1',
    data
  }
  sheetState = {
    activeId: sheet.id,
    sheets: [sheet]
  }
  saveSheetState()
  return sheetState
}

function saveSheetState() {
  if (sheetState) {
    localStorage.setItem(SIMPLE_MIND_MAP_SHEETS, JSON.stringify(sheetState))
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

// 获取最近一次保存/打开的文件路径（空字符串表示尚未保存为文件）
export const getCurrentFilePath = () => {
  try {
    return localStorage.getItem(SIMPLE_MIND_MAP_LAST_FILE) || ''
  } catch (e) {
    return ''
  }
}

// 记录最近一次保存/打开的文件路径
export const setCurrentFilePath = p => {
  try {
    if (p) {
      localStorage.setItem(SIMPLE_MIND_MAP_LAST_FILE, p)
    } else {
      localStorage.removeItem(SIMPLE_MIND_MAP_LAST_FILE)
    }
  } catch (e) {}
}
