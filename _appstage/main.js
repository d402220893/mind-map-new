const { app, BrowserWindow, dialog } = require('electron')
const fs = require('fs')
const path = require('path')

const APP_DIR = __dirname
// 渲染端报错日志（万一百白屏，把这个文件内容发我即可定位）
const DEBUG_LOG = path.join(APP_DIR, '..', 'renderer.log')

function debugLog(msg) {
  try {
    fs.appendFileSync(DEBUG_LOG, '[' + new Date().toISOString() + '] ' + msg + '\n')
  } catch (e) {}
}

let mainWindow = null
let firstErrorShown = false

function createWindow() {
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

  // 捕获渲染端 JS 报错（白屏最常见原因）
  mainWindow.webContents.on('console-message', (e, level, message, line, source) => {
    if (level >= 2) {
      debugLog('CONSOLE[' + level + '] ' + (source || '') + ':' + (line || '') + ' ' + message)
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
    debugLog('DID_FAIL_LOAD code=' + code + ' desc=' + desc + ' url=' + url)
    dialog.showErrorBox('页面加载失败', 'code=' + code + '\n' + desc + '\nurl=' + url)
  })

  mainWindow.webContents.on('render-process-gone', (e, details) => {
    debugLog('RENDER_GONE ' + JSON.stringify(details))
    dialog.showErrorBox('渲染进程崩溃', JSON.stringify(details))
  })

  mainWindow.loadFile(path.join(APP_DIR, 'index.html'))

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

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
