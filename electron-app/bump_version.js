// 出包前自增小版本号（patch +1），使 NSIS 安装包能自动卸载旧版本覆盖安装。
// 用法: node bump_version.js
const fs = require('fs')
const path = require('path')

const pkgPath = path.join(__dirname, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

const cur = String(pkg.version || '1.0.0')
const parts = cur.split('.').map(n => parseInt(n, 10) || 0)
// 递增最小版本号（patch），如 1.0.0 -> 1.0.1
parts[2] = (parts[2] || 0) + 1
pkg.version = parts.join('.')

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
console.log('[bump_version] ' + cur + ' -> ' + pkg.version)
