# Milkdown 接入「思绪思维导图」(Vue2 + Electron) 可行性评估与模块级工作量清单

> 评估日期：2026-09-18
> 目标：在现有 Vue2 + Electron 工程中接入 Milkdown，做出 Typora 同款体验的 Markdown 阅读/编辑器。
> 结论先行：**技术可行**，核心引擎（ProseMirror）由 Milkdown 外包，自写量集中在「Vue2 工具栏/菜单壳 + 插件接线 + 导入导出」。MVP 约 8–12 人天，功能齐全约 18–28 人天（≈1 个月单人）。

---

## 1. 你们工程现状（决定接入方式的关键约束）

| 项 | 现状 | 对 Milkdown 接入的影响 |
|---|---|---|
| Vue 版本 | **2.6.11**（vue-router 3.x / vuex 3 / Element UI 2） | 官方 `@milkdown/vue` 绑定是 **Vue3 专有，不可用**；必须走命令式 `@milkdown/kit` API（`mounted` 里 `Editor.make()`），官方有 Vue2 recipe 支持 |
| 构建链 | vue-cli-service 4.5 / **webpack 4** / babel 7 | Milkdown 7 是 ESM + 现代 JS（`?.`/`??`/类字段），需在 `vue.config.js` 的 `transpileDependencies` 加 `@milkdown`、`prosemirror-*`、`@codemirror`、`katex`、`mermaid`、`dompurify` 才能被 webpack4 正确转译 |
| Electron | 25.7.0，`contextIsolation:true` / `nodeIntegration:false` / **无 CSP 头** | ProseMirror/KaTeX/Mermaid 全在渲染进程 DOM 内运行，无 node 集成需求；无 CSP 限制，DOM 注入/内联样式/Web Font(data URI) 均放行 → **无阻断性风险** |
| 已有 WYSIWYG 范式 | `NodeNote.vue` 已用 Toast UI 命令式挂载（`el: this.$refs.x` + `$nextTick` + `getMarkdown/setMarkdown` + 暗色 less 覆盖） | **直接复用此范式**挂 Milkdown，挂载/销毁/读写/主题适配都有现成样板 |
| 部署形态 | Nativefier 包装，`resources/app` 为运行真源 | ⚠️ 需确认 Nativefier 包裹层不注入严格 CSP；已查 `main.js` 无 CSP 设置，风险低。若有，放宽 `style-src 'unsafe-inline'` 与 `font-src data:` 即可 |
| 已有相关依赖 | `katex`(已装)、`prismjs`+`highlight.js`、`markdown-it`、`docx`(Word导出)、`pptxgenjs`、`xlsx` | math 直接复用 katex；Word 导出复用 `docx`；**但 Milkdown 代码块高亮用 CodeMirror 6（需新装），与现有 prismjs 不互通** |

---

## 2. 依赖清单

### 新增（npm install）
- `@milkdown/kit`（core + preset-commonmark + preset-gfm + 基础 plugins 的聚合包，v7.22.1）
- `@milkdown/theme-nord`（明暗主题；或自写 CSS 融入现有玻璃主题）
- `@milkdown/plugin-math`（依赖已装的 katex）
- `@milkdown/plugin-diagram`（**需新装 `mermaid`**）
- `@milkdown/plugin-cursor` / `-clipboard` / `-history` / `-listener`（onChange 取 markdown）/ `-indent` / `-trailing` / `-slash` / `-upload`（按需）
- `@codemirror/*`（CodeMirror 6，做编辑态代码高亮；Crepe 同款，若接受只读态才高亮可省）
- `dompurify`（`<code>`/HTML 粘贴清洗；Crepe 依赖，手动接也建议装）

### 复用（已装，零新增）
- `katex` → 数学公式
- `docx` → Word 导出
- `markdown-it` → 非 WYSIWYG 只读渲染兜底

---

## 3. 模块级工作量清单（自写代码行数，不含依赖）

### M1 · 依赖接入与构建适配（配置+排雷）
- `package.json` 加依赖；`vue.config.js` 的 `transpileDependencies` 增加 `@milkdown`、`prosemirror-*`、`@codemirror`、`katex`、`mermaid`、`dompurify`
- 验证 webpack4 能打包 Milkdown7 ESM（踩坑点：顶层 await / 动态 import / 类字段）
- **自写 ≈ 0 行；耗时 0.5–1 人天（主要是排雷）**

### M2 · Milkdown 编辑器封装组件 `MarkdownEditor.vue`（核心）
- 仿 `NodeNote.vue`：`mounted`→`$nextTick`→`Editor.make().config(rootCtx=this.$refs.editor).use(commonmark).use(gfm).use(plugins).create()`
- `beforeDestroy` 调 `editor.destroy()`
- `setMarkdown()` / `getMarkdown()` 桥接；`readonly` 切换（reader 模式：`crepe.setReadonly` 同款由 `editor` 命令实现）
- 接 cursor/history/clipboard/listener/indent/trailing
- **自写 ≈ 200–350 行；1–2 人天**

### M3 · 格式工具栏（Vue2 自写，替代 Crepe 的 Vue3 Toolbar/TopBar）
- 加粗/斜体/删除线/标题/列表/引用/代码/链接/图片/表格/数学 按钮
- 每个按钮调用 Milkdown command：`editor.action(ctx => ctx.get(commandsCtx).call(...))`
- 选区浮动工具栏（参考 Crepe Toolbar 行为，可选）
- **自写 ≈ 250–400 行 + CSS；2–3 人天（最大自写块）**

### M4 · 斜杠命令菜单（slash menu）
- `@milkdown/plugin-slash` 提供触发逻辑，**UI 需 Vue2 自渲染**（命令列表浮层）
- 或 MVP 阶段先用顶部工具栏代替，slash 后补
- **自写 ≈ 150–250 行；1–2 人天（可选）**

### M5 · 数学公式（接 `@milkdown/plugin-math` + 已装 katex）
- 插件接线 + 行内/块级 `$...$` `$$...$$` 渲染验证
- **自写 ≈ 50 行；0.5 人天**

### M6 · 流程图/时序图（接 `@milkdown/plugin-diagram` + 新装 mermaid）
- 插件接线 + mermaid 初始化
- **自写 ≈ 50–100 行；0.5–1 人天**

### M7 · 代码块语法高亮
- 路线A（推荐，Crepe 同款）：引 CodeMirror 6，配置语言包（复用 `NodeNote.vue` 的 `codeLangs` 思路）
- 路线B（省依赖）：仅只读态用 prismjs 高亮，编辑态无高亮
- **路线A 自写 ≈ 100–200 行；1 人天**

### M8 · 图片处理
- 粘贴/拖入图片 → data URL 内嵌（复用 `NodeNote.vue` 的 Toast UI 粘贴内嵌范式）
- 或接 `@milkdown/plugin-upload` 走上传 API
- **自写 ≈ 100–200 行；1 人天**

### M9 · 导入 / 导出
- 导出 MD（原生 `getMarkdown`）：0.5 天
- 导出 HTML（Milkdown serializer / 自己拼）：0.5 天
- 导出 PDF（Electron `webContents.printToPDF`）：0.5 天
- 导出 Word（已装 `docx`：md→html→docx 或直转）：1–2 天
- 导入 `.md` 文件（`fs.readFile` + `setMarkdown`）：0.5 天
- **自写 ≈ 300–500 行；3–4 人天**

### M10 · 主题 / 暗色适配
- 接 `@milkdown/theme-nord`（明暗两套），或写自定义 CSS 融入现有玻璃主题（参考 `NodeNote.vue` 的 less 覆盖手法）
- **自写 ≈ 100–200 行；0.5–1 人天**

### M11 · 与思维导图联动（产品层，可选）
- 场景A：节点备注从 Toast UI 迁移到 Milkdown（替换 `NodeNote.vue` 内核）
- 场景B：新增「文档」视图，导图节点 ↔ 文档锚点跳转
- **自写 ≈ 视范围；2–5 人天（可选）**

### M12 · 路由/面板挂载 + 真机验证 + 编包
- 新增路由 `/md` 或在 `Edit.vue` 加可停靠面板；`build_now.sh` 部署验证（注意 Milkdown 改动要打进 `dist`）
- **自写 ≈ 50–150 行；0.5–1 人天**

---

## 4. 路线图与人天汇总

| 范围 | 包含模块 | 自写行数 | 人天 |
|---|---|---|---|
| **MVP**（能读能写、工具栏、math、导出 MD/PDF、暗色） | M1+M2+M3+M5+M9(部分)+M10+M12 | ~1,200–1,800 | **8–12** |
| **完整**（含 slash、diagram、Word、图片上传、导图联动） | MVP + M4+M6+M7+M8+M9(全)+M11 | ~2,500–4,000 | **18–28** |

> 注：以上均为**自写业务代码**估算，ProseMirror/Milkdown/KaTeX/Mermaid 等引擎代码由依赖提供（约数十万行，不算在内）。相比「完全自研渲染引擎」的 5万–15万行，Milkdown 把最难的引擎外包了，自写量主要是 UI 壳 + 接线 + 导出。

---

## 5. 主要风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| Crepe 全家桶是 Vue3 组件，Vue2 不可用 → 工具栏/斜杠菜单/图片块/表格 UI 必须自写 | 高（成本主因） | 接受「自写 Vue2 工具栏 + slash 浮层」；体验略低于 Crepe，但功能等价 |
| webpack4 转译 Milkdown7 ESM 可能报错 | 中 | `transpileDependencies` 加全；必要时降 Milkdown 次级版本或加 babel 插件 |
| 工程是 Vue2，升级 Vue3 不现实（Element UI 2 整套） | 高（架构锁死） | 不升 Vue3，走命令式 API；与 Typora 体验差主要来自自写 UI 打磨度，非引擎 |
| Nativefier 包裹层可能注入严格 CSP | 低（已查 main.js 无 CSP） | 若有，放行 `style-src 'unsafe-inline'`、`font-src data:`、`img-src data:` |
| 代码高亮引 CodeMirror 6 是新依赖，体积增大 | 低 | Electron 本地应用不在乎体积；或走路线B 省依赖 |
| Milkdown 改动若写入 `node_modules` 会被 `npm install` 冲掉 | 中 | 接入是「安装依赖 + 写工程源码」，不碰 node_modules 内部，无此问题（区别于上次 priority 图标改 node_modules 的脆弱性） |

---

## 6. 与「自研」和「复用 Toast UI」的对比

- **自研引擎**：50万–150万行级，劝退。
- **复用现有 Toast UI Editor**（已装）：最快（NodeNote 已验证），但它是「源码/预览分栏或切换」式，**不是 Typora 的行内无缝渲染**；公式/图要另外挂。
- **Milkdown（推荐）**：行内无缝 WYSIWYG 与 Typora 同源（都基于 ProseMirror）；Vue2 下引擎可用、UI 自写。是「Typora 体验」与「工程现实(Vue2)」之间的最优折中。

---

## 7. 建议下一步
1. 先做一个 **MVP 原型**（M1+M2+M3+M5+M10）：一个 Vue2 路由页挂 Milkdown，工具栏 + 公式 + 暗色，验证手感与构建。预计 1–2 周。
2. 原型手感 OK 再补 M4/M6/M7/M8/M9（slash、图、代码高亮、导出）。
3. 是否做 M11（与导图联动）取决于产品定位，单独评估。
