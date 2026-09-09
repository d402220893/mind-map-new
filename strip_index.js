const fs = require('fs')
const root = 'E:/03_学习文件/mind-map-main'
let out = fs.readFileSync(root + '/dist/index.html', 'utf8')
// 彻底剥离 51.la 流量统计跟踪脚本（隐私）：移除任何含 51.la / LA.init / LA_COLLECT 的
// <script>（含外部 src 加载器与内联 init 调用），不依赖具体缩进/包裹结构。
out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) =>
  /51\.la|LA\.init|LA_COLLECT/i.test(m) ? '' : m
)
// 根 index.html（asar 根入口，非实际伺服）
fs.writeFileSync(root + '/electron-app/index.html', out, 'utf8')
// asar 内实际伺服的 dist/index.html（build_now.sh 第[2/5]步已 cp 进来）：必须同样剥离，
// 否则 51.la 仍随 asar 泄漏（旧版只剥了根 index.html，漏了这份）。
const distIdx = root + '/electron-app/dist/index.html'
if (fs.existsSync(distIdx)) fs.writeFileSync(distIdx, out, 'utf8')
console.log('extern=', /externalPublicPath/.test(out), 'takeOverApp=', /takeOverApp/.test(out), 'LA=', /LA\.init/.test(out))
