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

const mainSrc = fs.readFileSync(path.join(root, 'main.js'), 'utf8')
const asarPath = path.join(root, 'dist-electron', 'win-unpacked', 'resources', 'app.asar')

test('DevTools 快捷键支持 F12（用户按 F12 必须能打开控制台）', () => {
  assert.ok(
    /input\.key\s*===\s*'F12'/.test(mainSrc),
    "main.js 未绑定 F12：before-input-event 分支里必须包含 input.key === 'F12'"
  )
})

test('DevTools 快捷键仍保留 Ctrl+Shift+I（不能为加 F12 丢掉原有入口）', () => {
  assert.ok(
    /toLowerCase\(\)\s*===\s*'i'/.test(mainSrc),
    'main.js 丢失 Ctrl+Shift+I 分支'
  )
  assert.ok(
    /input\.control\s*&&\s*input\.shift/.test(mainSrc),
    'main.js 丢失 Ctrl+Shift 修饰键判断'
  )
})

test('DevTools 切换只在 keyDown 响应（keyDown+keyUp 双触发会「开了又关」，表现为按了没反应）', () => {
  assert.ok(
    /input\.type\s*!==\s*'keyDown'/.test(mainSrc),
    "main.js 必须判断 input.type !== 'keyDown'，否则同一次按键先 openDevTools 再 closeDevTools，用户看到毫无反应"
  )
})

test('app.asar 内的 main.js 已含 F12（防止改了源码却没重打包，F12 在真机上不生效）', () => {
  if (!fs.existsSync(asarPath)) return // 尚未构建 asar 时跳过，避免误报
  const inner = asar.extractFile(asarPath, 'main.js').toString('utf8')
  assert.ok(
    /input\.key\s*===\s*'F12'/.test(inner),
    'asar 内 main.js 不含 F12 绑定：源码已改但 asar 未重打'
  )
})
