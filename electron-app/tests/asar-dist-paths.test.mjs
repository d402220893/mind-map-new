import { resolveAsar, asarSkip, asarCandidates } from './_asar-path.mjs'
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
// ⚠️ 产物路径必须动态解析：打包链已把 asar 产出改到项目根 _appstage.asar，
// 硬编码 dist-electron 会指向 Sep-11 的 0 字节残留（守卫空转，见 _asar-path.mjs 头注）
const asarPath = resolveAsar()
const asarSkipOpt = { skip: asarSkip() }

// v1.0.46 白屏回归守卫：
//   出包步骤若用 `cp -r electron-app/dist/. app/`（带点），会把 dist 内容摊平到 app/ 根，
//   导致 asar 内没有 `dist/` 子目录。根 index.html 引用的 `dist/css/...`、`dist/js/...`
//   全部 404 → vue 不 mount → 启动后白屏。
//   正确写法是 `cp -r electron-app/dist app/`（无点），产出 `app/dist/`。
//   下列断言确保 asar 内 dist 路径完整，作为 fail-loud 守门。

test('asar 内必须含 dist/ 子目录（v1.0.46 白屏回归守卫）', asarSkipOpt, () => {
  const entries = asar.listPackage(asarPath)
  const hasDistDir = entries.some(e => e === 'dist' || e === '\\dist' || /\\dist$/.test(e))
  assert.ok(
    hasDistDir,
    'asar 缺少 dist/ 子目录：根 index.html 引用 dist/css, dist/js 将全部 404 → 白屏。' +
      '出包时必须用 `cp -r electron-app/dist app/`（无点），不能用 `cp -r electron-app/dist/. app/`。'
  )
})

test('asar 内 dist/js 必须含至少一个 chunk', asarSkipOpt, () => {
  const entries = asar.listPackage(asarPath)
  assert.ok(
    entries.some(e => /^\\?dist\\js\\.+\.js$/.test(e)),
    'asar 缺少 dist/js 下的任何 .js chunk（vue/app 入口未打进包）'
  )
})

test('asar 内 dist/css 必须含至少一个 chunk', asarSkipOpt, () => {
  const entries = asar.listPackage(asarPath)
  assert.ok(
    entries.some(e => /^\\?dist\\css\\.+\.css$/.test(e)),
    'asar 缺少 dist/css 下的任何 .css chunk（样式未打进包）'
  )
})

// ── 守卫自身可信度（2026-09-20 补）──
// 背景：这组守卫曾硬编码 dist-electron/.../app.asar 且写成 `if (!existsSync) return`，
// 而打包链早已改产出到 electron-app/_appstage.asar；旧路径下只剩 Sep-11 的 **0 字节**残留，
// 于是 7 条守卫连续空转数日 —— "永远通过的守卫"比没有守卫更危险（给人虚假安全感）。
test('asar 路径解析器必须命中"存在且非空"的真实产物（防再次指向空壳）', asarSkipOpt, () => {
  assert.ok(asarPath, 'resolveAsar() 必须返回路径（构建完成后）')
  assert.ok(fs.statSync(asarPath).size > 0, 'asar 产物不得为 0 字节：' + asarPath)
  assert.ok(
    asar.listPackage(asarPath).length > 0,
    'asar 必须是可解析的包（0 条目 = 假产物）：' + asarPath
  )
})

test('候选路径里若存在 0 字节 asar，解析器必须跳过它', () => {
  const zero = asarCandidates().filter(p => {
    try { return fs.existsSync(p) && fs.statSync(p).size === 0 } catch { return false }
  })
  for (const p of zero) {
    assert.notStrictEqual(resolveAsar(), p, '0 字节的 asar 不得被当作产物：' + p)
  }
})
