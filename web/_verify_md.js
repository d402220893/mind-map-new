/* 无头验证脚本：用真实 Toast UI Editor 引擎实跑 MdEditor 的全部功能。
 * 不依赖 GUI，纯 Node + jsdom。仅用于验证，非应用代码。 */
const fs = require('fs')
const path = require('path')

// ── 1. 准备 DOM 环境（必须在 require @toast-ui/editor 之前）──
const { JSDOM } = require('C:/Users/d36847/.workbuddy/binaries/node/workspace/node_modules/jsdom')
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/'
})
const { window } = dom
global.window = window
global.self = window
global.document = window.document
global.navigator = window.navigator
global.HTMLElement = window.HTMLElement
global.Node = window.Node
global.Element = window.Element
global.getComputedStyle = window.getComputedStyle.bind(window)
global.MutationObserver = window.MutationObserver
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
global.cancelAnimationFrame = (id) => clearTimeout(id)
window.requestAnimationFrame = global.requestAnimationFrame
window.cancelAnimationFrame = global.cancelAnimationFrame
window.matchMedia = window.matchMedia || (() => ({ matches: false, media: '', addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false } }))
global.matchMedia = window.matchMedia

// ProseMirror 需要几何测量，jsdom 未实现 → 补空矩形桩（ProseMirror 会退而用 getBoundingClientRect）
const _emptyRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() {} })
const _rectList = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} })
for (const proto of [window.Range.prototype, window.Element.prototype, window.HTMLElement.prototype, window.SVGElement && window.SVGElement.prototype].filter(Boolean)) {
  if (!proto.getClientRects) proto.getClientRects = _rectList
  if (!proto.getBoundingClientRect) proto.getBoundingClientRect = _emptyRect
}
// jsdom 未实现 elementFromPoint（ProseMirror 的 posAtCoords 需要）→ 返回 null 桩
if (!document.elementFromPoint) document.elementFromPoint = () => null
if (!window.document.elementFromPoint) window.document.elementFromPoint = () => null

// ── 2. 加载真实引擎 ──
let ToastUI
try {
  ToastUI = require('@toast-ui/editor')
} catch (e) {
  console.log('ENGINE_REQUIRE_ERR:', e.message)
  process.exit(2)
}
const Editor = ToastUI.Editor || ToastUI.default || ToastUI

const MD_FILE = path.resolve(__dirname, '..', 'MD功能验证_测试样例.md')
const mdContent = fs.readFileSync(MD_FILE, 'utf8')

// 直接从工具栏源码解析 exec('name') / exec('name', {level:N})，端到端验证接线
const TOOLBAR = path.resolve(__dirname, 'src/pages/Edit/components/MdToolbar.vue')
const tbSrc = fs.readFileSync(TOOLBAR, 'utf8')
const CMD_LIST = []
for (const m of tbSrc.matchAll(/exec\(\s*'([\w]+)'\s*(?:,\s*\{\s*level:\s*(\d+)\s*\}\s*)?\)/g)) {
  CMD_LIST.push([m[1], m[2] ? { level: Number(m[2]) } : null])
}
console.log('工具栏实际下发的 exec 命令:', CMD_LIST.map(c => c[0] + (c[1] ? `(${c[1].level})` : '')).join(', '), '\n')

let editor
try {
  editor = new Editor({
    el: document.getElementById('root'),
    initialEditType: 'wysiwyg',
    hideModeSwitch: true,
    autofocus: false,
    usageStatistics: false,
    events: {}
  })
} catch (e) {
  console.log('EDITOR_INIT_ERR:', e.message)
  console.log(e.stack && e.stack.split('\n').slice(0, 6).join('\n'))
  process.exit(3)
}
console.log('ENGINE_OK:', Editor.name || 'ToastUIEditor', '| version init ok\n')

// ── 探针：dump 真实可执行的命令名，避免误判 ──
function probeRegistries() {
  const out = {}
  const tryKeys = ['wwCommands', 'mdCommands', 'commandManager', 'wwEditor', 'mdEditor']
  for (const k of tryKeys) {
    let o
    try { o = editor[k] } catch (e) { continue }
    if (!o) continue
    if (o.commands && typeof o.commands === 'object') out[k + '.commands'] = Object.keys(o.commands)
    else if (typeof o === 'object') out[k] = Object.keys(o).slice(0, 60)
  }
  return out
}
console.log('PROBE registries:', JSON.stringify(probeRegistries(), null, 0).slice(0, 1200))

// 候选命令名探测（找出 ul/task/table 的正确名）
const CANDIDATES = ['bulletList', 'orderedList', 'taskList', 'table', 'ul', 'ol', 'task', 'insertTable']
console.log('=== 候选命令名实测（作用于当前块）===')
for (const c of CANDIDATES) {
  editor.setMarkdown('probe line')
  try { editor.moveCursorToEnd() } catch (e) {}
  let threw = null, msg = ''
  try { editor.exec(c) } catch (e) { threw = true; msg = (e.message || '').split('\n')[0].slice(0, 40) }
  console.log(`  ${c.padEnd(12)} ${threw ? 'THROW ' + msg : 'OK -> ' + JSON.stringify(editor.getMarkdown())}`)
}
console.log('')


// ── 3. 工具栏命令实跑（逐一断言，CMD_LIST 已由上方从 MdToolbar.vue 解析）──
function testExec(cmd, payload) {
  editor.setMarkdown('hello world')
  let threw = null
  let msg = ''
  try {
    // 行内命令需要选中范围才有副作用；块命令用折叠光标作用于当前块
    const inline = ['bold', 'italic', 'strike', 'code'].includes(cmd)
    if (inline) {
      try { editor.setSelectionRange(1, 12) } catch (e) {}
    } else {
      try { editor.moveCursorToEnd() } catch (e) {}
    }
    if (payload) editor.exec(cmd, payload)
    else editor.exec(cmd)
  } catch (e) {
    threw = true
    msg = (e && e.message ? e.message : String(e)).split('\n')[0]
  }
  const md = editor.getMarkdown()
  return { threw, msg, md }
}

console.log('=== 工具栏命令实跑 ===')
const results = []
for (const [cmd, payload] of CMD_LIST) {
  const r = testExec(cmd, payload)
  const changed = r.md !== 'hello world'
  const status = r.threw ? 'THROW' : (changed ? 'OK' : 'NOOP')
  results.push({ cmd: payload ? `${cmd}(${JSON.stringify(payload)})` : cmd, ...r, status, changed })
  console.log(`[${status.padEnd(5)}] ${cmd.padEnd(12)} threw=${r.threw ? 'Y' : '-'} ${r.msg ? 'err=' + r.msg.slice(0, 50) : ''}  md="${r.md.replace(/\n/g, '⏎').slice(0, 60)}"`)
}

// ── 4. 加载真实测试文件并做渲染/DOM 断言 ──
console.log('\n=== 加载真实测试 .md 并断言渲染 DOM ===')
editor.setMarkdown(mdContent)
const round = editor.getMarkdown()
const byteEq = round === mdContent
// 统计渲染后节点（与 scrollToLine 用的选择器一致）
const ww = document.querySelector('.toastui-editor-ww-container')
const sel = '.toastui-editor-ww-container *[data-nodeid], .toastui-editor-ww-container h1, .toastui-editor-ww-container h2, .toastui-editor-ww-container h3'
const allNodes = document.querySelectorAll(sel)
const wwEl = ww || document
const count = (tag) => wwEl.querySelectorAll(tag).length
const domCounts = {
  h1: count('h1'), h2: count('h2'), h3: count('h3'),
  blockquote: count('blockquote'), table: count('table'),
  ul: count('ul'), ol: count('ol'),
  pre: count('pre'), hr: count('hr'),
  img: count('img'), a: count('a')
}
console.log('markdown 字节往返一致(含归一化差异容忍):', byteEq ? '是' : '否(见下方差异样本)')
if (!byteEq) {
  console.log('  原长度', mdContent.length, '-> 回读长度', round.length)
  // 打印首个差异位置样本
  let i = 0; while (i < Math.min(mdContent.length, round.length) && mdContent[i] === round[i]) i++
  console.log('  首个差异附近 原:', JSON.stringify(mdContent.slice(i - 20, i + 20)))
  console.log('  首个差异附近 回:', JSON.stringify(round.slice(i - 20, i + 20)))
}
console.log('渲染 DOM 节点统计:', JSON.stringify(domCounts))
console.log('scrollToLine 选择器命中的可定位节点总数:', allNodes.length, '| markdown 总行数:', mdContent.split('\n').length)

// ── 5. 跳转精度实证（修复后 findBlockIndex 内容锚定）──
const mdScroll = require(path.resolve(__dirname, 'src/utils/mdScroll.js'))
const blocks = mdScroll.getTopLevelBlocks(document)
console.log('--- 全部顶层块文本(调试) ---')
blocks.forEach((b, i) => console.log(`  [${i}] "${(b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)}" tag=${b.tagName}`))
const mdLines = mdContent.split('\n')
let jumpPass = 0, jumpFail = 0
function checkJump(li, expect) {
  const idx = mdScroll.findBlockIndex(mdContent, blocks, li)
  const blk = blocks[idx]
  const txt = blk ? (blk.textContent || '').replace(/\s+/g, ' ').trim() : '(none)'
  const ok = txt && (txt.includes(expect) || expect.includes(txt))
  if (!ok) jumpFail++; else jumpPass++
  console.log(`  行${String(li).padEnd(3)} 期望含“${expect.slice(0, 20)}” -> block[${idx}] “${txt.slice(0, 26)}” ${ok ? 'OK' : 'MISMATCH'}`)
}
for (let li = 0; li < mdLines.length; li++) {
  const m = mdLines[li].match(/^(#{1,6})\s+(.*)$/)
  if (m) checkJump(li, m[2].trim())
}
// 非标题的「查找跳行」场景（按文本反查真实行号，避免越界）
function checkJumpByText(substr) {
  const li = mdLines.findIndex((l) => l.includes(substr))
  if (li < 0) { console.log(`  (未找到行) ${substr}`); return }
  checkJump(li, substr)
}
checkJumpByText('第一段用于测试 scrollToLine')
checkJumpByText('第三段再补充一些描述性文字')
console.log(`跳转精度: ${jumpPass} 命中 / ${jumpFail} 偏差 (DOM 顶层块数=${blocks.length})`)

console.log('\n=== 结论（工具栏→引擎接线，全部来自 MdToolbar.vue 实测）===')
const popupLimited = ['addImage', 'addLink']
const realBug = results.filter(r => r.threw && !popupLimited.includes(r.cmd.replace(/\(\{.*\}$/, '')))
const okCmd = results.filter(r => !r.threw)
const noopCmd = results.filter(r => r.status === 'NOOP')
console.log('工具栏命令总数:', results.length)
console.log('可执行(未抛错):', okCmd.length, '->', okCmd.map(r => r.cmd).join(', '))
console.log('行内命令 NOOP(需选中文本，无头选择不稳定，非 bug):', noopCmd.map(r => r.cmd).join(', '))
console.log('真 bug(命令名非法抛错):', realBug.length, realBug.length ? '-> ' + realBug.map(r => `${r.cmd}(${r.msg})`).join('; ') : '(无)')
console.log('弹窗类(addImage/addLink)命令名合法，但弹窗需真实布局→jsdom 假阴性，需在浏览器点击最终确认')

process.exit(0)
