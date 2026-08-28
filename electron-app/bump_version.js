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

// 同步 NSIS 安装脚本里的版本号（NSIS 脚本里 !define VERSION 硬编码，需保持一致）
const nsiPath = path.join(__dirname, 'make_installer.nsi')
let nsi = fs.readFileSync(nsiPath, 'utf8')
// 读时去掉 UTF-8 BOM（若有），写回时保留
if (nsi.charCodeAt(0) === 0xFEFF) nsi = nsi.substring(1)
nsi = nsi.replace(/(!define VERSION ")[^"]+(")/, '$1' + pkg.version + '$2')
fs.writeFileSync(nsiPath, '\uFEFF' + nsi, 'utf8')
console.log('[bump_version] NSIS VERSION -> ' + pkg.version)
