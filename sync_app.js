// 同步构建产物到 Electron 应用目录，并生成“去 51.la 分析 SDK”的安装页 index.html。
// 原因：public/index.html 模板含 //sdk.51.la 外链脚本，离线启动时该脚本加载失败会触发
// 渲染进程 console error，进而弹出应用内置的“页面脚本错误”对话框。安装/离线场景必须剥离。
const fs = require('fs')
const path = require('path')

const ROOT = __dirname
const srcDist = path.join(ROOT, 'dist')
// NSIS 路径：electron-app 会被 electron-builder 整体打包进 resources/app，
// 运行时 APP_DIR === electron-app 目录，因此前端产物同步到 electron-app/dist，
// 入口 index.html（去 SDK）生成到 electron-app/index.html。
const appDir = path.join(ROOT, 'electron-app')
const appDist = path.join(appDir, 'dist')
const appIndex = path.join(appDir, 'index.html')

function strip51la(html) {
  let out = html
  // 1) 移除外链分析脚本 <script ... src="//sdk.51.la..."></script>
  //    用明确的 id="LA_COLLECT" 锚定，避免劫持其他外链脚本
  out = out.replace(/<script[^>]*id=["']LA_COLLECT["'][^>]*><\/script>/gi, '')
  // 2) 移除内联的 LA.init({...}) 脚本块。
  //    起点必须是 <script> 后紧跟 try {，防止非贪婪跨多 script 段误删
  //    window.externalPublicPath / window.takeOverApp 等关键运行期变量。
  out = out.replace(/<script>\s*try\s*\{[\s\S]*?LA\.init[\s\S]*?\}\s*catch[\s\S]*?\}\s*<\/script>/gi, '')
  return out
}

function main() {
  if (!fs.existsSync(srcDist)) {
    console.error('源 dist 不存在：', srcDist)
    process.exit(1)
  }

  // 清空旧 app/dist 后整体复制，避免残留旧 hash 文件。
  // 部分沙箱环境会拦截 fs.rmSync 递归删除，这里 try/catch 兜底：
  // 即便删除失败，下面的 cpSync 也会覆盖同名文件（残留的过期文件不会被 index.html
  // 引用，无害），不因删除被拦而中断整个同步。
  try {
    fs.rmSync(appDist, { recursive: true, force: true })
  } catch (e) {
    console.warn('清空 app/dist 失败（沙箱拦截？），将直接覆盖：', e.message)
  }
  fs.cpSync(srcDist, appDist, { recursive: true })
  console.log('已同步 dist ->', appDist)

  // 生成去 SDK 的 app/index.html。
  // 蓝本优先级：dist/index.html（copy.js 现已保留）→ 否则回退项目根 index.html
  //（copy.js 会把 dist/index.html 复制到项目根，旧构建链可能只留项目根那份）。
  let srcIndex = path.join(srcDist, 'index.html')
  if (!fs.existsSync(srcIndex)) {
    const fallback = path.join(ROOT, 'index.html')
    if (fs.existsSync(fallback)) {
      console.warn('dist/index.html 缺失，回退使用项目根 index.html')
      srcIndex = fallback
    } else {
      console.error('源 index.html 不存在：', srcIndex, ' 且项目根也无 index.html')
      process.exit(1)
    }
  }
  const raw = fs.readFileSync(srcIndex, 'utf8')
  const clean = strip51la(raw)
  if (/sdk\.51\.la/i.test(clean) || /LA\.init/i.test(clean)) {
    console.warn('警告：index.html 中可能仍残留 51.la 分析代码，请检查。')
  }
  // 守卫：确保 stripping 没有把运行期关键 script 段一起吞掉
  // （例如 externalPublicPath / takeOverApp，漏删会导致 webpack chunk 路径全错）
  for (const probe of ['externalPublicPath', 'takeOverApp']) {
    if (/externalPublicPath/.test(clean) !== /externalPublicPath/.test(raw) ||
        /takeOverApp/.test(clean) !== /takeOverApp/.test(raw)) {
      console.error('校验失败：strip51la 删掉了关键 script 段（' + probe + '）。')
      process.exit(3)
    }
  }
  fs.writeFileSync(appIndex, clean, 'utf8')
  console.log('已生成（去 SDK）app/index.html')

  // 校验 app/index.html 引用的资源 hash 是否与 app/dist 中实际文件匹配
  const refs = [...clean.matchAll(/(?:src|href)="(dist\/[^"?]+)(?:\?[^"]*)?"/g)].map(m => m[1])
  let missing = 0
  for (const r of refs) {
    if (!fs.existsSync(path.join(appDir, r))) {
      console.warn('  缺失资源：', r)
      missing++
    }
  }
  if (missing === 0) console.log('资源引用校验通过（' + refs.length + ' 个引用全部存在）')
  else { console.error('存在 ' + missing + ' 个缺失资源！'); process.exit(2) }
}

main()
