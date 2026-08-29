// 纯多文件状态机：不依赖 Vue / DOM / simple-mind-map，可在 Node 下单测。
// 每个 workbook 各自持有独立的 sheetState，彻底消除“共享模块级 sheetState 指针
// 切换文件时数据串到错误文件”的整类 bug。
//
// 状态结构：
// state = {
//   activeId: <workbookId>,
//   workbooks: [
//     { id, name, filePath, dirty, sheetState: { activeId, sheets: [{id,name,data}] } }
//   ]
// }

const WB_KEY = 'SIMPLE_MIND_MAP_WORKBOOKS'
const LAST_FILE_KEY = 'SIMPLE_MIND_MAP_LAST_FILE'

let storage = null
let defaultSheetData = {
  root: { data: { text: '中心主题' }, children: [] }
}

export function initWorkbookStorage(s) {
  storage = s
}

// 浏览器端由 api/index.js 注入真实 exampleData；Node 测试注入占位数据
export function setDefaultSheetData(d) {
  if (d) defaultSheetData = d
}

function deepClone(o) {
  return JSON.parse(JSON.stringify(o))
}

function uid(prefix) {
  return prefix + Date.now() + '-' + Math.floor(Math.random() * 1e6)
}

export function isAbsolutePath(p) {
  if (!p || typeof p !== 'string') return false
  return /^[a-zA-Z]:[\\/]/.test(p) || /^\//.test(p)
}

let state = null

function persist() {
  if (state && storage) {
    try {
      storage.setItem(WB_KEY, JSON.stringify(state))
    } catch (e) {
      // localStorage 配额或不可用：忽略，内存态仍可用
    }
  }
}

export function persistState() {
  persist()
}

function createDefaultSheetState(name) {
  const sheet = {
    id: uid('sheet-'),
    name: name || 'Sheet1',
    data: deepClone(defaultSheetData)
  }
  return { activeId: sheet.id, sheets: [sheet] }
}

function normalize(w) {
  if (!w.id) w.id = uid('wb-')
  if (typeof w.name !== 'string' || !w.name) w.name = '未命名'
  if (typeof w.filePath !== 'string') w.filePath = ''
  if (typeof w.dirty !== 'boolean') w.dirty = false
  if (typeof w.lastAutosavedAt !== 'number') w.lastAutosavedAt = 0
  if (!w.sheetState || !Array.isArray(w.sheetState.sheets)) {
    w.sheetState = createDefaultSheetState(w.name)
  }
  return w
}

function createInitialState() {
  const wb = normalize({
    name: '未命名-1',
    filePath: '',
    sheetState: createDefaultSheetState('Sheet1'),
    dirty: false
  })
  return { activeId: wb.id, workbooks: [wb] }
}

export function loadState() {
  if (state) return state
  if (!storage) {
    state = createInitialState()
    return state
  }
  const raw = storage.getItem(WB_KEY)
  if (raw) {
    try {
      const p = JSON.parse(raw)
      if (p && Array.isArray(p.workbooks) && p.workbooks.length) {
        p.workbooks.forEach(normalize)
        state = p
        return state
      }
    } catch (e) {
      // 解析失败：重建
    }
  }
  state = createInitialState()
  persist()
  return state
}

function getActiveWb() {
  const s = loadState()
  return s.workbooks.find(w => w.id === s.activeId) || s.workbooks[0]
}

// 列出所有 workbook（不含 sheet 数据，避免大对象泄漏到 UI）
export function getWorkbookList() {
  const s = loadState()
  return {
    activeId: s.activeId,
    workbooks: s.workbooks.map(w => ({
      id: w.id,
      name: w.name,
      filePath: w.filePath,
      dirty: w.dirty
    }))
  }
}

export function getActiveWorkbookId() {
  return loadState().activeId
}

export function getCurrentFilePath() {
  const wb = getActiveWb()
  if (wb && isAbsolutePath(wb.filePath)) return wb.filePath
  return ''
}

export function setCurrentFilePath(p) {
  const s = loadState()
  const wb = s.workbooks.find(w => w.id === s.activeId)
  if (!wb) return
  // 空串 / null / undefined => 显式置为未保存路径（新建空白文件）
  if (p === '' || p === null || p === undefined) {
    wb.filePath = ''
    try {
      storage.removeItem(LAST_FILE_KEY)
    } catch (e) {}
  } else if (isAbsolutePath(p)) {
    // 合法绝对路径 => 设置并记忆
    wb.filePath = p
    try {
      storage.setItem(LAST_FILE_KEY, p)
    } catch (e) {}
  } else {
    // 相对/非法路径：保留原有 filePath，不覆盖（避免误清已打开文件的路径）
    return
  }
  persist()
}

// 当前激活 workbook 的 sheetState（与 workbook 对象共享引用，
// storeData 对其内部 data 的修改即直接落到该 workbook）。
export function getActiveSheetState() {
  return getActiveWb().sheetState
}

export function setActiveSheetState(sheetState) {
  const s = loadState()
  const wb = s.workbooks.find(w => w.id === s.activeId)
  if (wb && sheetState) {
    wb.sheetState = sheetState
    persist()
  }
}

// 新增 workbook 并切换为激活。
// 由于每个 workbook 各自持有 sheetState，且 storeData 会实时把编辑写入激活
// workbook 的 sheetState，因此无需“写回旧 workbook”的拷贝逻辑；skipOldWriteback
// 仅保留兼容，不再承担数据同步职责。
export function addWorkbook({
  name,
  filePath,
  sheetState: initialSheetState,
  skipOldWriteback = false
} = {}) {
  const s = loadState()
  const newWb = normalize({
    name: name || '未命名-' + (s.workbooks.length + 1),
    filePath: filePath || '',
    sheetState: initialSheetState || createDefaultSheetState('Sheet1'),
    dirty: false
  })
  s.workbooks.push(newWb)
  s.activeId = newWb.id
  persist()
  return { id: newWb.id, name: newWb.name, filePath: newWb.filePath }
}

// 切换激活 workbook。返回是否发生切换。
export function switchWorkbook(id) {
  const s = loadState()
  const target = s.workbooks.find(w => w.id === id)
  if (!target || id === s.activeId) return false
  s.activeId = id
  persist()
  return true
}

// 关闭 workbook。至少保留一个；关闭最后一个时用全新空白替换。
export function removeWorkbook(id) {
  const s = loadState()
  if (s.workbooks.length <= 1) {
    const newWb = normalize({
      name: '未命名-1',
      filePath: '',
      sheetState: createDefaultSheetState('Sheet1'),
      dirty: false
    })
    const oldId = s.workbooks[0].id
    s.workbooks = [newWb]
    s.activeId = newWb.id
    persist()
    return { removed: oldId, newActiveId: newWb.id }
  }
  const idx = s.workbooks.findIndex(w => w.id === id)
  if (idx === -1) return null
  s.workbooks.splice(idx, 1)
  if (s.activeId === id) {
    const newActive = s.workbooks[Math.max(0, idx - 1)]
    s.activeId = newActive.id
  }
  persist()
  return { removed: id, newActiveId: s.activeId }
}

// 重命名 workbook。newFilePath 可选；若提供合法绝对路径，则同步更新 filePath
//（调用方已负责完成磁盘重命名）。返回 { oldName, oldPath, newPath } 供调用方使用。
export function renameWorkbook(id, name, newFilePath) {
  if (!name) return null
  const s = loadState()
  const w = s.workbooks.find(w => w.id === id)
  if (!w) return null
  const result = { oldName: w.name, oldPath: w.filePath || '', newPath: w.filePath || '' }
  w.name = name
  if (isAbsolutePath(newFilePath)) {
    w.filePath = newFilePath
    result.newPath = newFilePath
  }
  persist()
  return result
}

// 去重：同一绝对路径（大小写不敏感）已在其它标签打开则返回该 workbook
export function findByPath(filePath) {
  if (!isAbsolutePath(filePath)) return null
  const s = loadState()
  const target = filePath.toLowerCase()
  return (
    s.workbooks.find(
      w => isAbsolutePath(w.filePath) && w.filePath.toLowerCase() === target
    ) || null
  )
}

// 未保存标记
export function markDirty(id, value) {
  const s = loadState()
  const w = s.workbooks.find(w => w.id === id)
  if (w) {
    w.dirty = !!value
    persist()
  }
}

export function isDirty(id) {
  const s = loadState()
  const w = s.workbooks.find(w => w.id === id)
  return !!(w && w.dirty)
}

// 自动保存时间戳（供状态栏显示“已自动保存 HH:MM” / 崩溃恢复判断）
export function markAutosaved(id, ts) {
  const s = loadState()
  const w = s.workbooks.find(w => w.id === id)
  if (w) {
    w.lastAutosavedAt = typeof ts === 'number' ? ts : Date.now()
    persist()
  }
}

export function getLastAutosavedAt(id) {
  const s = loadState()
  const w = s.workbooks.find(w => w.id === id)
  return w && typeof w.lastAutosavedAt === 'number' ? w.lastAutosavedAt : 0
}

// 另存为：把当前激活 workbook 重定向到新路径（文件名随之更新），
// 原文件（如有）不受影响——其它 workbook 的 filePath 完全不动。
// 返回新文件名（不含路径）。
export function applySaveAs(newPath) {
  if (!isAbsolutePath(newPath)) return null
  const s = loadState()
  const wb = s.workbooks.find(w => w.id === s.activeId)
  if (!wb) return null
  wb.filePath = newPath
  wb.dirty = false
  const name = newPath.split(/[\\/]/).pop().replace(/\.smm$/i, '')
  wb.name = name || wb.name
  persist()
  return wb.name
}

// 清空全部状态（测试用）
export function __resetForTest() {
  state = null
}

// 初始化为空状态（测试用，便于精确控制 workbook 数量；应用运行时始终 >=1）
export function __initEmpty() {
  state = { activeId: '', workbooks: [] }
}
