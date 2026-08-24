const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

const APP_DIR = path.join(__dirname, '..', '..', '思绪思维导图-win32-x64', 'resources', 'app')
const LOG = path.join(__dirname, '..', 'headless_result.txt')
fs.writeFileSync(LOG, '')

function log(m) {
  const line = '[' + new Date().toISOString() + '] ' + m
  fs.appendFileSync(LOG, line + '\n')
  console.log(line)
}

log('require(electron) OK, app type=' + typeof app)

app.whenReady().then(async () => {
  log('app.whenReady OK')
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
      webSecurity: false,
      preload: path.join(APP_DIR, 'preload.js')
    }
  })

  const errors = []
  win.webContents.on('console-message', (e, level, message, line, source) => {
    log('CONSOLE[' + level + '] ' + (source || '') + ':' + (line || '') + ' ' + message)
    if (level >= 2) errors.push((source || '') + ':' + (line || '') + ' ' + message)
  })
  win.webContents.on('did-fail-load', (e, code, desc, url) => {
    log('DID_FAIL_LOAD code=' + code + ' desc=' + desc + ' url=' + url)
  })
  win.webContents.on('render-process-gone', (e, d) => {
    log('RENDER_GONE ' + JSON.stringify(d))
  })

  const indexPath = path.join(APP_DIR, 'index.html')
  log('loadFile -> ' + indexPath)
  try {
    await win.loadFile(indexPath)
    log('loadFile resolved')
  } catch (e) {
    log('loadFile ERR ' + e)
  }

  setTimeout(async () => {
    try {
      const info = await win.webContents.executeJavaScript(
        '(function(){' +
          'var app=document.getElementById("app");' +
          'return {' +
          'appChildCount: app?app.children.length:-1,' +
          'appHTMLLen: app?app.innerHTML.length:-1,' +
          'title: document.title,' +
          'hasContainer: !!document.getElementById("mindMapContainer"),' +
          'sheetTabs: document.querySelectorAll(".sheetTabs").length,' +
          'localApp: window.__LOCAL_APP__' +
          '}' +
          '})()'
      )
      log('DOM_INFO ' + JSON.stringify(info))
    } catch (e) {
      log('EXEC_ERR ' + e.message)
    }
    log('ERRORS_COUNT ' + errors.length)
    if (errors.length) log('FIRST_ERRORS\n' + errors.slice(0, 10).join('\n'))
    log('DONE')
    app.quit()
  }, 7000)
}).catch(e => {
  log('WHENREADY_ERR ' + (e && e.stack || e))
  app.quit()
})

setTimeout(() => {
  log('TIMEOUT_FORCE_QUIT')
  try { process.exit(1) } catch (e) {}
}, 25000)
