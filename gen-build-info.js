// 生成构建指纹：写入 dist/build-info.json 与 electron-app/dist/build-info.json
// 运行实例（web/src/main.js）启动后 fetch('/dist/build-info.json') 并打印到控制台，
// 用于核对"本次改动到底有没有发到正在跑的那份 app.asar"。
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

function gitHash() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch (e) {
    return 'unknown'
  }
}

function version() {
  try {
    return require('./electron-app/package.json').version
  } catch (e) {
    return '0.0.0'
  }
}

const info = {
  version: version(),
  buildTime: new Date().toISOString(),
  gitHash: gitHash()
}
const json = JSON.stringify(info, null, 2)

for (const d of ['dist', 'electron-app/dist']) {
  try {
    fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(path.join(d, 'build-info.json'), json)
    console.log('wrote', d + '/build-info.json ->', json.replace(/\n/g, ' '))
  } catch (e) {
    console.warn('skip', d, e.message)
  }
}
