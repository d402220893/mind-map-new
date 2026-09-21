// 回归：视图层接线（§7.10–7.17 / §8）的源码级守卫。
// 目的：防止后续改动把「视图 ⇄ 服务层」的接线悄悄拆掉（这会让整个 md↔导图双链功能
// 在打包后"看起来没变化"——因为未被引用的模块会被 tree-shake 掉）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'

const SRC = new URL('../../src/', import.meta.url)
const read = p => readFileSync(new URL(p, SRC), 'utf8')

const NEW_VIEWS = [
  'pages/Edit/components/MdEditor.vue',
  'pages/Edit/components/WorkspacePanel.vue',
  'pages/Edit/components/RefBlock.vue',
  'pages/Edit/components/SectionPicker.vue',
  'pages/Edit/components/ConflictDialog.vue',
  'pages/Edit/components/StatusBar.vue',
  'pages/Edit/components/MdToolbar.vue',
  'pages/Edit/components/MdOutline.vue',
  'pages/Edit/components/MindMapPreview.vue'
]

test('[视图接线] 新增视图组件全部存在', () => {
  for (const p of NEW_VIEWS) {
    assert.ok(existsSync(new URL(p, SRC)), '缺少组件：' + p)
  }
})

test('[视图接线] 新增视图不直连 services/io，且不直调 window.smmApi', () => {
  for (const p of NEW_VIEWS) {
    const src = read(p)
    assert.ok(!/from\s+['"][^'"]*services\/io\//.test(src), p + ' 直连了 services/io')
    assert.ok(!/\bwindow\.smmApi\b/.test(src), p + ' 直调了 window.smmApi（须走 workspaceBridge）')
  }
})

test('[视图接线] 新增视图经 @/utils/workspaceBridge 访问服务', () => {
  const bridged = NEW_VIEWS.filter(p => /from\s+['"]@\/utils\/workspaceBridge['"]/.test(read(p)))
  // 纯展示组件（MdToolbar / MdOutline / StatusBar 部分）可只走 $bus，但至少主体必须接桥
  for (const must of ['pages/Edit/components/MdEditor.vue', 'pages/Edit/components/WorkspacePanel.vue', 'pages/Edit/components/RefBlock.vue']) {
    assert.ok(bridged.includes(must), must + ' 未接 workspaceBridge')
  }
})

test('[视图接线] NodeNote 内嵌 RefBlock / SectionPicker / ConflictDialog', () => {
  const src = read('pages/Edit/components/NodeNote.vue')
  for (const c of ['RefBlock', 'SectionPicker', 'ConflictDialog']) {
    assert.ok(new RegExp('import\\s+' + c + '\\s+from').test(src), 'NodeNote 未引入 ' + c)
    assert.ok(new RegExp('<' + c + '[\\s>]').test(src), 'NodeNote 模板未使用 ' + c)
  }
  assert.ok(/🔗 引用文档章节/.test(src), '缺少「引用文档章节」入口按钮')
})

test('[视图接线] Index.vue 按 Tab kind 切换 md / 导图编辑器', () => {
  const src = read('pages/Edit/Index.vue')
  assert.ok(/activeKind\s*\(\)\s*\{/.test(src), '缺少 activeKind 计算属性')
  assert.ok(/activeKind === 'markdown'/.test(src), '未用 activeKind 做编辑器切换')
  assert.ok(/<MdEditor/.test(src), '未渲染 MdEditor')
  assert.ok(/v-show="activeKind !== 'markdown'"/.test(src), '导图侧必须用 v-show 保留实例（v-if 会销毁画布）')
  assert.ok(/<WorkspacePanel/.test(src), '缺少工作区侧栏')
  assert.ok(!/<StatusBar/.test(src), '底部状态栏已移除，避免遮挡内容')
})

test('[视图接线] Edit.vue 注入 customHyperlinkJump（且不在 node_click 重复实现）', () => {
  const src = read('pages/Edit/components/Edit.vue')
  assert.ok(/customHyperlinkJump:/.test(src), '缺少 customHyperlinkJump（节点 link 跳转）')
  const idx = src.indexOf('customHyperlinkJump:')
  const body = src.slice(idx, idx + 400)
  assert.ok(/navigate\(/.test(body), 'customHyperlinkJump 必须调 fileRouter.navigate')
})

test('[视图接线] MdEditor 的 Toast UI 实例必须 markRaw（备注面板同坑）', () => {
  const src = read('pages/Edit/components/MdEditor.vue')
  const idx = src.indexOf('new Editor(')
  assert.ok(idx > 0, '找不到 new Editor(')
  // markRaw 必须包住 new Editor
  assert.ok(/markRaw\(\s*[\s\S]{0,200}new Editor\(/.test(src), 'new Editor 未被 markRaw 包裹')
})

test('[视图接线] 引用块 / diff 配色变量在 macos.less 的浅色与深色各定义一份', () => {
  const less = read('styles/macos.less')
  const groups = less.split(/body\.isDark\s*\{/)
  assert.strictEqual(groups.length, 2, 'macos.less 应有 :root 与 body.isDark 两段')
  const names = ['--mm-ref-bg', '--mm-ref-border', '--mm-ref-text', '--mm-diff-add-bg', '--mm-diff-del-bg', '--mm-diff-mod-text']
  for (const g of groups) {
    for (const n of names) {
      assert.ok(g.includes(n), n + ' 在某一主题下缺失')
    }
  }
})

test('失效链接事件必须有视图监听方（emit 了没人听 = 点了没反应）', () => {
  // 背景：fileRouter 在 3 处 emit LINK_MISSING，workspaceBridge 也把它转发到 bus，
  // 但一度**没有任何组件订阅** —— 用户点失效链接全静默，F22 实际未实现。
  const dir = new URL('../../src/pages/Edit/', import.meta.url)
  const files = []
  const walk = d => {
    for (const f of readdirSync(d)) {
      const p = new URL(f + (statSync(new URL(f + '/', d)).isDirectory() ? '/' : ''), d)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.vue$/.test(f)) files.push(p)
    }
  }
  walk(dir)
  const listeners = files.filter(f => /\$bus\.\$on\(\s*'link-missing'/.test(readFileSync(f, 'utf8')))
  assert.ok(listeners.length >= 1, '必须有组件订阅 link-missing（否则失效链接点击无任何反馈）')
})
