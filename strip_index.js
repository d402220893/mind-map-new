const fs = require('fs')
const root = 'E:/03_学习文件/mind-map-main'
let out = fs.readFileSync(root + '/dist/index.html', 'utf8')
out = out.replace(/<script[^>]*id=["']LA_COLLECT["'][^>]*><\/script>/gi, '')
out = out.replace(/<script>\s*try\s*\{[\s\S]*?LA\.init[\s\S]*?\}\s*catch[\s\S]*?\}\s*<\/script>/gi, '')
fs.writeFileSync(root + '/electron-app/index.html', out, 'utf8')
console.log('extern=', /externalPublicPath/.test(out), 'takeOverApp=', /takeOverApp/.test(out), 'LA=', /LA\.init/.test(out))
