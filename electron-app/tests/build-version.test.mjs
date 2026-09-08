import { test } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const pkgPath = path.join(root, 'package.json')
const nsiPath = path.join(root, 'make_installer.nsi')
const distDir = path.join(root, 'dist')
const asarPath = path.join(root, 'dist-electron', 'win-unpacked', 'resources', 'app.asar')

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

test('package.json 与 make_installer.nsi 的版本号一致', () => {
  const nsi = fs.readFileSync(nsiPath, 'utf8')
  const m = nsi.match(/!define\s+VERSION\s+"([^"]+)"/)
  assert.ok(m, 'make_installer.nsi 中找不到 !define VERSION')
  assert.strictEqual(
    m[1],
    pkg.version,
    `版本不一致：nsi=${m[1]} / package.json=${pkg.version}`
  )
})

test('app.asar 内版本号与 package.json 一致（防止过期 asar 被打进安装包）', () => {
  if (!fs.existsSync(asarPath)) return // 尚未构建 asar 时跳过，避免误报
  const inner = JSON.parse(asar.extractFile(asarPath, 'package.json').toString('utf8'))
  assert.strictEqual(
    inner.version,
    pkg.version,
    `asar 内版本 ${inner.version} ≠ package.json ${pkg.version}：源码已改但 asar 没重打`
  )
})

test('app.asar 的打包时间不早于 dist（dist 重编后必须重打 asar）', () => {
  if (!fs.existsSync(asarPath) || !fs.existsSync(distDir)) return
  const asarM = fs.statSync(asarPath).mtimeMs
  const distM = fs.statSync(distDir).mtimeMs
  assert.ok(
    asarM >= distM,
    `app.asar(${(asarM / 1000) | 0}) 比 dist(${(distM / 1000) | 0}) 旧：` +
      'dist 已重新构建，必须重新 asar pack 再出安装包'
  )
})
