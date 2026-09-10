// 回归：F2 备注图片双击缩放查看器
// 修复前：图片双击只挂在 NodeNoteContentShow（悬停浮层）里的 noteContentWrap 上，
// 编辑框/侧栏里的图片双击根本没反应；并且 F2 lightbox 分散在两个组件内、回收不全。
// 重构后：提取独立组件 NoteImgLightbox.vue，挂在 Edit.vue 内、全局监听 document.dblclick，
// 命中 IMG 且 target.closest 落在 .nodeNoteDialog / .noteContentViewer / .sidebarContainer 之一
// 即打开 —— 编辑框、悬停浮层、侧栏三处都能用。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'

const SRC = new URL('../../src/', import.meta.url)

function read(p) {
  return readFileSync(new URL(p, import.meta.url), 'utf8')
}

test('[F2] NoteImgLightbox.vue 独立组件存在', () => {
  const p = new URL('pages/Edit/components/NoteImgLightbox.vue', SRC)
  assert.ok(statSync(p).isFile(), 'NoteImgLightbox.vue 必须作为单文件组件存在')
})

test('[F2] NoteImgLightbox 全局监听 document dblclick + 命中 IMG + closest 三个宿主', () => {
  const s = read(new URL('pages/Edit/components/NoteImgLightbox.vue', SRC))
  assert.ok(
    /document\.addEventListener\(\s*['"]dblclick['"]/.test(s),
    'NoteImgLightbox 必须在 document 上监听 dblclick'
  )
  assert.ok(
    /\b\w+\.tagName\s*(?:!==|===)\s*['"]IMG['"]/.test(s),
    'NoteImgLightbox 必须用 .tagName === "IMG"（或 !== "IMG"）判断目标'
  )
  assert.ok(
    /\.nodeNoteDialog/.test(s) &&
      /\.noteContentViewer/.test(s) &&
      /\.sidebarContainer/.test(s),
    'hostSelector 必须包含 .nodeNoteDialog / .noteContentViewer / .sidebarContainer（编辑框 / 浮层 / 侧栏 三处宿主）'
  )
  assert.ok(
    /\.closest\(/.test(s),
    'NoteImgLightbox 必须用 closest() 命中宿主（事件冒泡 / 嵌套层级）'
  )
})

test('[F2] NoteImgLightbox 拦截默认行为 + 缩放/拖拽/Esc 关闭齐全', () => {
  const s = read(new URL('pages/Edit/components/NoteImgLightbox.vue', SRC))
  assert.ok(/preventDefault\s*\(\s*\)/.test(s), '必须 preventDefault 拦截 Toast UI 默认图片双击')
  assert.ok(/stopPropagation\s*\(\s*\)/.test(s), '必须 stopPropagation 防止多次弹层')
  assert.ok(/Math\.min\(this\.scale\s*\*\s*1\.2/.test(s), '放大逻辑（zoomIn）')
  assert.ok(/Math\.max\(this\.scale\s*\/\s*1\.2/.test(s), '缩小逻辑（zoomOut）')
  assert.ok(/['"]Escape['"]/.test(s), 'Esc 关闭 lightbox')
})

test('[F2] Edit.vue 模板 mount NoteImgLightbox', () => {
  const s = read(new URL('pages/Edit/components/Edit.vue', SRC))
  assert.ok(
    /<NoteImgLightbox[^/]*\/?>/.test(s),
    'Edit.vue 模板必须包含 <NoteImgLightbox>（保证全局只挂一份）'
  )
  assert.ok(
    /import\s+NoteImgLightbox\s+from\s+['"]\.\/NoteImgLightbox\.vue['"]/.test(s),
    'Edit.vue 必须 import NoteImgLightbox'
  )
  assert.ok(
    /\bNoteImgLightbox\b/.test(
      s.match(/components:\s*\{[\s\S]*?\}/)[0]
    ),
    'Edit.vue components 必须注册 NoteImgLightbox'
  )
})

test('[F2] NodeNoteContentShow.vue 不再内联 lightbox（已抽出到 NoteImgLightbox）', () => {
  const s = read(new URL('pages/Edit/components/NodeNoteContentShow.vue', SRC))
  // 只查脚本里的实现调用，不查注释（注释里提到组件名是合理的）
  const scriptMatch = s.match(/<script[\s\S]*?<\/script>/)
  const script = scriptMatch ? scriptMatch[0] : ''
  assert.ok(
    !/noteImgLightbox/.test(script),
    'NodeNoteContentShow.vue 脚本不应再出现 noteImgLightbox（已抽出独立组件）'
  )
  assert.ok(
    !/openLightbox|closeLightbox|onWheel|onDragStart/.test(script),
    'NodeNoteContentShow.vue 脚本不应再含 lightbox 状态/缩放/拖拽方法（已抽出）'
  )
})

// F1：F1 之前为"插入代码块"按钮外加的 .noteCodeBar 被用户反馈 UI 难看，
// 且 exec('codeBlock', { language }) 的入参错（WYSIWYG 没有该 payload）导致按钮失效。
// 重构后：删除底部 .noteCodeBar / codeLang / insertCodeBlock，使用 Toast UI 自带工具栏的 </> 按钮。

test('[F1 回退] NodeNote.vue 移除底部 .noteCodeBar 工具栏（UI 难看+功能失效）', () => {
  const s = read(new URL('pages/Edit/components/NodeNote.vue', SRC))
  assert.ok(
    !/class=["']noteCodeBar["']/.test(s),
    'NodeNote.vue 不应再含底部 .noteCodeBar 工具栏（用 Toast UI 自带工具栏的 </> 按钮）'
  )
  assert.ok(
    !/insertCodeBlock/.test(s),
    'NodeNote.vue 不应再含 insertCodeBlock 方法（exec 入参错；改由自带工具栏触发）'
  )
  assert.ok(
    !/codeLang\b/.test(s),
    'NodeNote.vue 不应再含 codeLang / codeLangs data'
  )
})

test('[F1 保留] NodeNote.vue 仍是 wysiwyg 单栏实时渲染', () => {
  const s = read(new URL('pages/Edit/components/NodeNote.vue', SRC))
  assert.ok(
    /initialEditType:\s*['"]wysiwyg['"]/.test(s),
    'NodeNote.vue 仍需 initialEditType:"wysiwyg"（F1 单栏实时渲染核心）'
  )
  assert.ok(
    /hideModeSwitch:\s*true/.test(s),
    'NodeNote.vue 仍需 hideModeSwitch:true（去掉模式切换标签）'
  )
  assert.ok(
    /codeSyntaxHighlight/.test(s),
    'NodeNote.vue 仍需 codeSyntaxHighlight 插件（代码块按语言实时上色）'
  )
})