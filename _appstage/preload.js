// 声明本应用为本地客户端，用于屏蔽“网页版仅供试用，请下载客户端”等提示。
const { contextBridge } = require('electron')
contextBridge.exposeInMainWorld('__LOCAL_APP__', true)
