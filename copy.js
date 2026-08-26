const fs = require('fs')
const path = require('path')

const src = path.resolve(__dirname, './dist/index.html') 
const dest = path.resolve(__dirname, './index.html') 

if (fs.existsSync(dest)) {
    fs.unlinkSync(dest)
}

if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest)
    // 注意：不再删除 dist/index.html。
    // 旧逻辑会在复制后 unlinkSync(src)，导致 dist/index.html 被删，
    // 后续 sync_app.js（以 dist/index.html 为蓝本生成去 SDK 的 electron-app/index.html）
    // 拿不到入口而失败。保留它不影响 copy.js 把入口同步到项目根 index.html 的本职。
}

// console.warn('请检查付费插件是否启用！！！')