const { app, BrowserWindow, dialog, Menu, ipcMain, shell } = require('electron')
const http = require('http')
const fs = require('fs')
const path = require('path')
const { execFile, spawn } = require('child_process')
const os = require('os')
const { getAppExeName } = require('./install-meta')

const APP_DIR = __dirname
// === 启动性能埋点（由环境变量 STARTUP_LOG 控制；为空则不写，不影响正常功能）===
const STARTUP_LOG = process.env.STARTUP_LOG || ''
const _bootT0 = Date.now()
if (STARTUP_LOG) {
  try { fs.writeFileSync(STARTUP_LOG, 'process_start ' + _bootT0 + '\n') } catch (e) {}
}
function bootMark(label) {
  if (!STARTUP_LOG) return
  try { fs.appendFileSync(STARTUP_LOG, label + ' ' + (Date.now() - _bootT0) + '\n') } catch (e) {}
}
// 渲染端错误日志落盘路径：必须可写。
// 历史上写到 APP_DIR/..（Program Files\resources\renderer.log），普通用户对 Program Files
// 无写权限 → appendFileSync 静默失败、日志从未真正生成。改到 userData（%APPDATA% 下，必可写）。
function rendererLogPath() {
  try {
    return path.join(app.getPath('userData'), 'renderer.log')
  } catch (e) {
    // app 未 ready 等极端情况兜底到临时目录，仍比 Program Files 可靠
    return path.join(os.tmpdir(), 'mindmap-renderer.log')
  }
}

// 本地静态服务器端口（仅监听 127.0.0.1，安全）
const PORT = 51888
// 实际监听端口（端口回退后会变，给 mainWindow.loadURL 用）
let ACTIVE_PORT = PORT

// 未捕获异常兜底日志：避免 Electron 弹原生 "JavaScript error in main process" 吓用户
process.on('uncaughtException', err => {
  try {
    fs.appendFileSync(
      path.join(APP_DIR, '..', 'main.log'),
      '[' + new Date().toISOString() + '] UNCAUGHT ' + (err && err.stack ? err.stack : String(err)) + '\n'
    )
  } catch (e) {}
  // 主进程已不可信，强制退出避免悬挂；外层用户可重新启动应用
  try { app.exit(1) } catch (e) { process.exit(1) }
})

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
}

// 极简静态服务器：把 resources/app 作为站点根目录
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  if (urlPath === '/') urlPath = '/index.html'
  const filePath = path.normalize(path.join(APP_DIR, urlPath))
  // 防止路径穿越
  if (filePath !== APP_DIR && !filePath.startsWith(APP_DIR + path.sep)) {
    res.writeHead(403)
    res.end('forbidden')
    return
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404)
      res.end('not found: ' + urlPath)
      return
    }
    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(data)
  })
})

let mainWindow = null
let installerWindow = null
let firstErrorShown = false

// 把菜单命令转发给渲染进程处理（保存/另存为/打开）
function sendCmd(cmd) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('smm:menu-command', cmd)
  }
}

// ===== 文件读写 IPC（渲染进程通过 preload 的 smmApi 调用）=====
const SMM_FILTERS = [
  { name: '思绪思维导图 (*.smm)', extensions: ['smm'] },
  { name: 'JSON (*.json)', extensions: ['json'] },
  { name: '所有文件', extensions: ['*'] }
]

// 另存为：弹保存对话框并写文件
ipcMain.handle('smm:save-workbook', async (e, { content, defaultPath, defaultName }) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow
  const dlg = {
    title: '保存思维导图',
    filters: SMM_FILTERS
  }
  // defaultPath 是完整路径（优先）；兼容旧调用仍支持 defaultName
  if (defaultPath) {
    dlg.defaultPath = defaultPath
  } else if (defaultName) {
    dlg.defaultPath = defaultName
  } else {
    dlg.defaultPath = '思维导图.smm'
  }
  const result = await dialog.showSaveDialog(win, dlg)
  if (result.canceled || !result.filePath) return { canceled: true }
  try {
    fs.writeFileSync(result.filePath, content, 'utf8')
    return { canceled: false, filePath: result.filePath }
  } catch (err) {
    return { canceled: false, filePath: result.filePath, error: err.message }
  }
})

// 直接覆盖写入已有路径
ipcMain.handle('smm:write-file', async (e, { filePath, content }) => {
  try {
    fs.writeFileSync(filePath, content, 'utf8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// 同步覆盖写入（渲染进程 beforeunload 同步落盘用；sendSync 调用，
// 必须用 event.returnValue 返回结果，确保窗口关闭前写盘已完成）
ipcMain.on('smm:write-file-sync', (event, { filePath, content }) => {
  try {
    fs.writeFileSync(filePath, content, 'utf8')
    event.returnValue = { ok: true }
  } catch (err) {
    event.returnValue = { ok: false, error: err.message }
  }
})

// 重命名本地文件（标签双击重命名用）：oldPath -> newPath
ipcMain.handle('smm:rename-file', async (e, { oldPath, newPath }) => {
  try {
    if (fs.existsSync(newPath)) {
      return { ok: false, exists: true, error: '目标文件已存在' }
    }
    fs.renameSync(oldPath, newPath)
    return { ok: true, newPath }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// 打开：弹打开对话框并读取内容
ipcMain.handle('smm:open-workbook', async e => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow
  const result = await dialog.showOpenDialog(win, {
    title: '打开思维导图',
    properties: ['openFile'],
    filters: SMM_FILTERS
  })
  if (result.canceled || !result.filePaths || !result.filePaths[0]) {
    return { canceled: true }
  }
  const p = result.filePaths[0]
  try {
    const content = fs.readFileSync(p, 'utf8')
    return { canceled: false, filePath: p, content }
  } catch (err) {
    return { canceled: false, filePath: p, error: err.message }
  }
})

// 按路径读文件（备用）
ipcMain.handle('smm:read-file', async (e, { filePath }) => {
  try {
    return { ok: true, content: fs.readFileSync(filePath, 'utf8') }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ══════════════════════════════════════════════════════════════════════════
// 工作区 / 双链（md↔导图）所需 IPC（详设 §7.2）
// ⚠️ 全部写在 main.js 内，不新建本地模块 —— 避免触碰 build_now.sh 的 _appstage 白名单拷贝清单
//    （asar-modules.test.mjs 会兜底校验 main.js 的所有本地 require 都在包内）
// ══════════════════════════════════════════════════════════════════════════
const DEFAULT_IGNORE = ['node_modules', '.git', '.mindlink', '_trash', 'dist', 'dist-electron', 'dist-electron2']
const MAX_TEXT_BYTES = 8 * 1024 * 1024 // 8MB
const MAX_BINARY_BYTES = 10 * 1024 * 1024 // 10MB
const TRASH_BATCH = 20

let fsWatcher = null // 同时只保留一个 root

function isIgnored(name, ignore) {
  return name.startsWith('.') || ignore.includes(name)
}

// 1 选择目录（只读对话框）
ipcMain.handle('smm:pick-directory', async (e, { title } = {}) => {
  const res = await dialog.showOpenDialog({ title: title || '选择工作区目录', properties: ['openDirectory'] })
  if (res.canceled || !res.filePaths || !res.filePaths[0]) return { canceled: true, dirPath: null }
  return { canceled: false, dirPath: res.filePaths[0] }
})

// 2 读目录树（root 必须已存在且为目录）
ipcMain.handle('smm:read-tree', async (e, { root, depth = Infinity, ignore } = {}) => {
  const ig = Array.isArray(ignore) ? ignore : DEFAULT_IGNORE
  try {
    const st = fs.statSync(root)
    if (!st.isDirectory()) return { ok: false, code: 'E_NOT_DIR', message: root }
  } catch (err) {
    return { ok: false, code: 'E_STAT', message: err.message }
  }
  const walk = (dir, d) => {
    const out = []
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { return out }
    for (const ent of entries) {
      if (isIgnored(ent.name, ig)) continue
      const p = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        out.push({ name: ent.name, path: p, isDir: true, children: d < depth ? walk(p, d + 1) : [] })
      } else {
        let size = 0
        try { size = fs.statSync(p).size } catch (e) {}
        out.push({ name: ent.name, path: p, isDir: false, size })
      }
    }
    return out
  }
  try {
    return { ok: true, tree: walk(root, 1) }
  } catch (err) {
    return { ok: false, code: 'E_READ_TREE', message: err.message }
  }
})

// 3 批量 stat（只读）
ipcMain.handle('smm:stat-many', async (e, { paths = [] } = {}) => {
  const stats = {}
  for (const p of paths) {
    try {
      const st = fs.statSync(p)
      stats[p] = { exists: true, isDir: st.isDirectory(), isFile: st.isFile(), mtimeMs: st.mtimeMs, size: st.size }
    } catch (err) {
      stats[p] = { exists: false, isDir: false, isFile: false, mtimeMs: 0, size: 0 }
    }
  }
  return { ok: true, stats }
})

// 4 读文本（默认上限 8MB）
ipcMain.handle('smm:read-text', async (e, { filePath, maxBytes } = {}) => {
  const cap = maxBytes || MAX_TEXT_BYTES
  try {
    const st = fs.statSync(filePath)
    if (st.size > cap) return { ok: false, code: 'E_TOO_LARGE', size: st.size, maxBytes: cap }
    return { ok: true, content: fs.readFileSync(filePath, 'utf8'), mtimeMs: st.mtimeMs }
  } catch (err) {
    return { ok: false, code: 'E_READ', message: err.message }
  }
})

// 5 写文本（expectMtimeMs 不匹配仅告警，写盘不阻断）
ipcMain.handle('smm:write-text', async (e, { filePath, content = '', expectMtimeMs } = {}) => {
  let mtimeChanged = false
  if (expectMtimeMs != null) {
    try {
      const st = fs.statSync(filePath)
      mtimeChanged = Math.floor(st.mtimeMs) !== Math.floor(expectMtimeMs)
    } catch (err) { mtimeChanged = false }
  }
  try {
    fs.writeFileSync(filePath, content, 'utf8')
    const st = fs.statSync(filePath)
    return mtimeChanged
      ? { ok: false, code: 'E_MTIME_CHANGED', mtimeMs: st.mtimeMs, written: true }
      : { ok: true, mtimeMs: st.mtimeMs }
  } catch (err) {
    return { ok: false, code: 'E_WRITE', message: err.message }
  }
})

// 6 写二进制（base64 入参，上限 10MB）
ipcMain.handle('smm:write-binary', async (e, { filePath, base64 = '', mkdirp } = {}) => {
  const buf = Buffer.from(base64, 'base64')
  if (buf.length > MAX_BINARY_BYTES) return { ok: false, code: 'E_TOO_LARGE', size: buf.length }
  try {
    if (mkdirp) fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, buf)
    return { ok: true, size: buf.length }
  } catch (err) {
    return { ok: false, code: 'E_WRITE', message: err.message }
  }
})

// 7 递归建目录
ipcMain.handle('smm:mkdirp', async (e, { dirPath } = {}) => {
  try {
    fs.mkdirSync(dirPath, { recursive: true })
    return { ok: true }
  } catch (err) {
    return { ok: false, code: 'E_MKDIR', message: err.message }
  }
})

// 8 移动（目标存在 → E_EXISTS；跨盘回退 copy + 回收站）
ipcMain.handle('smm:move', async (e, { from, to } = {}) => {
  try {
    if (fs.existsSync(to)) return { ok: false, code: 'E_EXISTS', path: to }
    if (to.startsWith(path.dirname(from) + path.sep) || path.dirname(from) === path.dirname(to)) {
      // 同目录：改名语义，允许
    }
    try {
      fs.renameSync(from, to)
      return { ok: true }
    } catch (err) {
      if (err.code !== 'EXDEV') return { ok: false, code: 'E_MOVE', message: err.message }
      // 跨盘：copy + 回收站删除源文件（禁 fs.rm）
      fs.copyFileSync(from, to)
      try { await shell.trashItem(from) } catch (e) {}
      return { ok: true, fallback: 'copy+trash' }
    }
  } catch (err) {
    return { ok: false, code: 'E_MOVE', message: err.message }
  }
})

// 9 删除到回收站（禁 fs.rm；一次最多 20 条）
ipcMain.handle('smm:trash', async (e, { paths: targets = [] } = {}) => {
  const list = targets.slice(0, TRASH_BATCH)
  const failed = []
  for (const p of list) {
    try { await shell.trashItem(p) } catch (err) { failed.push({ path: p, message: err.message }) }
  }
  return { ok: failed.length === 0, failed, skipped: targets.length - list.length }
})

// 10/11 目录监听：同时只保留一个 root；400ms 合并窗口后推 smm:fs-event
// ⚠️ 事件载荷契约（渲染进程 workspaceBridge.startFsBridge 依赖，改这里必须同步改那边）：
//    { root, events: [{ type:'add'|'change'|'unlink', path:<绝对>, rel:<相对root,/> , ts }] }
//    早期实现直接透传 fs.watch 的 'rename'/'change'，既没有语义化的 add/unlink，也没有 rel
//    → 渲染端按 {type,rel} 取值全落空 → 树永不刷新（2026-09-20「新增文件未实时显示」）。
ipcMain.handle('smm:watch', (e, { root } = {}) => {
  if (fsWatcher) { try { fsWatcher.close() } catch (err) {} fsWatcher = null }
  const pending = new Map()
  let timer = null
  const flush = () => {
    const events = [...pending.values()]
    pending.clear()
    if (events.length && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('smm:fs-event', { root, events })
    }
  }
  const push = (type, rel) => {
    const abs = path.join(root, rel || '')
    // fs.watch 的 type 只有 'rename' / 'change'；'rename' 既可能是新建也可能是删除，
    // 必须 stat 一次才能区分（stat 失败 = 已被删除 → unlink）。
    let kind = 'change'
    if (type === 'rename') {
      let alive = false
      try { fs.statSync(abs); alive = true } catch (err) { alive = false }
      kind = alive ? 'add' : 'unlink'
    }
    pending.set(kind + '|' + rel, { type: kind, path: abs, rel, ts: Date.now() })
    clearTimeout(timer)
    timer = setTimeout(flush, 400)
  }
  try {
    fsWatcher = fs.watch(root, { recursive: true }, (type, filename) => {
      if (!filename) return
      const rel = String(filename).replace(/\\/g, '/')
      if (/(^|\/)(node_modules|\.git|\.mindlink|_trash)(\/|$)/.test(rel)) return // 噪声过滤
      push(type, rel)
    })
  } catch (err) {
    return { ok: false, code: 'E_WATCH', message: err.message } // Linux 无 recursive → 降级
  }
  return { ok: true }
})

ipcMain.handle('smm:unwatch', () => {
  if (fsWatcher) { try { fsWatcher.close() } catch (err) {} fsWatcher = null }
  return { ok: true }
})

// 12 外部打开（白名单：http/https/file，或工作区内解析出的绝对路径）
ipcMain.handle('smm:open-external', async (e, { url, baseDir } = {}) => {
  let target = String(url || '')
  if (!target) return { ok: false, code: 'E_BAD_URL' }
  if (/^(https?:|mailto:)/i.test(target)) {
    await shell.openExternal(target)
    return { ok: true }
  }
  if (/^file:\/\//i.test(target)) {
    await shell.openExternal(target)
    return { ok: true }
  }
  // 相对路径：只允许解析到 baseDir 之内，防越界
  if (baseDir) {
    const abs = path.resolve(baseDir, target)
    const rel = path.relative(baseDir, abs)
    if (rel.startsWith('..') || path.isAbsolute(rel)) return { ok: false, code: 'E_PATH_ESCAPE', path: abs }
    await shell.openPath(abs)
    return { ok: true }
  }
  return { ok: false, code: 'E_BAD_URL', url: target } // 其他 scheme（javascript: 等）一律拒绝
})

// 13 在文件夹中显示
ipcMain.handle('smm:reveal-in-folder', async (e, { filePath } = {}) => {
  try {
    shell.showItemInFolder(filePath)
    return { ok: true }
  } catch (err) {
    return { ok: false, code: 'E_REVEAL', message: err.message }
  }
})

// 导入本地文件：弹出打开对话框，读取文件原始字节返回给渲染进程解析
// 渲染进程根据扩展名统一分发到 .smm/.json/.xmind/.md/.emmx 等解析器
ipcMain.handle('smm:import-file', async (e, { exts, title } = {}) => {
  const extList = Array.isArray(exts) && exts.length > 0 ? exts : ['smm', 'json', 'xmind', 'md', 'emmx']
  const allLabel = extList.map(e => `*.${e}`).join(';')
  const filters = [
    { name: `思维导图文件 (${allLabel})`, extensions: extList },
    { name: '所有文件', extensions: ['*'] }
  ]
  const res = await dialog.showOpenDialog({
    title: title || '导入思维导图文件',
    properties: ['openFile'],
    filters
  })
  if (res.canceled || !res.filePaths || !res.filePaths[0]) return { canceled: true }
  const p = res.filePaths[0]
  try {
    const buf = fs.readFileSync(p) // Buffer -> 经 IPC 序列化为 Uint8Array
    return { canceled: false, filePath: p, buffer: buf }
  } catch (err) {
    return { canceled: false, filePath: p, error: err.message }
  }
})

// 设置窗口标题（直观显示当前文件路径）
ipcMain.handle('smm:set-title', (e, title) => {
  if (mainWindow) mainWindow.setTitle(title || '思绪思维导图')
})

// 窗口控制按钮（自定义标题栏用）
ipcMain.handle('smm:window-minimize', () => {
  if (mainWindow) mainWindow.minimize()
})
ipcMain.handle('smm:window-maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow.maximize()
  }
})
ipcMain.handle('smm:window-close', () => {
  if (mainWindow) mainWindow.close()
})
ipcMain.handle('smm:window-state', () => {
  return mainWindow ? { maximized: mainWindow.isMaximized() } : { maximized: false }
})

// =====================================================================
// 安装向导（--install 模式）：自带的 GUI 安装器
// 由 WinRAR SFX 的 Setup=MindMap.exe --install 拉起。
// =====================================================================
const APP_ROOT = path.resolve(APP_DIR, '..', '..') // .../resources/app -> 应用根目录
const APP_NAME = 'MindMap'
// 快捷方式/卸载图标指向的 exe 名，必须与 package.json 的 productName 一致
const APP_EXE = getAppExeName(app.getName())
// 安装时不需要拷贝进目标的文件（vc_redist 单独静默安装；配置文件仅 SFX 用）
const INSTALL_EXCLUDE = new Set([
  'vc_redist.x64.exe',
  'install.bat',
  'sfx_config.txt',
  'MindMap.sfx',
  'renderer.log',
  'uninstall.cmd'
])

function defaultInstallPath() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  return path.join(local, 'MindMap')
}

// 列出待拷贝文件（相对路径），跳过排除项
function listFiles(dir, base, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    const rel = base ? path.join(base, entry.name) : entry.name
    if (entry.isDirectory()) {
      listFiles(full, rel, out)
    } else if (!INSTALL_EXCLUDE.has(entry.name)) {
      out.push({ full, rel })
    }
  }
}

async function copyWithProgress(srcRoot, destRoot, event) {
  const files = []
  listFiles(srcRoot, '', files)
  const total = files.length
  let done = 0
  for (const f of files) {
    const dest = path.join(destRoot, f.rel)
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(f.full, dest)
    } catch (e) {
      // 单个文件失败不致命（如正在被锁定的日志），继续
      console.warn('copy skip', f.rel, e.message)
    }
    done++
    if (done % 40 === 0) {
      event.sender.send('install:progress', {
        phase: 'copy',
        done,
        total,
        pct: total ? Math.floor((done / total) * 100) : 100
      })
      await new Promise(r => setImmediate(r))
    }
  }
  event.sender.send('install:progress', { phase: 'copy', done: total, total, pct: 100 })
}

function createShortcut(linkPath, targetPath, workDir, iconPath) {
  const ps =
    "$s=(New-Object -COM WScript.Shell).CreateShortcut('" +
    linkPath +
    "');$s.TargetPath='" +
    targetPath +
    "';$s.WorkingDirectory='" +
    workDir +
    "';$s.IconLocation='" +
    targetPath +
    ",0';$s.Save()"
  try {
    execFile('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore' })
  } catch (e) {
    console.warn('shortcut fail', linkPath, e.message)
  }
}

function writeUninstallCmd(targetDir) {
  const p = path.join(targetDir, 'uninstall.cmd')
  const lines = [
    '@echo off',
    'setlocal',
    'set "APP_DIR=' + targetDir + '"',
    'rmdir /S /Q "%APP_DIR%" 2>nul',
    'rmdir /S /Q "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\MindMap" 2>nul',
    'del /Q "%USERPROFILE%\\Desktop\\MindMap.lnk" 2>nul',
    'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MindMap" /f 2>nul',
    'exit /b 0'
  ]
  fs.writeFileSync(p, lines.join('\r\n') + '\r\n')
}

function registerUninstall(targetDir) {
  const key = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MindMap'
  const args = [
    'add',
    key,
    '/f',
    '/v',
    'DisplayName',
    '/t',
    'REG_SZ',
    '/d',
    'MindMap',
    '/v',
    'InstallLocation',
    '/t',
    'REG_SZ',
    '/d',
    targetDir,
    '/v',
    'UninstallString',
    '/t',
    'REG_SZ',
    '/d',
    '"' + path.join(targetDir, 'uninstall.cmd') + '"',
    '/v',
    'DisplayIcon',
    '/t',
    'REG_SZ',
    '/d',
    path.join(targetDir, APP_EXE) + ',0'
  ]
  try {
    execFile('reg', args, { stdio: 'ignore' })
  } catch (e) {
    console.warn('reg fail', e.message)
  }
}

// 关闭静态 server（解决安装完毕后 spawn 出去的 exe 启动时 EADDRINUSE）
function closeServer() {
  return new Promise(resolve => {
    if (!server.listening) return resolve()
    try {
      // Windows 上 keep-alive 连接可能阻塞 close，先强制踢掉
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections()
    } catch (e) {}
    try {
      server.close(() => resolve())
    } catch (e) {
      resolve()
    }
    // 兜底：1.5s 强制 resolve（不让 await 永久挂起）
    setTimeout(resolve, 1500)
  })
}

// 真正执行安装（在渲染进程点击"安装"后由 IPC 触发）
async function doInstall(targetDir, opts, event) {
  try {
    event.sender.send('install:progress', { phase: 'start', pct: 0 })
    fs.mkdirSync(targetDir, { recursive: true })

    // 1) 拷贝应用文件（带进度）
    await copyWithProgress(APP_ROOT, targetDir, event)

    // 2) 静默安装 VC++ 运行库（从源目录）
    const vc = path.join(APP_ROOT, 'vc_redist.x64.exe')
    if (fs.existsSync(vc)) {
      event.sender.send('install:progress', { phase: 'runtime', pct: 100 })
      await new Promise(resolve => {
        try {
          const cp = spawn(vc, ['/install', '/passive', '/norestart'], { stdio: 'ignore' })
          cp.on('exit', () => resolve())
          cp.on('error', () => resolve())
        } catch (e) {
          resolve()
        }
      })
    }

    // 3) 快捷方式
    const installedExe = path.join(targetDir, APP_EXE)
    if (opts && opts.desktop) {
      createShortcut(
        path.join(process.env.USERPROFILE || os.homedir(), 'Desktop', 'MindMap.lnk'),
        installedExe,
        targetDir
      )
    }
    if (opts && opts.startMenu) {
      const smDir = path.join(
        process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
        'Microsoft',
        'Windows',
        'Start Menu',
        'Programs',
        'MindMap'
      )
      fs.mkdirSync(smDir, { recursive: true })
      createShortcut(path.join(smDir, 'MindMap.lnk'), installedExe, targetDir)
      createShortcut(path.join(smDir, '卸载 MindMap.lnk'), path.join(targetDir, 'uninstall.cmd'), targetDir)
    }

    // 4) 卸载脚本 + 注册表
    writeUninstallCmd(targetDir)
    registerUninstall(targetDir)

    const exePath = installedExe
    event.sender.send('install:progress', { phase: 'done', pct: 100, exePath })

    // 5) 关闭本地 HTTP server（51888）—— 不关的话，后续 spawn 出去的新
    // MindMap.exe 也会执行 server.listen(PORT) 并立即报 EADDRINUSE。
    await closeServer()

    // 6) 按用户选择决定是否启动已安装的程序（detached，安装器退出不影响它）
    if (opts && opts.run) {
      try {
        const child = spawn(exePath, [], { detached: true, stdio: 'ignore' })
        child.unref()
      } catch (e) {
        console.warn('launch fail', e.message)
      }
    }

    event.sender.send('install:done', { ok: true, exePath })

    // 7) 不再强制 process.exit(0)。
    // 原因：强制退出会在 install:done 后仅 250ms 就杀掉整个安装器进程，
    // 导致 install.html 的“安装完成”页一闪而过（用户来不及点“完成”），
    // 而此时上面 spawn 出去的已安装 exe 还在冷启动（2~3s），表现为“窗口消失几秒”。
    // 改为由完成页的“完成”按钮（api.installQuit -> app.quit）正常退出；
    // 上面的 spawn 已提前执行，用户在完成页停留期间 exe 已冷启动完毕，点完成后无缝衔接。
  } catch (e) {
    event.sender.send('install:done', { ok: false, error: e.message })
  }
}

// 安装向导窗口
function startInstaller() {
  // 安装器不显示主程序菜单
  Menu.setApplicationMenu(null)
  const win = new BrowserWindow({
    width: 760,
    height: 560,
    minWidth: 640,
    minHeight: 480,
    title: '思绪思维导图 安装程序',
    backgroundColor: '#f5f6fa',
    center: true,
    resizable: true,
    webPreferences: {
      preload: path.join(APP_DIR, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  })
  // install.html 是纯本地资源（CSS/JS 内联），直接 loadFile 走 file://，
  // 不再依赖 HTTP server，彻底避开"安装器占着 51888"导致的 EADDRINUSE。
  win.loadFile(path.join(APP_DIR, 'install.html'))
  installerWindow = win
}

// 安装向导相关 IPC
ipcMain.handle('install:get-default-path', () => defaultInstallPath())
ipcMain.handle('install:browse', async () => {
  const res = await dialog.showOpenDialog({
    title: '选择安装目录',
    properties: ['openDirectory', 'createDirectory']
  })
  if (res.canceled || !res.filePaths || !res.filePaths[0]) return { canceled: true }
  return { canceled: false, path: res.filePaths[0] }
})
ipcMain.handle('install:do', async (event, { targetDir, opts }) => {
  await doInstall(targetDir, opts, event)
  return { started: true }
})
ipcMain.handle('install:quit', () => {
  app.quit()
  return { ok: true }
})

function createWindow() {
  // 隐藏原生菜单栏（文件/视图/帮助），UI 操作改由前端 Toolbar 与 FileTabs 完成
  Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: '思绪思维导图',
    show: false,
    backgroundColor: '#ffffff',
    frame: false,
    // 关掉 thickFrame，否则 frame:false 的窗口两侧仍会画一条用于拖拽缩放的深色边框（用户反馈"两头的黑框"就是这个）
    thickFrame: false,
    webPreferences: {
      preload: path.join(APP_DIR, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  })

  // 捕获渲染端 JS 报错（白屏最常见原因），写入日志并首次弹窗
  mainWindow.webContents.on('console-message', (e, level, message, line, source) => {
    if (level >= 2) {
      try {
        fs.appendFileSync(
          rendererLogPath(),
          '[' + new Date().toISOString() + '] CONSOLE[' + level + '] ' +
            (source || '') + ':' + (line || '') + ' ' + message + '\n'
        )
      } catch (err) {}
      if (level >= 3 && !firstErrorShown) {
        firstErrorShown = true
        try {
          dialog.showErrorBox(
            '页面脚本错误',
            (source || '') + ':' + (line || '') + '\n' + message +
              '\n\n（详细日志见 ' + rendererLogPath() + '，或按 Ctrl+Shift+I 打开控制台查看完整堆栈）'
          )
        } catch (err) {}
      }
    }
  })

  mainWindow.webContents.on('did-fail-load', (e, code, desc, url) => {
    try {
      fs.appendFileSync(
        rendererLogPath(),
        '[' + new Date().toISOString() + '] DID_FAIL_LOAD code=' + code + ' ' + desc + ' ' + url + '\n'
      )
    } catch (err) {}
    dialog.showErrorBox('页面加载失败', 'code=' + code + '\n' + desc + '\nurl=' + url)
  })

  mainWindow.webContents.on('render-process-gone', (e, details) => {
    try {
      fs.appendFileSync(
        rendererLogPath(),
        '[' + new Date().toISOString() + '] RENDER_GONE ' + JSON.stringify(details) + '\n'
      )
    } catch (err) {}
    dialog.showErrorBox('渲染进程崩溃', JSON.stringify(details))
  })

  mainWindow.loadURL('http://127.0.0.1:' + ACTIVE_PORT + '/index.html')
  bootMark('loadurl_called')

  mainWindow.webContents.on('did-finish-load', () => {
    bootMark('did_finish_load')
  })

  mainWindow.once('ready-to-show', () => {
    bootMark('ready_to_show')
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Ctrl+Shift+I 或 F12 打开/关闭 DevTools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // 只在按键「按下」时响应：before-input-event 对 keyDown 与 keyUp 各触发一次，
    // 若不判断 input.type，同一次按键会先 openDevTools 再 closeDevTools，
    // 表现为「按了快捷键毫无反应」（开了又关）。
    if (input.type !== 'keyDown') return
    const isToggle =
      (input.control && input.shift && input.key && input.key.toLowerCase() === 'i') ||
      input.key === 'F12'
    if (!isToggle) return
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools()
    } else {
      mainWindow.webContents.openDevTools()
    }
  })
}

// 端口回退：51888 被占就试 51889~51898（最多 10 个），都失败才报错退出。
// 解决"本机 51888 已被其他程序占用 → 启动直接 EADDRINUSE"。
function tryListen(startPort, cb, attempt) {
  if (attempt === undefined) attempt = 0
  if (attempt > 10) {
    try {
      dialog.showErrorBox(
        '端口被占用',
        '127.0.0.1 上 ' + startPort + '~' + (startPort + 10) + ' 端口均被占用。\n请关闭占用端口的程序后重试。'
      )
    } catch (e) {}
    setTimeout(() => process.exit(1), 100)
    return
  }
  const tryPort = startPort + attempt
  server.once('error', err => {
    if (err && err.code === 'EADDRINUSE') {
      // 让出 tick 后递归，避免栈深
      setImmediate(() => tryListen(startPort, cb, attempt + 1))
    } else {
      try { dialog.showErrorBox('启动失败', err.message) } catch (e) {}
      setTimeout(() => process.exit(1), 100)
    }
  })
  server.listen(tryPort, '127.0.0.1', () => {
    ACTIVE_PORT = tryPort
    bootMark('server_listening')
    cb()
  })
}

const IS_INSTALL_MODE = process.argv.includes('--install') || process.env.MINDMAP_INSTALL === '1'

// 安装器模式完全脱离 HTTP server（install.html 是纯本地资源，loadFile 直读），
// 从根本上解决"安装器自己 listen 51888 → spawn 出去的 MindMap.exe 撞端口"的问题。
// 正常模式走 tryListen 做端口回退，避免本机 51888 被其他程序占用时启动失败。
app.whenReady().then(() => {
  bootMark('app_ready')
  if (IS_INSTALL_MODE) {
    startInstaller()
  } else {
    tryListen(PORT, () => {
      createWindow()
    })
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
