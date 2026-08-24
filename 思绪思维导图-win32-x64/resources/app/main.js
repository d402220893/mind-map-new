const { app, BrowserWindow, dialog, Menu, ipcMain } = require('electron')
const http = require('http')
const fs = require('fs')
const path = require('path')

const APP_DIR = __dirname
// 本地静态服务器端口（仅监听 127.0.0.1，安全）
const PORT = 51888

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
ipcMain.handle('smm:save-workbook', async (e, { content, defaultName }) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow
  const result = await dialog.showSaveDialog(win, {
    title: '保存思维导图',
    defaultPath: defaultName || '思维导图.smm',
    filters: SMM_FILTERS
  })
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

// 设置窗口标题（直观显示当前文件路径）
ipcMain.handle('smm:set-title', (e, title) => {
  if (mainWindow) mainWindow.setTitle(title || '思绪思维导图')
})

function createWindow() {
  // 自定义菜单：含“文件”菜单（打开/保存/另存为），避免 Electron 默认菜单用 Ctrl+S 弹出“另存为”抢走组合键
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '打开', accelerator: 'Ctrl+O', click: () => sendCmd('open') },
        { label: '保存', accelerator: 'Ctrl+S', click: () => sendCmd('save') },
        { label: '另存为', click: () => sendCmd('saveAs') },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: () =>
            dialog.showMessageBox(mainWindow, {
              message: '思绪思维导图（多工作表离线版）'
            })
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: '思绪思维导图',
    show: false,
    backgroundColor: '#ffffff',
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
          path.join(APP_DIR, '..', 'renderer.log'),
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
              '\n\n（详细日志见 exe 同目录 renderer.log）'
          )
        } catch (err) {}
      }
    }
  })

  mainWindow.webContents.on('did-fail-load', (e, code, desc, url) => {
    try {
      fs.appendFileSync(
        path.join(APP_DIR, '..', 'renderer.log'),
        '[' + new Date().toISOString() + '] DID_FAIL_LOAD code=' + code + ' ' + desc + ' ' + url + '\n'
      )
    } catch (err) {}
    dialog.showErrorBox('页面加载失败', 'code=' + code + '\n' + desc + '\nurl=' + url)
  })

  mainWindow.webContents.on('render-process-gone', (e, details) => {
    try {
      fs.appendFileSync(
        path.join(APP_DIR, '..', 'renderer.log'),
        '[' + new Date().toISOString() + '] RENDER_GONE ' + JSON.stringify(details) + '\n'
      )
    } catch (err) {}
    dialog.showErrorBox('渲染进程崩溃', JSON.stringify(details))
  })

  mainWindow.loadURL('http://127.0.0.1:' + PORT + '/index.html')

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Ctrl+Shift+I 打开 DevTools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key && input.key.toLowerCase() === 'i') {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
      } else {
        mainWindow.webContents.openDevTools()
      }
    }
  })
}

// 先确保服务器监听成功，再创建窗口（避免 loadURL 时服务未就绪）
server.listen(PORT, '127.0.0.1', () => {
  app.whenReady().then(createWindow)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
