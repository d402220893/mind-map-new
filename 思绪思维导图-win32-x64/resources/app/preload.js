// 声明本应用为本地客户端，用于屏蔽“网页版仅供试用，请下载客户端”等提示。
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('__LOCAL_APP__', true)

// 暴露给渲染进程的安全文件操作接口（通过 IPC 与主进程通信，
// 渲染进程本身 nodeIntegration=false，不能直接访问 fs/dialog）。
contextBridge.exposeInMainWorld('smmApi', {
  // 另存为：弹出保存对话框并写文件，返回 { canceled, filePath, error }
  saveWorkbook: (content, defaultName) =>
    ipcRenderer.invoke('smm:save-workbook', { content, defaultName }),
  // 直接写入已有路径（覆盖保存用）
  writeFile: (filePath, content) =>
    ipcRenderer.invoke('smm:write-file', { filePath, content }),
  // 打开：弹出打开对话框并读内容，返回 { canceled, filePath, content, error }
  openWorkbookDialog: () => ipcRenderer.invoke('smm:open-workbook'),
  // 按路径读文件（备用）
  readFile: filePath => ipcRenderer.invoke('smm:read-file', { filePath }),
  // 设置窗口标题（用于直观显示当前文件路径）
  setTitle: title => ipcRenderer.invoke('smm:set-title', title),
  // 监听主进程菜单命令（保存/另存为/打开）
  onMenuCommand: cb => {
    ipcRenderer.on('smm:menu-command', (e, cmd) => cb(cmd))
  }
})
