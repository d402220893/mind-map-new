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

// F1 演进（2026-09-11 二次修正）：
// 初版在底部加 .noteCodeBar（语言下拉+插入代码块+长提示），用户反馈 UI 难看；
// 且 exec('codeBlock', { language }) 的入参在 WYSIWYG 下不存在、被静默吞掉 → 插入的是无语言代码块。
// 二版直接删掉整条栏改用自带 </> 按钮 → 用户反馈"编程语言选择都没了"（找不到入口）。
// 现行方案：编辑器**上方**一行紧凑工具条 .noteCodeLangBar（无长提示），
// 插入走 ProseMirror 直接建带 language attrs 的 codeBlock 节点，确保语言真的生效。

test('[F1 语言选择] NodeNote.vue 保留紧凑语言工具条，且不再用底部 .noteCodeBar', () => {
  const s = read(new URL('pages/Edit/components/NodeNote.vue', SRC))
  assert.ok(
    !/class=["']noteCodeBar["']/.test(s),
    'NodeNote.vue 不应再含底部 .noteCodeBar（旧版 UI 难看）'
  )
  assert.ok(
    /class=["']noteCodeLangBar["']/.test(s),
    'NodeNote.vue 应含紧凑语言工具条 .noteCodeLangBar'
  )
  assert.ok(
    /codeLangs\s*:/.test(s) && /codeLang:\s*['"]/.test(s),
    'NodeNote.vue 应含 codeLang / codeLangs（语言选择数据）'
  )
  // 语言条必须在编辑器之前（顶部），不能是底部旧样式
  assert.ok(
    s.indexOf('noteCodeLangBar') < s.indexOf('ref="noteEditor"'),
    '语言工具条应位于编辑器上方（旧版在底部被反馈难看）'
  )
})

test('[F1 语言生效] 插入代码块必须把 language 写进 ProseMirror 节点 attrs，禁用 exec payload', () => {
  const s = read(new URL('pages/Edit/components/NodeNote.vue', SRC))
  // 断言只作用于代码：源码注释里会引用被禁用的旧写法（说明为何禁用），需先剥离注释
  const code = s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(l => l.replace(/\/\/.*$/, ''))
    .join('\n')
  assert.ok(
    /insertCodeBlock\s*\(/.test(code),
    'NodeNote.vue 应有 insertCodeBlock 方法'
  )
  // 关键回归：exec('codeBlock', { language }) 在 WYSIWYG 下入参被吞 → 绝不能再用
  assert.ok(
    !/exec\(\s*['"]codeBlock['"]\s*,\s*\{/.test(code),
    '禁用 exec("codeBlock", { language })：WYSIWYG 无此 payload，会被静默吞掉（旧 bug）'
  )
  // 正确实现：schema.nodes.codeBlock.create({ language }) + dispatch
  assert.ok(
    /nodes\.codeBlock\.create\(\s*\{\s*language/.test(code),
    '必须用 schema.nodes.codeBlock.create({ language }) 把语言写进节点 attrs'
  )
  assert.ok(
    /replaceSelectionWith\(/.test(code),
    '必须用 replaceSelectionWith 把代码块插入光标处'
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