// asar-modules.test.mjs
//
// 防止主进程 require 的本地模块漏打进 app.asar（v1.0.37 教训：
// "extract 旧 asar + 只 cp 改动文件" 的快捷方式漏掉了 fileArgs.js，
// 导致安装后双击启动弹 "Cannot find module './fileArgs'"）。
//
// 解析 main.js 里所有 require('./xxx') / require('../xxx') 的相对路径，
// 对每个本地模块验证它在 app.asar 内存在。
//
// 约束：
//   - 只解析字面量 require（够覆盖本项目主进程所有本地依赖；v1.0.37 的 fileArgs.js
//     正是字面量 require）；
//   - 不解析字符串拼接 / 动态 require（主进程无此用法，未来若有再扩展）。
//
// v1.0.18 调整：v1.0.18 简化版主进程仅 require './install-meta'（无需 fileArgs，因为
// 文件关联是 v1.0.34+ 才引入的子模块）。脚本以「所有字面 require 都进 asar」为最强约束，
// 不强求 rels.length 下限，也不强求 fileArgs 在场（用 relaxNg 更严：manual 跟踪若
// 真加 fileArgs 请升级该测试）。

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

// 从 JS 源码里抽出 require('./xxx') / require('../xxx') 的相对路径
function extractLocalRequires(src) {
  const re = /require\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g
  const out = []
  let mm
  while ((mm = re.exec(src)) !== null) out.push(mm[1])
  return out
}

// 把 ./xxx / ../xxx 解析成相对 asar 根的 POSIX 路径（asar 内部统一用正斜杠）。
// 关键：Node 的 require('./xxx') 会自动补 .js 后缀，本函数也要补，否则会把
// `./install-meta` 误判为不存在（实际是 install-meta.js），v1.0.37 的 fileArgs.js
// 教训正是这种"require 字面量缺扩展名"的漏检。若已带扩展名则原样保留。
function toAsarRelPath(fromFile, rel) {
  const fromDir = path.posix.dirname(fromFile) // main.js/preload.js 都在 asar 根，dirname === ''
  const normalized = path.posix.normalize(path.posix.join(fromDir, rel)).replace(/\\/g, '/')
  if (path.posix.extname(normalized) === '') return normalized + '.js'
  return normalized
}

function asarHas(asarPath, relPath) {
  try {
    asar.extractFile(asarPath, relPath)
    return true
  } catch {
    return false
  }
}

const haveAsar = fs.existsSync(asarPath)

test('main.js 的所有本地 require 都在 asar 内（防 fileArgs.js 类漏打包回归）', (t) => {
  if (!haveAsar) {
    return assert.fail(
      'app.asar 尚未构建（路径：dist-electron/win-unpacked/resources/app.asar），请先 vue build + asar pack'
    )
  }
  const mainSrc = asar.extractFile(asarPath, 'main.js').toString('utf8')
  const rels = extractLocalRequires(mainSrc)
  // v1.0.18 简化版主进程仅一个本地 require（install-meta）。不强求 >= 2。
  assert.ok(
    rels.length >= 1,
    'main.js 应至少有 1 个本地 require（v1.0.18 仅 install-meta），实际：' + rels.length + ' 个：' + rels.join(', ')
  )
  // install-meta 是安装器 exe 名契约，v1.0.18 必须存在。
  assert.ok(
    rels.includes('./install-meta'),
    'main.js 必须 require("./install-meta")（安装器 exe 名契约）'
  )
  const missing = rels.filter(r => !asarHas(asarPath, toAsarRelPath('main.js', r)))
  assert.deepStrictEqual(
    missing,
    [],
    'main.js require 的以下本地模块不在 asar 内：[' + missing.join(', ') +
      ']；必须用「全量从 electron-app 同步到 resources/app 再 asar pack」而非 extract+copy 快捷方式'
  )
})