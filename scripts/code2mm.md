# code2mm — 代码转思维导图（AI 集成契约文档）

> **契约版本**：v1.3 ｜ **最后更新**：2026-10-09 ｜ **对应 CLI**：`scripts/code2mm.mjs`（v2.0.41 规范容器形状修复后）
> **受众**：AI 编程助手 / 自动化 Agent。
> **用途**：让 AI 在“阅读代码”时，把目录或单文件的**真实结构骨架**抽成一张可被「思绪思维导图」直接打开的 `.smm` 脑图。
> **当前形态**：CLI（MVP）。
> **后续计划**：包成 MCP server（具体方案 A/B/C 见 §9）；本文件即是工具契约，包 MCP 时无需重写。
> **核心约束**：无论 CLI 还是未来 MCP，`.smm` 输出 schema 契约（§4）是唯一真源，不变。
> **配套源码**：`scripts/code2mm.mjs`（CLI）、`web/src/services/smmCodec.js`（`.smm` 编解码契约）。

---

## 0. 一句话用法

```bash
node scripts/code2mm.mjs <targetDir|file> [--out file.smm] [--name 根名] [--max-depth N] [--no-imports] [--no-lines]
```

产出 `.smm` 后，用「思绪思维导图」**双击打开**即可（Windows 已注册 `.smm` 文件关联）。

**快速开始**（从零到打开）：

1. 运行（下面的相对路径示例**假设在仓库根目录执行**）：`node scripts/code2mm.mjs web/src/services --out code2mm-demo/services.smm`
2. 双击 `code2mm-demo/services.smm` → 「思绪思维导图」打开，看到 `services/` 骨架图。

> 运行目录不限（TypeScript 按脚本自身位置解析，见 §2）；上面命令里的相对路径按**当前工作目录**解析，写绝对路径最稳。

---

## 1. 它做什么 / 不做什么

**做**（事实层，零幻觉）：
- 用 TypeScript 编译器（**复用仓库内已有的** `electron-app/node_modules/typescript`，**不新增任何依赖**）解析目标。
- 抽取**导出面**：`function` / `class` / `interface` / `type` / `enum` / `const`（及箭头函数常量）。
- 抽类成员：方法（含 `constructor`/`get`/`set`）、属性，带 `static`/`#`/`protected`/`readonly`/`async` 修饰符。
- 抽相对路径 `import` 依赖（仅 `./` `../` 开头；第三方包忽略）。
- 镜像文件夹层级（**跳过隐藏项与 `SKIP_DIRS`**，规则见 §6），节点名与行号**全部来自真实 AST**。

**不做**（语义层，留给 LLM / 后续版本）：
- 不概括“这个模块是干什么的”、不合并、不推断调用关系图、不评价复杂度。
- 不做类型推导、不做跨文件调用分析。

**设计原则**：所有节点文本都是 AST 真值，行号是真值位置；不凭空造符号名。

---

## 2. 运行环境

| 项 | 要求 |
|---|---|
| 运行时 | Node ≥ 16（ESM，脚本用 `import`） |
| TypeScript | **复用** `electron-app/node_modules/typescript`（脚本内 `createRequire` 解析，**不要**另行 `npm i`） |
| 入口 | `scripts/code2mm.mjs` |
| 编码 | UTF-8 |

> 无需安装任何依赖。**运行目录不限**：TypeScript 按脚本自身位置绝对解析（`ROOT = resolve(__dirname, '..')`，已实证从任意工作目录运行成功）；仅 `<target>` 与 `--out` 的**相对路径**按当前工作目录解析。

---

## 3. 命令行接口

### 位置参数
- `<targetDir|file>`：**必填**。目录则递归镜像；文件则只抽该文件。可为相对或绝对路径。

### 选项

| 标志 | 默认值 | 说明 |
|---|---|---|
| `--out <file.smm>` | `./<targetBasename>.smm`（写到**当前工作目录**） | 输出文件路径 |
| `--name <rootName>` | 目录：`basename(target)+'/'`；文件：`basename 去扩展名` | 脑图根节点文本 |
| `--max-depth N` | `Infinity`（不限制） | 目录递归深度上限；超出处折叠成 `…(depth capped)` 占位 |
| `--no-imports` | 关闭 | 不抽 import 依赖子节点 |
| `--no-lines` | 关闭 | 节点文本不带 `:L<行号>` 后缀 |

> **`targetBasename` 说明**：= 路径最后一段（目录名或文件名）。`path.resolve` 会归一化尾斜杠，Windows `\` 与 POSIX `/` 等价；`web/src/services`、`web/src/services/`、`web\src\services` 三者 basename 均为 `services`，故默认输出 `./services.smm`。

### 示例

```bash
# 抽整个 services 目录 → 默认输出 ./services.smm
node scripts/code2mm.mjs web/src/services

# 抽单文件，指定输出与根名，限深 2，不要 import 分支
node scripts/code2mm.mjs web/src/api/index.js --out code2mm-demo/api.smm --name api --max-depth 2 --no-imports

# 关闭行号（纯结构）
node scripts/code2mm.mjs web/src/utils --no-lines
```

### 输出（stdout 摘要）
```
=== code2mm ===
target   : <绝对路径>
root     : <根节点文本>
nodes    : <节点总数>
out      : <输出绝对路径>
shape    : { app:"smm-multisheet", sheets:[{data:{root}}] }  (app 规范容器形态)
```

> **退出码与错误行为**（CLI 当前实现，以代码为准）：
>
> | 退出码 | 触发条件 | stderr 输出 |
> |---|---|---|
> | `0` | 成功写出 `.smm`（个别文件解析失败不影响，仍按既有节点产出） | 摘要打印到 stdout |
> | `2` | 缺 `<target>` 位置参数，或 `<target>` 不存在/不可读 | 用法提示 / `目标不存在: <path>` |
> | `1` | **（无）——本 CLI 不使用通用错误码**（错误场景只有上行的 `2` 与下述静默容忍两类） | — |
>
> - ⚠️ **未知选项被静默忽略**（不报错、不退出）：**拼错选项名不会得到任何提示**——例如 `--max-dept 2`（少个 h）会被直接跳过、限深实际未生效。传参后请核对 stdout 摘要是否符合预期；如需"未知选项报错退出"需改 CLI 源码（当前未实现）。
> - **全部文件解析失败**：不会专门退出；仍会写出文件（可能 `nodes=0`，含 `[parse-error]` 叶子）。如需“零节点即失败”需改 CLI 源码（当前未实现独立的退出码）。

---

## 4. ⚠️ 输出 `.smm` Schema（契约核心）

**这是 AI 必须严格遵守的形状**。违反会导致打开后是默认模板、甚至被应用自动保存**污染写坏**文件（见 §7 事故）。

### 4.1 必须：规范多 sheet 容器形状

```json
{
  "app": "smm-multisheet",
  "version": 1,
  "activeId": "sheet-1",
  "sheets": [
    {
      "id": "sheet-1",
      "name": "Sheet1",
      "data": { "root": <节点树> }
    }
  ]
}
```

- `app` 固定 `"smm-multisheet"`；`version` 为数字 `1`。
- `activeId` 必须等于某个 `sheets[].id`。
- **`sheets[].data` 必须是 `{ root: <节点树> }` 载荷**（不是裸根节点本身）。这是与「思绪思维导图」自存格式**同一 schema**，应用的 `loadSheetData` 按 `data.root` 取根。
- `version` 由**生成端**写死为数字 `1`（见上）。**解码端**（`decodeSmm`）不校验 `version`、未知值直接透传（只认 `app`/`sheets`/`activeId`），因此对未来未知 `version` 也兼容；若引入破坏性格式变更，会在 `containerSheets`/`decodeSmm` 处加 version 守卫并同步本契约。

### 4.2 节点树形状（simple-mind-map 原生）

每个节点：

```json
{
  "data": { "text": "节点显示文本", "expand": true },
  "children": [ /* 同形状节点，可空数组 */ ]
}
```

- `data.text`：显示文本（支持 `<p>…</p>` HTML，纯文本直接写字符串亦可）。
- `data.expand`：`true` 表示默认展开（CLI 默认全部展开）。
- `children`：子节点数组；**必须存在**（空数组 `[]` 表示叶子）。
- `data.text` 的具体格式（函数/类/行号后缀等）约定见 **§5**。
- **`expand` 一律为 `true`**：CLI 默认全展开，包括 `--max-depth` 深度裁剪产生的 `…(depth capped)` 占位节点也是 `expand:true`（它只是层级截断提示，不影响展开态）。
- `data` 除 `text`/`expand` 外还可包含**应用扩展字段**（备注、关联、图标、样式等，见 §4.4）；本文档只约定 CLI 当前产出的字段，手工生成时的扩展字段**以 §4.4 契约为准，不要自创字段名**。

### 4.3 完整最小示例（AI 直接写文件也用这个）

```json
{
  "app": "smm-multisheet",
  "version": 1,
  "activeId": "sheet-1",
  "sheets": [
    {
      "id": "sheet-1",
      "name": "Sheet1",
      "data": {
        "root": {
          "data": { "text": "my-project/", "expand": true },
          "children": [
            {
              "data": { "text": "utils/  (exp:3 imp:1)", "expand": true },
              "children": [
                { "data": { "text": "formatDate() (1) :L12", "expand": true }, "children": [] },
                { "data": { "text": "class Cache :L20", "expand": true }, "children": [
                  { "data": { "text": "get(key) (1) :L22", "expand": true }, "children": [] }
                ]}
              ]
            }
          ]
        }
      }
    }
  ]
}
```

> **反例（禁止）**：把裸根节点直接当 `sheets[].data`，即
> `{ "app":"smm-multisheet", "sheets":[{ "data": { "data":{"text":"x"}, "children":[] } }] }`
> —— **`data` 缺 `root` 键**，应用会按整图数据取 `.root` 落空 → 回退默认模板并写坏文件。

### 4.4 节点关联外部文件（扩展字段契约）

> CLI（code2mm）当前**不产出**关联字段；本节约束**手工 / AI 生成**时的写法。字段名与行为全部来自源码真值（`refData.js` / `refService.js` / `linkResolver.js` / `Edit.vue`），**自创字段名（如 `md`、`ref`）不会被应用识别**。

**① 引用外部 md（悬浮卡片 + 备注区引用块）— `data._mindlink`**

```json
{
  "data": {
    "text": "需求分析要点",
    "expand": true,
    "_mindlink": {
      "v": 1,
      "mode": "ref",
      "refs": [
        {
          "file": "docs/详细设计_全量改造.md",
          "sectionId": null,
          "sectionPath": ["需求分析"],
          "mode": "content",
          "baseHash": "sha1:…",
          "baseRev": 0,
          "title": "详细设计_全量改造 · 需求分析",
          "cachedContent": "被引用的 md 原文片段（悬浮卡片正文）…"
        }
      ]
    }
  },
  "children": []
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `v` | 建议 | 结构版本，当前 `1` |
| `mode` | 是 | `'ref'`＝引用模式；与 `data.note` **互斥**（ref 模式下 note 置 `null`） |
| `refs[].file` | 是 | **相对当前工作区根**的路径（应用按 `workspaceService.abs()` 解析） |
| `refs[].sectionId` | 是 | `null`＝整文件引用；否则为 md 章节 id |
| `refs[].sectionPath` | 建议 | 章节标题路径数组；`sectionId` 失效时的降级定位线索 |
| `refs[].mode` | 是 | 固定 `'content'`（内容引用） |
| `refs[].baseHash` / `baseRev` | 建议 | 引用时的内容快照（`sha1:…` / 数字），供 stale / 冲突检测 |
| `refs[].title` / `cachedContent` | 建议 | 悬浮卡片显示的标题与正文缓存；缺省时标题退化为 `file · sectionPath` |

**渲染行为**：hover 节点 → 悬浮卡片显示 `📎 title` + `cachedContent`（应用把 `refs` 合并进备注预览）；节点显示备注标识图标（refs 非空即显示）；备注区出现引用块（RefBlock）。同 `file` + `sectionId` + `mode` 视为同一引用（去重）。

**② 跳转链接 — `data.hyperlink`（+ `data.hyperlinkTitle`）/ `data.link`**

- `hyperlink`：simple-mind-map 原生字段，节点上显示**跳转图标**，点击经 fileRouter 统一打开（md / .smm / 图片 / 外链）。
- `link`：引用面板写入的「文件#锚点」串（如 `docs/a.md#需求分析`），备注面板显示用。
- **相对路径解析基准**（linkResolver）：Windows 盘符开头＝绝对路径；`/` 开头＝相对**工作区根**；其余相对路径＝相对**当前文件所在目录**。

**③ 备注 — `data.note`**：纯文本备注；`_mindlink.mode='ref'` 时应为 `null`（互斥，见上）。

**AI 速查**：要"悬浮卡片"用 ①，要"点击跳转"用 ②，两者可共存；最简可用引用只需 `{file, sectionId, sectionPath, mode:'content'}`（无 title/cachedContent 时卡片标题自动退化，**建议带上**以保显示质量）。

---

## 5. 节点文本约定（CLI 自动生成，供 AI 理解/复刻）

| 源 | 节点文本格式 | 示例 |
|---|---|---|
| 导出函数 | `[async ]<name>() (<参数个数>) :L<行>` | `async loadData() (2) :L42` |
| 导出类 | `class <Name> :L<行>` | `class Cache :L20` |
| 类方法 | `[static ][#\|protected ][async ]<name>() (<参数个数>) :L<行>` | `static #flush() (0) :L30` |
| 类属性 | `[static ][readonly ][#\|protected ]<name> :L<行>` | `readonly #size :L25` |
| 接口 | `interface <Name> :L<行>` | `interface NodeOpts :L5` |
| 类型别名 | `type <Name> :L<行>` | `type Id = string :L8` |
| 枚举 | `enum <Name> :L<行>`（成员为子节点） | `enum Mode :L10` |
| const | `const fn <name> :L<行>`（箭头/函数表达式）或 `const <name> :L<行>` | `const fn debounce :L88` |
| 文件节点 | `<filename>  (exp:<导出数> imp:<导入数>)` | `utils.js  (exp:3 imp:1)` |
| import（相对） | `<spec>  <- <绑定>` | `./foo  <- { bar, baz }` |
| 解析失败文件 | `<name> [parse-error]` | `weird.ts [parse-error]` |
| 目录 | `<name>/` | `utils/` |
| 深度裁剪 | `<name>/ …(depth capped)` | `deep/ …(depth capped)` |

- `--no-lines` 时去掉所有 `:L<行>` 后缀。
- `--no-imports` 时不生成 `imports (N)` 子分支。
- **参数个数计数规则**（节点文本中 `(N)` 的来源）：`N` = 该函数声明节点的 `parameters.length`（形参个数）。默认参数、rest 参数（`...args`）、解构参数（`{a,b}` / `[x,y]`）**各计 1 个**（AST 中 rest 参数就是一个 Parameter 节点，故计 1）；`constructor` 同样按 `parameters.length` 计。

---

## 6. 抽取规则细节（确定性行为）

- **跳过目录 / 隐藏项**：扫描任一目录时，凡**名称以 `.` 开头**的条目（如 `.eslintrc.js`、`.gitignore`、`.git` 等隐藏文件与目录）**一律跳过**；`SKIP_DIRS`（`node_modules` `.git` `dist` `dist-electron` `dist-electron2` `.trash` `_trash` `coverage`）同样跳过。例外：若 **`<target>` 本身**就是一个隐藏路径（如 `web/.eslintrc.js`），则照常处理（不进跳过循环）。
- **识别扩展名**：`.ts` `.tsx` `.js` `.jsx` `.mjs` `.cjs`；其余文件忽略。
- **只抽导出符号**：未 `export` 的 `function`/`class`/`interface`/`type`/`enum`/`const` 不入图（类内部成员无论是否导出都会列出）。
- **import 仅相对路径**：以 `.` 开头才入图；裸模块名（如 `react`）忽略。
- 解析异常的文件：生成 `… [parse-error]` 叶子节点，不影响其他文件。
- 行号基于 1 的源码行（`getLineAndCharacterOfPosition` + 1）。

---

## 7. ⚠️ 历史事故（务必规避）

**v2.0.41**：早期 code2mm 产出单图形状 `{ "type":"mindmap", "data": <裸根节点> }`。
「思绪思维导图」的 `decodeSmm` 曾把**裸根节点直接当 `sheet.data`**，下游 `loadSheetData` 见无 `.root` 走 `mindMap.setData(裸节点)` 分支 → 库取 `.root` 落空 → **画布回退默认模板**，且自动保存把文件写坏成
`{ data, children, root:默认模板, view, layout, theme }` 混合体。

**当前已修复**（两端都修）：
- `smmCodec.decodeSmm` 单图分支：无 `.root` 一律包成 `{ root: … }`，已带 `.root` 的透传。
- `code2mm.mjs` 直接产出 §4.1 规范容器形状。

### ⚠️ AI 两条铁律（防止再次写坏文件，最高优先级）

1. 用 CLI 就完事，**不要**自己另写单图形状 `{type:'mindmap',…}` 去绕开 CLI。
2. 若必须手工/程序化生成 `.smm`（例如将来 MCP 直出），**一定**用 §4.1 的容器形状，`sheets[].data` 必须是 `{ root: <节点树> }`。
3. 节点**关联字段同样受契约约束**：引用外部 md 用 `data._mindlink`、跳转链接用 `data.hyperlink`（§4.4）；**不要自创字段名**。

---

## 8. 契约锁（回归测试）

`.smm` 解码契约由 `web/tests/pure/smmCodec.test.mjs` 锁定，覆盖：
- 单图/裸根 decode → `sheets[0].data` 必须有 `.root`（`loadSheetData` 契约）。
- **旧单图形状 `{type:'mindmap', data: <裸根节点>}`（v2.0.41 事故源头）decode → 必须包成 `{root:…}`**：已由用例 `单图（type=mindmap）被包成单 sheet，id 为 root` 与 `单图 decode → sheet.data 必须有 .root` 覆盖（**以用例名定位**，不写行号以免测试文件改动后漂移），改此分支时**勿删**。
- 已是 `{root,view,layout}` 包装体时不二次包裹。
- 被污染混合体（含 `data+children+root`）不被覆盖、原样透传。

运行：`cd web && node --test tests/pure/smmCodec.test.mjs`。
**任何改动 code2mm 输出形状或 smmCodec 解码逻辑，都必须先跑全量 `cd web && node --test` 确保 1071 项全绿。**

---

## 9. 集成路径（CLI → MCP）

- **现在**：AI 在仓库内 `exec` 上面的 `node scripts/code2mm.mjs …`，拿到 `.smm` 路径，交还用户双击打开（或返回路径让用户打开）。
- **下一步（待定 A/B/C）**：
  - **A**：薄壳 MCP server，暴露 `code2mm(target, opts) → file.smm 路径`，复用本 CLI 核心（不改形状）。
  - **B**：在 A 基础上增加 LLM 语义注解（节点 summary 字段）与跨文件调用图，再包 MCP。
  - **C**：调整 CLI 展示层级（如按模块聚合而非镜像文件夹）后再包 MCP。
- 无论哪条，**§4 的 `.smm` schema 契约不变**——这是 CLI 与未来 MCP 共用的唯一真源。

---

## 10. 排障

| 现象 | 原因 / 处理 |
|---|---|
| 打开后是默认模板（而非代码骨架） | 文件是旧单图形状被污染（§7）。删除该 `.smm`，用修复后的 CLI 重新生成；应用中已打开的同名标签需**先关掉再重开**（单实例下重开同名只激活旧标签、不重读磁盘）。 |
| `Cannot find module 'typescript'` | 通常是**仓库结构不完整**——`electron-app/node_modules/typescript` 缺失或被移走（解析基于脚本自身位置，与运行目录无关，已实证任意目录可运行）。不要自行 `npm i typescript`。 |
| 输出文件没出现在预期位置 | 默认输出到**当前工作目录** `./<basename>.smm`，用 `--out` 显式指定绝对路径最稳妥。 |
| 限深没生效 / 行号还在 | 先查选项**拼写**——未知选项会被静默忽略（如 `--max-dept 2` 少个 h 等于没传，见 §3 ⚠️）。 |
| 节点挂了 md 关联但无悬浮卡片 / 无跳转图标 | 字段名必须准确：引用卡片＝`data._mindlink`、跳转图标＝`data.hyperlink`（§4.4），自创字段不被识别；`refs[].file` 按**工作区根**相对路径解析；`_mindlink.mode='ref'` 与 `data.note` 互斥。 |
| 节点数异常少 | 检查是否触发 `--max-depth` 裁剪或 `SKIP_DIRS`；未 `export` 的符号本就不入图（属预期）。 |
| 第二实例秒退 / 报 `bad option` | 沙箱/某些环境带 `ELECTRON_RUN_AS_NODE=1`，直接用 exe 传文件会被当纯 Node 执行。正常用户双击走文件关联不受影响；脚本唤起应用请用 `explorer.exe <file.smm>`。 |
| 节点层级 / 顺序与预期不符 | 当前 CLI 只能按**文件夹层级**镜像，不按模块语义聚合。如需聚合，打开后在画布内手动调整；"按模块聚合"属 §9 的 C 方案（**未来项，当前不可用**）。 |

---

## 变更记录

- **v1.3**（2026-10-09）：**新增 §4.4「节点关联外部文件」契约**（`_mindlink` 引用卡片 / `hyperlink`·`link` 跳转 / `note` 备注，含字段表、路径解析基准、渲染行为——源自 refData/refService/linkResolver/Edit.vue 源码）；§4.2 补扩展字段说明；铁律新增第 3 条（关联字段约束）；§10 补关联排障行；退出码 `1` 并入表格；快速开始标注"假设在仓库根目录执行"；变更记录分条。
- **v1.2**（2026-10-09）：
  - 退出码补"1 不使用"；未知选项静默忽略加 ⚠️ 警示 + §10 限深排障行
  - §8 去行号、改用例名定位；version 表述改为"生成端写死 → 解码端不校验"
  - §1 镜像补跳过引用；**修正 §2/§10 运行目录表述（实证任意目录可运行，原"必须在仓库根目录"说法有误）**
  - const 行补 `:L<行>`；rest 参数计 1 补解释；§10 C 方案标注未来项
  - 新增快速开始；反例关键词加粗；变更记录列表化
- **v1.1**（2026-10-09）：补 basename 定义、version 升级行为、退出码、文件节点行、隐藏项规则、参数计数、裁剪节点 expand、层级不符排障、MCP 表述统一、铁律提级。
- **v1.0**：初版（规范容器形状契约）。

*对应 `scripts/code2mm.mjs` 规范容器形状修复后状态，app v2.0.41+。*
