# MdEditor 四 issue 设计方案（v2）

> 范围：Markdown 编辑器（`MdEditor.vue` / `MdToolbar.vue` / `MdSidebar.vue`）
> 状态：v2 —— 已查 Toast UI Editor v3.2.2 源码确认命令名，并采纳评审的 4 个必改 + 3 个细节修正。
> 原则：先出方案、本次落地代码；严格遵循项目约定（bus 事件、`workspaceBridge`、原子写盘、纯 Node 单测、回归测试随代码同改）。

---

## 〇、源码查证（关键前提，先定死）

环境：`web/node_modules/@toast-ui/editor@3.2.2`（`package.json` 写 `^3.1.5`，实际装 3.2.2）。

用 `Grep` + `node` 直接读 `dist/esm/index.js` 确认：

| 命令 | 源码证据 | 结论 |
| --- | --- | --- |
| `heading` | `var HEADING = 'heading'`；`var level = payload.level`；`state.schema.nodes[payload.level ? 'heading' : 'paragraph']` | ✅ 正确，payload 需 `{level}`。**不是 `setHeading`（`setHeading` 全源码零出现）** |
| `blockQuote` | `var BLOCK_QUOTE = 'blockQuote'`；`case 'blockQuote':` | ✅ 正确（评审误以为应是 `blockquote`，错） |
| `addTable` | `Table.prototype.addTable`；命令注册 `addTable` | ✅ 正确 |
| `addImage` | `addLinkOrImage('image')` → 命令名 `addImage` | ✅ 正确 |
| `addLink` | `addLinkOrImage('link')` → 命令名 `addLink` | ✅ 正确 |
| `bold`/`italic`/`strike`/`code`/`bulletList`/`taskList`/`codeBlock`/`hr`/`undo`/`redo` | 标准命令 | ✅ 正确 |

**结论**：MdToolbar 里这些命令名本来都对，崩溃只因 H1/H2/H3 把对象 `{cmd,payload}` 直接喂给 `editor.exec`。其余按钮没报过错就是这个原因。

---

## 一、总体设计原则

| 原则 | 说明 |
| --- | --- |
| **最小侵入** | 只改 `MdEditor` 子系统，不动思维导图画布、工作区、路由。 |
| **协议统一** | `MdToolbar` → `MdEditor` 的命令一律走 `md:exec` 总线，传**字符串命令名**，禁止传对象。 |
| **能力探测 + 降级** | 剪贴板、Toast UI API、写盘服务都可能缺失或抛错，任何路径都要有降级（base64 内嵌、纯文本、静默忽略）。 |
| **纯函数外移** | HTML 表格解析、剪贴板图片读取抽到 `web/src/utils/*.js`，方便写纯 Node 单测。 |
| **状态机显式化** | 侧边栏从 `show + active` 改为显式三态机，消除“点不开/关不掉”的隐含状态。 |
| **测试随行** | 每新增一个 util 必须同步 `web/tests/pure/*.test.mjs`；每改一个 UI 行为必须同步 `web/tests/unit/*.test.mjs`。 |

---

## 二、问题 1：H1 / H2 / H3 点击报错

### 2.1 根因

`MdToolbar.vue` 第 70–72 行对带 payload 的命令 emit 了 `{ cmd, payload }` 对象；`MdEditor.onExec` 直接 `this.editor.exec(cmd)`，Toast UI 把对象当命令名索引，报 `wwCommands[object Object] is not a function`。

### 2.2 方案（v2 修订：统一类型 + 正确命令名）

#### 2.2.1 统一命令映射层（v2 修正：全部函数形式，避免混类型脆弱性）

新增 `web/src/utils/mdCommands.js`：

```js
/**
 * 解析 MdToolbar 下发的命令名 → 实际执行器。
 * 统一为函数形式：(editor) => void，消除 v1 中 string|function 混排的脆弱闭包。
 * @param {string} name
 * @param {import('@toast-ui/editor').Editor} editor
 * @returns {((editor: Editor) => void) | null}
 */
export function resolveMdCommand(name, editor) {
  const REGISTRY = {
    // —— 标题：Toast UI 命令名即 heading，payload 需 { level }（已查 v3.2.2 源码确认）——
    heading1: e => e.exec('heading', { level: 1 }),
    heading2: e => e.exec('heading', { level: 2 }),
    heading3: e => e.exec('heading', { level: 3 }),
    // —— 其余均为 Toast UI 原生命令名（已查源码确认，勿改）——
    bold:    e => e.exec('bold'),
    italic:  e => e.exec('italic'),
    strike:  e => e.exec('strike'),
    code:    e => e.exec('code'),
    blockQuote: e => e.exec('blockQuote'),
    bulletList: e => e.exec('bulletList'),
    taskList:   e => e.exec('taskList'),
    addTable:   e => e.exec('addTable'),
    codeBlock:  e => e.exec('codeBlock'),
    hr:         e => e.exec('hr'),
    addImage:   e => e.exec('addImage'),
    addLink:    e => e.exec('addLink'),
    undo:       e => e.exec('undo'),
    redo:       e => e.exec('redo')
  }
  const fn = REGISTRY[name]
  return typeof fn === 'function' ? fn : null
}
```

> v2 修正点：
> 1. **全部为 `(editor) => void` 函数形式**，不再混 string。REGISTRY 可安全提到模块顶层（导出常量）以复用，闭包不再依赖 `resolveMdCommand` 调用时的局部 `editor`。
> 2. **`heading` 而非 `setHeading`**（v1 写错，已查源码订正）。
> 3. `blockQuote`/`addTable`/`addImage`/`addLink` 保持 Toast UI 原生名（评审查错项已驳）。

#### 2.2.2 `MdToolbar` 改造（离散命令名）

```vue
<span class="tbBtn" @click="exec('heading1')">H1</span>
<span class="tbBtn" @click="exec('heading2')">H2</span>
<span class="tbBtn" @click="exec('heading3')">H3</span>
```

```js
exec(cmd) {
  this.$bus.$emit('md:exec', cmd)   // 永远只传字符串
}
```

#### 2.2.3 `MdEditor.onExec` 改造

```js
import { resolveMdCommand } from '@/utils/mdCommands'

onExec(cmd) {
  if (!this.editor) return
  try {
    const fn = resolveMdCommand(cmd, this.editor)
    if (fn) {
      fn(this.editor)
    } else {
      // 未知命令走原生尝试（兼容未来直接传 Toast UI 命令名）
      this.editor.exec(cmd)
    }
  } catch (e) {
    console.error('[MdEditor] exec 失败:', cmd, e)
    const label = typeof cmd === 'string' ? cmd : JSON.stringify(cmd)
    this.$message && this.$message.error('命令执行失败：' + label)
  }
}
```

### 2.3 新增/修改文件

- 新增：`web/src/utils/mdCommands.js`
- 修改：`web/src/pages/Edit/components/MdToolbar.vue`（H1/H2/H3 改离散名、`exec` 只传字符串）
- 修改：`web/src/pages/Edit/components/MdEditor.vue`（`onExec` 用 `resolveMdCommand`）
- 新增单测：`web/tests/pure/mdCommands.test.mjs`

### 2.4 回归用例

1. 点击 H1/H2/H3 不抛错，当前行切换为对应标题。
2. 再次点击同一标题按钮可取消标题（Toast UI 行为）。
3. 普通命令（bold/italic/blockQuote/addTable 等）保持可用。

---

## 三、问题 2：大纲 / 查找点不到、点开关不掉、不要透明

### 3.1 根因

`MdSidebar.vue` 用两个弱关联变量控制：`show`（图标栏显隐）和 `active`（当前面板）。无显式状态机，面板用毛玻璃背景。

### 3.2 方案（v2 修订：补 hidden 不可达说明 + 实色）

#### 3.2.1 显式三态状态机

```ts
type SidebarState = 'hidden' | 'icons' | 'outline' | 'search'
```

| 动作 | 当前状态 | 下一状态 |
| --- | --- | --- |
| 点击 toggleShowBtn（隐藏 → 显示） | hidden | icons |
| 点击 toggleShowBtn（显示 → 隐藏） | icons/outline/search | hidden |
| 点击“大纲” | icons/search | outline |
| 点击“大纲”（当前已是 outline） | outline | icons |
| 点击“查找” | icons/outline | search |
| 点击“查找”（当前已是 search） | search | icons |
| 点击 closeBtn | outline/search | icons |
| 点击编辑器空白处 | outline/search | icons |

> **v2 补充（评审问题 3）**：`hidden` 状态下图标栏整体 `right: -60px` 不可见，**`trigger` 按钮不可达**，因此转换表中“hidden → outline”分支永远不会发生，无需在 `trigger()` 里特判 `hidden`。实施时不要把 `trigger` 写成可以从 hidden 直接进 panel。

#### 3.2.2 统一状态转换入口

```js
methods: {
  setState(next) {
    const valid = ['hidden', 'icons', 'outline', 'search']
    if (!valid.includes(next)) return
    this.state = next
  },
  toggleShow() {
    this.setState(this.state === 'hidden' ? 'icons' : 'hidden')
  },
  trigger(item) {
    // hidden 不可达，无需特判；icons/outline/search 间切换
    this.setState(this.state === item.value ? 'icons' : item.value)
    if (this.state === 'search') this.runSearch()
  },
  close() {
    if (['outline', 'search'].includes(this.state)) this.setState('icons')
  },
  openOutline() {
    this.setState('outline')
  }
}
```

模板改为：

```vue
<div class="mdSidebarTrigger" :class="{ show: state !== 'hidden', hasActive: ['outline','search'].includes(state) }">
  <div class="trigger">
    <div class="triggerItem" :class="{ active: state === 'outline' }" @click="trigger(outlineItem)">…</div>
    <div class="triggerItem" :class="{ active: state === 'search' }" @click="trigger(searchItem)">…</div>
  </div>
</div>
<div class="mdSidePanel" :class="{ show: ['outline','search'].includes(state), solid: true }">…</div>
```

#### 3.2.3 扩大点击热区

- `.trigger` 容器加 `padding: 4px` 圆角。
- `toggleShowBtn` hover 展开宽度 `35px → 44px`，增加 `padding-right: 8px`。
- 父容器无 `pointer-events: none` 截断。

#### 3.2.4 点击编辑器区域自动收起（v2 补充：粘贴不依赖面板）

`MdEditor.vue` 宿主监听 `focusin`：

```js
this._onHostFocus = () => this.$bus.$emit('md:sidebar-close-panel')
el.addEventListener('focusin', this._onHostFocus, true)
```

`MdSidebar`：

```js
this.$bus.$on('md:sidebar-close-panel', this.close)
```

> **v2 补充（评审问题 4）**：粘贴/插入操作通过 `editor.insertText()` 在**当前光标位置**插入，与面板是否打开无关。面板收起只影响侧栏 UI，不改变编辑器选区，因此“粘贴表格时面板自动收起”不影响表格插入位置。

#### 3.2.5 不透明化

移除毛玻璃，直接用实色背景：

```less
.mdSidePanel {
  background-color: var(--macos-bg);          // 实色，去掉 backdrop-filter
  border-left: 1px solid var(--macos-border);
  // 移除 backdrop-filter / -webkit-backdrop-filter
}
.mdSidebarTrigger .trigger {
  background-color: var(--macos-bg);          // 实色
  // 移除 backdrop-filter
}
```

用户当前要求“不要透明”，直接实色即可，无需新增配置开关。

#### 3.2.6 z-index 对齐

`mdSidebarTrigger z-index: 1`、`mdSidePanel z-index: 2` 维持；参与 `store.sidebarZIndex++` 机制（面板打开时自增，避免被其他浮层盖住）。

### 3.3 新增/修改文件

- 修改：`web/src/pages/Edit/components/MdSidebar.vue`（三态机 + 实色 + focusin 收面板）
- 修改：`web/src/pages/Edit/components/MdEditor.vue`（focusin 发 `md:sidebar-close-panel`）
- 新增单测：`web/tests/unit/mdSidebarState.test.mjs`

### 3.4 回归用例

1. 默认图标栏可见、面板关闭。
2. 点击“大纲”开面板，再点“大纲”关（回 icons）。
3. 点击 closeBtn 关面板。
4. 点击编辑器区域关面板。
5. 点击 toggleShowBtn 可隐藏/显示整个图标栏。
6. 面板与图标栏背景为实色，无透明。

---

## 四、问题 3：不支持直接粘贴从 Excel 复制的表格

### 4.1 根因

`MdEditor.vue` 的 `_onPaste` 只处理 `clipboardData.files`，Excel 复制的是 `text/html`（含 `<table>`），被浏览器默认粘贴处理为纯文本或丢弃。

### 4.2 方案（v2 修订：pasteTsv 分隔线修复 + extractInlineImages 明确本次不做）

#### 4.2.1 粘贴事件分层处理

```js
_onPaste = e => {
  const cd = e.clipboardData
  if (!cd) return

  // 1. 图片文件（覆盖 files + items 两种路径，见问题 4）
  const img = readClipboardImage(cd)
  if (img) { e.preventDefault(); this.pasteImage(img); return }

  // 2. HTML 表格（Excel / 网页复制）
  const html = cd.getData('text/html')
  if (html && /<table/i.test(html)) { e.preventDefault(); this.pasteTable(html); return }

  // 3. 纯文本表格（tab 分隔 + 换行，Excel 也提供 text/plain）
  const text = cd.getData('text/plain')
  if (text && /\t/.test(text) && /\n/.test(text)) { e.preventDefault(); this.pasteTsv(text); return }

  // 其余走 Toast UI 默认粘贴
}
```

#### 4.2.2 HTML 表格 → Markdown

新增 `web/src/utils/htmlTableToMd.js`：

```js
/**
 * 浏览器内置 DOMParser（零依赖）解析 HTML table → Markdown 表格。
 * 仅处理标准 <table><tr><td>/<th>；colspan/rowspan 按占位空格处理（后续增强）。
 * 分隔线固定插入首行之后（Markdown 规范）。
 */
export function htmlTableToMd(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const table = doc.querySelector('table')
  if (!table) return ''

  const rows = Array.from(table.querySelectorAll('tr'))
  const lines = rows.map(tr => {
    const cells = Array.from(tr.querySelectorAll('td, th'))
      .map(cell => (cell.textContent || '').replace(/\|/g, '\\|').trim() || ' ')
    return '| ' + cells.join(' | ') + ' |'
  })
  if (lines.length === 0) return ''
  const headerCount = lines[0].split(' | ').length - 2
  const sep = '| ' + Array(headerCount).fill('---').join(' | ') + ' |'
  // v2 修正：分隔线在首行之后，而非整表之后
  return [lines[0], sep, ...lines.slice(1)].join('\n')
}
```

#### 4.2.3 内嵌图片（v2 修订：本次不做，明确边界）

> **v2 决定**：Excel 复制的表格 HTML 通常**不含**内嵌图片（单元格图片极少）。为避免空壳实现引入新 bug，本次 `pasteTable` **只处理纯表格**，HTML 中的 `<img>` 按原样丢弃（或整段降级为纯文本粘贴）。内嵌图片落地作为后续增强（需 `extractInlineImages` + 写盘 + 错误降级全套），不在本方案范围。

若 `htmlTableToMd` 解析失败（无 table 节点），降级为 `editor.insertText(text)`（纯文本）。

#### 4.2.4 纯文本 TSV → Markdown（v2 修正分隔线位置）

```js
pasteTsv(text) {
  const lines = text.split('\n').filter(Boolean)
  const cells = lines.map(line =>
    line.split('\t').map(c => (c.replace(/\|/g, '\\|').trim()) || ' ')
  )
  if (cells.length === 0) return
  const colCount = Math.max(...cells.map(r => r.length))
  const pad = row => { while (row.length < colCount) row.push(' '); return row }
  const body = cells.map(row => '| ' + pad(row).join(' | ') + ' |')
  const sep = '| ' + Array(colCount).fill('---').join(' | ') + ' |'
  // v2 修正：[首行, 分隔线, ...其余] 而非 [整表, 分隔线]
  const md = [body[0], sep, ...body.slice(1)].join('\n')
  this.onInsert({ text: '\n' + md + '\n' })
}
```

#### 4.2.5 `onInsert` 说明（v2 补：评审遗漏 3）

`onInsert` 是 **`MdEditor.vue` 已有方法**（非新协议），定义于本组件第 322 行：

```js
onInsert({ text }) {
  if (!this.editor) return
  try {
    this.editor.insertText
      ? this.editor.insertText(text)
      : this.editor.exec('insertText', text)
  } catch (e) {
    const cur = this.editor.getMarkdown() || ''
    this.editor.setMarkdown(cur + '\n' + text)
  }
  this.onChange()
}
```

它在当前光标位置插入文本并触发 `onChange`（写回 `mdDoc` + 调度保存），与 `md:exec` 总线无关。表格/图片粘贴统一复用它。

### 4.3 新增/修改文件

- 新增：`web/src/utils/htmlTableToMd.js`
- 修改：`web/src/pages/Edit/components/MdEditor.vue`（`_onPaste` 分层、`pasteTable`/`pasteTsv`）
- 新增单测：`web/tests/pure/htmlTableToMd.test.mjs`

### 4.4 回归用例

1. 从 Excel 复制 3×3 表格，粘贴后渲染为 Markdown 表格。
2. 表格中 `|` 字符正确转义。
3. 空单元格为占位空格，不破坏结构。
4. 复制不含表格的 HTML 走默认粘贴，不触发本逻辑。
5. 复制 tab 分隔纯文本生成正确表格（分隔线在首行后）。

---

## 五、问题 4：不支持直接粘贴图片

### 5.1 根因

`_onPaste` 只读 `e.clipboardData.files`；很多截图工具（Windows 截图、Snipaste）复制图片时 `files` 为空，但 `clipboardData.items` 含 image blob。

### 5.2 方案

#### 5.2.1 剪贴板图片读取统一函数

新增 `web/src/utils/clipboardImage.js`：

```js
/**
 * 从 DataTransfer 读取第一个图片 Blob（支持 files + items 两种路径）。
 * @param {DataTransfer} dataTransfer
 * @returns {File | Blob | null}
 */
export function readClipboardImage(dataTransfer) {
  if (!dataTransfer) return null
  const files = Array.from(dataTransfer.files || [])
  const fileImg = files.find(f => /^image\//.test(f.type))
  if (fileImg) return fileImg
  const items = Array.from(dataTransfer.items || [])
  for (const item of items) {
    if (/^image\//.test(item.type)) {
      const blob = item.getAsFile()
      if (blob) return blob
    }
  }
  return null
}
```

#### 5.2.2 `pasteImage` 增强

```js
async pasteImage(blob) {
  try {
    const ext = mimeToExt(blob.type) || 'png'
    const name = `paste-${Date.now()}-${randomHex(4)}.${ext}`
    const dir = String(this.filePath || '').replace(/\\/g, '/').replace(/\/[^/]*$/, '')
    const rel = `assets/${name}`
    const abs = `${dir || '.'}/${rel}`

    const dataUrl = await readAsDataURL(blob)
    const base64 = dataUrl.split(',')[1] || ''

    const svc = getServices().workspaceService
    const w = typeof svc.writeBinary === 'function'
      ? await svc.writeBinary(abs, base64, { encoding: 'base64' })
      : null

    // 写盘不可用（无工作区/环境不支持）→ 降级 base64 内嵌，不丢内容
    this.onInsert({ text: w && w.ok ? `![](${rel})` : `![](${dataUrl})` })
  } catch (e) {
    console.error('[MdEditor] 粘贴图片失败:', e)
    this.$message && this.$message.error('图片粘贴失败')
  }
}
```

#### 5.2.3 拖拽图片（可选）

`attachDomHandlers` 增加 `dragover`/`drop`，复用 `pasteImage`。

### 5.3 新增/修改文件

- 新增：`web/src/utils/clipboardImage.js`
- 修改：`web/src/pages/Edit/components/MdEditor.vue`（`_onPaste` 用 `readClipboardImage`、`pasteImage` 增强）
- 新增单测：`web/tests/pure/clipboardImage.test.mjs`

### 5.4 回归用例

1. 从 Windows 截图工具复制 PNG，粘贴后生成 `assets/paste-*.png` 相对路径。
2. 从 Snipaste 复制粘贴成功。
3. 无工作区时降级为 base64 内嵌。
4. 复制非图片文件不触发图片粘贴。

---

## 六、模块依赖图

```
MdToolbar.vue
    └─ md:exec(字符串) ──> MdEditor.vue
                                ├─ utils/mdCommands.js       (命令映射，已查源码)
                                ├─ utils/clipboardImage.js   (读剪贴板图片)
                                ├─ utils/htmlTableToMd.js    (HTML 表格 → Markdown)
                                └─ MdSidebar.vue
                                       └─ 本地三态状态机
```

---

## 七、实施优先级

| 优先级 | 问题 | 理由 |
| --- | --- | --- |
| P0 | H1/H2/H3 报错 | 用户可见崩溃，且命令名已查实确认。 |
| P1 | 大纲/查找交互 | 状态机改造后体验质变。 |
| P2 | 图片粘贴增强 | 覆盖更多截图工具，改动小。 |
| P3 | Excel 表格粘贴 | 功能增强，逻辑独立。 |

---

## 八、测试清单

| 类型 | 文件 | 覆盖内容 |
| --- | --- | --- |
| 纯函数单测 | `web/tests/pure/mdCommands.test.mjs` | 已知命令映射、未知命令返回 null、heading 调 `exec('heading',{level})` |
| 纯函数单测 | `web/tests/pure/htmlTableToMd.test.mjs` | 标准表格、含 `\|` 单元格、空单元格、分隔线位置 |
| 纯函数单测 | `web/tests/pure/clipboardImage.test.mjs` | files 路径、items 路径、非图片返回 null |
| 单元测试 | `web/tests/unit/mdSidebarState.test.mjs` | 三态机转换、toggle/close/编辑器区域收起 |
| 集成手动 | 手动 | H1/H2/H3、大纲/查找、图片粘贴、Excel 表格粘贴 |

---

## 九、关键约定（防止踩坑）

1. **命令名以源码为准**：已查 Toast UI 3.2.2，标题命令是 `heading`（非 `setHeading`）；`blockQuote`/`addTable`/`addImage`/`addLink` 均正确，勿改。
2. **映射层统一函数形式**：`REGISTRY` 可提到模块顶层，所有 entry 为 `(editor) => void`，避免闭包脆弱。
3. **`markRaw` 保持**：`this.editor` 已 `markRaw`，工具函数不返回被 Vue 代理的复杂对象。
4. **写盘收敛主进程**：图片落地走 `workspaceService.writeBinary`（底层 `safeWriteFile`），渲染进程不直写。
5. **错误降级**：外部 API 失败有降级路径，禁止弹空白 `[object Object]`。
6. **总线事件命名**：新增事件统一 `md:` 前缀（如 `md:sidebar-close-panel`），避免与全局事件冲突。
