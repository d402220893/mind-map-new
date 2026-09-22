# 需求输入.md

> **文档用途**：本文档是"思维导图 + Markdown 双链工具"的完整需求与技术方案，可直接交给其他 AI / 开发者作为实现依据。阅读者应能据此独立完成整个应用，无需额外澄清。
> 
> **项目现状**：思维导图部分**已完成**，基于**思绪思维导图（SimpleMindMap）**，文件格式为 **`.smm`**（JSON）。当前**唯一缺口是"调用"环节**——即文件树、Markdown 编辑器、导图编辑器三者之间的互相调起、链接跳转、嵌入渲染、章节引用同步。本文档重点描述这些待实现部分，同时保留完整的上下文供实现者理解。
> 
> **阅读顺序建议**：先读第一、二、七节了解产品与界面，再读第五、六节了解数据与核心逻辑，最后按第九节路线图实施。

***

## 〇、文档约定

* **【必须】** = MVP 必须实现；**【可选】** = 二期或锦上添花。
* **【已完成】** = 已有实现，实现者无需重做，只需对接。
* 代码示例使用 TypeScript 语法，仅示意，具体框架可替换。
* 所有路径均为相对工作区根目录的相对路径。
* 术语表：

| 术语 | 含义 |
| --- | --- |
| 工作区（Workspace） | 用户打开的一个根文件夹 |
| 章节（Section） | Markdown 中一个标题及其下属内容构成的内容单元 |
| 引用块（SectionRef） | 导图备注或 Markdown 中指向某章节的引用视图 |
| 真相源（SSOT） | Markdown 文件是内容的唯一权威存储 |
| baseRev | 引用块读到的章节版本号 |
| current.rev | 索引表中当前章节的版本号 |
| commitEdit | 引用块提交编辑的入口函数 |
| handleConflict | 冲突处理入口函数 |
| .smm | 思绪思维导图（SimpleMindMap）的文件格式，JSON |
| 调用 | 文件树 / Markdown / 导图三者之间互相打开、跳转、渲染的过程 |

***

## 一、产品定位与目标

### 1.1 一句话定位

一个**本地优先**的桌面应用，把 **Markdown 文档**和**思维导图**放在同一文件夹里统一管理，二者可**互相引用、互相嵌入、同源编辑**。编辑体验接近 Typora，知识串联能力接近 Obsidian。

### 1.2 核心价值

1. 打开一个文件夹，左侧文件树，右侧编辑区，md 与导图自由切换。
2. md 与导图之间可跳转、可嵌入。
3. **导图备注可引用 md 的某一章节，两边原地编辑、内容同源。**

### 1.3 非目标（明确不做）

* ❌ 不做云端同步、多人协作。
* ❌ 不做块级数据库（类 Notion）。
* ❌ 不做移动端。
* ❌ 不做全格式兼容，聚焦 md + 导图。

***

## 二、功能总览与优先级

### 2.1 功能清单

| 编号 | 模块 | 功能 | 优先级 | 状态 |
| --- | --- | --- | --- | --- |
| F1 | 工作区 | 打开/切换/记住文件夹 | 必须 |  |
| F2 | 工作区 | 最近打开列表 | 可选 |  |
| F3 | 文件树 | 层级展示、展开折叠、类型图标 | 必须 |  |
| F4 | 文件树 | 新建/重命名/删除/移动、拖拽 | 必须 |  |
| F5 | 文件树 | 文件名过滤、实时刷新（外部改动同步） | 必须 |  |
| F6 | Tab | 多标签打开/切换/关闭/排序 | 必须 |  |
| F7 | Tab | 未保存标记、会话恢复 | 必须 |  |
| F8 | Markdown 编辑器 | 所见即所得（类 Typora） | 必须 |  |
| F9 | Markdown 编辑器 | 语法：标题/列表/引用/代码/表格/任务 | 必须 |  |
| F10 | Markdown 编辑器 | 数学公式、代码高亮 | 必须 |  |
| F11 | Markdown 编辑器 | 图片粘贴存 assets、相对路径插入 | 必须 |  |
| F12 | Markdown 编辑器 | 大纲面板、自动保存、字数统计 | 必须 |  |
| F13 | 思维导图编辑器 | 节点增删改、拖拽、折叠 | 必须 | ✅ 已完成 |
| F14 | 思维导图编辑器 | 节点链接、备注 | 必须 | ✅ 已完成 |
| F15 | 思维导图编辑器 | 布局切换、撤销重做、缩放平移 | 必须 | ✅ 已完成 |
| F16 | 思维导图编辑器 | 导入 km/xmind、导出 PNG/SVG/md | 可选 |  |
| F17 | 双向链接 | md→导图 跳转（`[x](./a.smm)`） | 必须 | ❌ 待实现 |
| F18 | 双向链接 | md→导图 嵌入（`![](./a.smm)`） | 必须 | ❌ 待实现 |
| F19 | 双向链接 | 导图节点 link → md 跳转（含锚点） | 必须 | ❌ 待实现 |
| F20 | 双向链接 | 反向链接面板 | 可选 |  |
| F21 | 双向链接 | 链接自动补全 | 可选 |  |
| F22 | 双向链接 | 失效链接提示与修复 | 必须 |  |
| F23 | **章节引用** | **导图备注引用 md 章节** | **必须** | ❌ 待实现 |
| F24 | **章节引用** | **引用块原地编辑（模式 B）** | **必须** | ❌ 待实现 |
| F25 | **章节引用** | **乐观锁 + 版本号比对** | **必须** | ❌ 待实现 |
| F26 | **章节引用** | **冲突处理（最后写入生效 + 提示）** | **必须** | ❌ 待实现 |
| F27 | **章节引用** | **章节失效检测与兜底** | **必须** | ❌ 待实现 |
| F28 | 搜索 | 文件名搜索、全文搜索 | 必须 |  |
| F29 | 大纲 | Markdown 大纲、导图大纲 | 必须 |  |
| F30 | 格式互转 | md ↔ 导图 | 可选 |  |
| F31 | 外观 | 主题（浅/深/跟随系统） | 必须 |  |
| F32 | 设置 | 自动保存间隔、字体字号、侧栏宽度 | 可选 |  |
| F33 | 界面 | 顶部全局条 + 上下文工具栏 | 必须 |  |

### 2.2 分期

* **第一期（MVP）**：F1、F3\~F7、F8\~F12、F17\~F19、**F23\~F27**、F28、F29、F31、**F33**
* **第二期**：F2、F16、F20、F21、F30、F32
* **第三期**：Git 集成、多工作区、快捷键自定义

> **注意**：章节引用（F23\~F27）是产品差异化核心，**必须在 MVP 完成**，否则产品失去意义。

***

## 三、技术选型

| 层 | 推荐 | 备选 | 说明 |
| --- | --- | --- | --- |
| 桌面壳 | **Tauri 2** | Electron | Tauri 体积小；熟 Electron 可换 |
| 前端 | **Vue 3 + Vite** | React 18 | 组件化，任一皆可 |
| 状态 | **Pinia** | Zustand |  |
| 文件树 | 自研 / `react-arborist` 思路 |  |  |
| 文件监听 | **chokidar** |  | Tauri 用 `notify` |
| Markdown 编辑 | **Milkdown**（ProseMirror） | CodeMirror 6 自研装饰 | Milkdown 自带 WYSIWYG |
| Markdown 解析 | **remark / unified** | markdown-it | 必须 AST 级操作 |
| 数学公式 | KaTeX |  |  |
| 代码高亮 | Shiki / highlight.js |  |  |
| 思维导图 | **SimpleMindMap（思绪）** |  | ✅ 已完成集成 |
| diff/merge | `node-diff3` / `diff` |  | 冲突合并用 |
| 存储 | 本地 JSON（`.mindlink/`） | SQLite | MVP 用 JSON 足够 |

***

## 四、总体架构

```
┌───────────────────────────────────────────────────────┐
│                  主进程 / Rust 侧                       │
│  - 文件系统读写                                         │
│  - chokidar/notify 文件监听                             │
│  - 索引持久化 (.mindlink)                               │
└───────────────────────┬───────────────────────────────┘
                        │ IPC
┌───────────────────────┴───────────────────────────────┐
│                  渲染进程 / 前端                        │
│                                                         │
│  ┌──────────┐   ┌──────────────────────────────────┐  │
│  │ 文件树    │   │  Tab 管理                         │  │
│  └──────────┘   └──────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐   │
│  │           上下文工具栏（随编辑器切换）            │   │
│  │   ┌─────────────────┐   ┌──────────────────┐   │   │
│  │   │ Markdown 工具栏  │   │ 思维导图工具栏    │   │   │
│  │   └─────────────────┘   └──────────────────┘   │   │
│  └────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────┐   │
│  │              编辑器路由 (按扩展名)                │   │
│  │   ┌─────────────────┐   ┌──────────────────┐   │   │
│  │   │ Markdown 编辑器  │   │ SimpleMindMap    │   │   │
│  │   │                 │   │ (已完成)          │   │   │
│  │   └─────────────────┘   └──────────────────┘   │   │
│  └────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────┐   │
│  │ 核心服务层（★ 本期重点）                          │   │
│  │  - CommandBus (工具栏/快捷键统一命令)            │   │
│  │  - LinkService (链接解析/跳转) ★                │   │
│  │  - FileRouter (文件树 → 编辑器路由) ★            │   │
│  │  - SectionService (章节解析/读写) ★              │   │
│  │  - RefService (引用块管理) ★                     │   │
│  │  - RevisionService (乐观锁) ★                    │   │
│  │  - EventBus (跨视图同步) ★                       │   │
│  └────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**★ 标记的为核心服务层，是本期"调用"功能需要重点实现的部分。**

***

## 五、目录与数据格式

### 5.1 工作区目录结构

```
my-workspace/
├── .mindlink/                  # 应用元数据（可加入 .gitignore）
│   ├── sections.json           # 章节索引（ID、path、rev、hash）
│   ├── refs.json               # 引用关系（反链基础）
│   ├── history/                # 覆盖快照，用于回滚
│   └── meta.json               # 工作区配置
├── docs/
│   ├── requirements.md
│   └── overview.md
├── diagrams/
│   ├── arch.smm                # 思绪思维导图文件
│   └── flow.smm
└── assets/
    └── pasted-image-xxx.png
```

### 5.2 支持的文件类型

```ts
const SUPPORTED = {
  '.md':       'markdown',
  '.markdown': 'markdown',
  '.smm':      'mindmap',          // 思绪思维导图，JSON
  '.km':       'mindmap-import',   // 兼容导入
  '.xmind':    'mindmap-import',   // 兼容导入
};
```

### 5.3 思维导图文件格式（`.smm`）

`.smm` 是\*\*思绪思维导图（SimpleMindMap）\*\*的原生 JSON 格式，节点结构如下：

```jsonc
{
  "data": {
    "text": "项目规划",
    "link": "./docs/overview.md#项目背景",   // 节点跳转链接（可选）
    "note": "这里是节点备注",                  // 备注（字符串）
    "tag": [],                                // 标签
    "expand": true,                           // 是否展开
    "uid": "xxx"                              // 节点唯一 ID
  },
  "children": [
    {
      "data": {
        "text": "需求分析",
        "link": "./docs/requirements.md",
        "uid": "n1"
      },
      "children": []
    }
  ]
}
```

**关键字段说明**：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `text` | string | 节点文本 |
| `link` | string | 超链接，用于跳转到 md 文件（含锚点） |
| `note` | string | 备注内容 |
| `tag` | array | 标签 |
| `uid` | string | 节点唯一 ID |
| `children` | array | 子节点 |

> **备注字段的扩展**：SimpleMindMap 原生的 `note` 是字符串。为了支持**章节引用**，需要扩展为支持结构化数据。有两种方案：
> 
> **方案 A（推荐）**：`note` 仍为字符串，但内部用约定的标记语法承载引用，如：
>
> ```
> 这里是用户自己的备注文字
> 
> <!-- ref:{"file":"docs/requirements.md","sectionId":"a1b2c3","sectionPath":["需求分析"]} -->
> ```
>
> 优点：不破坏 SimpleMindMap 原生兼容性，`.smm` 文件仍可被原库正常打开。
> 
> **方案 B**：把 `note` 改为对象，存 `{ownContent, refs}`。缺点：破坏原生兼容性，需要改 SimpleMindMap 的渲染逻辑。
> 
> **本方案采用 A**：引用信息以隐藏注释形式嵌在 `note` 字符串里，读写时解析/序列化。

### 5.4 索引文件

**`.mindlink/sections.json`**

```jsonc
{
  "docs/requirements.md": {
    "a1b2c3": {
      "path": ["需求分析"],
      "level": 2,
      "rev": 7,
      "contentHash": "sha1:ab12...",
      "lastModified": "2026-09-20T10:00:00Z"
    }
  }
}
```

**`.mindlink/refs.json`**

```jsonc
{
  "docs/requirements.md#a1b2c3": [
    {
      "type": "mind-note",
      "file": "diagrams/arch.smm",
      "nodeId": "uid-xxx",
      "refId": "ref-1"
    }
  ]
}
```

**`.mindlink/history/`**：每次覆盖式写入前，保存一份 `{file}#{sectionId}-{timestamp}.txt` 快照。

***

## 六、核心模块详细设计

> **本章重点**：6.1\~6.3 为基础设施；6.4\~6.5 为已有编辑器；**6.6\~6.10 为本期"调用"功能的重点**。

### 6.1 工作区服务

**职责**：打开文件夹、扫描、建立初始索引、启动监听。

```ts
interface WorkspaceService {
  open(rootPath: string): Promise<void>;
  close(): void;
  getTree(): FileNode[];
  refresh(): void;
  onCreate(cb): void;
  onDelete(cb): void;
  onChange(cb): void;
}
```

**流程**：

1. 递归扫描根目录，按 `SUPPORTED` 过滤，生成 `FileNode[]`。
2. 读取或初始化 `.mindlink/`。
3. 全量解析所有 `.md`，建立 `sections.json`（首次或索引缺失时）。
4. 启动 chokidar，监听 `.md` / `.smm` 的增删改。
5. 文件变更时：更新树 → 若为 md，重新解析章节 → 校验 rev/hash → 广播事件。

***

### 6.2 文件树

**节点结构**：

```ts
interface FileNode {
  name: string;
  path: string;            // 相对工作区根
  type: 'file' | 'dir';
  kind?: 'markdown' | 'mindmap' | 'other';
  children?: FileNode[];
}
```

**UI 要求**：

* 展开/折叠；类型图标（📄 md / 🧠 smm / 📁 dir）。
* 当前打开的文件高亮。
* 顶部搜索框，模糊过滤文件名。
* 右键菜单：新建文件/文件夹、重命名、删除、在系统中打开、复制路径。
* 支持拖拽移动（可选但推荐）。
* 外部变化实时刷新（chokidar 事件驱动）。

***

### 6.3 Tab 管理

**Tab 结构**：

```ts
interface Tab {
  id: string;
  path: string;
  kind: 'markdown' | 'mindmap';
  dirty: boolean;
  anchor?: string;         // md 锚点
  scrollTop?: number;
}
```

**行为**：

* 打开已存在的文件 → 激活已有 Tab，不重复打开。
* `Ctrl+S` 手动保存；自动保存由编辑器层负责。
* 关闭有未保存改动 → 弹窗确认。
* 应用重启 → 恢复上次 Tab 列表（存于 `meta.json`）。

***

### 6.4 Markdown 编辑器

**必须能力**：

* WYSIWYG：输入标记立即渲染（`# ` → 标题，`**` → 粗体）。
* 支持标准语法 + 表格 + 任务列表 + 代码块 + 引用。
* KaTeX 行内 `$...$`、块级 `$$...$$`。
* 代码块按语言高亮。
* 粘贴图片：保存到 `assets/`，插入相对路径 `![](assets/xxx.png)`。
* 大纲面板（右侧）：解析标题层级，点击定位。
* 自动保存（防抖 1\~2 秒）。
* 状态栏：字数、行列、保存状态。

**对思维导图的特殊处理**：

* 解析到 `![xxx](./yyy.smm)` → 替换为**内嵌只读导图组件**。
* 点击内嵌导图 → 在 Tab 中打开可编辑版本。
* 解析到 `[xxx](./yyy.smm)` → 保持普通链接，点击跳转。

**锚点定位**：

* md 标题生成稳定锚点（slug + 冲突时后缀）。
* 打开 `file.md#anchor` 时，滚动到对应标题并高亮。

***

### 6.5 思维导图编辑器（已完成，需对接）

**状态**：基于 **SimpleMindMap（思绪思维导图）** 的编辑器已完成，能读写 `.smm` 文件、编辑节点、打开/保存。

**已具备能力**：

* 节点增删改、拖拽、折叠。
* 节点 `link`、`note` 编辑。
* 布局切换、撤销重做、缩放平移。
* 工具栏（图标、图片、超链接、备注、标签、概要、关联线、公式、外框等）。
* 导入/导出。

**需要补充的对接点**（本期工作）：

1. **接受外部传入的初始数据**：`openTab` 时能把 `.smm` 内容传进组件。
2. **暴露数据变更事件**：`data_change` 时通知外层自动保存。
3. **暴露节点点击事件**：节点 `link` 有值时触发外层跳转。
4. **备注面板集成章节引用**：工具栏"备注"按钮打开的面板里，增加"引用文档章节"入口。
5. **提供只读渲染模式**：供 Markdown 内嵌导图使用。

**SimpleMindMap 初始化示例**：

```ts
import MindMap from "simple-mind-map";

const mindMap = new MindMap({
  el: document.getElementById("mindMapContainer"),
  data: JSON.parse(smmContent),   // 从 .smm 读入
  readonly: false,                 // 内嵌预览时设 true
});

// 数据变更 → 自动保存
mindMap.on('data_change', () => {
  scheduleSave(smmPath, mindMap.getData());
});

// 节点点击 → 跳转
mindMap.on('node_click', (node) => {
  const link = node.getData('link');
  if (link) handleLinkNavigate(link, currentSmmPath);
});

// 保存
const data = mindMap.getData();
fs.writeFileSync(smmPath, JSON.stringify(data, null, 2));
```

***

### 6.6 【本期重点】文件路由与调用

这是"调用未实现"的核心。定义三种调用入口，统一由 `FileRouter` 处理。

#### 6.6.1 文件路由服务

```ts
interface FileRouter {
  // 打开文件（Tab 中）
  open(path: string, options?: { anchor?: string }): Promise<void>;
  
  // 内嵌渲染（返回组件描述，供 Markdown 使用）
  resolveEmbed(path: string): { kind: 'mindmap' | 'image' | 'unknown'; abs: string };
  
  // 链接跳转
  navigate(href: string, fromPath: string): Promise<void>;
}
```

#### 6.6.2 调用入口 1：文件树 → 编辑器

```ts
// 文件树点击节点
function onTreeItemClick(node: FileNode) {
  if (node.type === 'dir') return;
  
  const ext = path.extname(node.path);
  switch (SUPPORTED[ext]) {
    case 'markdown':
      fileRouter.open(node.path);        // 打开 Markdown 编辑器
      break;
    case 'mindmap':
      fileRouter.open(node.path);        // 打开 SimpleMindMap 编辑器
      break;
    default:
      // 其他类型：系统默认程序打开，或提示不支持
      break;
  }
}
```

**路由内部**：

```ts
async function open(path: string, options?: { anchor?: string }) {
  const ext = path.extname(path);
  const kind = SUPPORTED[ext];
  
  // 1. 若已有 Tab，激活
  const existing = tabs.find(t => t.path === path);
  if (existing) {
    activateTab(existing.id);
    if (options?.anchor) scrollToAnchor(options.anchor);
    return;
  }
  
  // 2. 读取内容
  const content = await fs.readFile(path, 'utf-8');
  
  // 3. 新建 Tab，路由到编辑器
  const tab = createTab({
    path,
    kind,
    content,              // md 传字符串；smm 传 JSON
    anchor: options?.anchor,
  });
  
  activateTab(tab.id);
}
```

#### 6.6.3 调用入口 2：Markdown 链接 → 跳转

```ts
// Markdown 编辑器中点击链接
function onMarkdownLinkClick(href: string, fromPath: string) {
  fileRouter.navigate(href, fromPath);
}

async function navigate(href: string, fromPath: string) {
  const { abs, kind, anchor } = resolveLink(fromPath, href);
  
  // 1. 文件不存在 → 提示创建
  if (!await fs.exists(abs)) {
    return promptCreate(abs, kind);
  }
  
  // 2. 打开
  await open(abs, { anchor });
}
```

#### 6.6.4 调用入口 3：Markdown 嵌入 → 内嵌渲染

```ts
// Markdown 编辑器解析到 ![x](./a.smm) 时
function renderEmbed(node) {
  const { abs, kind } = resolveLink(currentFile, node.url);
  
  if (kind === 'mindmap' && abs.endsWith('.smm')) {
    // 替换为只读导图组件
    return <MindMapPreview src={abs} readonly height="400px" />;
  }
  
  if (kind === 'image') {
    return <img src={abs} />;
  }
  
  return <span className="broken-link">无法嵌入: {node.url}</span>;
}
```

**`MindMapPreview` 组件**：

```vue
<template>
  <div class="mindmap-preview" @click="openInTab">
    <div ref="container" :style="{ height }"></div>
  </div>
</template>

<script setup>
import MindMap from "simple-mind-map";

const props = defineProps({
  src: String,
  readonly: { type: Boolean, default: true },
  height: { type: String, default: '400px' },
});

const container = ref(null);
const emit = defineEmits(['open']);

onMounted(async () => {
  const content = await fs.readFile(props.src, 'utf-8');
  const mindMap = new MindMap({
    el: container.value,
    data: JSON.parse(content),
    readonly: true,          // 只读
    enableFreeDrag: false,
  });
});

function openInTab() {
  // 点击内嵌预览 → 在 Tab 中打开可编辑版本
  emit('open', props.src);
}
</script>
```

#### 6.6.5 调用入口 4：导图节点 link → Markdown 跳转

```ts
// 导图编辑器内，节点点击
mindMap.on('node_click', (node) => {
  const link = node.getData('link');
  if (!link) return;
  
  // 交由 FileRouter 处理
  fileRouter.navigate(link, currentSmmPath);
});
```

#### 6.6.6 链接解析统一函数

```ts
function resolveLink(fromPath: string, href: string): {
  abs: string;
  kind: 'markdown' | 'mindmap' | 'image' | 'other';
  anchor?: string;
} {
  const [filePart, anchor] = href.split('#');
  const abs = path.resolve(path.dirname(fromPath), filePart);
  const ext = path.extname(abs);
  
  let kind: 'markdown' | 'mindmap' | 'image' | 'other' = 'other';
  if (SUPPORTED[ext] === 'markdown') kind = 'markdown';
  else if (SUPPORTED[ext] === 'mindmap') kind = 'mindmap';
  else if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)) kind = 'image';
  
  return { abs, kind, anchor };
}
```

***

### 6.7 【本期重点】章节引用（核心功能）

#### 6.7.1 概念

* **章节**：Markdown 中一个标题及其下属内容，直到下一个同级或更高级标题。
* **引用块**：导图备注或 Markdown 中的一个视图组件，指向某文件的某章节。
* **真相源**：内容永远存在 md 文件中；引用块不复制内容，只读写。

#### 6.7.2 章节 ID 与索引

* 章节 ID 采用**短哈希**（如 `a1b2c3`），生成规则：`hash(file + titlePath + 首次出现时间)`。
* 索引存于 `.mindlink/sections.json`，键为 `file → sectionId → {path, level, rev, contentHash, lastModified}`。
* 定位优先用 ID；ID 找不到时，用 `path + contentHash` 兜底匹配。
* 章节被删除/找不到 → 引用块标红，提示"引用失效"，可重选或转为纯文本。

#### 6.7.3 章节解析（必须用 AST，禁止正则）

```ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';

interface Section {
  id: string;
  level: number;
  title: string;
  path: string[];        // 标题层级路径
  startLine: number;     // 标题行
  endLine: number;       // 章节结束行（不含）
  content: string;       // 标题以下正文
  contentHash: string;
}

function parseSections(md: string, file: string): Section[] {
  const tree = unified().use(remarkParse).parse(md);
  // 遍历 heading 节点，按 level 切块
  // 计算每块的 startLine/endLine（利用 node.position）
  // 分配/复用 sectionId（查索引表，找不到则新建）
  // 计算 contentHash
}
```

#### 6.7.4 章节读

```ts
function getSection(file: string, sectionId: string): {
  content: string;
  rev: number;
  contentHash: string;
  sectionPath: string[];
};
```

#### 6.7.5 章节写回

```ts
function replaceSection(
  file: string,
  sectionId: string,
  newContent: string
): { newRev: number; newHash: string };
```

**步骤**：

1. 读文件内容 → AST 解析 → 定位 section 的 `startLine`/`endLine`。
2. 保留标题行，只替换正文部分（如允许改标题则整体替换，需在设置中明确）。
3. 用 `newContent` 拼接新文件内容。
4. 写入文件。
5. 计算新 `rev = oldRev + 1`、新 `contentHash`。
6. 更新 `sections.json`。
7. 广播 `section:updated` 事件。

**禁止使用正则定位**：代码块内可能含 `#`，正则必错。

#### 6.7.6 备注中的引用存储（方案 A）

SimpleMindMap 的 `note` 是字符串。引用信息以**隐藏注释**形式嵌入：

```
这里是用户自己的备注文字

<!-- ref:{"file":"docs/requirements.md","sectionId":"a1b2c3","sectionPath":["需求分析"],"mode":"editable"} -->
```

**读写工具函数**：

```ts
interface RefData {
  file: string;
  sectionId: string;
  sectionPath: string[];
  mode: 'readonly' | 'editable';
}

// 从 note 字符串解析出 ownContent 和 refs
function parseNote(note: string): { ownContent: string; refs: RefData[] } {
  const refRegex = /<!--\s*ref:(.*?)\s*-->/g;
  const refs: RefData[] = [];
  let match;
  while ((match = refRegex.exec(note)) !== null) {
    try { refs.push(JSON.parse(match[1])); } catch {}
  }
  const ownContent = note.replace(refRegex, '').trim();
  return { ownContent, refs };
}

// 把 ownContent 和 refs 序列化回 note 字符串
function serializeNote(ownContent: string, refs: RefData[]): string {
  const refParts = refs.map(r => `<!-- ref:${JSON.stringify(r)} -->`);
  return [ownContent, ...refParts].filter(Boolean).join('\n\n');
}
```

#### 6.7.7 引用块 UI（模式 B：原地编辑）

在导图备注面板中，每个引用块显示为：

```
┌─────────────────────────────────────────────┐
│ 📌 引用自 requirements.md · 需求分析          │
│ [↗ 打开源文件] [✏️ 编辑] [🔗 解除引用]         │
├─────────────────────────────────────────────┤
│  （可编辑区域，与 md 编辑器同源的富文本/源码）  │
│  这里显示章节正文，用户可直接修改...           │
│                                             │
└─────────────────────────────────────────────┘
```

* 编辑时实际是在改 md 文件对应章节。
* 失焦或防抖 500ms → 触发提交。
* 若冲突 → 弹冲突对话框（见 6.7.9）。

#### 6.7.8 乐观锁（Revision）

**核心原则**：

* 每个章节一个 `rev`，整数，单调递增，持久化于 `sections.json`。
* 每次成功写回，`rev + 1`，并更新 `contentHash`。
* 引用块持有 `baseRev`（读时的版本）。

**提交流程**：

```ts
async function commitEdit(ref: RefData & { baseRev: number; baseHash: string }, newContent: string) {
  const current = await sectionService.get(ref.file, ref.sectionId);

  // 1. 乐观锁校验
  if (current.rev !== ref.baseRev) {
    return handleConflict(ref, current, newContent);
  }

  // 2. hash 校验（防外部手改但索引未更新）
  if (current.contentHash !== ref.baseHash) {
    return handleConflict(ref, current, newContent);
  }

  // 3. 写回
  const { newRev, newHash } = await sectionService.replaceSection(
    ref.file, ref.sectionId, newContent
  );

  // 4. 更新引用块状态
  ref.baseRev = newRev;
  ref.baseHash = newHash;

  // 5. 广播
  eventBus.emit('section:updated', {
    file: ref.file,
    sectionId: ref.sectionId,
    rev: newRev,
    source: 'mind-note',
  });
}
```

**规则**：

* 只有**内容真正变化**时才 `rev + 1`（空保存不加）。
* 一次提交算一次锁，防抖窗口内 `baseRev` 不变。
* `rev` 必须持久化，重启后仍能判定新旧。

#### 6.7.9 冲突处理（最后写入生效 + 提示）

**策略**：检出冲突后，**不静默覆盖**，弹窗提示用户，用户确认后按"最后写入生效"覆盖，同时保留被覆盖内容快照。

**冲突对话框**：

```
┌────────────────────────────────────────────────┐
│ ⚠️ 章节「需求分析」已在别处被修改                │
├────────────────────────────────────────────────┤
│  你的修改（导图备注）  │  当前内容（Markdown）   │
│  ────────────────     │  ─────────────────      │
│  ...                  │  ...                    │
├────────────────────────────────────────────────┤
│ [保留我的并覆盖] [用最新的] [手动合并] [取消]     │
└────────────────────────────────────────────────┘
```

**行为定义**：

* **保留我的并覆盖**：写入前把当前内容快照存入 `.mindlink/history/`，然后强制写回，`rev = current.rev + 1`。
* **用最新的**：丢弃本地编辑，重新加载内容，`baseRev = current.rev`。
* **手动合并**：打开双栏 diff 编辑器，用户编辑后作为 newContent 提交。
* **取消**：保留草稿（内存），不写回。

**自动合并（可选增强）**：若双方改动不重叠，可用 `node-diff3` 三路合并（base/mine/theirs）自动完成，无需弹窗。

#### 6.7.10 同步机制

**事件总线**：

```ts
eventBus.on('section:updated', ({ file, sectionId, rev, source }) => {
  // 更新所有引用块（除发起者）
  refService.getAllBySection(file, sectionId)
    .filter(r => r.source !== source)
    .forEach(ref => {
      ref.baseRev = rev;
      ref.reload();      // 重读内容
    });
});
```

**触发时机**：

| 事件 | 处理 |
| --- | --- |
| 导图备注编辑 | 防抖 500ms → commitEdit |
| Markdown 编辑器编辑 | 防抖保存 → commitEdit（source: 'markdown-editor'） |
| 外部文件改动 | chokidar → 重新解析 → 校验 rev → 广播 |
| 打开引用块 | 重读内容，刷新 baseRev |

**防抖与静默期**：只广播"已提交"的变更，不广播"正在输入"，避免死循环与光标乱跳。

**光标保护**：若某视图正在聚焦编辑，收到外部刷新时，暂缓刷新并提示"内容已更新，点击刷新"。

#### 6.7.11 章节失效处理

| 情况 | 检测 | 处理 |
| --- | --- | --- |
| 章节被删 | 索引找不到 sectionId | 标红，提示"引用失效"，可重选或转纯文本 |
| 标题被改 | ID 在，path 变 | 自动更新显示，无感 |
| 标题层级变 | level 变 | 重新解析，提示边界可能变化 |
| 文件被删 | 文件不存在 | 显示缓存内容，只读，提示"源文件已删除" |
| 文件重命名 | 路径变 | 尝试用 ID 匹配修复引用 |

**缓存兜底**：引用块本地存 `cachedContent`，源不可用时至少可读。

***

### 6.8 反向链接（可选）

* 基于 `refs.json` 与全量扫描构建。
* 编辑器底部显示"被以下文件引用"。
* 点击跳转。

***

### 6.9 搜索

* **文件名搜索**：顶栏输入框，模糊匹配。
* **全文搜索**：回车或点放大镜展开全文搜索面板，跨 `.md` 与 `.smm` 节点文字与备注。
* 结果列表点击跳转并高亮。

***

### 6.10 大纲

* **Markdown 大纲**：解析标题层级，右侧面板，点击滚动定位。
* **导图大纲**：本质是导图本身，可省略；或提供列表视图。

***

### 6.11 命令总线（CommandBus）

**作用**：工具栏按钮、快捷键、右键菜单统一走同一条命令通道，避免逻辑重复。

```ts
interface CommandBus {
  execute(commandId: string, payload?: any): Promise<void>;
  register(commandId: string, handler: Handler): void;
  isEnabled(commandId: string): boolean;   // 用于按钮禁用态
}
```

**示例命令**：

```ts
// 思维导图
'mindmap.undo' / 'mindmap.redo'
'mindmap.applyFormatBrush'
'mindmap.addSiblingNode' / 'mindmap.addChildNode' / 'mindmap.deleteNode'
'mindmap.insertImage' / 'mindmap.insertIcon'
'mindmap.insertLink' / 'mindmap.openNote' / 'mindmap.insertTag'
'mindmap.insertSummary' / 'mindmap.insertRelation'
'mindmap.insertFormula' / 'mindmap.insertBoundary'
'mindmap.toggleOutline'
'mindmap.new' / 'mindmap.open' / 'mindmap.save' / 'mindmap.saveAs'
'mindmap.import' / 'mindmap.export'

// Markdown
'markdown.undo' / 'markdown.redo'
'markdown.toggleBold' / 'markdown.toggleItalic' / ...
'markdown.insertQuote' / 'markdown.insertList' / ...
'markdown.insertImage' / 'markdown.insertLink' / 'markdown.insertSectionRef'
'markdown.toggleOutline'
'markdown.new' / 'markdown.open' / 'markdown.save' / 'markdown.saveAs'
'markdown.import' / 'markdown.export'

// 通用
'app.openWorkspace' / 'app.search' / 'app.toggleTheme' / 'app.settings'
```

**快捷键映射**（示例）：

| 快捷键 | 命令 |
| --- | --- |
| Ctrl+Z | `*.undo`（按当前编辑器类型） |
| Ctrl+Shift+Z | `*.redo` |
| Ctrl+B | `markdown.toggleBold` |
| Ctrl+S | `*.save` |
| Ctrl+Shift+F | `app.search` |
| Enter（导图节点选中） | `mindmap.addSiblingNode` |
| Tab（导图节点选中） | `mindmap.addChildNode` |

***

## 七、界面布局（无菜单栏 + 上下文工具栏）

### 7.1 整体布局

```
┌──────────────────────────────────────────────────────────────┐
│ [顶栏 40px]  ⌂  📁 工作区▾    🔍 搜索      ⚙  🌙  ─  □  ✕      │
├──────────┬───────────────────────────────────────────────────┤
│          │ [Tab 条 36px]  Tab1 | Tab2 | Tab3                 │
│          ├───────────────────────────────────────────────────┤
│          │ [工具栏 44px]  ★ 随 Tab 类型切换                    │
│  侧边栏   ├───────────────────────────────────────────────────┤
│  240px   │                                                   │
│ (可调宽)  │              编辑区（自适应）                      │
│          │                                                   │
│          │                                                   │
│          ├───────────────────────────────────────────────────┤
│          │ [状态栏 28px]  字数 · 行列 · 保存 · 反向链接         │
└──────────┴───────────────────────────────────────────────────┘
```

### 7.2 顶部条（替代传统菜单栏）

极简一条，只放全局操作：

| 元素 | 作用 |
| --- | --- |
| ⌂ 应用图标 | 点击弹出小菜单（关于、退出等） |
| 📁 工作区名 ▾ | 切换/打开/关闭工作区，最近列表 |
| 🔍 搜索框 | 默认搜文件名，回车/点放大镜展开全文搜索面板 |
| ⚙️ | 设置面板 |
| 🌙 | 主题切换 |
| ─ □ ✕ | 窗口控制 |

> 可做成**可隐藏**：鼠标移到顶部才出现，或按 Alt 显示。

### 7.3 上下文工具栏（核心）

**切换规则**：

```
当前激活 Tab 的 kind
   ├─ 'mindmap'  → 渲染 <MindToolbar />
   ├─ 'markdown' → 渲染 <MarkdownToolbar />
   └─ 无 Tab      → 工具栏留空 / 显示"打开文件"
```

工具栏高度固定（44px），位于 Tab 条下方、编辑区上方。

#### 7.3.1 思维导图工具栏（已完成，需接入 CommandBus）

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ↶  ↷  │ 格式刷 │ 同级节点  子节点  删除节点 │ 图片 图标 超链接 备注 标签 概要 关联线 公式 外框 │ 目录 │ 新建 打开 保存 另存为 │ 导入 导出 │
└────────────────────────────────────────────────────────────────────────────┘
```

| 分组 | 按钮 | 命令 ID | 说明 |
| --- | --- | ----- | --- |
| 撤销 | 撤销 / 重做 | `mindmap.undo` / `mindmap.redo` |  |
| 格式 | 格式刷 | `mindmap.applyFormatBrush` | 复制节点样式 |
| 节点 | 同级节点 / 子节点 / 删除节点 | `mindmap.addSiblingNode` / `addChildNode` / `deleteNode` | 结构操作 |
| 内容 | 图片 / 图标 / 超链接 / **备注** / 标签 / 概要 / 关联线 / 公式 / 外框 | `mindmap.insertImage` ... `mindmap.openNote` ... | 备注是章节引用入口 |
| 导航 | 目录 | `mindmap.toggleOutline` | 打开/关闭大纲面板 |
| 文件 | 新建 / 打开 / 保存 / 另存为 | `mindmap.new` / `open` / `save` / `saveAs` |  |
| 交换 | 导入 / 导出 | `mindmap.import` / `mindmap.export` |  |

> **"备注"按钮** → 打开备注面板 → 面板顶部提供 **[🔗 引用文档章节]** → 进入章节选择器。

#### 7.3.2 Markdown 工具栏（对称设计）

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ↶  ↷  │ B  I  S  `  H1 H2 H3 │ 引用 列表 任务 表格 代码 公式 分割线 │ 图片 链接 章节引用 │ 目录 │ 新建 打开 保存 另存为 │ 导入 导出 │
└────────────────────────────────────────────────────────────────────────────┘
```

| 分组 | 按钮 | 命令 ID | 说明 |
| --- | --- | ----- | --- |
| 撤销 | 撤销 / 重做 | `markdown.undo` / `redo` |  |
| 文本 | 粗体 / 斜体 / 删除线 / 行内代码 / H1 / H2 / H3 | `markdown.toggleBold` ... |  |
| 块 | 引用 / 无序列表 / 有序列表 / 任务列表 / 表格 / 代码块 / 公式 / 分割线 | `markdown.insertQuote` ... |  |
| 插入 | 图片 / 链接 / **章节引用** | `markdown.insertImage` / `insertLink` / `insertSectionRef` | 章节引用是核心入口 |
| 导航 | 目录 | `markdown.toggleOutline` |  |
| 文件 | 新建 / 打开 / 保存 / 另存为 | `markdown.new` / `open` / `save` / `saveAs` |  |
| 交换 | 导入 / 导出 | `markdown.import` / `export` |  |

***

## 八、关键流程时序

### 8.1 打开工作区

```
用户选择文件夹
   → 扫描目录，生成文件树
   → 读取/初始化 .mindlink
   → 若索引缺失，全量解析 md 建 sections.json
   → 启动 chokidar
   → 渲染树
```

### 8.2 文件树打开 .smm

```
用户点击 diagrams/arch.smm
   → FileRouter.open('diagrams/arch.smm')
   → 读文件 → JSON.parse
   → 新建 Tab (kind='mindmap')
   → 渲染 MindMapEditor，传入 data
   → SimpleMindMap 实例化
```

### 8.3 Markdown 中链接到 .smm

```
md 内容：[架构图](./diagrams/arch.smm)
用户点击链接
   → FileRouter.navigate('./diagrams/arch.smm', 'docs/overview.md')
   → resolveLink → { abs: '/ws/diagrams/arch.smm', kind: 'mindmap' }
   → FileRouter.open(abs)
   → 打开导图 Tab
```

### 8.4 Markdown 中嵌入 .smm

```
md 内容：![架构图](./diagrams/arch.smm)
Markdown 渲染器解析到 image 节点
   → resolveLink → kind='mindmap'
   → 替换为 <MindMapPreview src=abs readonly />
   → 组件内 SimpleMindMap 实例化，readonly=true
用户点击预览
   → emit('open', abs) → FileRouter.open(abs) → Tab 打开可编辑版
```

### 8.5 导图节点 link 跳到 md

```
导图节点 data.link = './docs/requirements.md#功能列表'
用户点击节点
   → SimpleMindMap 'node_click' 事件
   → FileRouter.navigate('./docs/requirements.md#功能列表', 'diagrams/arch.smm')
   → resolveLink → { abs, kind: 'markdown', anchor: '功能列表' }
   → FileRouter.open(abs, { anchor })
   → 打开 md Tab 并滚动到锚点
```

### 8.6 导图备注引用 md 章节（无冲突）

```
用户点工具栏"备注" → 打开备注面板
   → 点"引用文档章节" → 打开章节选择器
   → 选中 docs/requirements.md 的"需求分析"章节
   → 生成 RefData，写入节点 note（注释形式）
   → 保存 .smm
   
用户编辑引用块内容
   → 防抖 500ms → commitEdit
   → 读 current（rev=7），baseRev=7 ✅
   → replaceSection 写回 md
   → rev=8，更新 sections.json
   → 广播 section:updated
   → 其他引用块刷新，本引用块 baseRev=8
```

### 8.7 冲突（最后写入生效）

```
导图引用块 baseRev=7
Markdown 编辑器先保存 → rev=8
导图引用块提交 → current.rev=8 ≠ baseRev=7
   → 冲突弹窗
   → 用户选"保留我的并覆盖"
   → 快照当前内容到 history/
   → 强制写回，rev=9
   → 广播
```

***

## 九、开发路线图（针对"调用未实现"）

> **已有部分**：思维导图编辑器（SimpleMindMap）、`.smm` 读写。
> **本期目标**：把编辑器接进主框架，实现所有调用与章节引用。

### 阶段 1：文件路由骨架

1. `FileRouter` 服务：`open()` / `navigate()` / `resolveEmbed()`。
2. 文件树点击 → 按扩展名路由到对应编辑器。
3. Tab 管理集成：打开已存在文件激活而非重复。
4. `.smm` 文件读取 → 传入 SimpleMindMap 组件。

### 阶段 2：双向链接调用

5. Markdown 编辑器链接解析（`[x](./a.smm)` → 跳转）。
6. Markdown 编辑器嵌入渲染（`![](./a.smm)` → `MindMapPreview`）。
7. 导图节点 link → Markdown 跳转（`node_click` 事件）。
8. 锚点定位（`file.md#anchor` → 滚动高亮）。
9. 失效链接提示与修复入口。

### 阶段 3：章节引用（核心）

10. `SectionService`：`parseSections` / `getSection` / `replaceSection`。
11. `sections.json` 索引读写。
12. 备注面板集成：解析/序列化 note 中的引用注释。
13. 章节选择器 UI。
14. 引用块组件（显示 + 编辑）。
15. `RevisionService`：乐观锁 `commitEdit`。
16. 冲突弹窗 + history 快照。
17. `EventBus`：跨视图同步。

### 阶段 4：CommandBus 与工具栏

18. `CommandBus` 实现。
19. 思维导图工具栏命令接入（映射到 SimpleMindMap API）。
20. Markdown 工具栏实现。
21. 快捷键绑定。

### 阶段 5：搜索与大纲

22. 文件名搜索、全文搜索（含 `.smm` 节点文字与备注）。
23. Markdown 大纲面板。

### 阶段 6：打磨

24. 主题、设置。
25. 反链、自动补全、格式互转（可选）。

***

## 十、测试要点

| 模块 | 测试 |
| --- | --- |
| 文件路由 | 文件树点击 md/smm/其他，路由正确；Tab 去重 |
| 链接跳转 | md→smm、smm→md、锚点、相对路径 |
| 嵌入渲染 | `![](./a.smm)` 正确渲染只读；点击可打开可编辑 |
| 章节解析 | 嵌套标题、代码块含 `#`、空章节、连续标题 |
| 写回 | 只改正文不改标题、边界正确、AST 定位准确 |
| 备注序列化 | note 字符串 ↔ ownContent + refs 双向转换无损 |
| 乐观锁 | 无冲突、单侧冲突、双侧冲突、外部改动 |
| 冲突处理 | 覆盖、丢弃、合并、取消各分支 |
| 同步 | 双向编辑、防抖、光标不乱跳 |
| 失效 | 删章节、改标题、删文件、重命名 |
| 命令总线 | 工具栏与快捷键触发同一命令 |

***

## 十一、注意事项（避免踩坑）

1. **写回必须用 AST**，禁止正则定位章节边界。
2. **`rev` 只在内容真变时 +1**，避免空保存导致误冲突。
3. **防抖窗口内 `baseRev` 不变**，一次提交一次锁。
4. **广播带 `source`**，否则发起者刷新自己导致光标乱跳。
5. **索引损坏要能重建**：提供全量扫描重建 `sections.json` 的能力。
6. **覆盖式写入前存快照**到 `.mindlink/history/`，保证可回滚。
7. **chokidar 事件要防抖**，编辑器自动保存会触发大量事件。
8. **相对路径统一**，写盘用相对工作区根的路径，避免绝对路径污染。
9. **`.mindlink` 可选加入 .gitignore**，但建议提交（团队共享索引）——需在文档中说明。
10. **章节 ID 生成要稳定**，同标题多次出现时用路径 + 序号区分。
11. **`.smm` 兼容性**：章节引用信息以注释形式嵌入 `note`，不改 SimpleMindMap 原生结构，保证文件仍可被原库正常打开。
12. **SimpleMindMap 的 `note` 是字符串**：所有结构化引用必须先序列化再写入，读取时再解析，务必保证往返无损。
13. **内嵌预览用 `readonly: true`**：避免用户在只读视图里编辑导致状态混乱。

***

## 十二、验收标准（MVP）

* [ ] 能打开一个含 md 和 .smm 的文件夹，树形展示。
* [ ] 点击 `.smm` 文件能在 Tab 中打开 SimpleMindMap 编辑器并正确渲染。
* [ ] md 能所见即所得编辑并保存。
* [ ] md 中 `[x](./a.smm)` 点击可跳转打开导图。
* [ ] md 中 `![](./a.smm)` 可内嵌渲染只读导图，点击可打开可编辑版。
* [ ] 导图节点 link 可跳转到 md 指定锚点。
* [ ] 导图备注可引用 md 某章节，显示内容并可原地编辑。
* [ ] 编辑后 md 文件对应章节同步更新。
* [ ] 两处同时编辑触发乐观锁，冲突时弹窗，选择覆盖后保留快照。
* [ ] 章节被删/文件被删时引用块提示失效，不崩溃。
* [ ] 全文搜索可用（含 `.smm` 节点）。
* [ ] 主题可切换。
* [ ] 应用重启后恢复上次工作区与 Tab。

***

## 十三、术语对照（给实现者）

| 术语 | 含义 |
| --- | --- |
| Workspace | 用户打开的一个根文件夹 |
| Section | md 中一个标题及其内容 |
| SectionRef | 引用块，导图备注或 Markdown 中对某章节的引用视图 |
| baseRev | 引用块读到的章节版本 |
| current.rev | 索引表中当前章节版本 |
| SSOT | Markdown 文件是内容唯一真相 |
| commitEdit | 引用块提交编辑的入口函数 |
| handleConflict | 冲突处理入口 |
| .smm | 思绪思维导图（SimpleMindMap）JSON 文件 |
| FileRouter | 统一文件打开/跳转/嵌入路由 |
| CommandBus | 工具栏/快捷键统一命令总线 |

***

## 十四、交付物清单

实现者应产出：

1. 可运行的桌面应用（MVP 功能齐全，导图部分对接已有 SimpleMindMap）。
2. `FileRouter` 完整实现（三种调用入口）。
3. `.mindlink` 索引结构的读写实现。
4. 章节解析/读/写三个核心函数及单元测试。
5. 备注中引用信息的序列化/反序列化实现（保证 `.smm` 兼容性）。
6. 乐观锁与冲突处理的完整实现。
7. CommandBus 及两套工具栏接入。
8. 使用说明文档（如何打开工作区、如何引用章节）。
9. 已知限制说明。