#!/usr/bin/env node
/**
 * patch-smm-note-indicator.js
 * ---------------------------------------------------------------
 * 让 simple-mind-map 的「备注标识」(note icon) 在节点带有章节引用
 * (data._mindlink.refs) 时也出现，并使悬停预览能显示被引用内容。
 *
 * 背景（§33 / v2.0.13）：
 *   simple-mind-map 原版 createNoteNode 只在 `data.note` 存在时才渲染
 *   备注图标；本项目把「引用」存到 data._mindlink.refs（与 note 并列的
 *   元数据），导致「插入引用后节点无备注标识、无法预览」。
 *   该修复应落在 simple-mind-map fork 源（0.14.0-fix.3），但本地无 fork
 *   源码，故在 node_modules 侧打补丁。node_modules 不入库且 npm install
 *   会覆盖，因此本脚本在 build_now.sh 的 vue build 之前幂等重放，确保
 *   任意一次全新安装后构建仍包含修复。
 *
 * 本脚本：
 *   1. 定位 web/node_modules/simple-mind-map/src/core/render/node/nodeCreateContents.js
 *   2. 若已含标记则跳过（幂等）
 *   3. 否则把 createNoteNode 的 `if (!this.getData('note')) return null`
 *      替换为「note 或 _mindlink.refs 任一存在即渲染图标」
 */
const fs = require('fs')
const path = require('path')

const SMM = path.resolve(
  __dirname,
  '..',
  'web',
  'node_modules',
  'simple-mind-map',
  'src',
  'core',
  'render',
  'node',
  'nodeCreateContents.js'
)

const MARKER = '备注标识出现的两种情形'

const OLD = `function createNoteNode() {
  if (!this.getData('note')) {
    return null
  }`

const NEW = `function createNoteNode() {
  // 备注标识出现的两种情形：
  //   ① 节点有备注正文 data.note（simple-mind-map 原生）
  //   ② 节点带章节引用 data._mindlink.refs（本项目扩展功能，详见 refData.js；
  //      _mindlink 以下划线前缀，不进样式字段，仅作元数据）
  // 只判 note 会导致"插入引用后节点无备注标识、也无法预览"（用户复现 bug）。
  const note = this.getData('note')
  const ml = this.getData('_mindlink')
  const refs = ml && Array.isArray(ml.refs) ? ml.refs : []
  if (!note && !refs.length) {
    return null
  }`

function main() {
  if (!fs.existsSync(SMM)) {
    console.error('[patch-smm-note-indicator] 未找到 simple-mind-map 源文件，跳过：', SMM)
    process.exit(0)
  }
  const src = fs.readFileSync(SMM, 'utf8')
  if (src.includes(MARKER)) {
    console.log('[patch-smm-note-indicator] 已打补丁，跳过')
    process.exit(0)
  }
  if (!src.includes(OLD)) {
    console.error('[patch-smm-note-indicator] 找不到可替换的目标代码，可能 simple-mind-map 已升级，请人工核对 createNoteNode。')
    process.exit(0)
  }
  const out = src.replace(OLD, NEW)
  fs.writeFileSync(SMM, out, 'utf8')
  console.log('[patch-smm-note-indicator] 已成功打补丁：备注图标现在也会在节点含引用时出现')
  process.exit(0)
}

main()
