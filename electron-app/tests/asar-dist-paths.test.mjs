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
const asarPath = path.join(root, 'dist-electron', 'win-unpacked', 'resources', 'app.asar')

// v1.0.46 白屏回归守卫：
//   出包步骤若用 `cp -r electron-app/dist/. app/`（带点），会把 dist 内容摊平到 app/ 根，
//   导致 asar 内没有 `dist/` 子目录。根 index.html 引用的 `dist/css/...`、`dist/js/...`
//   全部 404 → vue 不 mount → 启动后白屏。
//   正确写法是 `cp -r electron-app/dist app/`（无点），产出 `app/dist/`。
//   下列断言确保 asar 内 dist 路径完整，作为 fail-loud 守门。

test('asar 内必须含 dist/ 子目录（v1.0.46 白屏回归守卫）', () => {
  if (!fs.existsSync(asarPath)) return
  const entries = asar.listPackage(asarPath)
  const hasDistDir = entries.some(e => e === 'dist' || e === '\\dist' || /\\dist$/.test(e))
  assert.ok(
    hasDistDir,
    'asar 缺少 dist/ 子目录：根 index.html 引用 dist/css, dist/js 将全部 404 → 白屏。' +
      '出包时必须用 `cp -r electron-app/dist app/`（无点），不能用 `cp -r electron-app/dist/. app/`。'
  )
})

test('asar 内 dist/js 必须含至少一个 chunk', () => {
  if (!fs.existsSync(asarPath)) return
  const entries = asar.listPackage(asarPath)
  assert.ok(
    entries.some(e => /^\\?dist\\js\\.+\.js$/.test(e)),
    'asar 缺少 dist/js 下的任何 .js chunk（vue/app 入口未打进包）'
  )
})

test('asar 内 dist/css 必须含至少一个 chunk', () => {
  if (!fs.existsSync(asarPath)) return
  const entries = asar.listPackage(asarPath)
  assert.ok(
    entries.some(e => /^\\?dist\\css\\.+\.css$/.test(e)),
    'asar 缺少 dist/css 下的任何 .css chunk（样式未打进包）'
  )
})
