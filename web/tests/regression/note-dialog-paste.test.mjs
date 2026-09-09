// 回归：备注窗口支持粘贴图片，且粘贴进备注时不会同时进节点。
// 修复：Edit.vue 的 onPaste 在「修改备注」对话框（class="nodeNoteDialog"）
// 内部 early-return，让 Toast UI Editor 自己把图片转 base64 插入到备注。
// 不修这个会让 window 捕获阶段的 onPaste 抢走图片插到节点，造成双重插入。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = new URL('../../src/', import.meta.url)

function read(p) {
  return readFileSync(new URL(p, import.meta.url), 'utf8')
}

test('[备注粘贴图片] Edit.vue onPaste 在 .nodeNoteDialog 焦点/target 内 early-return', () => {
  const vue = read(new URL('pages/Edit/components/Edit.vue', SRC))
  // 抓 onPaste 方法体（缩进 4 空格的 `}` 收尾）
  const m = vue.match(/async onPaste\([^)]*\)\s*\{([\s\S]*?)\n\s{4}\}/)
  assert.ok(m, '找不到 Edit.vue 的 onPaste 方法体')
  const body = m[1]
  assert.ok(
    /\.nodeNoteDialog/.test(body),
    'onPaste 必须含 .nodeNoteDialog 闭包检查（避免备注里粘贴图片被同时插入节点）'
  )
  // 闭包检查必须在 clipboardData 解析之前 —— 否则图片已被识别，节点抢插仍会发生
  const closeIdx = body.indexOf('.nodeNoteDialog')
  const cdIdx = body.indexOf('clipboardData')
  assert.ok(
    closeIdx > 0 && cdIdx > 0 && closeIdx < cdIdx,
    '.nodeNoteDialog 检查必须在 clipboardData 之前（早退让出）'
  )
})

test('[备注类名锚点] NodeNote 模板根 el-dialog 保留 class="nodeNoteDialog" 锚点', () => {
  const note = read(new URL('pages/Edit/components/NodeNote.vue', SRC))
  assert.ok(
    /class="nodeNoteDialog"/.test(note),
    'NodeNote 模板根 el-dialog 必须保留 .nodeNoteDialog 类名（Edit.vue 据此识别备注对话框）'
  )
})
