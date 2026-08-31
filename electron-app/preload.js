// 声明本应用为本地客户端，用于屏蔽“网页版仅供试用，请下载客户端”等提示。
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('__LOCAL_APP__', true)

// 暴露给渲染进程的安全文件操作接口（通过 IPC 与主进程通信，
// 渲染进程本身 nodeIntegration=false，不能直接访问 fs/dialog）。
contextBridge.exposeInMainWorld('smmApi', {
  // 另存为：弹出保存对话框并写文件，返回 { canceled, filePath, error }
  // defaultPath 为完整默认路径（含目录和文件名），优先于 defaultName
  saveWorkbook: (content, defaultPath) =>
    ipcRenderer.invoke('smm:save-workbook', { content, defaultPath }),
  // 直接写入已有路径（覆盖保存用，异步）
  writeFile: (filePath, content) =>
    ipcRenderer.invoke('smm:write-file', { filePath, content }),
  // 同步覆盖写入（供渲染进程 beforeunload 在同步上下文中落盘；
  // 异步 invoke 在窗口关闭前往往来不及完成导致丢文件，故此处用 sendSync）
  writeFileSync: (filePath, content) =>
    ipcRenderer.sendSync('smm:write-file-sync', { filePath, content }),
  // 打开：弹出打开对话框并读内容，返回 { canceled, filePath, content, error }
  openWorkbookDialog: () => ipcRenderer.invoke('smm:open-workbook'),
  // 按路径读文件（备用）
  readFile: filePath => ipcRenderer.invoke('smm:read-file', { filePath }),
  // 重命名本地文件：返回 { ok, newPath, exists, error }
  renameFile: (oldPath, newPath) =>
    ipcRenderer.invoke('smm:rename-file', { oldPath, newPath }),
  // 设置窗口标题（用于直观显示当前文件路径）
  setTitle: title => ipcRenderer.invoke('smm:set-title', title),
  // 自定义标题栏窗口控制
  windowControls: {
    minimize: () => ipcRenderer.invoke('smm:window-minimize'),
    maximize: () => ipcRenderer.invoke('smm:window-maximize'),
    close: () => ipcRenderer.invoke('smm:window-close'),
    getState: () => ipcRenderer.invoke('smm:window-state')
  },
  // 导入本地文件：弹出打开对话框并读取原始字节，返回 { canceled, filePath, buffer }
  // exts: 扩展名数组，如 ['smm','json','xmind','md','emmx']
  importFileDialog: (exts, title) => ipcRenderer.invoke('smm:import-file', { exts, title }),
  // 监听主进程菜单命令（保存/另存为/打开/导入）
  onMenuCommand: cb => {
    ipcRenderer.on('smm:menu-command', (e, cmd) => cb(cmd))
  },
  // ===== 安装向导 IPC =====
  installGetDefaultPath: () => ipcRenderer.invoke('install:get-default-path'),
  installBrowse: () => ipcRenderer.invoke('install:browse'),
  installDo: (targetDir, opts) => ipcRenderer.invoke('install:do', { targetDir, opts }),
  installQuit: () => ipcRenderer.invoke('install:quit'),
  onInstallProgress: cb => {
    ipcRenderer.on('install:progress', (e, p) => cb(p))
  },
  onInstallDone: cb => {
    ipcRenderer.on('install:done', (e, r) => cb(r))
  }
})
