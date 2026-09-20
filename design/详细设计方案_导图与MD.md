# 详细设计方案：思维导图 + Markdown 双链工作区

> **输入文档**：`design/导图+md.md`（需求与技术方案，以下简称「需求文档」）
> **目标工程**：`mind-map-main` —— 「思绪思维导图」Electron 桌面应用（**既有工程，非绿地项目**）
> **本文定位**：把需求文档落到**当前真实代码库**上，产出可直接据以编码的详细设计：模块划分、接口签名、数据结构、IPC 契约、时序、异常矩阵、测试与路线图。
> **基线**：版本 `2.0.1` / `gitHash df3ac86` / 前端测试 `133/133 通过`（2026-09-20 实测）
> **修订**：v1.5 · 2026-09-20（第五轮：界面/功能盲区复检 H1–H9 + I1–I4；v1.4 为第四轮、v1.3 为第三轮）

### 修订记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-09-20 | 首版。基于 `design/导图+md.md` 落地到本工程，含 10 条决策（D1–D10）、模块接口、IPC 契约、异常矩阵、13 个测试文件、14 条风险。 |
| v1.1 | 2026-09-20 | **架构评审响应版**。见 §0.1「评审意见处置」。核心变更：① 消除 `refService ⇄ revisionService` 双向依赖，提交入口唯一化；② 抽出独立 `workspaceIndex`（索引层不再寄居 `workspaceService`）；③ 引入组合根 + 工厂注入 + `WorkspaceContext`，替代模块级可变单例；④ 新增 `events.js` 集中声明事件，**回声抑制从事件载荷移入 IO 层**（删 `source` 字段）；⑤ 拆 `linkResolver`（纯）/ `fileRouter`（编排）；⑥ `sectionService` 收敛为纯函数（消除命名漂移）；⑦ `docState` 从 `workbookState` 迁出为 `documentStore`；⑧ 冲突四分支改策略表；⑨ `MdEditor.vue` 拆为容器 + 7 个 composable；⑩ 统一 `Result/ErrorInfo`、新增结构化日志、索引重建规则、`migrations/`、测试按纯边界分层；⑪ **新增 §16 分层与依赖规约、§17 演进与废弃**。另修正 v1.0 自身 2 处内部不一致（`workspaceIndex` 有图无文件；`markdown-it` 声明位置描述错误）。 |
| **v1.2** | 2026-09-20 | **第二轮架构评审响应版（v1.1 自身缺陷修复）**。见 §0.2 与 §19。核心变更：① **全文工厂函数统一为闭包，禁用 `this`**（A1，结构性）；② 修 `commitEdit` 步骤 ③–④ 的 `current === undefined` 崩溃（A11，伪码实际 bug）；③ `refService.onSectionCommitted` → **`syncRefSnapshots`**，明确同步 `.smm` 内 `_mindlink.refs[].baseHash/baseRev` 的语义与性能约束（A4）；④ **新增 `L0 基础层`**（`events/logger/context`，零依赖）+ **`CG 组合根层`**（`index.js`/`migrations/`），化解"L3 需 `emit` 却不得 import L5"的分层矛盾；`errors.js` 按"纯值构造"归 **L1**（A3/A13/B1）；⑤ `suppression.hit` 统一为 **`async hit(absPath)`**（内部读盘算 hash），并把登记点唯一化到 `fsApi`，统一 §10-23 与 §7.8 的回声漏判分支（A5/A12/A14-3）；⑥ `documentStore` 只 `serialize/hydrate`，持久化归 L4（A6）；⑦ 补 `getSectionView` 实现要点（A2）、`migrations` 进入 `open()` 伪码（B2）、`workspaceSearch` 走工厂并进组合根（B8）、补 `commandRegistry.js`（A14-4）；⑧ `check-arch.mjs` 断言扩至 **9 类**（A10/B3/B4/B5/B9 + L1/L3 同层互引 + 组合根约束）；⑨ 测试零 mock 指标给出**分层预算与分母定义**（A9）。 |
| **v1.3** | 2026-09-20 | **第三轮架构评审响应版（v1.2 自身缺陷修复 + 收尾）**。见 §0.3 与 §20。**无结构性改动**，核心变更：① **`rebind` 语义定论**（新增 §7.7.1）—— 只改 `id/path`、**不豁免乐观锁**，并证明 v1.2 的写法天然满足（局部解构导致 rebind 写 `baseHash` 亦无效）（C1/C2）；② **补 `N>10` 惰性同步的完整落地路径**（新增 §7.6.6 + refs.json 的 `snapshotPending` 字段 + `calibratePendingSnapshots()` + 「刷新全部引用」入口）（C3）；③ §16.2 补 **`overrides` 契约表与最小 `fakeIo` 示例**（C4）；④ §11.2 新增 **A′ 逐文件等价类扩展表**（112 → 160 可核）（C5）；⑤ 零 mock 验收改为**脚本自动校验**（`check-arch.mjs` 断言 **9 → 10 类**），并修正 v1.2 里写错的 `grep -c … == 0`（C6）；⑥ 统一 `errors.js` 层级归属（修 §5.3/§16.3，C7）；⑦ §16.5 补 4 条 `E_CONFLICT_*` + `ErrorInfo.kind`（C11）；⑧ §12 P0 交付边界（C8）、§16.1 L0"零依赖"精确定义（C9）、`runMigrations({meta})` 免重复 IO（C10）；⑨ **自查修 3 处**：`commitEdit` 补返回 `rebound`（D1）、迁移失败改"先 full 重建再降级"（D3）、§7 章首声明伪码省略的 import 来源（D4）。**测试预算同步上调**：pure ≥160 / orchestration ≥51 / 合计 ≥227（pure 占 70.5%）。 |
| **v1.4** | 2026-09-20 | **第四轮评审响应版（功能 F1–F7 + 界面 G1–G9）**。见 §0.4 与 §21。**无架构/分层/数据契约变更**，核心变更：① **F1** 澄清"改名靠 id 复用(主力) vs rebind(fallback)"职责边界，重写 §7.7.1 行为对照表（消除 v1.3 与 §6.4 规则 1 的错位）；② **F2** `cachedContent` 定位改为"内容快照"(非缓存、首次引用即写、截断 8KB)，补"章节失效"恢复路径(转为纯文本/Picker 预选/history 触发时机 2)、§7.6.4；③ **F3** 明确两语义刷新 + `syncRefSnapshots` 增 `scope`('section'|'smm'|'workspace')；④ **F4** 首次编辑连带影响提示 + 冲突弹窗影响范围；⑤ **F5** `mode` 字段标"保留未启用"(YAGNI)；⑥ **F6** `link`(跳转)与 `_mindlink.refs`(内容)可共存 + SectionPicker 三选项 + RefBlock 跳转按钮；⑦ **F7** MVP 引用块固定布局；⑧ **F-边界#1–#10** 自引用/同文件/整文件引用/图片路径/嵌入不递归/超长 等处置；⑨ **F20** 反链面板提升 MVP；⑩ **G1** 禅模式(F11)+响应式+FileTabs 澄清；⑪ **G2/G3** 引用块强视觉(警告条/紫边/计数) + 冲突弹窗 diff/影响范围/撤销提示；⑫ **G4** Tab 管理完整交互(§8.6)；⑬ **G5/G6/G7** 响应式三档/状态栏分组/引用块专用色；⑭ **G8** Picker 新建文件；⑮ **G9** 快捷键总览；⑯ **§8.7** 空态/加载态/错误态。 |
| **v1.5** | 2026-09-20 | **第五轮评审响应版（界面 H1–H9 + 功能 I1–I4 盲区复检）**。见 §0.5 与 §22。**无架构/分层/数据契约变更**，核心变更（13 条全部成立、全部落地）：① **H1** 禅模式统一（§2.1 `localConfig.zenMode` 与 v1.4 md 沉浸模式合并为同一概念/状态，F11 全局切换、跨 Tab 保持）；② **H2** "被 N 处引用"点击=反链浮层（位置/内容/跳转/与 F20 侧栏关系）；③ **H3** 手动合并三栏布局(左我的/中结果/右当前)+差异块 `[←]/[→]` 操作+3-way 初值+确认提示；④ **H4** 侧栏停靠/浮动窄屏各折叠、两层独立不重叠；⑤ **H5** §8.6 与既有 FileTabs 关系澄清(既有能力 vs v1.4 新增)；⑥ **H6** §8.7 空态位置+触发条件表+加载态形式；⑦ **H7** 禅模式极简状态点(灰/橙/红/绿反馈)；⑧ **H8** §8.5 新增 `--mm-diff-*` 浅/深变量(WCAG AA 对比度)；⑨ **H9** §7.9 快捷键表补 4 行 + §8.2 数据源改 `commandRegistry.list()` 自动导出；⑩ **I1** §7.7.1 改名后 `sectionPath` 随快照同步 + RefBlock"标题已更新"提示；⑪ **I2** "转为纯文本"改"转为备注内容"精确语义(追加+保留标题+保持 markdown+只删本 ref)；⑫ **I3** §7.6 `scope`×`force` 六组合语义表；⑬ **I4** §7.13/`§7.7` `sectionId:null` 整文件引用编辑语义(整文件覆盖+整文件乐观锁+整文件反链)。 |

> **§0.1 评审意见处置**（对 v1.0 的外部架构评审，逐条核对后的结论）
>
> | 编号 | 评审意见 | 核对结论 | 处置 |
> |---|---|---|---|
> | P1-a | `refService ⇄ revisionService` 双向依赖 | ✅ **成立** | §7.6 删 `commitRef`，§7.7 提交入口唯一化 |
> | P1-b | `fileRouter ⇄ mdDocument`（因监听 `file-saved` 做回声抑制） | ❌ **不成立** | §7.8 表中 `file-saved` 的消费者是**状态栏/冲突抑制窗口**，`fileRouter` 未监听；§5.3 图中 `fileRouter → mdDocument` 为**单箭头**。无需改动，但 §16 仍加"禁止服务互相监听对方广播"的路由规约以防将来出现 |
> | P1-c | 索引层未独立（`open()` 直读 `.mindlink`） | ✅ **成立**（且是 v1.0 内部不一致） | 新增 `workspaceIndex.js`，进 §5.2 清单 |
> | P2 | 无统一上下文，状态散落在模块单例 | ✅ **成立** | 新增 `context.js` + 工厂注入 + 组合根（§16.2） |
> | P3 | 事件总线成为隐式耦合网；`source` 进载荷做回声抑制 | ✅ **成立** | 新增 `events.js`；抑制改 `suppressionRegistry`（IO 层）；§7.8 删 `source` |
> | P4 | 视图/服务边界仅靠约定 | ⚠️ **部分成立** | v1.0 §11.2 已列 `services-isolation.test.mjs`（**不只是约定，已有源码守卫**）；但缺机制化强制。**采纳强化，不采纳 ESLint**——本工程 Vue3 升级时已移除 ESLint（`web/package.json` 无 eslint），为守"零新增第三方依赖"（D5/D10），改用自研零依赖 `scripts/check-arch.mjs`（import 扫描 + 环检测），见 §16.4 |
> | P5 | 冲突四分支硬编码在 `revisionService` | ✅ **成立** | 抽 `conflictStrategies.js`（纯），§7.7 |
> | P6 | `MdEditor.vue` 上帝组件 | ✅ **成立** | 拆容器 + 7 个 composable，§7.10.0 |
> | P7 | `fileRouter` 纯函数与副作用混用 | ✅ **成立** | 抽 `linkResolver.js`（纯），§7.4 |
> | P8 | `sectionService` IO 与纯逻辑混用 | ⚠️ **部分成立** | §7.5 代码块内**全部是纯函数**，实为**命名/职责表述漂移**：§5.2 清单写 `getSection/replaceSection`，代码写 `getSectionFromText/replaceSectionInText`，标题注释又写"纯函数 + 少量 IO 编排"。**按"纯函数"收敛并统一命名**，§7.5 |
> | P9 | `workbookState` 掺入 `docState` | ✅ **成立** | 抽 `documentStore.js`，D6 改写 |
> | P10 | `CommandBus` 转发 `execCommand` 无退场策略 | ✅ **成立** | 加迁移表 + 退场里程碑 + 守卫，D8 |
> | M1 | 错误模型不统一（FsError / SectionError / `{ok:false}` 三种并存） | ✅ **成立** | 统一 `Result + ErrorInfo`，§16.5 |
> | M2 | 日志与可观测性完全缺失 | ✅ **成立**（全文 `日志/logger/log(` **0 命中**） | 新增 `logger.js` + 关键路径日志点，§16.6 |
> | M3 | 索引重建时机/并发/失败恢复未定义 | ✅ **成立** | §6.3.1 重建协议 |
> | M4 | 迁移路径不明确（legacy 注释 / `kind` / `meta.json` v1→v2） | ✅ **成立** | 新增 `migrations/`，§17.2 |
> | M5 | 测试分层与模块边界不对齐（1:1 按文件） | ✅ **成立** | §11.2 改为 `pure/ orchestration/ regression/` |
> | M6 | 缺"版本与演进"章节 | ✅ **成立**（仅有 1 行修订） | 新增 §17，D1–D10 落 ADR，§17.4 |
>
> **统计**：完全成立 **15** / 部分成立 **2** / 不成立 **1**。
> **另查出 v1.0 自身 2 处内部不一致（评审未提）**：
> 1. §5.3 依赖图出现 `workspaceIndex(.mindlink)` 节点，但 §5.2 文件清单**没有该文件**，只有 §12 路线图 P4 提了一句 → 已补齐为独立模块。
> 2. §13-R1 称 `markdown-it` "当前仅 dev 传递依赖"，实际它**已显式声明**在 `web/package.json` 的 `devDependencies@^13.0.1` → 描述已修正（见 R1）：真正的问题是**声明在 `devDependencies` 而非 `dependencies`**，语义错误（webpack 会打进 bundle，故运行时可跑；但 `npm ci --omit=dev` 或将来 CI 收紧会炸）。

> **§0.2 第二轮评审处置**（对 v1.1 修订自身的外部复检，逐条核对后结论）
>
> **结论：22 条中 21 条成立、1 条部分成立**（A10 的脚本逻辑其实已覆盖 L1 内部环，只是文档未写明）；另**自查新增 4 处**（下表 *A14-x*）。本轮修订量同样很大，故一并冻结口径：**自本版起，§16 为唯一分层真源，§5.2 与 §11.3.2 必须与 §16.1 逐字一致。**
>
> | 编号 | 问题 | 核对结论 | 处置位置 |
> |---|---|---|---|
> | **A1** | `createXxxService(ctx)` 伪码内混用 `this.xxx`，解构调用即失效 | ✅ **成立**（结构性错误） | §7.3/§7.4/§7.6/§7.7 全文改闭包；§16.2 加"禁 `this`"硬规约 |
> | A2 | §7.5.2 `getSectionView` 只有签名无实现要点 | ✅ **成立** | §7.5.2 补伪码（只读、不动索引、`fileHash` 短路） |
> | **A3** | `io/workspaceIndex`(L3) 需 `emit(index:rebuilding)`，但 §16.1 的 L3 不允许 import `events.js`(L5)；且 §6.3.1 说"UI 层广播"与 §7.8 表"生产=workspaceIndex"互相矛盾 | ✅ **成立**（唯一实质性分层矛盾） | **采纳评审方案 1 的变体**：新增 **L0 基础层**（零依赖，含 `events.js`）；同时采纳方案 2 变体：`rebuild({onProgress})` 回调由 L4 转发 |
> | **A4** | `refService.onSectionCommitted` 语义不明（`refs.json` 是反链索引，与章节 rev/hash 无关） | ✅ **成立**（核心链路最危险处） | 改名 **`syncRefSnapshots({file, sectionId, rev, hash})`** 并明确"回写 `.smm` 内 `baseHash/baseRev`"+ 性能约束（A4-b） |
> | A5 | `suppression.hit(path, diskHash)` 的 `diskHash` 无人计算；`fs:change` 只给路径 | ✅ **成立** | 改为 **`async hit(absPath)`**（内部 `readText` + 算 hash）；§7.1/§7.8 同步 |
> | A6 | `documentStore` 定为 L2「无 IO」却又"从 localStorage 恢复" | ✅ **成立** | 明确**持久化归 L4 `mdDocument`**，`documentStore` 只 `serialize()/hydrate()`；§5.2/§6.6 改写 |
> | A7 | Proxy 单例的 `has/ownKeys/instanceof` 陷阱、reset 后旧引用仍活着 | ✅ **成立**（合理补充） | §16.2 补 trap 与"测试禁 import Proxy"纪律；§11.2 新增 `compositionRoot.test.mjs` |
> | A8 | §7.14 说 `$emit('conflict')`，§7.7 说 `commitEdit` 返回 `conflict`，未说谁触发 | ✅ **成立** | **走返回值**（事件无法携带 `newContent` 等复杂对象）；§7.14 写明 |
> | A9 | "zero-mock ≥ 70%" 分母未定义，且与表内数字不符（实算 ≈60%） | ✅ **成立**（新引入的自相矛盾） | §11.2 给出**分层预算表 + 分母定义**（分母=本轮新增用例）；§14 改为具体数字 |
> | A10 | L1 同层互引（`sectionWriter → sectionParser`）的环检测未写明 | ⚠️ **部分成立** | 脚本 `EDGES` 本就含 L1 边、DFS 覆盖全层；**文档补写**"L1 内部环同样拦"（§11.3.2） |
> | **A11** | `commitEdit`：`!current` 走 `rebind` 后 `current` 仍 undefined → 步骤⑤ `current.content` 崩溃 | ✅ **成立**（伪码实际 bug） | §7.7 步骤③后**重新赋 `current`**；仍无则返回 `E_SECTION_MISSING` |
> | A12 | §10-23「内容一致则静默丢弃并补登记」在 §7.8 分支中不存在 | ✅ **成立** | 统一为 §10-23 行为（更鲁棒），§7.8 伪码重写 |
> | A13 | `services/{events,logger,context,index}.js` 混装"零依赖横切"与"组合根"，L5「允许 import 全部」过宽 | ✅ **成立** | 拆为 **L0（零依赖横切：`events/logger/context`）+ CG（组合根，允许全部）**，见 §16.1；`errors.js` 因是**纯值构造**（`ok/fail/err/appError` 无副作用）归 **L1** |
> | **A14-1** | §16.1 的 L3「允许 import」漏了**同层 L3**（`fsApi → suppressionRegistry`、`fsWatchClient → fsApi` 均同层） | ✅ **成立**（自查） | §16.1 L3 行补"同层 L3" |
> | **A14-2** | `§16.2` 组合根 `import { createEventBus } from './events'`，但 §7.8 的 `events.js` 只定义常量 | ✅ **成立**（自查） | §7.8 补 `createEventBus()` 工厂（常量 + emitter 同文件） |
> | **A14-3** | §7.10.2 `save()` 写 `suppress.add(absPath)`，与 §7.1 `suppression.register` 命名不一，且 `fsApi.writeText` 内部已自动登记 → **重复登记** | ✅ **成立**（自查） | 统一命名；"唯一登记点"定在 `fsApi`，业务层**不再登记** |
> | **A14-4** | §11.2 列了 `pure/commandRegistry.test.mjs`，§5.2 无 `commandRegistry.js` | ✅ **成立**（自查） | §5.2 补 `services/commandRegistry.js`(L1)，`commandBus` 只做编排 |
> | B1 | `logger` 用 `localStorage` 却归属"L1 禁 window"层 | ✅ **成立** | 归 **L0**，并明确 `localStorage` 属浏览器内置、L0 允许、**L1 不允许** |
> | B2 | `migrations` 说"open 之前执行"，但 §7.3 `open()` 伪码未体现 | ✅ **成立** | §7.3 补 `runMigrations(ctx,{dryRun:false})` 为第 ① 步 + 失败降级 |
> | B3 | `check-arch.mjs` 对视图只查 `from '.../io/'`，漏动态 import / `window.smmApi` 直调 / 组合根泄漏 | ✅ **成立** | §11.3.2 断言扩为 6 类 |
> | B4 | "服务方法签名不得带 `ctx`"无机检 | ✅ **成立** | §11.3.2 加该断言 |
> | B5 | §17.1 的 `TODO(退场条件:)` 检查未落到脚本 | ✅ **成立** | §11.3.2 加统计 + 快照对比（只减不增） |
> | B6 | 无"组合根无串味"测试 | ✅ **成立** | §11.2 新增 `pure/compositionRoot.test.mjs`（4 用例） |
> | B7 | `orchestration/migrations.test.mjs` 未进 §11.2 表 | ✅ **成立** | §11.2 orchestration 表补该行 |
> | B8 | `workspaceSearch` 用 `export const` 单例，未走工厂（且**组合根未装配它**） | ✅ **成立**（比评审更严重） | §7.15 改 `createWorkspaceSearch(ctx)`；§16.2 组合根补装配 |
> | B9 | §11.3.2 "L1 禁止 import `window`" 表述不清（`window` 不是模块） | ✅ **成立** | 改为"不得引用 `window`/`localStorage` 全局"，脚本用 `/\bwindow\./` 断言 |
>
> **统计**：成立 **21** / 部分成立 **1** / 不成立 **0**；另有**自查新发现 4** 处。
>
> **对评审"值得保留"的回应**：评审点名 8 项不要动（P4 拒 ESLint 的理由、P8 判"命名漂移"的克制、§0.1 处置表、`check-arch` 的环检测、R15–R20 新风险、§17.1 退场条件、§17.5 文档演进、`suppressionRegistry` 替代 `source`）——**本轮全部保留、未做任何回退**；本轮只修"新引入的不一致"，不改动方向性决策。

> **§0.3 第三轮评审处置**（对 v1.2 修订自身的外部复检，逐条核对后结论）
>
> **结论：11 条中 9 条成立、2 条部分成立、0 条不成立**；另**自查新增 3 处**（下表 *D-x*）。本轮**无结构性改动**（核心架构 D1–D10 与 §16 分层零回退），全部是"收尾级"修正。
>
> | 编号 | 问题 | 核对结论 | 处置位置 |
> |---|---|---|---|
> | **C1** | 步骤③ `rebind` 后的 `if (!current)` 是死代码；真正缺口是**没说明 `baseHash/baseRev` 是否仍有效** | ✅ **成立**（核心链路唯一模糊） | **新增 §7.7.1**：明确裁决 **(b) 重绑不豁免乐观锁**；`rebind` 只改 `id/path`；并给出 4 种场景行为对照表。保留 `if (!current)` 但标注为**防御性断言（构造上不可达）** |
> | **C2** | `rebind` 未同步 `refCtx.sectionPath` 会导致二次失效反查错误；`baseHash/baseRev` 同步与否需拍板 | ✅ **成立**（前半）+ 评审判后半为"虚警"，但结论仍要写死 | §7.7.1；`rebind` 显式同步 `sectionPath`。**额外发现**：`doCommitEdit` 首行已把 `baseHash/baseRev` 解构为**局部常量**，故步骤④ 用的是局部值 —— 即"重绑后仍过乐观锁"在当前写法下**天然成立**，把 (a) 写进 `rebind` 也是**无声失效**。此事实已写入 §7.7.1 作为采纳 (b) 的证据 |
> | **C3** | `N>10` 惰性同步**无落地路径**：`refs.json` 无 `snapshotPending` 字段、触发点未定义、用户入口不存在 | ✅ **成立** | §6.3 refs.json schema 补 `snapshotPending/pendingRev/pendingHash`；**新增 §7.6.6**（三件套：标记存哪 / 两个触发点 / 兜底规则）；§7.4 补 `open()` 内校准时序；§7.6 接口补 `calibratePendingSnapshots()` 与 `syncRefSnapshots({force})`；§7.14 补「🔄 刷新全部引用」入口 |
> | **C4** | `overrides` 的类型与契约不明：`stores/events/io` 各要实现到什么程度、`fakeIo` 要覆盖多少方法 | ✅ **成立** | §16.2 新增 **`overrides` 契约表**（含"必须提供/不必提供"两列）+ **最小 `createFakeIo` 完整示例** + fake 三纪律（返 `Result` / 不放宽断言 / 失败注入走工厂参数） |
> | **C5** | §11.2 说"112 是必测项、150 是预算"，但**差额 48 无出处**；验收者会逐条数、实现者会问"剩下我自己编吗" | ✅ **成立**（口径与施工图脱节） | §11.2 新增 **A′ 逐文件等价类扩展表**（17 个文件，每行给"扩展维度"与目标条数，合计 **160**），并给出判据"低于预算须写 `// 预算说明`" |
> | **C6** | §14 的零 mock 验收方法两套（按数量 / 按 `grep -c … == 0` 字样），且 **`grep -c … == 0` 语法本身是错的** | ✅ **成立** | §14 两条合并为**一条自动验收**；`check-arch.mjs` 增**第 10 类断言**（脚本内计数 + 读文件判 `mock/jsdom/sinon/jest.fn`，**不用 grep**）；§11.3.2/§12/§16.4 断言数 **9 → 10** |
> | **C7** | `errors.js` 在 §5.3 图属 L0，但 §5.2/§16.1/§16.8 属 L1 | ✅ **成立**（v1.2 修订自身造成的不同步） | §5.3 图修正（L0 = `events/logger/context`；`errors.js` 明确归 L1 并注明理由）；**§16.3 同处一并修正**（评审只提了 §5.3，§16.3 有同样问题）；顺带修正 §5.3 中"workspaceIndex 用它上报进度"与 §16.7 规则 8（L3 不 emit）的字面冲突 |
> | **C8** | §12 P0 交付物只列 `errors.js`，未说明其余 L1 模块何时交付 | ✅ **成立**（低危） | §12 P0 交付物补括注：`errors.js` 为 P0 必须，其余 8 个 L1 模块按 P2–P5 落地的理由（P0 时无 L4 引用它们） |
> | **C9** | §16.1 的 L0"零依赖"与 `logger` 依赖 `localStorage` 有概念张力 | ⚠️ **部分成立**（§16.6 已有归属表，缺"精确定义"） | §16.1 判据下补一段：L0"零依赖"= **不 import 服务模块**，**不排除浏览器内置全局**；`localStorage` 需**可用性检测 + 内存降级**；并注明断言③ 只对 L1/L2 禁 `localStorage`（否则脚本会拦下 `logger.js` 自己） |
> | **C10** | `open()` 与 `runMigrations` 各读一次 `meta.json`，重复 IO | ✅ **成立**（优化，非缺陷） | `runMigrations(ctx, { …, meta })` 接受已读 meta；§17.2 签名与 §7.3 调用同步 |
> | **C11** | §7.14 读 `res.error.kind`，但 §16.5 错误码表**没有 `E_CONFLICT_*`**，`ErrorInfo` 也没有 `kind` 字段 | ✅ **成立**（清单完整性） | §16.5 补 4 条 `E_CONFLICT_*` + `ErrorInfo.kind?` + `suggestedAction: 'pickFromCandidates'`；§7.7 `conflictResult()` 明确**双写 `code` 与 `kind`** |
> | **D1** | （自查）`commitEdit` 返回值只有 `{newRev,newHash}`，而 §7.14 读 `res.data.rebound` —— 字段对不上，**"重绑提示"永远不显示** | ✅ **成立**（v1.2 新引入） | §7.7 步骤⑥ 返回 `rebound`；§7.14 与 §11.2 测试行同步 |
> | **D3** | （自查）§6.3.1 说"迁移失败则 `full:true` 重建"，但 §7.3 伪码直接降级 `readonly-index` —— 两处不一致 | ✅ **成立** | §7.3 改为"先 `rebuild({full:true})`，仍失败才降级"；§17.2 第 5 条同步 |
> | **D4** | （自查）§7 各段伪码引用了 `ok/fail/err/normalizeForHash/now/samePath/joinWin/viewConfirm` 等，但**从未声明这些来自哪里** —— 实现者会以为要自己造 | ✅ **成立** | §7 章首新增**伪码约定**：逐项列出省略的 import 来源（L1 `errors.js`/`hash.js`/`sectionParser.js`/`sectionWriter.js`、既有 `utils/`、`ctx` 注入的 `viewConfirm`），并注明"实现时一个都不能少" |
>
> **统计**：成立 **9** / 部分成立 **2**（C2 后半、C9） / 不成立 **0**；另有**自查新发现 3** 处。
>
> **本轮"不动"清单**：评审明确肯定的 10 项（§19.2 变更性质分布表、§19.3 保留项、A3 的 L0+CG 拆分方式、A1 的"硬规约 + 脚本断言"双保险、§16.2 四点硬规约表、A12 的消费端统一分支、§16.8 自检清单 4 条新增、§17.4 ADR 体例（本版再增 D19/D20）、`check-arch.mjs` 的表达力优于 ESLint）——**全部保留，零回退**。

> **§0.4 第四轮评审处置**（功能 F1–F7 + 界面 G1–G9，对 v1.3 设计文本的外部复检）
>
> **结论：16 条（F1–F7 + G1–G9）全部成立**——均为"设计没写清/没覆盖、用户会用到的真实场景"，无一条不成立、无一条虚警；**无架构/分层/数据契约变更**（与第三轮的"收尾级"同性质，但本轮聚焦功能与界面而非架构）。本轮全部落地为 v1.4 文本修订。
>
> | 编号 | 问题 | 核对结论 | 处置位置 |
> |---|---|---|---|
> | **F1** | "只改名"场景在 v1.3 走不通：rebind 与 §6.4 规则 1(id 复用) 职责错位 | ✅ **成立** | §6.4 加"id 复用(主力) vs rebind(fallback)"两段式说明；§7.7.1 行为对照表重写（第 1 行改为 `rebound:false` 走 id 复用） |
> | **F2** | "章节被删"后无恢复路径；`cachedContent` 定位模糊 | ✅ **成立** | §6.2 不变量#2 改 `cachedContent` 为"内容快照"(首次即写/截断8KB)；§7.6.4 补恢复路径(兜底/转为纯文本/Picker 预选/history 时机2) |
> | **F3** | "刷新"有视图层/数据层两义，混在一起 | ✅ **成立** | §7.6 `syncRefSnapshots` 增 `scope`('section'|'smm'|'workspace') + 两语义说明；§7.6.6-② 三档对照表；§7.14 刷新本引用写 .smm |
> | **F4** | 用户不知"改引用块=改 md"、不知"连带影响谁" | ✅ **成立** | §7.14 首次编辑连带影响提示条 + 冲突事件带 `impact`；§8.4 影响范围行 |
> | **F5** | `mode` 字段无使用场景（YAGNI） | ✅ **成立** | 采纳 (c)：字段保留、标"v1.4 保留未启用"，MVP 不渲染双态；§7.13 模式单选改为三选项(跳转/内容/都写) |
> | **F6** | 节点 `link` 与 `_mindlink.refs` 关系未定义 | ✅ **成立** | §6.2 不变量#4 明确两者可共存；§7.13 三选项；§7.14 加"跳转到 link"按钮 |
> | **F7** | 引用块与备注混排未定义 | ✅ **成立** | §8.3 定 MVP 固定布局（引用块上/备注下，不混排不拖序） |
> | **G1** | md 编辑无"类 Typora"沉浸感 | ✅ **成立** | §8.1 加禅模式(F11)+工具栏折叠+FileTabs 澄清(仅一层标签) |
> | **G2** | 引用块视觉太弱，用户会误改 md | ✅ **成立** | §8.3 黄色警告条+紫边专用色+"被 N 处引用"计数；§8.5 专用色变量 |
> | **G3** | 冲突弹窗信息不足，用户不知选哪个 | ✅ **成立** | §8.4 diff 高亮+影响范围+撤销提示+按钮副标题+手动合并独立设计 |
> | **G4** | Tab 拖动/右键/溢出未定义 | ✅ **成立** | **新增 §8.6** Tab 管理完整交互 |
> | **G5** | 响应式/窗口缩放几乎未涉及 | ✅ **成立** | §8.1 响应式三档 + 工具栏溢出菜单 |
> | **G6** | 状态栏信息过载 | ✅ **成立** | §7.17 状态栏分组(左重要/右次要可折叠) |
> | **G7** | 深色模式引用块专用色缺 | ✅ **成立** | §8.5 新增 `--mm-ref-*`/`--mm-note-*`/`--mm-warn-*` 浅/深变量 + 毛玻璃规则 |
> | **G8** | SectionPicker 缺"新建文件"入口 | ✅ **成立** | §7.13 加"新建 md 文件"与"边引用边创建章节" |
> | **G9** | 缺快捷键总览 | ✅ **成立** | §8.2 加"设置→快捷键"总览(分组/搜索/导出/冲突检测) |
> | **附** | 空态/加载态/错误态缺失；F20 反链未进 MVP；边界#1–#10 未定义 | ✅ **成立** | **新增 §8.7** 三态清单；F20 提升 MVP(§3 分期+§14)；§7.6.4/§7.14/§7.13 补边界#1–#10 |
>
> **统计**：成立 **16** / 部分成立 **0** / 不成立 **0**；无架构回退。
>
> **本轮"不动"清单**：第三轮保留的 10 项（§20.3）**全部保留，零回退**；新增确认 `check-arch 10 类断言`、分层五处一致等仍为冻结判据。

> **§0.5 第五轮评审处置**（界面 H1–H9 + 功能 I1–I4，对 v1.4 设计文本的外部复检，聚焦"修补到位后浮现的盲区"）
>
> **结论：13 条（H1–H9 + I1–I4）全部成立**——均为"v1.4 把已知缺口补完后、用户必然会遇到但设计没写清"的真实场景，无一条不成立、无一条虚警；**无架构/分层/数据契约变更**（与第四轮同性质，聚焦界面/功能盲区而非架构）。本轮全部落地为 v1.5 文本修订。
>
> | 编号 | 问题 | 核对结论 | 处置位置 |
> |---|---|---|---|
> | **H1** | §2.1 既有 `localConfig.zenMode`（导图禅模式）与 v1.4 新增 md 沉浸模式(F11) 是同一还是两个？切 Tab 状态是否保持？ | ✅ **成立** | §8.1 加"禅模式统一"：同一概念/同一份 `localConfig.zenMode`（全局跨 Tab 持久化），F11 全局切换；编辑器差异仅表现层（md 极简顶部条 / 导图浮动工具栏）；合并成本最低（既有 store 状态本就全局） |
> | **H2** | RefBlock 头部"被 N 处引用"点击后的展开视图未设计 | ✅ **成立** | §7.14 加"反链浮层"设计（靠右 popover / 文件+节点预览+`[↗]`跳转 / 浮层不提供解除引用 / 与 F20 侧栏同源不同职） |
> | **H3** | §8.4"手动合并"只有一句话，三栏 vs 双栏矛盾、无差异块操作 | ✅ **成立** | §8.4 重写为三栏布局（左我的/中结果/右当前）+ 差异块 `[←]/[→]` 操作 + 3-way 初值（`<<<<<<<` 占位）+ 确认后再提示影响范围 |
> | **H4** | §8.1 响应式"侧栏折叠图标条"与既有浮动 SidebarTrigger 是否两套、会否"两层图标条" | ✅ **成立** | §8.1 加"侧栏窄屏折叠分两层"：停靠 WorkspacePanel(<900px→48px窄栏) 与 浮动 SidebarTrigger(复用既有，<700px 缩宽) 位置不同、各自折叠、不重叠 |
> | **H5** | §8.6 新增 Tab 交互与 §2.2 既有 FileTabs(500行) 哪些是重写、哪些是新增、兼容性未明 | ✅ **成立** | §8.6 加"与既有 FileTabs 关系"：既有(切换/双击重命名/×关闭/脏点/窗口控制)不重写，v1.4 新增(中键关/右键菜单/溢出▾/Ctrl+Tab/宽度)；窗口控制固定最右不溢出；P1 先核对既有再定清单 |
> | **H6** | §8.7 空态/加载态/错误态的"位置"与"触发时机"不明 | ✅ **成立** | §8.7 加"位置+触发条件"表（7 类空态）+ 加载态形式（进度条/骨架屏/旋转/行占位）+ 引用块无引用时只显按钮不显空块 |
> | **H7** | 禅模式隐藏状态栏后"●未保存/已保存"无呈现 | ✅ **成立** | §8.1 加"禅模式状态点"（编辑区右上 12px 圆点：灰已存/橙未存/红失败，hover tooltip，Ctrl+S 后短暂变绿） |
> | **H8** | §8.4 diff 高亮色在深色模式未定义、可能与紫/黄撞色 | ✅ **成立** | §8.5 新增 `--mm-diff-*`（add/del/mod 浅/深各两份）+ WCAG AA 对比度 ≥4.5:1 + 与引用块紫/警告条黄色相分离 |
> | **H9** | §8.2 快捷键总览引用 §7.9，但 §7.9 无 F11/Ctrl+Shift+T/Ctrl+Shift+B；数据源未定 | ✅ **成立** | §7.9 快捷键表补 4 行；§8.2 数据源改"自动从 `commandRegistry.list()` 导出"（每命令带 `title`/`shortcuts[]`，重叠高亮），两处必须一致 |
> | **I1** | §7.7.1"只改名"成功但 `sectionPath` 未同步 → 引用块显示旧标题、源文件新标题不一致 | ✅ **成立** | §7.7.1 加"改名后 sectionPath 同步"：commitEdit 成功路径上若 `current.path !== refCtx.sectionPath` 一并同步（与快照同步合并做，因走 id 复用不经 rebind）；RefBlock 显"标题已更新" |
> | **I2** | §7.14"转为纯文本"写入语义未定（追加/覆盖？保留标题？markdown？多引用？） | ✅ **成立** | §7.14 改"转为备注内容"精确语义：`merged = 原note + --- + #旧标题 + cachedContent`（追加不覆盖、保留标题、保持 markdown），只 `removeRef` 本 ref（其余不动），写入前 `$confirm` |
> | **I3** | §7.6 `scope` 与 `force` 组合语义未定义（scope='workspace' 隐含 force，scope='smm' 呢？） | ✅ **成立** | §7.6 加 `scope`×`force` 六组合语义表；原则：`scope` 主维度、`force` 覆盖开关（仅"刷新本引用"section+true 与"命令级 workspace"用 true） |
> | **I4** | §7.13 整文件引用 `sectionId:null` 的 `commitEdit` 编辑语义未定义 | ✅ **成立** | §7.13/§7.7 加"整文件引用编辑语义"：`sectionId:null` → 整文件覆盖分支、整文件乐观锁（baseHash/baseRev 对应整文件）、`syncRefSnapshots({sectionId:null})`/`findBacklinks(file,null)` 整文件反链 |
>
> **统计**：成立 **13** / 部分成立 **0** / 不成立 **0**；无架构回退。
>
> **本轮"不动"清单**：第四轮保留的 16 项（§21.3）**全部保留，零回退**；`check-arch 10 类断言`、分层五处一致、`rebind 不豁免乐观锁`、`scope`/`impact` 字段对 等仍为冻结判据。

---

## 〇、如何读这份文档

| 你是 | 建议顺序 |
|---|---|
| 决策者 / 产品 | §1 摘要与结论 → §3 差距与成本 → §13 风险 → §12 路线图 |
| 架构 / 主程 | §1 → §2 现状盘点 → §4 关键决策（含实测证据） → **§16 分层与依赖规约** → §5 目标架构 → §6 数据契约 |
| 执行开发者 | §16.1 分层模型（L0–L4 + 组合根）与**工厂签名模板** → §6 数据契约 → §7 模块接口 → §9 时序 → §10 异常矩阵 → §11 测试 |
| 验收 / 测试 | §10 异常矩阵 → §11 测试设计 → §14 验收清单 → §15 附录 A 实测证据 |
| 运维 / 排障 | §16.6 日志与可观测性 → §6.3.1 索引重建协议 → §17.2 迁移 → §10 异常矩阵 |

> **v1.1/v1.2 新增章节位置说明**：§16、§17 为架构评审响应新增的**规约性章节**（约束"必须怎么做"），置于文末附录之后，**对 §1–§14 具有约束力**：凡 §7 的接口签名与 §16 的分层规约冲突，以 §16 为准。§19 为第二轮评审（v1.1 自身缺陷）的响应汇总。

**符号约定**：`【必须】`/`【可选】` 沿用需求文档；`★` 标记本期核心；`⚠️` 标记**本项目已知的坑或实测风险**；`🆕` 表示新建文件；`✎` 表示改造既有文件。

---

## 一、摘要与关键结论

### 1.1 一句话方案

**不新建工程、不换技术栈**：在既有 `Electron + Vue3(Vue CLI5/webpack5) + simple-mind-map` 上**增量**补齐「工作区 + 文件树 + Markdown 编辑器 + 三种调用 + 章节引用」四块能力；新增逻辑一律下沉到**零依赖纯函数服务层**（`web/src/services/*.js`），可用现有 `node --test` 纪律直接覆盖。

### 1.2 关键决策速览

| 编号 | 决策 | 结论 | 依据 |
|---|---|---|---|
| **D1** | 技术栈 | **保留 Electron + Vue3 + Vue CLI5/webpack5**；否决 Tauri/Vite 重写，否决回退 Vue2 | 需求文档 §3 是绿地假设；本工程已有 4 万行可运行资产（画布引擎、多 sheet、导入导出、毛玻璃设计系统、构建部署链） |
| **D2** | Markdown 编辑器 | **MVP 用已在库的 Toast UI Editor 3.2.2**（WYSIWYG + Prism 高亮 + `katex@0.16.9` 已在依赖中）；**二期**可平移 Milkdown Crepe | 备注面板已验证可跑；Vue3 升级后 Crepe 才可用（见 `MILKDOWN_ASSESSMENT.md`），但接入成本 8–12 人天，不宜挡 MVP |
| **D3** | 章节解析引擎 | **`markdown-it` 的 `token.map` 行号**（`heading_open.map`）做 AST 级切块，**禁止正则** | 实测：`heading_open.map=[0,1]/[4,5]/[10,11]` 精确，且**围栏代码块内的 `#` 不被误判**（附录 A-1） |
| **D4** | 章节引用元数据载体 | **`node.data._mindlink`（下划线前缀自定义字段）**，**不**把 ref JSON 写进 `note` | 三条实测：① Toast UI 把块级 HTML 注释渲染成 `<div data-html-comment>` **可见转义文本**；② 行内 HTML 注释直接**抛异常**；③ simple-mind-map 把非 `_` 前缀的未知 data 字段**当样式字段**，会被"清除样式"**删除**（附录 A-2 / A-3 / A-4） |
| **D5** | 文件监听 | 主进程 **`fs.watch(root,{recursive:true})`**，**不引 chokidar** | `app.asar` 打包清单**不含第三方 node_modules**，引新依赖需改打包链并加守卫 |
| **D6** | Tab 模型 | 扩展 `workbookState`：workbook 增加 `kind:'mindmap'\|'markdown'` + **`docMeta`（只记元数据，文档内容另立 `state/documentStore.js`）** | 复用既有去重/脏标记/关标签/会话恢复/双击重命名全套；`normalize()` 天然向后兼容；**不把 content 塞进状态机**（v1.1 修正，响应 P9） |
| **D7** | 索引与版本 | `.mindlink/` 落 `sections.json` + `refs.json`；**以 `contentHash` 为冲突判定主依据，`rev` 为审计/展示** | 索引可丢失可重建；hash 相等即内容未变，无需持久 rev 也能正确判定 |
| **D8** | 命令总线 | CommandBus = 在既有 `$bus` + `execCommand` 之上的**薄注册表**，不重写工具栏；**桥接设退场里程碑**（P5 登记 → P6 禁止新用 → 二期拆除） | 现有 35 文件 / 180 处 `$bus` 通信，重写风险远大于收益；但长期双体系并存会致命令语义分裂（v1.1 补退场策略，§7.9） |
| **D9** | `.smm` 格式 | **以本工程真实格式为准**：多工作表容器 `{app:'smm-multisheet',...}`；**同时兼容**单图 JSON | 需求文档 §5.3 假设 `.smm` 是原生单图，与本工程不符（`api/index.js#isSheetsFile`） |
| **D10** | 图片/资源 | md 粘贴图片 → `assets/` 相对路径；新增 **`smm:write-binary`** IPC | 现有 IPC 只有文本写（`fs.writeFileSync(p, content,'utf8')`），无法落二进制 |

### 1.3 与需求文档的差异清单（必须修正）

| # | 需求文档 | 实际情况 | 处置 |
|---|---|---|---|
| 1 | 桌面壳 Tauri 2 / Vue3+Vite / Pinia | Electron + Vue3 + Vue CLI5/webpack5；状态用 **Vuex + 自研 `utils/eventBus.js`** | 全文按实际栈改写（D1/D8） |
| 2 | `.smm` = simple-mind-map 原生 JSON | 实际是**多 sheet 容器**，且带 `imgMap` 图片抽离机制 | 新增 `smmCodec` 统一编解码（D9，§6.1） |
| 3 | `note` 里塞 HTML 注释存引用（方案 A） | Toast UI 会让注释**可见**，且**行内注释必崩**；库会把该字段当样式字段 | 改为 `data._mindlink`（D4，§6.5） |
| 4 | 章节解析用 `remark/unified` | `remark` 未安装；`markdown-it@13.0.2` 已在树中但为 **dev 传递依赖** | **显式**加入 runtime 依赖并锁定版本（§4-D3） |
| 5 | 文件树/md 编辑器/大纲都是新建 | 确认全为空白，但**侧栏容器（`Sidebar.vue` + `sidebarTriggerList`）可直接复用** | md 大纲/引用面板/AI 面板挂同一套侧栏（§7.16） |
| 6 | 「打开工作区」是产品入口 | 现产品入口是「打开单个 `.smm` 文件」，无工作区概念 | 工作区作为**可选增强**：不打开工作区也能用（单文件模式），打开后解锁文件树/索引/反链（§7.1） |
| 7 | `KaTeX` 需引入 | `katex@0.16.9` **已在依赖**，但当前无用武之地 | 以 Decoration 插件形式接入（§7.10.4） |
| 8 | 冲突后 `.mindlink/history/` 快照 | 一致，保留；追加**每次写入前**快照而非仅冲突时 | §7.7 |

---

## 二、现状盘点（As-Is）

### 2.1 技术栈实况

| 层 | 实际 | 备注 |
|---|---|---|
| 桌面壳 | Electron（`electron-app/main.js` 666 行）+ Nativefier 包装 | 部署真源 `D:\Program Files (x86)\思绪思维导图\resources\app\`（**`app/` 目录优先于 `app.asar`**） |
| 渲染进程 | Vue **3.5.43**，Vue CLI 5.0.9 / webpack 5.111.1，`element-plus 2.14.6` | Vue3 升级已完成（v2.0.0） |
| 状态 | Vuex 4（`web/src/store.js`）+ 自研 EventBus（`web/src/utils/eventBus.js`） | 无 Pinia |
| 画布 | `simple-mind-map 0.14.0-fix.3`（**单实例 + 多 workbook/多 sheet**） | `Edit.vue` 1841 行 |
| 富文本/MD | `@toast-ui/editor 3.2.2` + `editor-plugin-code-syntax-highlight 3.1.0` + `prismjs 1.29.0` + `katex 0.16.9` | 已用于节点备注 |
| 测试 | `node --test`（零依赖，`node:assert`） | 前端 133 用例 + 主进程 5 个 `.mjs` |

### 2.2 现有模块地图（只列与本需求相关）

```
mind-map-main/
├─ web/src/
│  ├─ main.js                     createApp + globalProperties.$bus + element-plus 全量引入
│  ├─ router.js                   hash 路由：'/' → pages/Edit/Index.vue
│  ├─ store.js                    Vuex：localConfig（主题/透明度/背景/禅模式）、activeSidebar、isReadonly
│  ├─ api/
│  │  ├─ index.js        (340行)  存储委托：getData/storeData、sheet CRUD、workbook CRUD、saveAs
│  │  └─ workbookState.js(326行)  ★纯状态机（无 Vue/DOM 依赖，可在 Node 单测）
│  ├─ pages/Edit/
│  │  ├─ Index.vue                组装 FileTabs + Toolbar + Edit
│  │  └─ components/  (40+ 组件)
│  │     ├─ Edit.vue     (1841行) ★唯一 mindMap 实例宿主、快捷键、文件保存/打开、事件转发
│  │     ├─ FileTabs.vue  (500行) 自定义标题栏 + 文件标签（切换/新建/关闭/双击重命名/脏点）
│  │     ├─ SheetTabs.vue            底部工作表条
│  │     ├─ Toolbar.vue   (798行) 导图工具栏（保存/另存/导入/导出/备注…）
│  │     ├─ ToolbarNodeBtnList.vue 节点操作组（含 `$bus.$emit('showNodeNote')`）
│  │     ├─ NodeNote.vue  (331行) ★备注弹窗（Toast UI WYSIWYG + 语言条 + 插入代码块）
│  │     ├─ NodeNoteContentShow.vue 备注浮层预览（Viewer + Prism.highlightAllUnder）
│  │     ├─ NodeNoteSidebar.vue     备注侧栏预览（Viewer）
│  │     ├─ Sidebar.vue / SidebarTrigger.vue  浮动侧栏容器 + 触发器（`activeSidebar` 驱动）
│  │     ├─ Search.vue    (518行) 节点搜索（已 monkey-patch 支持**备注内容**命中的）
│  │     ├─ Outline.vue / OutlineSidebar.vue  导图大纲
│  │     ├─ Import.vue / Export.vue           导入（smm/json/xmind/emmx/md）/ 导出
│  │     └─ Setting.vue / Theme.vue           设置 / 主题
│  ├─ utils/
│  │  ├─ eventBus.js              $on/$off/$emit/$once 单例
│  │  ├─ global.js                setCurrentDataGetter/getCurrentData（跨模块取当前导图数据）
│  │  ├─ nodeImageKeys.js         跨 sheet 图片 key 注册表（★同类"跨表搬运丢元数据"前车之鉴）
│  │  ├─ prismSetup.js            Prism 语言包/主题初始化
│  │  └─ autosave.js / shortcutGuard.js / dragMaskController.js
│  └─ config/index.js             4 语言 i18n 汇总（zh/en/zhtw/vi）+ sidebarTriggerList 等
└─ electron-app/
   ├─ main.js         (666行)     窗口/IPC/静态服务/安装器
   ├─ preload.js                  contextBridge → window.smmApi（★唯一渲染进程 IO 通道）
   ├─ tests/*.test.mjs            5 个主进程契约测试（asar 路径/模块/版本/devtools/安装元数据）
   └─ make_installer.nsi / bump_version.js / dist / _appstage
```

### 2.3 能力矩阵（对齐需求文档功能清单）

| 编号 | 功能 | 现状 | 说明 |
|---|---|---|---|
| F1 | 打开/切换/记住文件夹 | ❌ | 只有「打开文件」，无文件夹概念 |
| F3 | 文件树 | ❌ | 完全空白 |
| F4 | 文件增删改名移动 | 🟡 部分 | 主进程已有 `smm:rename-file`；缺 mkdir/move/trash |
| F5 | 文件名过滤 + 外部改动刷新 | ❌ | 无监听 |
| F6 | 多标签 | ✅ | `FileTabs.vue` + `workbookState`（含去重 `findByPath`） |
| F7 | 未保存标记 / 会话恢复 | ✅🟡 | 脏点已有；会话恢复依赖 localStorage（未落 `.mindlink`） |
| F8–F12 | Markdown 编辑器 | ❌ | 但 **Toast UI 已在库**，备注面板即最小可用版 |
| F13–F15 | 思维导图编辑器 | ✅ | simple-mind-map，含布局/撤销/缩放/大纲 |
| F16 | 导入导出 | ✅ 优于文档 | 已支持 km/xmind/emmx/docx/pptx/xlsx/md |
| F17 | md → 导图 跳转 | ❌ | 无 md 编辑器 |
| F18 | md → 导图 嵌入 | ❌ | — |
| F19 | 导图节点 link → md | ❌ | **库已提供官方钩子 `customHyperlinkJump(link,node)`**，工程未接 |
| F22 | 失效链接提示 | ❌ | — |
| F23–F27 | 章节引用 | ❌ | 本期核心 |
| F28 | 搜索 | 🟡 | 已有**节点文字 + 备注**搜索；缺工作区全文 |
| F29 | 大纲 | 🟡 | 已有导图大纲；缺 md 大纲 |
| F31 | 主题 | ✅ | 含深色/毛玻璃设计系统 `styles/macos.less` |
| F33 | 顶部全局条 + 上下文工具栏 | 🟡 | 顶部条=FileTabs（含窗口控制）；工具栏固定为导图工具栏 |

### 2.4 现有 IPC 契约（`window.smmApi`，全量）

| 通道 | 入参 | 返回 | 备注 |
|---|---|---|---|
| `smm:save-workbook` | `{content, defaultPath, defaultName}` | `{canceled, filePath, error?}` | 弹保存对话框 |
| `smm:write-file` | `{filePath, content}` | `{ok, error?}` | **文本覆盖写** |
| `smm:write-file-sync` | `{filePath, content}` | `{ok, error?}` | `sendSync`，供 `beforeunload` |
| `smm:rename-file` | `{oldPath, newPath}` | `{ok, newPath?, exists?, error?}` | 目标存在则拒绝 |
| `smm:open-workbook` | — | `{canceled, filePath, content, error?}` | 过滤器仅 smm/json |
| `smm:read-file` | `{filePath}` | `{ok, content, error?}` | 文本读 |
| `smm:import-file` | `{exts, title}` | `{canceled, filePath, buffer, error?}` | 读**原始字节** |
| `smm:set-title` | `title` | — | — |
| `smm:window-*` | — | — | 最小化/最大化/关闭/状态 |
| `install:*` | — | — | 安装向导（与本期无关） |

**结论**：现有通道**不足以**支撑文件树与 md 编辑（缺：目录选择、目录树扫描、存在性判断、二进制写、目录创建、删除/移动、文件监听、外部打开）。§7.2 给出增量清单。

### 2.5 现有事件总线契约（节选，用 `$bus`）

| 事件 | payload | 生产 | 消费 |
|---|---|---|---|
| `node_active` | `(nodes, node)` | Edit.vue（转发库事件） | 各编辑面板（备注/标签/图标/超链接/样式…） |
| `node_click` | `(node, e)` | Edit.vue | Contextmenu（收起菜单）；**本期新增 fileRouter 消费** |
| `node_contextmenu` | `(node, e)` | Edit.vue | Contextmenu |
| `node_note_dblclick` | `(node)` | 库 | Toolbar → `showNodeNote` |
| `showNodeNote` | `(node)` | Toolbar / Contextmenu | **NodeNote.vue** |
| `showNodeLink` | `(node)` | Toolbar | NodeHyperlink |
| `data_change` / `view_data_change` | `(data)` | Edit.vue | Outline / Navigator / Count / Edit（自动保存） |
| `setData` | `(data)` | Toolbar / OutlineEdit | **Edit.vue（`mindMap.setData`）** |
| `workbook-list-changed` / `workbook-switched` / `before-workbook-switch` | `id?` | Index.vue / Edit.vue | FileTabs / Edit.vue |
| `write_local_file` | `(originData)` | api/index.js | Toolbar |
| `closeSideBar` / `show_search` / `showExport` / `showImport` | — | 各组件 | Sidebar / Search / Export / Import |
| `execCommand` | `(cmd, ...args)` | 40+ 处按钮 | **Edit.vue（`mindMap.execCommand`）** |
| `requestSave` / `requestSaveAs` / `requestOpen` | — | Toolbar | Edit.vue |

> **设计原则**：新增能力**只添加**事件，不改变既有事件语义与载荷，避免 35 个文件连带回归。

### 2.6 数据格式现状

**`.smm`（本工程写入的真格式）**：

```jsonc
{
  "app": "smm-multisheet",
  "version": 1,
  "activeId": "sheet-1757...",
  "sheets": [
    { "id": "sheet-...", "name": "Sheet1", "data": { "root": {...} 或 {data,children} } }
  ]
}
```

- 读取时 `isSheetsFile(data)` 判定；单图 JSON（`{data,children}` 或 `{root}`）也能载入（`buildSheetState` 归一化）。
- 节点图片：**base64 被抽成 key** 存在各 sheet 的 `imgMap`，`data.image` 只留 key（跨表搬运需同步 `imgMap`，见 `utils/nodeImageKeys.js`）。
- 节点数据可带任意自定义字段，**但必须 `_` 前缀**（否则被当样式字段，见 §4-D4）。

**localStorage 键**：

| 键 | 内容 |
|---|---|
| `SIMPLE_MIND_MAP_WORKBOOKS` | 全部 workbook（含 sheetState、filePath、dirty、lastAutosavedAt） |
| `SIMPLE_MIND_MAP_LAST_FILE` | 最近文件绝对路径 |
| `SIMPLE_MIND_MAP_LOCAL_CONFIG` | 本地配置（主题/透明度/背景/AI 配置） |

### 2.7 构建与部署链（改动必须守住）

`build_now.sh` 五步（单一真源）：

```
[0/5] 依赖自检（缺则自动装）
[1/5] vue build（清 webpack 缓存 → run_vue_build.js 硬超时 600s）
[2/5] 同步 dist → electron-app/dist + 剥 51.la + 生成 build-info + 2 条守卫断言
[3/5] bump 版本（electron-app/package.json + make_installer.nsi VERSION）
[4/5] electron-builder NSIS → dist-electron2/思绪思维导图 Setup.exe
[5/5] asar pack _appstage → 部署 D:\...\resources\app.asar；[5/5b] 同步 resources/app 目录
```

**三条硬约束（本期改动必须遵守）**：

1. `_appstage` 拷贝清单是**白名单**：`cp package.json main.js preload.js index.html install.html install-meta.js appicon.ico _appstage/`。**主进程新增本地模块必须同步改这一行**，否则安装后 `Cannot find module`（v1.0.37 `fileArgs.js` 事故）。
2. `app.asar` **不含 node_modules** ⇒ 主进程**只能用 Node 内置模块**（`fs`/`path`/`child_process`/`shell`…）。第三方库（chokidar 等）要么改打包链，要么**不要引**。
3. 部署真源是 `resources/app/`（优先级高于 `app.asar`），两处都要同步（`[5/5b]` 已实现）。

### 2.8 测试与质量基线

| 位置 | 数量 | 内容 |
|---|---|---|
| `web/tests/unit/*.test.mjs` | 9 文件 | workbookState、sheetState、autosave、nodeImageKeys、parseEmmx、shortcutGuard、storageErrors、dragMask |
| `web/tests/regression/*.test.mjs` | 4 文件 | 备注粘贴守卫、Toast UI 实例 `markRaw`、图片灯箱、模板绑定 |
| `electron-app/tests/*.test.mjs` | 5 文件 | asar 路径 / asar 模块完整性 / 版本号 / devtools 快捷键 / 安装元数据 |
| 基线 | **133/133 通过**（web）+ 主进程全绿 | 命令：`cd web && node --test`；`cd electron-app && node --test tests/xxx.test.mjs` |

**纪律**：新功能必须附零依赖 `node --test` 用例；`fail > 0` 视为阻断构建。

---

## 三、差距分析与成本

### 3.1 逐项落点

| 需求 | 现状 | 落点（🆕新建 / ✎改造） | 估（人天） |
|---|---|---|---|
| F1 工作区 | ❌ | 🆕 `services/workspaceService.js`、`services/io/fsApi.js`、`services/io/workspaceIndex.js`、`services/index.js`（组合根）；✎ `preload.js`、`main.js` | **5** |
| F3 文件树 | ❌ | 🆕 `components/FileTree.vue`、`WorkspacePanel.vue`；✎ `SidebarTrigger.vue`、`config/{zh,en,zhtw,vi}.js` | 3 |
| F4 增删改名移动 | 🟡 | ✎ `main.js`（mkdir/move/trash/exists）；🆕 `components/FsContextMenu.vue` | 2 |
| F5 过滤 + 外部刷新 | ❌ | ✎ `main.js`（`fs.watch` 推送）；🆕 `services/io/fsWatchClient.js`、`services/io/suppressionRegistry.js` | 2 |
| F6/F7 Tab | ✅ | ✎ `api/workbookState.js`（`kind`）、`api/index.js`（委托）、`FileTabs.vue`（图标） | 2 |
| F8–F12 md 编辑器 | ❌ | 🆕 `components/MdEditor.vue`、`MdToolbar.vue`、`MdOutline.vue`；🆕 `services/mdDocument.js` | 6 |
| F17/F18 调用 | ❌ | 🆕 `services/fileRouter.js`、`components/MindMapPreview.vue` | 3 |
| F19 节点 link | ❌ | ✎ `Edit.vue`（补 `customHyperlinkJump` 选项） | 1 |
| F22 失效链接 | ❌ | 🆕 `components/MissingLinkDialog.vue`（或复用 `$confirm`） | 1 |
| **F23–F27 章节引用** | ❌ | 🆕 `services/sectionService.js`、`refService.js`、`revisionService.js`、`workspaceIndex.js`、`components/SectionPicker.vue`、`RefBlock.vue`、`ConflictDialog.vue`；✎ `NodeNote.vue` | 9 |
| F28 全文搜索 | 🟡 | ✎ `Search.vue`（新增工作区范围）；🆕 `services/workspaceSearch.js` | 3 |
| F29 md 大纲 | ❌ | 🆕 `components/MdOutline.vue`（复用 `Sidebar.vue`） | 1.5 |
| F31 主题 | ✅ | ✎ `styles/macos.less`（新增组件样式变量复用） | 1 |
| F33 上下文工具栏 | 🟡 | ✎ `Index.vue`（按 `kind` 切换 `<Toolbar>`/`<MdToolbar>`） | 1.5 |
| 命令总线 | ❌ | 🆕 `services/commandBus.js`；✎ `Toolbar*.vue`（逐步迁移） | 3 |
| 测试 / 打包 / 文档 | — | 🆕 8–12 个测试文件；✎ `build_now.sh`（守卫断言） | 4 |
| **合计（MVP）** | | | **≈ 46 人天**（单人串行；2 人并行约 3.5–4 周） |

> **对比**：需求文档假设从零起步（估 > 90 人天）；复用现有资产后 MVP ≈ 46 人天，且交付风险集中在「章节引用」与「md 编辑器」两块。

### 3.2 分期

- **一期 MVP**：F1、F3–F7、F8–F12（Toast UI 版）、F17–F19、**F23–F27**、F28（含工作区）、F29（md 大纲）、F31、F33、CommandBus。
- **二期**：F2 最近列表、F16 补充、F21 自动补全、F30 格式互转、F32 设置项、**Milkdown 替换 md 编辑器**。
- **【v1.4 调整】F20 反链面板从二期提升为 MVP**：`findBacklinks` 数据层已实现，UI 低成本，无反链视图则"引用"功能不完整（第四轮评审 F20）。
- **三期**：Git 集成、多工作区、快捷键自定义。

---

## 四、关键设计决策（含实测证据）

### D1 技术栈：保留 Electron + Vue3，拒绝重写

- **选项**：① 按需求文档用 Tauri2+Vite+Pinia 新建；② 保留本栈增量开发。
- **结论**：②。
- **依据**：本工程已有可运行资产：simple-mind-map 集成、多 sheet 多文件状态机、导入导出（docx/pptx/xlsx/emmx/xmind）、毛玻璃设计系统、NSIS 安装器、一键构建部署链、137 个测试。需求文档第三章是"草地假设"，未考虑这些。
- **代价**：md 编辑器需用 Toast UI（非 Milkdown）、状态用 Vuex（非 Pinia）——两者都只是**实现差异**，不影响产品能力。
- **风险**：Toast UI 在"Typora 级体验"上与 Milkdown 有差距 → 用 D2 的二期平移消化。

### D2 Markdown 编辑器：MVP = Toast UI 3.2.2

| 维度 | Toast UI（现成） | Milkdown Crepe |
|---|---|---|
| 接入成本 | **0 依赖**，备注面板已跑通（含 WYSIWYG、代码高亮、图片粘贴、`markRaw` 坑已排） | 8–12 人天（`MILKDOWN_ASSESSMENT.md`），Vue3 升级后才可用 |
| WYSIWYG | ✅ 单栏 | ✅ 更接近 Typora |
| 代码高亮 | ✅ Prism（16 语言已配） | ✅ CodeMirror/Shiki |
| 数学公式 | 🟡 需自写 Decoration 插件（`katex` 已在依赖） | ✅ Crepe 内置 KaTeX/Mermaid |
| 表格/任务列表 | ✅ | ✅ |
| 自定义节点视图（内嵌导图） | ✅ 官方 `addWidget`/自定义节点可做 | ✅ 更强 |
| 风险 | 已知：行内 HTML 注释崩溃（D4 已规避） | 新依赖 + webpack transpile + 未知坑 |

- **结论**：MVP 用 Toast UI；**把渲染层封装在 `MdEditor.vue` 内**，对外只暴露 `setContent/getContent/onChange/scrollToAnchor`，二期换引擎不动上层。
- **⚠️ 复用注意事项**（备注面板踩过的坑，md 编辑器会再遇到）：实例**必须 `markRaw()`**（Vue3 深度 Proxy → ProseMirror `RangeError: Applying a mismatched transaction`）；`exec('codeBlock',{language})` 在 WYSIWYG 下被吞，需直建 `state.schema.nodes.codeBlock.create({language})`。

### D3 章节解析：`markdown-it` 的 `token.map`，禁止正则

**实测证据（附录 A-1）**：

```js
const md = require('markdown-it')()
md.parse('# H1\n\ntext\n\n## H2\n\n```js\n# not a heading\n```\n\n### H3\n').filter(t => t.type === 'heading_open')
// → h1 map=[0,1]   h2 map=[4,5]   h3 map=[10,11]   （fence map=[6,9] 内的 # 未误判）
```

- **结论**：`heading_open.map = [startLine, endLine)` 直接给出标题行区间；章节正文 = 本标题行之后到下一个 `level <= 自身` 的标题行之前。
- **依赖处置**：`markdown-it@13.0.2` 虽在 `web/node_modules` 中，但 `.package-lock` 标注 **`"dev": true` 且无任何包声明依赖它** ⇒ **必须在 `web/package.json` 显式加入 `"markdown-it": "^13.0.2"`**（零下载，已在树中），否则 `npm ci` 后可能消失。
- **备选（若拒绝新依赖）**：自写 ~80 行"围栏感知行扫描器"（跟踪 ``` / ~~~ / 缩进代码块 / ATX+Setext 标题），同样零依赖、可单测。**仅在 markdown-it 引入受阻时启用**。
- **反面教材**：需求文档 §11.1「写回必须用 AST，禁止正则定位章节边界」——严格执行。正则 `^#{1,6}\s` 会在围栏代码块、引用块、HTML 块里误判。

### D4 章节引用元数据：`node.data._mindlink`（否定需求文档「方案 A」）

**实测证据（附录 A-2/A-3/A-4）**：

1. **块级 HTML 注释在 WYSIWYG 里是可见的**：

   ```html
   <!-- setMarkdown('用户文字\n\n<!-- ref:{...} -->') 后的 WYSIWYG DOM -->
   <p>用户文字</p>
   <div data-html-comment="true">&lt;!-- ref:{"file":"docs/requirements.md",... --&gt;</div>
   ```

   ⇒ 用户会在备注里**看到一坨 JSON**（虽然往返无损）。若靠 CSS 隐藏，又要在 `contenteditable` 里处理光标落入隐藏节点的问题。

2. **行内 HTML 注释直接抛异常**：`setMarkdown('前文<!-- ref:{} -->后文')` →
   `TypeError: Cannot read properties of null (reading '1')`，堆栈终点是 Toast UI 自己的 `htmlInline` 转换器：

   ```js
   // @toast-ui/editor/dist/toastui-editor.js:22063
   htmlInline: function (state, node) {
     var matched = html.node ? ... : html.match(reHTMLTag);   // 注释不匹配 reHTMLTag → null
     var openTagName = matched[1]                             // ← 抛错点
   ```

   ⇒ 只要用户把光标贴着注释敲字，注释就可能变成"行内"，**下次打开备注即崩**。

3. **非 `_` 前缀的自定义 data 字段会被当成样式字段，且可能被删除**：

   ```js
   // simple-mind-map/src/utils/index.js:812
   export const checkIsNodeStyleDataKey = key => {
     if (/^_/.test(key)) return false          // 用户自定义字段 → 不是样式
     if (!nodeDataNoStylePropList.includes(key)) return true   // 否则一律当样式
     return false
   }
   // core/render/Render.js:1135 _handleRemoveCustomStyles() 会 delete 所有"样式字段"
   ```

   ⇒ 若用 `data.sectionRefs`，用户点一次「清除节点样式」就会被**静默删除**；且 `Style.getCustomStyle()` 会把它当 CSS 属性注入。

- **结论**：引用元数据存 **`node.data._mindlink`**：

  ```jsonc
  {
    "data": {
      "text": "需求分析",
      "note": "用户自己的备注文字（含 UI 装饰标记，无机器元数据）",
      "_mindlink": {
        "v": 1,
        "refs": [
          { "id": "ref-1", "file": "docs/requirements.md", "sectionId": "a1b2c3",
            "sectionPath": ["需求分析"], "mode": "editable" }
        ]
      }
    },
    "children": []
  }
  ```

- **为什么这是安全的**（读完库源码后的结论）：
  - `node.getData()/setData()` ⇄ `Render.setNodeData()` 只做 `data[key] = value` 合并，任意键都保存；
  - `copyNodeTree()`（复制/粘贴/拖拽/跨 sheet）用 `simpleDeepClone(rootData.data)` **整体深拷贝 data**，`_` 前缀键在 `data` 内**不受**"跳过 `_`"规则影响（该规则只作用于 data/children 之外的顶层键）；
  - `_` 前缀使 `checkIsNodeStyleDataKey` 恒 `false` ⇒ 不进样式系统、不被 `_handleRemoveCustomStyles` 删除。
- **兼容性**：原版 simple-mind-map 打开该 `.smm` 只是多一个不认识的字段，不影响渲染。
- **读取兼容**：为兼容"别人用方案 A 写的文件"或未来外部工具，`sectionRefService` 提供**只读解析**能力：若 `note` 中存在块级 `<!-- ref:... -->`，照旧识别（**但绝不写回**）——见 §7.6.5。

### D5 工作区与文件监听：主进程 `fs.watch`，不引 chokidar

- **约束**：`app.asar` 不含 `node_modules`（§2.7 约束 2）。
- **结论**：主进程用内置 `fs.watch(root, { recursive: true })`（Windows/macOS 支持递归；Linux 降级为逐目录 watch 或轮询），**事件在 300–500ms 窗口内合并**后经 `webContents.send` 推给渲染进程。
- **为什么必须放主进程**：渲染进程 `nodeIntegration=false`，只能走 IPC。
- **风险与对策**：`fs.watch` 只给 `filename`，**不保证 mtime/存在性** → 消费方对每个事件做一次 `stat` 确认（`smm:stat`），并对"编辑器自己保存"的回声做**抑制窗口**（§7.8 表格）。
- **若确实要 chokidar**：需在 `build_now.sh` 的 `_appstage` 步骤追加 `cp -r node_modules/chokidar _appstage/node_modules/` 并加守卫断言，**不推荐**。

### D6 Tab 模型：`workbookState` 增加 `kind`（向后兼容）+ 文档内容外置

> **v1.1 修正（响应 P9）**：v1.0 让 `workbookState` 承担 `docState: {content, savedContent, rev}` —— 但 `workbookState` 的既有职责是**纯状态机**（列表/顺序/去重/脏标记，已有 10+ 用例）。把"文档内容"塞进去后，它还会继续吞"图片附件模型"、"引用模型"，最终变成"什么都能装的袋子"，且 md 一改就要动它的测试。
> **改为**：`workbookState` 只记**元数据**（`kind` + `docMeta`），**文档内容另立 `state/documentStore.js`**（按 `tabId` 索引）。→ 现有 `workbookState.test.mjs` **零回归**。

```js
// ✎ web/src/api/workbookState.js —— 只加元数据，不装内容
// state.workbooks[i] = {
//   id, name, filePath, dirty, lastAutosavedAt,
//   kind: 'mindmap' | 'markdown',            // 🆕 缺省 'mindmap'
//   sheetState: { ... },                     // kind==='mindmap' 时存在
//   docMeta: { rev, savedRev, contentHash }  // 🆕 kind==='markdown' 时存在（**不含 content**）
// }
```

```js
// 🆕 web/src/services/state/documentStore.js —— L2 纯状态，按 tabId 索引文档内容
const docs = new Map()   // tabId → { content, savedContent, rev, dirty, lastSavedAt }

export const documentStore = {
  ensure(tabId, { content = '', rev = 0 } = {}) → DocState,
  get(tabId) → DocState|undefined,
  setContent(tabId, content) → { changed:boolean },   // 脏标记的**唯一入口**
  markSaved(tabId, content) → void,
  isDirty(tabId) → boolean,
  drop(tabId) → void,                                  // 关 Tab
  clear() → void                                       // 测试/切换工作区
}
```

```js
function normalize(w) {
  if (w.kind !== 'markdown') w.kind = 'mindmap'          // 🆕 旧数据自动升级
  if (w.kind === 'mindmap' && (!w.sheetState || !Array.isArray(w.sheetState.sheets))) {
    w.sheetState = createDefaultSheetState(w.name)
  }
  if (w.kind === 'markdown' && !w.docMeta) {
    w.docMeta = { rev: 0, savedRev: 0, contentHash: null }   // 🆕 仅元数据
  }
  // ...既有字段保持不变
}
```

- `getWorkbookList()` 返回值追加 `kind`（`FileTabs.vue` 图标由 `filePath?'📄':'📝'` 改为按 `kind` 三元组）。
- `applySaveAs(newPath)` 目前硬编码剥 `.smm` → 改为按 `kind` 决定扩展名与默认名。
- **脏标记的来源统一为 `documentStore.setContent`**；`workbookState.dirty` 由 `documentStore` 变更事件同步（单向：documentStore → workbookState 元数据），**不允许**反向把 content 写进 workbook。
- **回归保护**：`web/tests/unit/workbookState.test.mjs` 已有 10+ 用例，新增「旧数据（无 kind）载入后仍为 mindmap」用例；`documentStore` 单测独立（§11.2 `pure/` 下）。

### D7 索引与版本号：`contentHash` 为准，`rev` 为辅

- 冲突判定用 **`contentHash`（章节正文归一化后的 sha1 前 12 位）**：hash 相同 ⇒ 内容未变，绝无冲突。
- `rev` 单调递增、落 `.mindlink/sections.json`，用于 UI 展示与审计（"该章节已被修改 8 次"）。
- **索引可丢失**：`.mindlink/` 不存在时自动降级为"无索引模式"（仅 hash 判定 + 反链不可用），并在**打开工作区**时自动全量重建。
- **为什么不信 mtime**：编辑器保存、外部工具、Git 检出都会改 mtime，无法区分"内容真变"。

### D8 CommandBus：薄封装，不重写工具栏

```js
// 🆕 web/src/services/commandBus.js
// 现状：工具栏/快捷键各自 $bus.$emit('execCommand', 'INSERT_NODE')
// 目标：统一入口，命令 → { handler, enabled(), context }
commandBus.register('mindmap.addChildNode', { handler, enabled, scope: 'mindmap' })
commandBus.execute('mindmap.addChildNode')          // 工具栏按钮调它
commandBus.shortcut('Ctrl+B', 'markdown.toggleBold') // 快捷键表驱动
```

- **兼容策略**：`execCommand` 事件保留；`commandBus.execute()` 内部对 `mindmap.*` 默认转发到 `$bus.$emit('execCommand', 大写命令)`，因此**既有 40+ 按钮零改动**即可继续工作，新按钮与新快捷键走 `commandBus`。
- **⚠️ v1.1 补充：桥接是"临时妥协"，必须有退场策略**（见 §7.9「桥接的退场策略」）：P5 结束→桥接登记（`legacy:true`）；P6 结束→新代码禁止直发 `execCommand`（守卫阻断）；二期工具栏重构→逐条拆除至归零后删掉转发分支。
- 收益：按钮禁用态（`isEnabled`）、快捷键与按钮同源、可按上下文（当前 Tab 的 `kind`）路由。

### D9 `.smm` 编解码：`smmCodec`

```js
// 🆕 web/src/services/smmCodec.js —— 纯函数，可单测
decodeSmm(text)  → { kind: 'multisheet', activeId, sheets: [{id,name,data}] }
                 | { kind: 'single', sheets: [{id:'sheet-1', name:'Sheet1', data}] }
                 | { kind: 'invalid', error }
encodeSmm({ sheets, activeId }) → string   // 写盘用（多 sheet 容器）
pickActiveData(decoded)         → 单张 data（供 md 内嵌只读预览：只看活动 sheet）
```

- 内嵌预览（`![](./a.smm)`）与节点 `link → .smm` 都走它，避免三处各写一套判定。
- **不做**：不把多 sheet 容器拆成多个文件（破坏现有归档习惯）。

### D10 资源写入：新增 `smm:write-binary`

- md 粘贴图片流程：剪贴板 → `Blob` → `arrayBuffer` → **base64** → IPC `smm:write-binary({filePath, base64})` → 主进程 `fs.writeFileSync(p, Buffer.from(base64,'base64'))`。
- 目标路径：`<workspace>/assets/<yyyyMMdd-HHmmss>-<rand>.<ext>`；插入相对路径 `![](assets/xxx.png)`（**相对 md 文件所在目录**，若 md 不在工作区根目录，则写入 `<md所在目录>/assets/` 更符合相对路径语义——实现取「就近原则」：优先 md 同目录 `assets/`，无工作区时用 md 同目录）。
- 大图片限制：单文件 > 10MB 提示拒绝（防止 `.smm`/仓库膨胀）。

---

## 五、目标架构（To-Be）

### 5.1 分层

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Electron 主进程  electron-app/main.js（+ preload.js）                      │
│  · 窗口 / 静态服务 / 安装器（既有，不动）                                   │
│  · 【新增】workspace-fs IPC：目录树、stat、文本/二进制读写、mkdir、          │
│    move、trash、文件夹选择、fs.watch(recursive) 事件推送、shell 打开        │
│  ⚠️ 仅用 Node 内置模块（asar 不含 node_modules）                            │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ contextBridge: window.smmApi（既有 + 【新增】12 通道）
┌───────────────────────────────┴──────────────────────────────────────────┐
│ 渲染进程 web/src（Vue3）                                                    │
│  ┌────────────────────────── 视图层 ───────────────────────────┐           │
│  │ FileTabs（✎ kind 图标） │ SidebarTrigger（✎ 新增"工作区"入口）│           │
│  │ Index.vue（✎ 按 kind 切换上下文工具栏）                      │           │
│  │  ┌──────────────┐ ┌────────── ─┐ ┌───────────────────────┐ │           │
│  │  │ FileTree 🆕   │ │ MdEditor 🆕 │ │ Edit.vue（导图，既有） │ │           │
│  │  │ WorkspacePanel│ │ MdToolbar 🆕│ │  + customHyperlinkJump │ │           │
│  │  │ MdOutline 🆕  │ │ MindMap-    │ │  + 备注面板接引用块    │ │           │
│  │  │ SectionPicker │ │ Preview 🆕  │ │                       │ │           │
│  │  │ RefBlock 🆕   │ │ Conflict-   │ │                       │ │           │
│  │  │               │ │ Dialog 🆕   │ │                       │ │           │
│  │  └──────────────┘ └────────────┘ └───────────────────────┘ │           │
│  └─────────────────────────────────────────────────────────────┘           │
│  ┌────────────────★ 服务层 web/src/services/（纯 JS，零 Vue 依赖，可单测）★─┐ │
│  │ 【L0 基础层】零依赖、零业务 —— 事件总线/日志/上下文（v1.2 新增）             │ │
│  │   events.js（事件唯一声明处 + createEventBus）· logger.js（环形缓冲，唯一   │ │
│  │   允许访问 localStorage 的服务模块）· context.js                            │ │
│  │ 【L1 纯函数层】零 import 服务、零 IO、零全局 —— 单测主战场                  │ │
│  │   errors.js（ok/fail/err/appError 纯值构造）· hash.js                      │ │
│  │   sectionParser.js   parseSections / buildAnchorMap / slugify          │ │
│  │   sectionWriter.js   replaceSectionInText / normalizeForHash           │ │
│  │   linkResolver.js    resolveLink / resolveEmbed / isExternal          │ │
│  │   refData.js         get/setNodeRefs / addRef / parseLegacyRefs        │ │
│  │   conflictStrategies.js  四分支纯函数                                   │ │
│  │   commandRegistry.js 命令注册表（纯）· smmCodec.js                       │ │
│  │ 【L2 状态层】只持内存状态，不做 IO、不碰 localStorage                      │ │
│  │   workspaceStore.js  {root, tree, indexCache} · documentStore.js        │ │
│  │ 【L3 IO 层】只封 IPC，不懂业务（唯一 IO 出口）                            │ │
│  │   io/fsApi.js · io/suppressionRegistry.js（回声抑制唯一实现处）          │ │
│  │   io/workspaceIndex.js  sections.json / refs.json / meta.json 唯一读写者 │ │
│  │ 【L4 编排层】唯一可以互相调用的一层；构造注入 (ctx)，工厂创建，**禁 this** │ │
│  │   createWorkspaceService(ctx) · createSectionService(ctx)               │ │
│  │   createRefService(ctx) · createRevisionService(ctx)  ← 单向，无回路     │ │
│  │   createFileRouter(ctx) · createCommandBus(ctx) · createMdDocument(ctx) │ │
│  │   createWorkspaceSearch(ctx)                                            │ │
│  │ 【CG 组合根】index.js（只装配）· migrations/（迁移器）—— 唯一可 import 全部 │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│  既有：api/index.js（存储委托）· api/workbookState.js（✎ 加 kind，不装文档内容）│
│        utils/eventBus.js（✎ 新增事件）· store.js（✎ 新增 ui 状态）          │
└───────────────────────────────────────────────────────────────────────────┘
                                │
                        工作区文件系统
        my-workspace/
        ├─ .mindlink/{sections.json, refs.json, meta.json, history/}
        ├─ docs/*.md      diagrams/*.smm      assets/*.png
```

### 5.2 新增 / 改造文件清单

| 路径 | 层 | 类型 | 职责 | **允许** import（§16 硬约束） |
|---|---|---|---|---|
| `services/errors.js` | L1 | 🆕 | `ok/fail/err/appError` + `Result`/`ErrorInfo` 类型（§16.5）—— **纯值构造，零副作用** | 仅内置 |
| `services/hash.js` | L1 | 🆕 | `sha1hex` / `normalizeForHash` / `reuseOrCreateId` | 仅运行环境内置 |
| `services/sectionParser.js` | L1 | 🆕 | `parseSections` / `buildAnchorMap` / `slugify` | markdown-it, hash |
| `services/sectionWriter.js` | L1 | 🆕 | `replaceSectionInText`（含自校验） | sectionParser, hash |
| `services/linkResolver.js` | L1 | 🆕 | `resolveLink` / `resolveEmbed` / `isExternal` / `normalizeHref` —— **纯函数** | 仅内置 |
| `services/refData.js` | L1 | 🆕 | `getNodeRefs` / `setNodeRefs` / `addRef` / `removeRef` / `parseLegacyRefs` / **`updateRefSnapshot`**（校准 `baseHash/baseRev`，供 `syncRefSnapshots` 用，A4） | 仅内置 |
| `services/conflictStrategies.js` | L1 | 🆕 | 冲突四分支策略表（纯函数） | 仅内置 |
| `services/commandRegistry.js` | L1 | 🆕 | **命令注册表纯逻辑**（注册/查表/enabled/快捷键表解析），`commandBus` 只负责编排 | 仅内置 |
| `services/smmCodec.js` | L1 | 🆕 | `.smm` 编解码（容器/单图） | 仅内置 |
| `services/events.js` | **L0** | 🆕 | **所有新增事件的唯一声明处**（常量 + JSDoc 载荷 schema）+ `createEventBus()` | 仅内置 |
| `services/logger.js` | **L0** | 🆕 | 结构化日志（环形缓冲 + 导出，零依赖）；**本工程唯一允许访问 `localStorage` 的服务模块** | 仅内置（含 `localStorage`） |
| `services/context.js` | **L0** | 🆕 | `createWorkspaceContext` / `createDocumentContext` | 仅内置 |
| `services/state/workspaceStore.js` | L2 | 🆕 | `{root, tree, indexCache, watcher}`（无 IO） | 仅内置 |
| `services/state/documentStore.js` | L2 | 🆕 | 文档内容 `{content, savedContent, rev, dirty}` 按 tabId 索引（**无 IO、不碰 localStorage**；持久化由 `mdDocument` 调 `serialize()/hydrate()` 完成，见 §6.6） | 仅内置 |
| `services/io/fsApi.js` | L3 | 🆕 | 封装 `window.smmApi`，统一 `Result/ErrorInfo`；无 window 时给明确错误；**回声抑制唯一登记点** | `window.smmApi`, L1, **同层 L3** |
| `services/io/suppressionRegistry.js` | L3 | 🆕 | **回声抑制的唯一实现处**（写前登记 absPath + hash + TTL；`hit` 为 async，见 §7.8） | fsApi, 同层 L3 |
| `services/io/fsWatchClient.js` | L3 | 🆕 | `fs.watch` 事件语义化 + 噪声过滤 + 抑制判定（`suppression.hit`） | fsApi, suppressionRegistry, **L0** |
| `services/io/workspaceIndex.js` | L3 | 🆕 | `sections.json/refs.json/meta.json` 的**唯一读写者**（含缓存/失效/重建）；进度经 `onProgress` 回调上抛，**自身不 emit** | fsApi, **L0**（events 常量） |
| `services/workspaceService.js` | L4 | 🆕 | `open/close/refresh/getRoot/abs/rel/inferRootFor`、监听订阅与去抖、**迁移调用**、`rebuildIndex` 转发 | 工厂注入 |
| `services/sectionService.js` | L4 | 🆕 | **编排**：读盘 → parse → 返回章节视图（**纯函数在 L1**） | 工厂注入 |
| `services/refService.js` | L4 | 🆕 | refs 增删改查、反链、`syncRefSnapshots`（**无 commit 入口**，见 §7.6） | 工厂注入 |
| `services/revisionService.js` | L4 | 🆕 | **全系统唯一提交入口** `commitEdit/resolveConflict/snapshot/listHistory` | 工厂注入 |
| `services/fileRouter.js` | L4 | 🆕 | `open/navigate`（**编排**；纯解析在 linkResolver） | 工厂注入 |
| `services/mdDocument.js` | L4 | 🆕 | md 载入/保存/自动保存编排 + **`documentStore` 的 localStorage 持久化** | 工厂注入 |
| `services/commandBus.js` | L4 | 🆕 | 命令编排/执行/可用态/快捷键绑定 + **迁移表**（§D8）；纯注册表在 L1 `commandRegistry` | 工厂注入 |
| `services/workspaceSearch.js` | L4 | 🆕 | 文件名 & 全文检索（含 `.smm` 遍历）。**工厂 `createWorkspaceSearch(ctx)`**（v1.2 修正：原为 `export const` 单例） | 工厂注入 |
| `services/index.js` | **CG** | 🆕 | **组合根**：装配依赖，导出默认单例供视图 import；**只装配、零业务、禁条件分支**（R16） | 全部 L0–L4 |
| `services/migrations/index.js` | **CG** | 🆕 | 迁移器注册与执行（幂等 + 备份 + 日志 + dry-run） | fsApi, logger |
| `services/migrations/m00x_*.js` | **CG** | 🆕 | 单步迁移（每步独立可回滚，§17.2） | fsApi, logger |
| `components/FileTree.vue` | 视图 | 🆕 | 树渲染/展开折叠/过滤/右键/拖拽 | `@/services`（**禁 io/**） |
| `components/WorkspacePanel.vue` | 视图 | 🆕 | 工作区侧栏（树 + 工具条 + 空态引导） | FileTree |
| `components/MdEditor.vue` | 视图 | 🆕 | **容器**：装配 7 个 composable（§7.10.0） | `@/services`, `@/composables` |
| `composables/useToastUi.js` | 视图 | 🆕 | Toast UI 生命周期（`markRaw`/destroy/`setMarkdown`） | toastui |
| `composables/useAutoSave.js` | 视图 | 🆕 | 防抖保存 | mdDocument |
| `composables/useLinkInterception.js` | 视图 | 🆕 | click 委托 → fileRouter | fileRouter |
| `composables/useEmbedMindMap.js` | 视图 | 🆕 | MutationObserver → MindMapPreview | smmCodec |
| `composables/useImagePaste.js` | 视图 | 🆕 | paste → writeBinary | 经服务层 |
| `composables/useAnchorScroll.js` | 视图 | 🆕 | 锚点 → 定位 | — |
| `composables/useMdOutline.js` | 视图 | 🆕 | 解析大纲 → 广播 | sectionService |
| `composables/useMdRender.js` | 视图 | 🆕 | **只读渲染 md 片段为 HTML**（RefBlock 与 MdEditor 共用） | markdown-it |
| `components/MdToolbar.vue` | 视图 | 🆕 | md 上下文工具栏（与导图工具栏对称） | commandBus |
| `components/MdOutline.vue` | 视图 | 🆕 | md 大纲（标题层级 + 点击定位） | sectionService |
| `components/MindMapPreview.vue` | 视图 | 🆕 | 只读内嵌导图（点击 → 打开可编辑 Tab） | simple-mind-map, smmCodec |
| `components/SectionPicker.vue` | 视图 | 🆕 | 章节选择器（文件 → 标题树 → 预览） | sectionService |
| `components/RefBlock.vue` | 视图 | 🆕 | 引用块（显示/原地编辑/失焦提交/失效态） | revisionService, useMdRender |
| `components/ConflictDialog.vue` | 视图 | 🆕 | 冲突四分支对话框（**只渲染，策略在 conflictStrategies**） | revisionService |
| `pages/Edit/components/Edit.vue` | 视图 | ✎ | ① 构造选项补 `customHyperlinkJump` ② `node_click` 转发已具备 ③ 只读模式支持 | fileRouter |
| `pages/Edit/components/NodeNote.vue` | 视图 | ✎ | 备注弹窗内新增「🔗 引用文档章节」入口 + 引用块列表（读写 `data._mindlink`） | refService, RefBlock |
| `pages/Edit/components/FileTabs.vue` | 视图 | ✎ | 按 `kind` 显示 📄/🧠 图标；md 标签标题 | — |
| `pages/Edit/Index.vue` | 视图 | ✎ | 按活动 Tab `kind` 切换 `<Toolbar>` / `<MdToolbar>`；渲染 `<MdEditor>` 或 `<Edit>` | — |
| `pages/Edit/components/SidebarTrigger.vue` | 视图 | ✎ | 新增「工作区 / 大纲(md)」入口 | config |
| `api/workbookState.js` | 既 | ✎ | `kind` + `docMeta`（**不装文档内容**）+ `applySaveAs` 泛化 | — |
| `api/index.js` | 既 | ✎ | 导出 doc 元数据委托（内容读写走 `documentStore`） | workbookState |
| `config/{zh,en,zhtw,vi}.js` | 既 | ✎ | 新侧栏项 + 新文案（**4 语言**） | — |
| `styles/macos.less` | 既 | ✎ | 文件树/引用块/冲突弹窗样式令牌 | — |
| `web/package.json` | 既 | ✎ | `markdown-it` 从 `devDependencies` **移入 `dependencies`**（见 R1） | — |
| `scripts/check-arch.mjs` | 工具 | 🆕 | **零依赖架构守卫**：分层 import 白名单 + 依赖环检测（§16.4） | 仅内置 |
| `electron-app/main.js` | 主 | ✎ | **13** 个新 IPC 通道 + `fs.watch` | Node 内置 |
| `electron-app/preload.js` | 主 | ✎ | 暴露上述通道 | — |
| `electron-app/tests/workspace-ipc.test.mjs` | 测试 | 🆕 | 主进程契约测试（通道存在 + 安全校验） | — |
| `web/tests/{pure,orchestration,regression}/*.test.mjs` | 测试 | 🆕 | 按**纯边界**分层（§11.2） | — |
| `build_now.sh` | 构建 | ✎ | 追加守卫断言（新 IPC 已编译；`markRaw`；`check-arch` 通过） | — |

### 5.3 模块依赖（单向 DAG，禁止回路）

> **v1.1 重写**。v1.0 的图里存在两处问题：① `refService ⇄ revisionService` 实为双向环（`refService.commitRef` 调 `revisionService`，而 `revisionService` 又依赖 `refService`）；② `workspaceIndex` 出现在图中但 §5.2 无对应文件。下面按 §16 的分层模型给出真实可达的 DAG（v1.2 起为 L0–L4 + CG）。

```
                               ┌─────────────┐
                               │ services/index.js │  ← 组合根：只在此处 new/装配
                               └────────┬────┘
        ┌───────────────┬───────────────┼───────────────┬────────────────┐
        ▼               ▼               ▼               ▼                ▼
 createFileRouter createRevisionSvc createRefService createMdDocument createCommandBus
        │               │               │               │                │
        │      ┌────────┘        ┌──────┘               │                │
        │      ▼                 ▼                      │                │
        │  sectionService ◀── refService ──▶ (L1 refData)                │
        │      │                 │                                       │
        └──────┴────────┬────────┴───────────────────────────────────────┘
                        ▼
              workspaceService ──▶ workspaceStore ──▶ (L2 纯状态)
                        │
      ┌─────────────────┼──────────────────┬────────────────────┐
      ▼                 ▼                  ▼                    ▼
 io/workspaceIndex  io/fsApi      io/suppressionRegistry   io/fsWatchClient
      │                 │                  │                    │
      └─────────────────┴──────────────────┴────────────────────┘
                        ▼
                 window.smmApi (IPC)

L0 基础层（零依赖，所有人都可 import，**自身不 import 任何服务**）：
  events.js（常量 + createEventBus）· logger.js · context.js
                                              ▲
                                              └── 唯一允许访问 localStorage 的服务模块
      ▲
      └── workspaceIndex(L3) 可 import 其事件**常量**；但进度上报经 onProgress 回调**上抛**，
          由 L4 workspaceService.rebuildIndex() 转发为 emit —— **L3 自身永不 emit**（§16.7 规则 8）

L1 纯函数（被 L4 引用，永不反向引用 L4；本层内可互引，但不得成环）：
  errors.js（ok/fail/err/appError 纯值构造 —— 归 **L1** 不归 L0，见 §16.1 变更说明）
  hash.js · sectionParser.js · sectionWriter.js · linkResolver.js · refData.js
  conflictStrategies.js · commandRegistry.js · smmCodec.js
─────────────────────────────────────────────────────────────────────
关键约束（由 scripts/check-arch.mjs 机械校验，见 §16.4）：
  ① revisionService → refService → sectionService → workspaceService → io/*  ：**单向，无回路**
  ② refService **不再有 commitRef**（v1.0 的双向环已拆除）：提交只能走
     revisionService.commitEdit()，由视图层（RefBlock / NodeNote）调用
  ③ 索引读写**只经 io/workspaceIndex.js**：workspaceService / refService / revisionService
     不得直接 readFile/writeFile `.mindlink/*.json`
  ④ 视图只 import `@/services`（组合根默认单例）或 `@/services/<L0|L1 纯模块>`；
     **禁止** import `services/io/*`
  ⑤ L1/L2/L3 **不得** import Vue、`.vue`、`@/store`、`@/router`；L1 **不得** import 任何服务、
     也**不得**引用 `window` / `localStorage` 全局（L0 的 `logger.js` 是唯一例外）
  ⑥ L4 服务方法签名**不得**出现 `ctx`（由工厂闭包捕获）；工厂内部**禁用 `this`**（A1）
```

**硬规则**（v1.0 保留，v1.1 加严）：

| # | 规则 | 强制手段 |
|---|---|---|
| 1 | 视图组件**不得** import `services/io/*`（含**动态 `import()`**） | `scripts/check-arch.mjs` + `tests/regression/services-isolation.test.mjs` |
| 2 | L1/L2/L3 **不得** import Vue / `.vue` / store / router | 同上 |
| 3 | 服务层**不得** import 视图 | 同上 |
| 4 | 依赖图**必须无环**（**含 L1 同层内部环**，如 `sectionWriter → sectionParser` 合法、反向即环） | `check-arch.mjs` 的 DFS 三色环检测（构建期阻断） |
| 5 | L1 不得 import 任何服务、不得引用 `window` / `localStorage`（保持零 IO 可直测） | 同上 |
| 6 | **`services/io/*` 之外**任何 `web/src/**` 不得出现 `window.smmApi` 直调 | 同上（`/\bwindow\.smmApi\b/`） |
| 7 | 组合根 `services/index.js` **不得**再导出 io 层（`export ... fsApi`） | 同上 |
| 8 | L4 服务方法签名**不得**出现 `ctx`；工厂内部**禁用 `this`** | 同上（正则断言 + 人工 CR 检查项） |

---

## 六、数据契约

### 6.1 `.smm`（既有格式，不改）

```jsonc
// 多工作表容器（本工程写盘格式）
{ "app": "smm-multisheet", "version": 1, "activeId": "sheet-a",
  "sheets": [ { "id": "sheet-a", "name": "Sheet1", "data": { "root": {...} } } ] }
// 兼容读入：单图 JSON（{data,children} 或 {root}）⇒ 归一化为单 sheet
```

### 6.2 节点数据扩展（本期唯一新增字段）

```jsonc
{
  "data": {
    "text": "需求分析", "uid": "n-1", "note": "备注文本（人类可读，无机器元数据）",
    "link": "./docs/requirements.md#需求分析",
    "_mindlink": {                       // 🆕 唯一新增：下划线前缀，避免被当样式字段
      "v": 1,
      "refs": [
        {
          "id": "ref-lm2x9",             // 节点内唯一
          "file": "docs/requirements.md",// 相对工作区根（POSIX 分隔符）
          "sectionId": "a1b2c3",          // 见 6.4；**可为 null** 表示"引用整个文件"（整文件引用，F-边界#4，v1.4）
          "sectionPath": ["需求分析"],     // 冗余，用于 ID 失效时兜底匹配与 UI 展示
          "mode": "editable",             // 【v1.4 保留未启用】当前恒为 'editable'；readonly 双态留待二期（无明确场景，YAGNI，F5）
          "baseHash": "sha1:ab12cd34ef56",// 读时快照，提交前比对
          "baseRev": 7,
          "cachedContent": "……",          // 【v1.4 修正，F2】内容快照（**非缓存**）：首次引用成功即写入，源失效时的兜底可读内容，截断 8KB
          "cachedAt": "2026-09-20T03:00:00Z"
        }
      ]
    }
  },
  "children": []
}
```

**不变量**：
1. `_mindlink` 只增不改语义；`v` 为 schema 版本，升级时旧版本可读。
2. `baseHash` / `baseRev` 是**可重建的缓存**（删除后仅损失"快速失效提示"，不影响数据正确性）；`cachedContent` **不是缓存，是内容快照**（v1.4 修正，F2）：① 首次引用成功后**立即写入**（而非"失效时才写"）；② 定位为"引用失效时的兜底可读内容"，不会被 `rebuild` 清空；③ 截断 **8KB**（超长提示"内容过长，仅显示前 8KB"）；④ 编辑态始终显示**全文**，`cachedContent` 仅用于失效兜底。
3. 所有 `file` 路径为**相对工作区根的 POSIX 路径**（杜绝绝对路径污染 `.smm`，需求文档 §11.8）。
4. **`link`（跳转）与 `_mindlink.refs[]`（内容引用）可独立共存**（v1.4 新增，F6）：一个节点可只有 `link`（点图标跳转到 md 锚点）、只有 `_mindlink`（在备注面板显示/编辑章节内容）、或两者都有（既跳转也显示）。两者语义互不影响，互不作为前置条件。典型用法见 §7.13。

### 6.3 `.mindlink/` 目录

```jsonc
// .mindlink/meta.json
{ "v": 1, "root": "my-workspace", "createdAt": "2026-09-20T02:00:00Z",
  "lastOpenedTabs": [{ "path": "docs/requirements.md", "kind": "markdown" }],
  "settings": { "autoSaveIntervalMs": 1200, "refCommitDebounceMs": 500 } }

// .mindlink/sections.json  —— 章节索引（可重建）
{ "v": 1, "files": {
    "docs/requirements.md": {
      "fileHash": "sha1:9f8e...",           // 整文件 hash，快速判断"文件是否变化"
      "sections": {
        "a1b2c3": { "path": ["需求分析"], "level": 2, "startLine": 12, "endLine": 28,
                    "rev": 7, "contentHash": "sha1:ab12cd34ef56",
                    "lastModified": "2026-09-20T03:00:00Z", "anchor": "需求分析" }
      },
      "updatedAt": "2026-09-20T03:00:00Z"
  } } }

// .mindlink/refs.json —— 引用关系（反链基础；真源是各 .smm 节点里的 _mindlink，
//                          本文件是"反向索引缓存"，可重建）
{ "v": 1, "bySection": {
    "docs/requirements.md#a1b2c3": [
      { "type": "mind-note", "file": "diagrams/arch.smm", "sheetId": "sheet-a",
        "nodeId": "uid-xxx", "refId": "ref-lm2x9", "mode": "editable",
        // 【v1.3 新增，C3】惰性快照同步标记：该 section 被引用数 N>10 时置 true，
        //   表示"这些 .smm 里的 baseHash/baseRev 尚未校准到最新 rev"。
        //   打开对应 .smm（fileRouter.open）或用户点「刷新全部引用」时校准并清除 —— §7.6.6
        "snapshotPending": true,
        "pendingRev": 8, "pendingHash": "sha1:ab12cd34ef56"   // 目标值（缺省时取 sections.json 现值）
    ]
  } }

// .mindlink/history/<file-slug>__<sectionId>__<yyyyMMdd-HHmmss>.md —— 覆盖写前快照
```

> **降级规则**：`.mindlink/` 不存在 或 读取失败 ⇒ `readonly-index` 模式：引用仍可显示/编辑（靠 `cachedContent` + 实时读源），但**无 rev 递增**、**无反链**、冲突判定退化为 hash 比较；UI 状态栏提示"未建立索引，点此重建"。

#### 6.3.1 索引重建协议（v1.1 新增 —— 响应 M3）

v1.0 只说"可重建"，没有规定**何时、并发怎么办、失败了怎么办**。以下为强制协议，实现于 `services/io/workspaceIndex.js`。

**schema 版本**：`meta.json` 与 `sections.json` / `refs.json` 均带 `v`。当前 `CURRENT_INDEX_SCHEMA = 1`。`v` 不等于当前值 ⇒ 视为**需要迁移/重建**，进入 §17.2 迁移器。

**唯一重建入口**：

```js
// services/io/workspaceIndex.js —— L3
// ⚠️ v1.2：L3 不得 emit（它只允许 import 内置/L0/L1）；进度经 onProgress 回调**上抛**，
//          由 L4 workspaceService.rebuildIndex() 转发为 emit(INDEX_REBUILDING, ...)
async rebuild({ full = false, signal, onProgress } = {}) → { mode:'full'|'incremental', scanned, files, refs, ms, aborted? }
// onProgress?.({ phase:'scan'|'parse'|'write', scanned, total })   —— 纯回调，无事件依赖
```

| 时机 | 触发方式 | 说明 |
|---|---|---|
| 打开工作区且 `.mindlink/` 缺失 | `open()` 内自动（用户确认后） | 首次建索引 |
| `v` 与 `CURRENT_INDEX_SCHEMA` 不符 | `open()` 内自动（**先迁移**，见 §17.2/§7.3） | 交给迁移器；迁移失败则 `full:true` 重建 |
| `sections.json` / `refs.json` 解析失败（`JSON.parse` 抛错） | 自动 | **先把坏文件改名为 `*.bad-<ts>` 备份**，再重建（不删） |
| 用户手动「重建索引」 | 命令 `app.rebuildIndex` | 走 `full:true` |
| 单文件 `fileHash` 变化 | 增量 | 只重解析该文件的 sections，并重算 refs 中指向它的条目 |

**并发与重入（关键）**：

```
1) 单飞（single-flight）：rebuild 期间再调用 → 返回同一个 in-flight Promise（不并发跑第二次）
2) 互斥门 `indexWriteLock`：rebuild 持锁期间，commitEdit 的"更新索引"步骤**排队等待**，
   而不是失败（避免用户在一次重建中丢提交）
3) 进度上报（v1.2 修正分层）：workspaceIndex 只调 `onProgress({phase,scanned,total})`；
   **L4** `workspaceService.rebuildIndex(opts)` 装配回调 →
   `workspaceIndex.rebuild({ ...opts, onProgress: p => emit(INDEX_REBUILDING, p) })`，
   完成时 `emit(INDEX_REBUILDING, {done:true})`。状态栏显示"正在重建索引…"，
   引用块进入只读（防止基于半成品索引做冲突判定）
4) 可中断：每处理 N=50 个文件检查一次 `signal.aborted`，中断则**不写盘**（保持旧索引可用），
   返回 `{aborted:true}`
5) 幂等：同一份文件树重复 rebuild 结果一致（靠 `normalizeForHash` 与稳定 ID 算法 §6.4）
6) 原子写：先写 `*.tmp-<rand>` 再 `move` 覆盖（复用 `fsApi.move`），避免半个 JSON
7) 失败恢复：任一步失败 → 回滚为**内存态索引**（`workspaceStore.indexCache` 仍可用），
   状态置 `indexStatus='degraded'`，状态栏提供"重试"；**绝不让重建失败导致引用功能不可用**
```

**重建耗时预算**：1000 个文件（含 200 个 `.smm`）目标 < 3s；`.smm` 解析走 `smmCodec` 只取节点文字，不建实例。超过 3000 文件时先建**目录级索引**，文件内容索引按需懒加载（`rebuild({ full:false })`）。

### 6.4 章节模型与 ID 算法

```ts
interface Section {
  id: string;            // 短哈希 6 位
  level: number;         // 1..6
  title: string;         // 标题文本（去掉 # 与行尾 #）
  path: string[];        // 层级路径 e.g. ['需求分析','功能列表']
  startLine: number;     // 标题行（0-based）
  headingLineCount: number; // 1（ATX）或 2（Setext）
  endLine: number;       // 章节结束行（不含）
  content: string;       // 标题行之后到 endLine 的原文
  contentHash: string;   // sha1(归一化 content) 前 12 位
  anchor: string;        // slug
}
```

**ID 生成（稳定性优先）**：

```
1) 若能命中旧索引（同 file、同 path、同 level，且旧 section 行区间与新解析结果重叠或相邻）
   → 复用旧 id（这是"标题被改也不换 ID"的关键：见下）
2) 否则 id = sha1(file + '#' + path.join('/') + '#' + level + '#' + ordinal).slice(0,6)
   其中 ordinal 为同 path 重复出现时的序号（0,1,2…），保证"同名标题多次出现"各自稳定
3) 6 位碰撞：同文件内已存在同 id 则追加 -1/-2…
```

**标题被改**：路径变了 ⇒ 规则 1 通过"行区间重叠"仍复用旧 ID（**不要让改标题变成换 ID**，否则所有引用全部失效）。**标题被删**：无法匹配 ⇒ 引用块进入 `missing`（§7.6.4）。

> **【v1.4 澄清，F1】"改名后引用仍有效"由两条机制接力保证，覆盖场景不重叠**：
> - **机制一（主力）：ID 复用**。改标题但章节**行区间仍与旧索引重叠** ⇒ `parseSections` 在 `reuseOrCreateId` 里直接复用旧 `id` ⇒ `commitEdit` 步骤② `sections.find(s => s.id === sectionId)` **命中**，**根本不进步骤③**，`rebound:false`，提交成功。这是"只改标题"的日常路径。
> - **机制二（fallback）：`rebind`**。`rebind`（§7.7.1）只在 **id 已丢失（行区间不再重叠）且 `byPath` 精确匹配命中唯一候选** 时才发生（`rebound:true`）。对应"章节被大幅重排/移动导致行区间不重叠、但标题文字尚在"的罕见场景。
> - 二者不重叠：行区间重叠 ⇒ 机制一（不进③）；行区间不重叠 ⇒ 机制二（进③，靠旧 `sectionPath` 反查）。故 §7.7.1 行为对照表第 1 行**不是"改名 + rebind"**，而是"改名 + 机制一（id 复用），rebound:false"。此澄清消除 v1.3 §7.7.1 与 §6.4 规则 1 的错位。

**锚点 slug 规则**（与 GitHub 尽量一致，供 `file.md#anchor` 跳转）：

```
1) 去首尾空白、转小写、去行内 markdown 标记（**bold**、`code`、[link](x) 取文本）
2) 保留 Unicode 字母/数字/CJK；空格→'-'；删除 # % & 等标点
3) 同名重复 → 追加 '-1','-2'（按文档顺序）
4) 反查容错：URL 里未编码的中文、大小写差异、连续的多个 '-' 均做归一化匹配
```

### 6.5 备注（`note`）往返无损规则

| 规则 | 说明 |
|---|---|
| R1 | `note` **只存人类可读内容**；机器元数据一律进 `_mindlink` |
| R2 | 引用块在备注里的可见呈现（`> 📌 引用自 xxx.md · 需求分析`）是**渲染时合成**的装饰，不写回 `note`（或写成纯文本行由用户自行保留） |
| R3 | 备注读入编辑器前**不做** markdown 归一化（保留原样，避免把 `- ` 改写成 `* ` 造成"打开一次就脏"） |
| R4 | **块级** HTML 注释允许存在但**不依赖**其语义（仅作 legacy 只读解析） |
| R5 | 保存时 `note = editor.getMarkdown()`；若检测到行内 HTML 注释（`\S<!--`）**先规范化**为独立块再 `setMarkdown`，避免 D4-② 崩溃 |

### 6.6 会话恢复（重启后还原）

> **v1.2 澄清（A6）**：`documentStore` 是 **L2 纯内存状态**，**自己不做任何持久化**（不碰 localStorage）。持久化职责归 **L4 `mdDocument`**：
> `mdDocument` 在 `markDirty` 防抖后调用 `documentStore.serialize(tabId)` → `localStorage.setItem('smm.doc.'+tabId, json)`；
> 启动时 `mdDocument` 读 localStorage → `documentStore.hydrate(tabId, json)`。
> **规则**：`services/state/*` 与 L1 **不得**出现 `localStorage`；全工程唯一允许访问 `localStorage` 的服务模块是 L0 的 `logger.js`（其余视图/`mdDocument` 属"会话持久化"特例，见 §16.1 注）。

- `FileTabs`/`workbookState` 已把打开文件列表存 localStorage；本期追加：把**工作区根路径**与 `lastOpenedTabs` 写入 `.mindlink/meta.json` 和 localStorage 双写。
- 启动流程：读 localStorage → 若有工作区且目录仍存在 → 恢复工作区与 Tab；md Tab 的**文档内容**由 `mdDocument` 从 localStorage **灌入** `documentStore`（未保存内容不丢；v1.1 起内容不再进 `workbookState`），并与磁盘内容比对决定脏态。

---

## 七、模块接口详细设计

> 所有服务层模块：**纯 JS + JSDoc，可 `node --test` 直接跑**；视图层只做展示与事件绑定。

### 7.1 `io/fsApi.js` —— 唯一 IO 出口（+ `io/suppressionRegistry.js`）

> **v1.1 变更**：① 移到 `services/io/`（L3），分层见 §16.1；② **一律返回 `Result`，永不抛**（v1.0 的"抛 `FsError`"与 §7.5/§7.7 的两种表示法并存，已由 §16.5 统一）；③ 新增 `io/suppressionRegistry.js` 承担回声抑制（§7.8）。

```js
// 🆕 web/src/services/io/fsApi.js  —— L3：只封 IPC，不懂业务
import { ok, fail, err } from '../errors'
import { suppression } from './suppressionRegistry'
import { sha1hex } from '../hash'

/** 非桌面环境：返回 Result 失败（**不抛**），便于单测注入 fake */
const api = () => (typeof window === 'undefined' || !window.smmApi) ? null : window.smmApi
const guard = () => { const a = api(); return a ? a : null }

/** 归一化所有 IPC 返回：调用方拿到的永远是 Result */
function nz(res, codeOnFail = 'E_IO') { /* 把 {ok:false,code} → fail(err(code)) */ }

export const fsApi = {
  pickDirectory: () => wrap(a => a.pickDirectory()),                       // Result<{canceled, dirPath}>
  readTree: (root, opts) => wrap(a => a.readTree(root, opts)),             // Result<{tree}>
  stat: paths => wrap(a => a.statMany(paths)),                             // Result<{path:{exists,isDir,mtimeMs,size}}>
  readText: p => wrap(a => a.readText(p)),                                 // Result<{content, mtimeMs}>
  /** ⚠️ 写文本前**自动**登记回声抑制（**全工程唯一登记点**），调用方无需关心、也**不得**再手动 `register` */
  async writeText(p, content, opt) {
    const r = await wrap(a => a.writeText(p, content, opt))                // opt.expectMtimeMs
    if (r.ok) suppression.register(p, { hash: sha1hex(content) })
    return r
  },
  async writeBinary(p, base64) {
    const r = await wrap(a => a.writeBinary(p, base64))
    if (r.ok) suppression.register(p, { hash: sha1hex(base64) })
    return r
  },
  mkdirp: p => wrap(a => a.mkdirp(p)),
  move: (from, to) => wrap(a => a.move(from, to)),
  trash: paths => wrap(a => a.trash(paths)),
  watch: root => wrap(a => a.watch(root)),                                 // 主进程推送 fs:event
  unwatch: () => wrap(a => a.unwatch()),
  onFsEvent: cb => wrap(a => a.onFsEvent(cb)),
  openExternal: url => wrap(a => a.openExternal(url)),
  revealInFolder: p => wrap(a => a.revealInFolder(p))
}
```

**错误码约定**（统一为 `Result` 的 `error: ErrorInfo`，见 §16.5）：

| code | 触发 | suggestedAction |
|---|---|---|
| `E_NO_DESKTOP` | 非 Electron 环境（Web 预览/单测） | — |
| `E_NOT_FOUND` | 路径不存在 | `pickAnotherPath` |
| `E_NOT_DIR` | 目标不是目录 | `pickAnotherPath` |
| `E_ACCESS` | 权限拒绝（EPERM/EACCES） | `retry` |
| `E_OUTSIDE_ROOT` | 目标在工作区外（文件树操作） | — |
| `E_EXISTS` | move/rename 目标已存在 | — |
| `E_LOCKED` | 文件被占用（EBUSY，Windows 常见） | `retry` |
| `E_IO` | 其他 IO 失败 | `retry` |

```js
// 🆕 web/src/services/io/suppressionRegistry.js  —— 实现见 §7.8
// ⚠️ v1.2：hit 改为 async，只收路径（内部读盘算 hash），调用方无需自己算 diskHash
export const suppression = {
  register(absPath, { hash, ttlMs }),
  async hit(absPath) → Promise<boolean>,
  clear()
}
```

> **谁负责登记（v1.2 统一，A14-3）**：**只有 `fsApi.writeText` / `fsApi.writeBinary` 内部登记**。
> 业务层（`revisionService` / `mdDocument` / 视图）**一律不得**调用 `suppression.register`——
> v1.1 在 §7.7 与 §7.10.2 各写了一处手动 `register` / `suppress.add`（与 §7.1 的"自动登记"重复且命名不一），
> 本版删除这两处，统一由 `fsApi` 承担。

### 7.2 主进程 IPC 扩展（`electron-app/main.js` + `preload.js`）

> ⚠️ **全部写在 `main.js` 内**（不新建本地模块），以免触碰 `_appstage` 白名单拷贝清单（§2.7 约束 1）。若确需拆模块，必须同步 `build_now.sh` 该行并依赖 `electron-app/tests/asar-modules.test.mjs` 兜底。

| # | 通道 | 入参 | 返回 | 安全约束 |
|---|---|---|---|---|
| 1 | `smm:pick-directory` | `{title?}` | `{canceled, dirPath}` | 只读对话框 |
| 2 | `smm:read-tree` | `{root, depth?, ignore?}` | `{ok, tree:FileNode[]}` | **必须** root 为已存在目录；默认忽略 `node_modules/.git/.mindlink/dist` 与隐藏项（可配） |
| 3 | `smm:stat-many` | `{paths:[]}` | `{ok, stats:{[p]:{exists,isDir,isFile,mtimeMs,size}}}` | 只读 |
| 4 | `smm:read-text` | `{filePath, maxBytes?}` | `{ok, content, mtimeMs}` | 默认上限 8MB，超限返回 `E_TOO_LARGE` |
| 5 | `smm:write-text` | `{filePath, content, expectMtimeMs?}` | `{ok, mtimeMs}` | `expectMtimeMs` 不匹配 → `{ok:false, code:'E_MTIME_CHANGED', mtimeMs}`（**仅告警，不阻断**，默认关闭） |
| 6 | `smm:write-binary` | `{filePath, base64, mkdirp?}` | `{ok, size}` | 上限 10MB |
| 7 | `smm:mkdirp` | `{dirPath}` | `{ok}` | — |
| 8 | `smm:move` | `{from, to}` | `{ok, code?}` | 目标存在 → `E_EXISTS`；跨盘 → 回退 copy+trash |
| 9 | `smm:trash` | `{paths:[]}` | `{ok, failed:[]}` | **用 `shell.trashItem`（回收站）**，禁止 `fs.rm`；一次最多 20 条 |
| 10 | `smm:watch` | `{root}` | `{ok}` | 同时只保留一个 root；替换时先 `close()` 旧 watcher |
| 11 | `smm:unwatch` | — | `{ok}` | — |
| 12 | `smm:open-external` | `{url, baseDir?}` | `{ok}` | **白名单**：`http/https/file` 或工作区内相对路径解析后的绝对路径；其他 scheme（`javascript:` 等）拒绝 |
| 13 | `smm:reveal-in-folder` | `{filePath}` | `{ok}` | `shell.showItemInFolder` |

**主进程 → 渲染进程推送**：

```js
ipcMain.handle('smm:watch', (e, { root }) => {
  if (watcher) { watcher.close(); watcher = null }
  const pending = new Map()          // path -> {type, ts}
  const flush = () => {
    const events = [...pending.values()]
    pending.clear()
    if (events.length && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('smm:fs-event', { root, events })
    }
  }
  let timer = null
  const push = (type, filename) => {
    const key = type + '|' + filename
    pending.set(key, { type, path: path.join(root, filename || ''), ts: Date.now() })
    clearTimeout(timer); timer = setTimeout(flush, 400)   // 合并窗口
  }
  try {
    watcher = fs.watch(root, { recursive: true }, (type, filename) => {
      if (!filename) return
      const rel = filename.replace(/\\/g, '/')
      if (/(^|\/)(node_modules|\.git|\.mindlink|_trash)(\/|$)/.test(rel)) return  // 噪声过滤
      push(type === 'rename' ? 'rename' : 'change', rel)
    })
  } catch (err) {
    return { ok: false, code: 'E_WATCH', message: err.message }   // Linux 无 recursive → 降级
  }
  return { ok: true }
})
```

**限制与对策**：`rename` 同时覆盖"新建/删除" ⇒ 渲染进程对每个事件 `stat` 确认后，再发出语义事件 `fs:add|fs:change|fs:unlink`（§7.8）。

### 7.3 `workspaceService.js`

> **v1.1 变更**：① 由 `export const workspaceService = {...}` 模块单例改为**工厂 + 注入**（§16.2）；② `root` 不再挂在模块变量上，而是 `ctx.workspace.root`；③ **删 `readIndex/writeIndex`**，索引读写全部委托 `io/workspaceIndex.js`（消除"索引层寄居"）。

```js
// 🆕 web/src/services/workspaceService.js
import { runMigrations } from './migrations'      // CG 层（组合根层，§16.1）
import { WS_OPENED, WS_CLOSED, TREE_CHANGED, INDEX_REBUILDING } from './events'   // L0

export function createWorkspaceService(ctx) {
  const { io, stores, events, log } = ctx          // 依赖注入（§16.1 工厂签名模板）
  const { fsApi, workspaceIndex } = io
  const { workspace } = stores                     // L2 纯状态：{root, tree, indexCache}
  const { emit } = events

  // ══════════════════════════════════════════════════════════════════════════
  // ⚠️ A1 硬规约：工厂内部**一律使用闭包函数与闭包变量**，禁止 `this.xxx`。
  //    原因：工厂返回对象字面量，调用方 `const { open } = workspaceService` 解构后
  //          `this` 立即丢失（strict ESM 下为 undefined），运行时才炸。
  //    §11.3.2 的 check-arch.mjs 对 `this\.` 做断言拦截。
  // ══════════════════════════════════════════════════════════════════════════

  /** 私有：首次建索引需用户确认（闭包，不依赖 this） */
  async function confirmCreateIndex(dirPath) {
    const r = await viewConfirm({ kind: 'createIndex', dirPath })   // 视图弹窗，返回 bool
    return r === true
  }

  /** 私有：索引视图的进度回调 → 转发为 L4 的 emit（L3 自身不 emit，见 §6.3.1-3） */
  const progressRelay = p => emit(INDEX_REBUILDING, p)

  return {
    /** 打开工作区：迁移 → 扫描 → 建/读 .mindlink → 建索引 → 启动监听。失败可回滚 */
    open, close, refresh, getRoot, abs, rel, inferRootFor,
    onFsAdd, onFsChange, onFsUnlink,
    readIndex, writeIndex, rebuildIndex
  }

  // ─────────────────────────── 实现（闭包） ───────────────────────────

  /** 打开工作区 */
  async function open(dirPath, { createIndexIfMissing = true } = {}) {
    const t0 = now()
    const st = await fsApi.stat(dirPath)                       // fsa.stat → {ok,data}
    if (!st.ok) return fail(st.error)
    if (!st.data.isDir) return fail(err('E_NOT_DIR', { path: dirPath }))

    const tree = await fsApi.readTree(dirPath, {
      ignore: ['node_modules', '.git', '.mindlink', '_trash', 'dist-electron', 'dist-electron2']
    })

    let indexStatus = 'ok'
    const meta = await workspaceIndex.read('meta.json')         // ← 索引读写只经 workspaceIndex

    // ① 索引已存在 → 先迁移（§17.2 触发时机：建索引之前；`v` 不符才真正执行）
    //    【v1.3-C10】把已读到的 meta 传进去（runMigrations 内部据此判断 `v`，
    //    避免它再读一次 meta.json —— 迁移器本轮不需要第二次 IO）
    if (meta.ok) {
      const mig = await runMigrations(ctx, { dryRun: false, meta: meta.data })
      if (!mig.ok) {
        log.warn('migrate.failed', { dirPath, error: mig.error })
        // 【v1.3-D3】对齐 §6.3.1「迁移失败则 full:true 重建」：先尝试整索引重建，
        //   仍失败才降级只读。v1.2 直接降级只读，与 §6.3.1 的表述不一致。
        const rb = await workspaceIndex.rebuild({ full: true, onProgress: progressRelay })
        indexStatus = rb.ok ? 'rebuilt' : 'readonly-index'    // 降级：不阻断打开（§10-27）
      }
    }

    // ② 再决定"新建索引"或"只读降级"
    if (!meta.ok) {
      if (createIndexIfMissing && await confirmCreateIndex(dirPath)) {
        await workspaceIndex.init(dirPath, defaultMeta(dirPath)) // 内部 mkdirp + 原子写
        indexStatus = 'created'
      } else indexStatus = 'readonly-index'
    }

    workspace.root = dirPath                                    // ← 状态落 store，不落模块变量
    workspace.tree = tree
    await fsApi.watch(dirPath)
    emit(WS_OPENED, { root: dirPath, tree, indexStatus })       // ← 事件常量来自 L0 events.js
    log.info('workspace.open', { dirPath, indexStatus, durMs: now() - t0, files: countNodes(tree) })
    return ok({ root: dirPath, tree, indexStatus })
  }

  async function close() { /* 停监听 + 清缓存 + emit(WS_CLOSED) */ }
  async function refresh() { /* 重扫 readTree → workspace.tree → emit(TREE_CHANGED) */ }
  function getRoot() { return workspace.root }                  // 便捷读；服务内部用 workspace.root
  function abs(rel) { return workspace.root ? joinWin(workspace.root, rel) : rel }
  function rel(p) { return workspace.root && isInside(p, workspace.root) ? toRel(workspace.root, p) : null }
  function inferRootFor(filePath) { /* 向上找 .mindlink/，找不到用文件所在目录 */ }

  function onFsAdd(cb) { return subscribe('add', cb) }
  function onFsChange(cb) { return subscribe('change', cb) }
  function onFsUnlink(cb) { return subscribe('unlink', cb) }
  function subscribe(kind, cb) { /* fsWatchClient 语义事件订阅，返回 unsubscribe */ }

  /** 索引视图（薄委托，不含实现） */
  function readIndex(name) { return workspaceIndex.read(name) }
  function writeIndex(name, data) { return workspaceIndex.write(name, data) }
  /** 重建索引：装配 onProgress → emit（L3 不 emit，L4 转发） */
  function rebuildIndex(opts = {}) { return workspaceIndex.rebuild({ ...opts, onProgress: progressRelay }) }
}
```

> **为什么要显式写出"私有闭包函数"（v1.2）**：v1.1 的伪码写成 `async open(dirPath) { ... this.confirmCreateIndex(...) }`，
> 与工厂模式**直接冲突**——工厂返回的是对象字面量，不是 `class` 实例。本版把"私有函数 + 返回对象"的形态写死，
> 让实现者无法误用 `this`。`§7.7` 的 `snapshot/rebind/_writeAndBroadcast` 同理，均改为闭包函数。

**空态与降级**：未打开工作区时，全部引用/链接能力按「单文件模式」工作——`inferRootFor(filePath)` 返回文件所在目录，`.mindlink` 不创建（只用 `cachedContent` + 实时读）。

### 7.4 `linkResolver.js`（纯） + `fileRouter.js`（编排）

> **v1.1 拆分为两个文件**（响应 P7）。v1.0 把"零成本可测的纯解析"和"要 mock 一堆依赖的副作用路由"塞在一个模块，导致 §11.2 里 10 个用例全都要 mock。现在：**纯解析零 mock，编排才注入 fake**。

**7.4.1 `linkResolver.js` —— L1 纯函数，零 import 服务（10 个用例零 mock）**

```js
// 🆕 web/src/services/linkResolver.js   —— 无 IO、无事件、无状态；输入输出皆字符串
export const SUPPORTED = {
  '.md': 'markdown', '.markdown': 'markdown',
  '.smm': 'mindmap', '.json': 'mindmap',
  '.km': 'mindmap-import', '.xmind': 'mindmap-import',
  '.png': 'image', '.jpg': 'image', '.jpeg': 'image',
  '.gif': 'image', '.svg': 'image', '.webp': 'image'
}

/** 链接解析（纯） */
export function resolveLink(fromPath, href, { root = null } = {})
  → { abs, rel, kind, anchor, isExternal, unsupported? }

/** 内嵌解析（纯）—— md 渲染器调用 */
export function resolveEmbed(href, fromPath, { root = null } = {})
  → { kind:'mindmap'|'image'|'md'|'external'|'broken', abs, anchor }

/** 显式外链判定（纯） */
export function isExternal(href) → boolean

/** URL 解码 + 反斜杠归正 + 去 ./（纯） */
export function normalizeHref(href) → string
```

**`resolveLink` 边界规则**（v1.0 规则全部保留，此处不变，只是换了归属文件）：

| 输入 | 处理 |
|---|---|
| `./a.smm` / `../x/y.md` | 相对 `fromPath` 所在目录解析 |
| `/docs/a.md` | 相对**工作区根**解析（而非盘根） |
| `docs/a.md#锚点` | 拆 anchor，anchor 走 slug 反查（§6.4） |
| `https://…` / `mailto:` | `kind:'external'`，交给 `fsApi.openExternal` |
| `#本地锚点` | `kind:'md'`，same-doc 滚动 |
| 空串 / `#` | 忽略 |
| 含 Windows 盘符绝对路径 | 直接判定绝对路径，但**不写回** `.smm`（提示用户改为相对路径） |
| URL 编码（`%20`） | `decodeURIComponent` 后再解析 |

**7.4.2 `fileRouter.js` —— L4 编排（只有它有副作用）**

```js
// 🆕 web/src/services/fileRouter.js
export function createFileRouter(ctx) {
  const { io, stores, services, events, log } = ctx
  const { fsApi } = io
  const { workspaceService } = services
  const { emit } = events

  // 闭包函数（严格禁用 this，同 §7.3-A1）；revisionService 仅在"需要触发提交"时惰性取用，
  // 避免 §5.3 的 DAG 出现 fileRouter → revisionService 之外的额外边
  async function open(pathOrAbs, { anchor, sheetId } = {}) { /* 入口 1：见下 */ }
  async function navigate(href, fromPath) { /* 入口 2：见下 */ }
  async function importAsNew(abs) { /* .km/.xmind → 既有 Import 流 */ }

  /** 入口 3：内嵌解析（**纯逻辑转发给 linkResolver**，保留以便调用方不改） */
  function resolveEmbed(href, fromPath) {
    return linkResolver.resolveEmbed(href, fromPath, { root: workspaceService.getRoot() })
  }
  /** 兼容转发：老调用方仍可用；新代码应直接 import linkResolver */
  function resolveLink(fromPath, href) {
    return linkResolver.resolveLink(fromPath, href, { root: workspaceService.getRoot() })
  }

  return {
    /** 入口 1：打开文件（Tab 内），已打开则激活 + 定位锚点 → Result<{tabId, reused}> */
    open,
    /** 入口 2：链接跳转（md 内点击 / 导图节点点击）—— 副作用集中在此 */
    navigate,
    resolveEmbed, resolveLink
  }
}
```

**`navigate` 伪码**：

```js
async function navigate(href, fromPath) {
  const r = linkResolver.resolveLink(fromPath, href, { root: workspaceService.getRoot() })
  if (r.kind === 'external') {
    const res = await fsApi.openExternal(r.abs)
    return res.ok ? ok({ action: 'external' }) : res
  }
  const st = await fsApi.stat(r.abs)
  if (!st.ok || !st.data.exists) {
    emit(LINK_MISSING, { href, fromPath, abs: r.abs })   // UI 弹"创建/忽略/改链接"
    return fail(err('E_LINK_MISSING', { path: r.abs }))
  }
  if (r.kind === 'mindmap-import') return importAsNew(r.abs)   // .km/.xmind 走既有 Import 流
  return open(r.abs, { anchor: r.anchor })
}
```

**Tab 去重 + 锚点**：`open()` 先用既有 `findByPath(abs)` 命中则 `switchWorkbook(id)` + `emit(MD_SCROLL_TO_ANCHOR, {anchor})`；未命中则 `addWorkbook({kind, name, filePath:abs})` 并载入内容。

**⚠️ `.smm` 打开时的引用快照校准（v1.3 新增，C3）**：`open()` 命中 `kind:'mindmap'` 时，必须在 `smmCodec.decodeSmm → pickActiveData` **之后、`setData` 渲染之前**调用 `refService.calibratePendingSnapshots({ abs })`（§7.6.6-②）。顺序不能颠倒 —— 否则会先渲染出 `baseHash` 陈旧的引用块，用户会看到一闪而过的假 `stale` 徽标。

**⚠️ 依赖方向纪律**：`fileRouter` **不得**反向 import `revisionService` 以外的 L4 服务，**不得**监听 `FILE_SAVED` 之类的"自己造成"的事件做抑制 —— 回声抑制的唯一实现处是 `io/suppressionRegistry`（§7.8）。

### 7.5 章节解析与写回 ★

> **v1.1 拆分与改名**（响应 P8）。v1.0 在同一个 `sectionService.js` 里，标题注释写"纯函数 + 少量 IO 编排"，§5.2 清单写 `getSection/replaceSection`（**暗示要读盘写盘**），而 §7.5 代码块里却全是纯函数 —— 三处表述不一致，实现时必然产生歧义。现明确切成三层、统一命名：

| 文件 | 层 | 性质 | 内容 |
|---|---|---|---|
| `services/sectionParser.js` | L1 | **纯** | `parseSections` / `buildAnchorMap` / `slugify` / `samePath` |
| `services/sectionWriter.js` | L1 | **纯** | `replaceSectionInText`（含自校验） / `normalizeForHash` |
| `services/sectionService.js` | L4 | 编排 | 读盘 → `parseSections` → 回填索引 → 返回章节视图；写回走 `revisionService` |

**命名对照（消除 v1.0 漂移）**：`getSection` → **`sectionService.getSectionView(file, sectionId)`**（编排，会读盘）；`replaceSection` → **`sectionWriter.replaceSectionInText(...)`**（纯，不读不写盘）。**"写盘"这件事只发生在 `revisionService.commitEdit`**。

**7.5.1 L1 纯函数接口（单测零 mock）**

```js
// 🆕 web/src/services/sectionParser.js   —— 纯函数，唯一依赖 markdown-it + hash.js
import MarkdownIt from 'markdown-it'
const mdit = new MarkdownIt({ html: true, linkify: false })

/** 解析全文 → 章节列表（AST 行号切块，禁止正则） */
export function parseSections(mdText, { file = '', prevIndex = null } = {}) → Section[]
/** 生成锚点表：anchor → line */
export function buildAnchorMap(sections) → Map<string, number>
/** slug（含重复去重） */
export function slugify(title, used) → string
/** 路径数组比较（纯） */
export function samePath(a, b) → boolean
```

```js
// 🆕 web/src/services/sectionWriter.js  —— 纯函数
/** 正文替换（给原文与章节 → 返回新全文），便于单测 */
export function replaceSectionInText(mdText, sections, sectionId, newContent, { replaceTitle = false } = {})
  → { text, verified }
/** 归一化（行尾/尾空白/连续空行）—— 供 hash 与 diff 共用 */
export function normalizeForHash(s) → string
```

**7.5.2 L4 编排接口（`sectionService`，需注入 fake 才可测）**

> **v1.2 补齐（A2）**：v1.1 只给了签名、没有实现要点，而 `getSectionView` 恰是 `revisionService.commitEdit` 步骤 ② 的核心依赖。现明确三条语义：**① 只读、不写盘；② 不更新索引（索引更新只发生在 `commitEdit` 步骤 ⑥）；③ `fileHash` 未变时短路返回缓存**。

```js
// 🆕 web/src/services/sectionService.js
export function createSectionService(ctx) {
  const { io, services, log } = ctx
  const { fsApi, workspaceIndex } = io
  const { workspaceService } = services

  // 闭包（禁用 this）
  async function getSectionView(file, sectionId) {
    // ① 取索引缓存（只读；不触发 rebuild）
    const idx = await workspaceIndex.read('sections.json')
    const cached = idx.ok ? idx.data.files?.[file] : null

    // ② 读盘（唯一取数处；与 mdDocument 共用同一份 fsApi.readText 结果，
    //    不额外维护第二份缓存 —— 磁盘永远是真相源）
    const read = await fsApi.readText(workspaceService.abs(file))
    if (!read.ok) return read
    const mdText = read.data.content
    const fileHash = 'sha1:' + sha1hex(normalizeForHash(mdText)).slice(0, 12)

    // ③ fileHash 短路：文件未变且缓存完整 → 直接用缓存，跳过重复解析
    if (cached && cached.fileHash === fileHash && cached.sections?.[sectionId]) {
      return ok({ section: cached.sections[sectionId], sections: Object.values(cached.sections),
                  mdText, fromCache: true })
    }

    // ④ 解析（纯函数，L1）；prevIndex 传旧索引以复用稳定 id（§6.4）
    const sections = parseSections(mdText, { file, prevIndex: cached })
    const section = sections.find(s => s.id === sectionId)
    if (!section) return fail(err('E_SECTION_MISSING', { path: file, sectionId }))

    // ⑤ 只回填**内存态**缓存（workspaceStore.indexCache），**不写盘、不 updateSection**
    //    —— 落盘由 revisionService.commitEdit 步骤 ⑥ 负责，避免"打开一次就写索引"
    workspaceService.cacheSections(file, { fileHash, sections })

    log.debug('section.view', { file, sectionId, fromCache: false, count: sections.length })
    return ok({ section, sections, mdText, fromCache: false })
  }

  /** 只解析不读盘（给已持有文本的调用方，如 MdEditor 大纲）—— 纯转发 L1，零 mock 可测 */
  function parseText(mdText, { file = '' } = {}) { return parseSections(mdText, { file }) }

  async function listSections(file) { /* 与 getSectionView 同源，返回全部 + fromCache */ }
  async function resolveAnchor(file, anchor) { /* 读盘 → buildAnchorMap → {line, sectionId} */ }

  return { getSectionView, parseText, listSections, resolveAnchor }
}
```

**`getSectionView` 的三条硬约束（实现时不得违背）**：

| # | 约束 | 理由 |
|---|---|---|
| 1 | **只读**：不调用任何 `fsApi.writeText` | 写盘唯一入口是 `commitEdit`，否则 rev/快照/回声抑制全部绕过 |
| 2 | **不 `updateSection`**：只回填内存缓存 | `workspaceIndex.updateSection` 只在 `commitEdit` 步骤 ⑥ 调用；否则"打开引用块"会改索引的 `updatedAt`，污染冲突判定 |
| 3 | **`fileHash` 未变即短路** | 大文件反复解析是性能黑洞；短路后 `fromCache:true` 供调用方判断新鲜度 |

**7.5.3 `parseSections` 实现要点**（v1.0 原样保留，属 L1）

```js
export function parseSections(mdText, { file = '', prevIndex = null } = {}) {
  const lines = mdText.split(/\r?\n/)
  const tokens = mdit.parse(mdText, {})
  const headings = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.type !== 'heading_open') continue
    const [s, e] = t.map                       // [startLine, endLine)  ← 行号来自 AST
    const inline = tokens[i + 1]               // heading_open 后紧跟 inline
    headings.push({
      level: Number(t.tag.slice(1)),
      title: inline && inline.type === 'inline' ? inline.content.trim() : '',
      startLine: s,
      headingLineCount: Math.max(1, e - s)     // ATX=1；Setext=2
    })
  }
  // 层级路径：维护 level → title 的栈
  const pathStack = []
  const out = []
  const usedIds = new Set()
  headings.forEach((h, idx) => {
    pathStack.length = h.level - 1               // 截断到本层级
    pathStack[h.level - 1] = h.title
    const path = pathStack.slice(0, h.level).filter(Boolean)
    // 章节结束 = 下一个 level<=h.level 的标题行，或文件末尾
    const next = headings.slice(idx + 1).find(x => x.level <= h.level)
    const endLine = next ? next.startLine : lines.length
    const contentStart = h.startLine + h.headingLineCount
    const content = lines.slice(contentStart, endLine).join('\n').replace(/\s+$/, '')
    const contentHash = 'sha1:' + sha1hex(normalizeForHash(content)).slice(0, 12)
    const id = reuseOrCreateId({ file, path, level: h.level, startLine: h.startLine,
                                 headingLineCount: h.headingLineCount }, prevIndex, usedIds)
    out.push({ id, level: h.level, title: h.title, path, startLine: h.startLine,
               headingLineCount: h.headingLineCount, endLine, content, contentHash })
  })
  return out
}
```

**`replaceSectionInText`（写回核心，**纯函数，位于 `sectionWriter.js`**）**：

```js
// 🆕 web/src/services/sectionWriter.js
import { parseSections } from './sectionParser'
import { normalizeForHash } from './hash'
import { appError } from './errors'          // §16.5 统一错误

export function replaceSectionInText(mdText, sections, sectionId, newContent, { replaceTitle = false } = {}) {
  const sec = sections.find(s => s.id === sectionId)
  // 纯函数只对"调用方用错了"这种编程错误抛异常；业务失败一律走 Result（§16.5）
  if (!sec) throw appError('E_SECTION_MISSING', { sectionId })
  const lines = mdText.split(/\r?\n/)
  const bodyStart = sec.startLine + (replaceTitle ? 0 : sec.headingLineCount)
  const body = splitLines(newContent)
  const next = [
    ...lines.slice(0, bodyStart),
    ...body,
    ...lines.slice(sec.endLine)              // 保留章节后的所有内容（含其它章节）
  ]
  const text = next.join('\n')
  // 自校验：重新解析，确认该 id 仍存在且 contentHash 与新内容一致（防越界/串章）
  const re = parseSections(text, { prevIndex: null })
  const again = re.find(s => normalizeForHash(s.content) === normalizeForHash(newContent))
  if (!again) throw appError('E_WRITE_VERIFY_FAILED', { sectionId })
  return { text, verified: true }
}
```

**`normalizeForHash`**（在 `hash.js`）：统一行尾 `\r\n→\n`、去行尾空白、压缩连续空行为单个、两侧 trim。**目的**：让"编辑器重排格式"不产生假冲突。

### 7.6 `refService.js` ★

> **v1.1 关键变更（响应 P1-a）**：**删除 `commitRef()`**。v1.0 里 `refService` 有 `commitRef → revisionService.commitEdit`，而 `revisionService` 又依赖 `refService`，形成模块加载即互拽的**双向环**（单测无法只加载一个）。现改为：
> **提交 = `revisionService.commitEdit()`，由视图层（`RefBlock` / `NodeNote`）直接调用**；`refService` 只管"引用元数据本身的增删改查与反链"，**永不触发章节写盘**。
>
> **v1.2 补充（A4）**：`refService` 允许**写 `.smm` 节点数据**（`syncRefSnapshots` 校准 `baseHash/baseRev`），但**仍然不允许写 `.md` 章节**——"章节写盘"的唯一入口始终是 `revisionService.commitEdit`。两者的区别是：前者改的是**引用方自己的元数据**，后者改的是**被引用的源文件**。
>
> ```
> v1.0（环）:  refService.commitRef ──▶ revisionService ──▶ refService     ❌
> v1.1（DAG）: 视图 ──▶ revisionService.commitEdit ──▶ refService（只读元数据）
>                                                └──▶ sectionWriter（纯）─▶ io
> ```

```js
// 🆕 web/src/services/refService.js
export function createRefService(ctx) {
  const { io, services, log } = ctx
  const { fsApi, workspaceIndex } = io
  const { sectionService, workspaceService } = services

  return {
    // ── 纯元数据操作（转发 L1 refData，node 由调用方传入） ──
    getNodeRefs(node) → RefData[]                          // 含 legacy note 注释只读解析
    setNodeRefs(node, refs) → boolean                       // 只写 data._mindlink
    addRef(node, {file, sectionId, sectionPath, mode}) → RefData   // 去重：同 file+sectionId+mode
    removeRef(node, refId) → boolean

    // ── 索引与查询（编排） ──
    /** 反链：给 section → 引用位置列表（读 refs.json） */
    async findBacklinks(file, sectionId) → Result<Backlink[]>
    /** 索引重建：扫描工作区所有 .smm，重建 refs.json（委托 workspaceIndex，§6.3.1） */
    async rebuildIndex(opts) → Result<{scanned, refs}>
    /** 失效检测（批量） */
    async checkValidity(file, refs) → Result<{sectionId, status:'ok'|'stale'|'missing'|'file-missing', current?}[]>

    // ── 提交后的真源同步（由 revisionService 调用，方向单一：revision → ref） ──
    /**
     * 【v1.2 改名 + 定语义，原 onSectionCommitted】(A4)
     * 提交成功后，把「引用此章节的 .smm 节点快照」校准到新 rev/hash。
     *   1) 用 findBacklinks(file, sectionId) 反查**引用了该 section 的 .smm**（只这批，不是全工作区）
     *   2) 对每个命中节点：refData.updateRefSnapshot(node, refId, { baseHash: hash, baseRev: rev })
     *      → 走 node.setData({_mindlink}) → 既有 data_change → 自动保存链
     *   3) N > 10 的溢出部分**不写 .smm**，只在 refs.json 打 snapshotPending（§7.6.6）
     *   4) 全部成功后才 return ok；部分失败返回 ok 但 error 字段带 failed[]（**不阻塞提交**）
     * 【v1.4 澄清，F3】"刷新"的两种语义：
     *   - **视图层**（重读章节内容让 RefBlock 显示最新）由调用方自行重渲染，**不经本方法**；
     *   - **数据层**（校准 .smm 节点 baseHash/baseRev）即本方法 —— 凡调用必**写 .smm**（否则下次打开又显示假 stale）。
     * @param {force?} 忽略 N>10 阈值（供「刷新全部引用」命令用）
     * @param {scope?} 'section'（默认，只校准该 section 的引用）| 'smm'（该校内全部引用该 section 的节点）| 'workspace'（全工作区 snapshotPending；隐含 force）
     */
    async syncRefSnapshots({ file, sectionId, rev, hash, force = false, scope = 'section' }) → Result<{updated: number, deferred: number, failed: string[], scope: string}>
    /**
     * 【v1.3 新增，C3】打开 .smm 时的**只读校准**：把带 snapshotPending 标记的引用
     * 的 baseHash/baseRev 覆盖为 pending 值，并清除标记。**不写 .md、不改正文**。
     * 调用时机：fileRouter.open() 内、`setData` 渲染**之前**（§7.6.6-②）。
     */
    async calibratePendingSnapshots({ abs }) → Result<{calibrated: number, cleared: number}>
  }
}
```

**⚠️ 为什么必须做这一步（A4 的核心）**：`.smm` 里的 `_mindlink.refs[i].baseHash / baseRev` 是**引用方持有的"读到的是哪一版"快照**。
若不随提交更新，则：① 提交后源文件已变，但 `.smm` 仍记着旧 `baseHash` → 下次打开会**误判为 `stale`**（假冲突）；
② 用户点"刷新"后 `baseHash` 才被顺带校准，白白多一次冲突交互。**所以 `syncRefSnapshots` 不是可选优化，是正确性一环。**

**⚠️ 性能约束（必须写清，否则会变成"提交一次 = 遍历全工作区"）**：

| 场景 | 策略 |
|---|---|
| 引用该 section 的 `.smm` 数量 `N ≤ 10` | **立即同步**（走上面的流程；单次提交额外 N 次 `.smm` 写盘，可接受） |
| `N > 10` | **惰性同步**：只把该 section 的引用条目在 `refs.json` 里标 `snapshotPending: true`（含 `pendingRev/pendingHash`）；待**下次打开该 `.smm` 时**（或用户显式「刷新全部引用」时）再校准，并在打开时**用新 hash 覆盖 `baseHash`**（等价于"打开即可信"）。**前 10 个仍立即写**，其余打标记 —— 完整落地路径（标记 schema / 触发点 / 用户入口）见 **§7.6.6** |
| 反查失败（`refs.json` 不可用） | 跳过同步、记 `log.warn('ref.sync.skipped')`，**不影响提交结果** |

**禁止**：`syncRefSnapshots` 内做全工作区 `.smm` 扫描（那是 `rebuildIndex` 的职责）；也不得写 `refs.json` 的 `rev/hash`
（`refs.json` 是**反链索引缓存**，与章节版本无关 —— 这正是 v1.1 里 `onSectionCommitted` 语义不清的根因）。

**⚠️ 注意**：`refService` **不导出任何"提交/写章节"方法**。若将来有人想在 `refService` 里加 `commitRef`，`scripts/check-arch.mjs` 会因 `refService → revisionService` 的逆向 import 而**构建失败**（§16.4 环检测）。

**7.6.1 为什么 refs 真源是 `.smm` 而不是 `refs.json`**：`.smm` 可单独拷贝/发送，携带自身引用信息才自洽；`refs.json` 只是**反向索引缓存**，任何时候都能由扫描 `.smm` 重建（`rebuildIndex()`）。

**7.6.2 写 `.smm` 的触发**：`setNodeRefs` 内部调 `node.setData({ _mindlink })`（走库的 `SET_NODE_DATA` → `data_change` → 既有自动保存链），**无需新增保存路径**。注意 `_mindlink` 变更不应触发节点重绘 → `isNodeNotNeedRenderData` 当前只认连线样式键，会走 `reRenderNodeCheckChange`；实测无副作用（不改变尺寸/内容），但**建议**在 `refService` 里改为直接写 `node.getData()` 引用后手动 `mindMap.emit('data_change')`，避免无谓重绘（§13 风险 R7）。

**7.6.3 跨 sheet/跨文件搬运**：`_mindlink` 在 `data` 内 → `copyNodeTree` 深拷贝会一起搬走；`file` 字段是工作区相对路径，跨文件仍然正确（前提：同一工作区）。**借 `utils/nodeImageKeys.js` 的教训**：引用不需要额外 key 注册表（因为无外部资源索引），但**搬运后必须重新校验** `sectionId`（目标文件可能不含该章节）→ 搬运后在 `data_change` 里做一次 `checkValidity`，失效则标黄提示。

**7.6.4 失效状态机**：

```
ok            章节存在 且 contentHash === baseHash
stale         章节存在 但 contentHash !== baseHash（"别处已改，点此刷新/合并"）
missing       同文件内 id 与 path 都找不到（标题被删/重排）
file-missing  源文件不存在（显示 cachedContent，只读）
ambiguous     id 找不到但 path 命中多个（重名标题被拆/合）→ 需用户确认绑定哪一个
```

> **【v1.4 恢复路径，F2】"章节被删/失效"后用户能做什么（v1.3 只提示"引用失效"，无补救）**：
> - **兜底可读**：`missing` / `file-missing` 态直接显示 `cachedContent`（首次引用即写入的内容快照，§6.2 不变量#2），用户至少能读到失效前的内容。
> - **转为纯文本**（单向不可逆，需 `$confirm`）：见 §7.14「转为纯文本」—— 把 `cachedContent` 写回节点备注并删引用，与源 md 脱钩。
> - **重选章节**：`missing` 态 `[重新选择章节]` 打开 `SectionPicker` 时**自动预选与被删章节"路径最接近"的候选**（如"需求分析"被删但"需求分析（新）"存在则预选，§7.13）。
> - **history/ 主动快照（触发时机 2，v1.4）**：`revisionService.snapshot()` 原本只在**覆盖写前**触发（v1.1）；新增——当 `fs:unlink` / `fs:change` 事件指向**被本工作区 .smm 引用的文件**时，对该文件相关的 `.smm` 触发一次全量快照（仅当引用数 `N ≤ 10`，与 `syncRefSnapshots` 阈值一致）。代价是监听开销，故限 `N ≤ 10`；`N > 10` 仍只靠前两种补救。覆盖写前的快照（时机 1）保持不变。

> **【v1.4 补充，F-边界#1/#2】自引用与同文件编辑**：
> - **#1 自引用（a.md 引用 a.md 某章节）**：允许。常见于 md 内部交叉引用；编辑时需防"编辑时自引用循环"——`commitEdit` 写回 a.md 后，若该 .smm 也引用 a.md，应走正常 `syncRefSnapshots` 而非递归进入同一提交。
> - **#2 引用正在编辑的同一 md**：允许；`syncRefSnapshots` / `calibratePendingSnapshots` 触发时**跳过当前正在编辑的 tab**（避免"改一处闪一下"的回写抖动）。
> - 已覆盖的边界：#3 同节点同章节去重（§7.6 `addRef`）、#4 整文件引用 `sectionId:null`（§7.13）、#6 图片相对路径 / #7 嵌入 smm 不递归 / #8 md 链接 `fromPath` / #9 超长编辑态显全文（§7.14）、#10 Picker 新建文件（§7.13）。

**7.6.5 legacy 兼容（需求文档方案 A 只读）**：
```js
const REF_RE = /^\s*<!--\s*ref:(\{[\s\S]*?\})\s*-->\s*$/gm    // 仅匹配独占一行
function parseLegacyRefs(note) {
  const refs = []; let m
  while ((m = REF_RE.exec(note)) !== null) {
    try { const r = JSON.parse(m[1]); if (r && r.file && r.sectionId) refs.push({ ...r, legacy: true }) } catch {}
  }
  return refs
}
```

- 遇到 legacy 引用：**只读展示 + 一键"升级为 v1 存储"**（迁移到 `_mindlink` 并从 `note` 中移除该注释行，迁移前写快照）。
- **绝不**把新引用写成注释（D4）。

**7.6.6 惰性同步的完整落地路径（v1.3 新增 —— 响应 C3）**

v1.2 只说"`N > 10` 时惰性同步"，但**没有定义标记存在哪里、什么时候校准、用户怎么手动触发** —— 实现者会卡在"性能 vs 正确性"之间。现补齐三件套：

**① 标记存哪：`refs.json` 的条目上**（schema 见 §6.3 的 `snapshotPending` / `pendingRev` / `pendingHash`）

```js
// 立即同步（N ≤ 10）
for (const bl of backlinks) await refData.updateRefSnapshot(bl, { baseHash: hash, baseRev: rev })

// 惰性同步（N > 10）—— 只写 refs.json 的标记，**不碰任何 .smm**
const targets = backlinks.slice(0, 10)
for (const bl of targets) await refData.updateRefSnapshot(bl, { baseHash: hash, baseRev: rev })
await workspaceIndex.updateRefEntries(rest, { snapshotPending: true, pendingRev: rev, pendingHash: hash })
log.info('ref.sync.deferred', { file, sectionId, immediate: 10, deferred: rest.length })
```

> 为什么保留"前 10 个立即"：避免"标记堆积"——若连续 30 次提交都只打标记，`pendingHash` 会被覆盖 30 次，最终打开时一次性校准，反而丢失中间版本。前 10 个立即写可保证**最常被打开的那批 `.smm` 始终最新**。

**② 何时校准：两个触发点（无第三个）**

| 触发点 | 位置 | 行为 |
|---|---|---|
| **打开 `.smm` 时**（主路径） | `fileRouter.open(abs, {kind:'mindmap'})` 在 `smmCodec.decodeSmm → pickActiveData` **之后、`setData` 渲染之前** | 遍历该 `.smm` 所有节点的 `_mindlink.refs[]` → 查 `refs.json` 命中 `snapshotPending:true` 的条目 → 用 `pendingHash/pendingRev`（缺省取 `sections.json` 现值）覆盖节点 `baseHash/baseRev` → 清除标记 → 再渲染。**不改正文，只校准快照**，故不触发 `data_change` 之外的副作用 |
| **用户显式刷新**（兜底） | 命令 `app.refreshRefSnapshots`（状态栏菜单 + `NodeNote` 引用列表的「🔄 刷新全部引用」按钮） | 走 `syncRefSnapshots({ force: true, scope: 'workspace' })`：忽略 `N>10` 的阈值，对本工作区所有 `snapshotPending` 条目一次性校准 |

> **【v1.4 澄清，F3】三种"刷新"的语义与 scope（避免"刷新了还是 stale"的困惑）**：
> | 操作 | 语义 | 层级 | scope | 是否写 .smm |
> |---|---|---|---|---|
> | 🔄 刷新（本引用块） | 重读章节内容 + 校准**本节点** baseHash/baseRev | 视图 + 数据（本节点） | `'section'` | **是**（不写则下次打开又显示假 stale） |
> | 🔄 刷新全部引用（面板级） | 校准**当前 .smm** 所有引用该 section 的节点 + 重读 | 数据（当前文件） | `'smm'` | 是 |
> | `app.refreshRefSnapshots`（命令） | 校准工作区所有 `snapshotPending` | 数据（工作区） | `'workspace'`（隐含 force） | 是 |
> **关键**：凡"刷新"都**写 .smm** 校准 baseHash/baseRev（数据层语义）；"只重读显示不写盘"不是刷新，是视图内的普通重渲染。
>
> **【v1.5 澄清，I3】`scope` × `force` 组合语义表**（§7.6 `syncRefSnapshots` 完整语义）：
> | scope | force | 含义 | 场景 |
> |---|---|---|---|
> | `'section'` | false（默认） | 只同步**当前 section** 的引用；`N ≤ 10` 立即，`N > 10` 标 pending | **默认**：`commitEdit` 后自动调用（步骤⑥） |
> | `'section'` | true | 强制同步**当前 section** 的全部引用（忽略 `N>10`） | 用户在某个引用块点"刷新本引用"（`scope='section', force=true`） |
> | `'smm'` | false | 同步**当前 `.smm`** 内引用该 section 的节点（`N` 按 `.smm` 内计数） | 面板级"刷新全部引用"（当前文件） |
> | `'smm'` | true | 强制同步**当前 `.smm`** 内所有引用该 section 的节点 | 少见：该 `.smm` 强制校准 |
> | `'workspace'` | false | 语义等价于 true（工作区范围忽略阈值） | —— |
> | `'workspace'` | true | 同步**工作区所有** `snapshotPending` 条目 | 命令 `app.refreshRefSnapshots` |
> **简化原则**：`scope` 是主维度、`force` 是覆盖开关；`force` 仅两处使用——"刷新本引用"（`section`+true）与"命令级 workspace 全量"（恒忽略阈值）；`scope='workspace'` 本身已隐含 `force`，故其余场景 `force` 默认 false 即可。

```js
// fileRouter.open 内的校准步骤（伪码，紧接 decodeSmm 之后）
const staged = await refService.calibratePendingSnapshots({ abs })   // ← 只读标记 + 改内存态 node data
if (staged.data.calibrated > 0) log.info('ref.sync.calibrated', { abs, count: staged.data.calibrated })
// ⚠️ 必须在 setData 之前完成：否则先渲染出 baseHash 陈旧的引用块，用户会看到一闪而过的假 stale
```

**③ 兜底规则**：`sections.json` 不可读或该 section 已不存在 → 清除标记且**不校准**（下次打开按"打开即可信"处理，§7.6 性能约束表第 3 行）。

**为什么不能"打开时不校准、等用户点刷新"**：那样每次打开老 `.smm` 都会看到假 `stale` 徽标 —— 这正是 §7.6 说的"`syncRefSnapshots` 是正确性一环，不是可选优化"。

### 7.7 `revisionService.js` ★——乐观锁与冲突

> **v1.1 变更**：① 它是**全系统唯一的章节提交入口**（`refService.commitRef` 已删，见 §7.6）；② 冲突四分支抽为 `conflictStrategies.js` 纯策略表（响应 P5）；③ 广播 payload **去掉 `source` 字段**，回声抑制改由 `io/suppressionRegistry` 承担（响应 P3）。

```js
// 🆕 web/src/services/revisionService.js
import { parseSections } from './sectionParser'            // L1
import { replaceSectionInText } from './sectionWriter'     // L1
import { strategies } from './conflictStrategies'          // L1
import { SECTION_UPDATED } from './events'                 // L0

export function createRevisionService(ctx) {
  const { io, services, events, log } = ctx
  const { fsApi, workspaceIndex } = io
  const { refService, workspaceService } = services
  const { emit } = events
  // ⚠️ v1.2：不再从 io 取 suppression —— 回声抑制的登记由 fsApi 内部完成（§7.1/A14-3），
  //          本服务不得手动 register（v1.1 步骤⑤ 的手动 register 已删除）

  // 闭包（禁用 this，同 §7.3-A1）
  async function snapshot(file, sectionId, content) { /* 覆盖前快照 → .mindlink/history/ */ }

  /**
   * 【v1.3 定论，C1/C2】重绑的**唯一职责 = 换 id 与 path**。
   *   ✅ 改：refCtx.sectionId / refCtx.sectionPath
   *   ❌ 不改：refCtx.baseHash / refCtx.baseRev（**故意不改**，理由见 §7.7.1）
   * 语义："这是同一个逻辑章节，只是 id 变了" —— 但**乐观锁仍要过**：
   *   改名同时改了内容 → contentHash 与旧 baseHash 不等 → 照常报 stale 冲突。
   */
  async function rebind(refCtx, newSection) {
    const from = refCtx.sectionId
    refCtx.sectionId = newSection.id
    refCtx.sectionPath = [...newSection.path]     // ⚠️ 必须同步：二次失效时按 path 反查要用
    refCtx.rebound = true                         // 供结果与 UI 提示使用（§7.14）
    log.info('revision.rebind', { file: refCtx.file, from, to: newSection.id })
    // ⚠️ 到此为止。**不写** refCtx.baseHash / baseRev —— 见 §7.7.1
  }

  async function writeAndBroadcast(refCtx, text, rev) { /* 写盘 + 索引 + 广播（keep-mine/manual-merge 共用） */ }

  /** 冲突结果：**同时**给 `error.code`（机器判定）与 `error.kind`（UI 文案） */
  function conflictResult(kind, extra) {
    return fail({ ...err('E_CONFLICT_' + kind, extra), kind, recoverable: true, suggestedAction: kind === 'ambiguous' ? 'pickFromCandidates' : 'reload' })
  }

  /** 串行化：同一 file+sectionId 的提交排队（防抖窗口内的连发不产生并发写） */
  const queue = new Map()   // key = file + '#' + sectionId → Promise 链尾
  function serialize(key, task) {
    const prev = queue.get(key) || Promise.resolve()
    const next = prev.then(task, task)          // 前一次失败也继续
    queue.set(key, next.catch(() => {}))        // 链尾吞错，避免污染下一次
    return next
  }

  return { commitEdit, resolveConflict, cancelEdit, snapshot, listHistory, restore }

  /** 全系统唯一提交入口（防抖后由视图层调用）→ Result<{newRev?, newHash?, noop?, conflict?}> */
  async function commitEdit(refCtx, newContent) {
    const key = refCtx.file + '#' + refCtx.sectionId
    if (refCtx.__serialized !== key) {                       // 防重入：同一提交不二次排队
      return serialize(key, () => commitEdit({ ...refCtx, __serialized: key }, newContent))
    }
    return doCommitEdit(refCtx, newContent)
  }

  async function doCommitEdit(refCtx, newContent) {
    const { file, sectionId, baseHash, baseRev } = refCtx    // ⚠️ v1.1：不再有 source 字段
    const t0 = now()

    // ① 内容未变 → 直接成功（避免"打开就脏"、避免空 rev+1）
    if (normalizeForHash(newContent) === normalizeForHash(refCtx.lastContent || '')) {
      return ok({ noop: true })
    }

    // ② 读盘 → 解析（永远以磁盘为真相源，不用任何缓存文本）
    const read = await fsApi.readText(workspaceService.abs(file)); if (!read.ok) return read
    const prev = await workspaceIndex.read('sections.json')
    const sections = parseSections(read.data.content, { file, prevIndex: prev.ok && prev.data.files[file] })
    let current = sections.find(s => s.id === sectionId)     // ⚠️ v1.2：必须 let（步骤③会重绑）

    // ③ 失效校验
    if (!current) {
      const byPath = sections.filter(s => samePath(s.path, refCtx.sectionPath))
      if (!byPath.length) return conflictResult('missing', { sections })
      if (byPath.length > 1) return conflictResult('ambiguous', { candidates: byPath })
      // 单一候选 → 自动重绑 id
      await rebind(refCtx, byPath[0])
      // ⚠️ A11 修复（v1.1 的实际 bug）：rebind 只改了 refCtx，**必须重新取 current**；
      //    否则下面步骤④⑤ 会对 undefined 取值 → `current.content` 抛 TypeError
      current = sections.find(s => s.id === refCtx.sectionId)
      if (!current) return fail(err('E_SECTION_MISSING', { path: file, sectionId: refCtx.sectionId }))
    }

    // ④ 乐观锁：hash 为主，rev 为辅（此处 current **必非空**，无需 `current &&` 兜底）
    if (current.contentHash !== baseHash) return conflictResult('stale', { current, newContent })
    if (typeof baseRev === 'number' && current.rev !== baseRev) {
      refCtx.baseRev = current.rev                           // 曾被改回原内容 → 仅同步 rev
    }

    // ⑤ 快照 + 写盘（纯函数产文本，verify 通过才落盘）
    //    ⚠️ 回声抑制由 fsApi.writeText 内部登记（全工程唯一登记点），此处**不再手动 register**
    await snapshot(file, sectionId, current.content)
    const { text } = replaceSectionInText(read.data.content, sections, current.id, newContent)
    const w = await fsApi.writeText(workspaceService.abs(file), text); if (!w.ok) return w

    // ⑥ 更新索引 + 同步引用快照 + 广播
    //    （**载荷只表达"发生了什么"，不含"为什么忽略"**）
    const after = parseSections(text, { file, prevIndex: prev.ok && prev.data.files[file] })
    const updated = after.find(s => s.id === current.id)
    if (!updated) return fail(err('E_WRITE_VERIFY_FAILED', { path: file, sectionId: current.id }))
    const newRev = (current.rev || 0) + 1
    await workspaceIndex.updateSection(file, { ...updated, rev: newRev })          // 只经 workspaceIndex
    // A4：把引用了该 section 的 .smm 的 baseHash/baseRev 校准（N≤10 立即；N>10 标 pending 惰性）
    await refService.syncRefSnapshots({ file, sectionId: current.id, rev: newRev, hash: updated.contentHash })
    emit(SECTION_UPDATED, { file, sectionId: current.id, rev: newRev, hash: updated.contentHash })
    log.info('revision.commit', { file, sectionId: current.id, rev: newRev, rebound: !!refCtx.rebound, durMs: now() - t0 })
    // 【v1.3-D1】`rebound` 必须回传给视图：§7.14 的「绑定重绑提示」读的正是 res.data.rebound，
    //   而 v1.2 的返回值只有 {newRev,newHash} —— 字段对不上，提示永远不显示。此处补齐。
    return ok({ newRev, newHash: updated.contentHash, rebound: !!refCtx.rebound })
  }
}
```

**规则（需求文档 §6.7.8 落地）**：

| 规则 | 实现 |
|---|---|
| 只有内容真变才 rev+1 | 步骤 ① |
| 一次提交一次锁，防抖窗口内 `baseRev` 不变 | 防抖在 **UI 层**（500ms），服务层幂等 |
| rev 必须持久化 | 写 `.mindlink/sections.json`（经 `workspaceIndex`）；写失败不影响文件正确性（索引可重建） |
| **回声抑制不靠事件载荷** | **登记由 `fsApi.writeText` 内部完成（唯一登记点）**；消费方 `await suppression.hit(path)`，**事件里没有 `source`**（v1.1 变更；v1.2 修正重复登记） |
| **引用快照必须同步** | 步骤 ⑥ `refService.syncRefSnapshots()` → 回写引用方 `.smm` 的 `baseHash/baseRev`（A4） |
| **提交后 `current` 必非空** | 步骤 ③ 重绑后**重新查找**，找不到即 `E_SECTION_MISSING`（A11 修复） |
| 无索引降级 | `prev.ok===false` 时 `rev` 从 0 起，冲突判定仍靠 hash |
| 提交串行化 | 同一 `file + sectionId` 的 `commitEdit` 走 `serialize(key, task)` 队列（防抖窗口内的连发不产生并发写） |
| **工厂内禁用 `this`** | `snapshot/rebind/writeAndBroadcast/conflictResult` 均为闭包函数（A1）；`check-arch.mjs` 断言 |

**7.7.1 `rebind` 的语义定论（v1.3 新增 —— 响应 C1/C2）**

评审在 v1.2 里指出：步骤③ 的 `rebind` 之后**没有任何地方说明 `baseHash/baseRev` 是否仍然有效**。这确实是核心链路上唯一的模糊点，实现者会自行拍脑袋。现给出**明确结论**：

| 选项 | 语义 | 裁决 |
|---|---|---|
| (a) rebind 同步 `baseHash/baseRev` | "改名 = 同一章节，内容变了也算过" → **静默覆盖**用户没看过的新内容 | ❌ **不采纳**（数据安全风险） |
| **(b) rebind 只换 id/path，不动 `baseHash/baseRev`** | 改名同时改内容 → 步骤④ 照常报 `stale`，用户看到冲突弹窗 | ✅ **采纳** |

**为什么 (b) 在当前伪码里本来就成立**：`doCommitEdit` 首行就把 `baseHash`/`baseRev` 解构成了**局部常量**，步骤④ 用的是局部值，与 `refCtx` 之后的修改无关。所以 (a) 即便写出来也是**无声失效**的（写了不生效，比不写更危险）。把 (b) 写成显式规约，等于让"文档描述"与"代码事实"对齐。

**行为对照表（实现时逐条验证；v1.4 修正，F1）**：

| 场景 | 走到哪一步 | 结果 |
|---|---|---|
| 只改标题（内容不变，行区间不变） | 步骤② 命中（`parseSections` 内 `reuseOrCreateId` 复用旧 id）→ **不进③** | ✅ 提交成功，`rebound:false`（没经过 rebind，靠机制一 id 复用） |
| 改标题 **+ 改内容** | 步骤② 命中 → 步骤④ `contentHash !== baseHash` | ⚠️ `E_CONFLICT_stale` + `kind:'stale'` → 弹冲突窗（**不静默覆盖**） |
| 改标题 + 大幅调整（行区间不重叠） | 步骤② 未命中 → 步骤③ `byPath` 精确匹配（旧 path 已不存在）→ 命中 0 条 | ⚠️ `E_CONFLICT_missing` → 引用失效（走 §7.6.4 恢复路径） |
| 只删标题（id 丢失，path 也丢失） | 步骤② 未命中 → 步骤③ 报 `missing` | ⚠️ 引用失效 |
| 改名 + 别处改过又改回原内容 | 步骤② 命中，`contentHash === baseHash` 但 `rev` 变 | ✅ 成功，步骤④ 第二段仅同步 `baseRev`（不 rev+1）；`rebound:false` |
| id 命中但内容被改 | 步骤② 命中，`contentHash !== baseHash` | ⚠️ `stale`（不经过 rebind） |
| id 丢失但同文件存在唯一同名 path（罕见，行区间不重叠） | 步骤② 未命中 → 步骤③ `byPath` 唯一命中 → `rebind` | ✅ 提交成功，`rebound:true` → UI 提示"已自动重绑" |

> **关键修正**：v1.3 原表第 1 行把"只改名"写成"`rebound:true`"—— 这与 §6.4 规则 1 冲突（行区间重叠时 id 在 `parseSections` 内已被复用，根本不会进步骤③）。v1.4 改为：日常"只改名"走**机制一（id 复用，`rebound:false`）**；`rebound:true` 只属于上表最后一行那种"id 丢失但 path 唯一命中"的 fallback 场景。

**`refCtx.sectionPath` 必须同步**（C2 后半）：若不同步，第二次失效时步骤③ 会用**旧 path** 反查 → 命中 0 条 → 误报 `missing`。这是 `rebind` 里除 `sectionId` 外唯一必须写的字段。

> **【v1.5 澄清，I1】改名后 `sectionPath` 的同步（避免"引用块显示旧标题、源文件新标题"不一致）**：
> - 步骤⑥ `syncRefSnapshots` 在校准 `baseHash/baseRev` 的同时，**若 `current.path` 与 `refCtx.sectionPath` 不一致，一并同步 `sectionPath`**（改 `refData` 的 `sectionPath` 字段，走 `setData` 自动保存链）。
> - 理由：日常"只改名"走 **id 复用（机制一）**，**不经过 `rebind`**（rebind 只处理 id 丢失场景），故 `sectionPath` 同步必须挂在 `commitEdit` **成功路径**上、与快照同步合并做，不能只放在 `rebind` 里。
> - **UI**：同步后若 `sectionPath` 变了，RefBlock 头部小字显示"章节标题已更新"，提示用户引用已跟随源文件重命名。

**冲突四分支 → 策略表（响应 P5）**：

```js
// 🆕 web/src/services/conflictStrategies.js —— L1 纯函数，零依赖，可直测
export const strategies = {
  /** 保留我的并覆盖 */
  'keep-mine': (ctx) => ({ text: ctx.mine, rev: (ctx.current.rev || 0) + 1, write: true }),
  /** 用最新（丢弃本地） */
  'use-latest': (ctx) => ({ text: ctx.current.content, noop: true }),
  /** 手动合并：UI 已把结果作为 mine 传回 */
  'manual-merge': (ctx) => ({ text: ctx.mine, rev: (ctx.current.rev || 0) + 1, write: true }),
  /** 取消：保留草稿 */
  'cancel': () => ({ canceled: true })
}
```

```js
// revisionService 侧只做"分发 + 持久化"，不含分支业务
async function resolveConflict(refCtx, payload, choice) {
  const s = strategies[choice]
  if (!s) return fail(err('E_UNKNOWN_STRATEGY', { choice }))
  const r = s({ mine: refCtx.draft, current: payload.current, base: refCtx.baseContent })
  if (r.canceled) return ok({ canceled: true })
  if (r.noop) return ok({ newHash: payload.current.contentHash })
  return writeAndBroadcast(refCtx, r.text, r.rev)             // keep-mine / manual-merge 共用（闭包函数，非 this）
}
```

**新增策略的成本**：加一个对象（如二期"自动三方合并"`auto-merge3` / "只读模式直接拒绝"`reject`），**不改 `resolveConflict`**；单测直接测策略函数，不经过 UI。

**自动合并（可选，二期）**：三方合并 `base`（快照里最近一次）/`mine`/`theirs`；仅当 `node-diff3` 无冲突时静默合并，否则弹窗。**不引入新依赖前先不做**。

### 7.8 事件总线扩展（只增加，不改动既有）

> **v1.1 变更（响应 P3）**：
> 1. **所有新增事件在 `services/events.js` 集中声明**（常量 + JSDoc 载荷 schema）——消费链不再需要全仓库 `grep $on` 才能看清；本表与 `events.js` 必须同步。
> 2. **删掉 `section:updated` 的 `source` 字段**。v1.0 用 `source: 'mind-note'|'md-editor'` 让消费方 `if (source === 自己) return` —— 这是把"为什么忽略"的**业务策略塞进了事件载荷**。现改为：**回声抑制的唯一实现处是 `io/suppressionRegistry`**，事件只表达"发生了什么"。
> 3. 新增事件走**独立的 `appBus`**（应用业务事件），与既有 `$bus`（导图渲染事件）分开，避免两类监听互相污染；`appBus` 内部可复用既有 emitter 实现。

```js
// 🆕 web/src/services/events.js —— 新增事件的唯一声明处（L0：零依赖）
/** @typedef {{ file:string, sectionId:string, rev:number, hash:string }} SectionUpdated */
export const SECTION_UPDATED = 'section:updated'          // payload: SectionUpdated
export const WS_OPENED        = 'workspace-opened'        // {root, tree, indexStatus}
export const WS_CLOSED        = 'workspace-closed'        // —
export const TREE_CHANGED     = 'tree-changed'            // {tree}
export const FS_ADD = 'fs:add', FS_CHANGE = 'fs:change', FS_UNLINK = 'fs:unlink'  // {path, rel, kind}
export const FILE_SAVED       = 'file-saved'              // {path, kind}
export const REF_ADDED = 'ref:added', REF_REMOVED = 'ref:removed'  // {file, sectionId, nodeId, refId}
export const LINK_MISSING     = 'link-missing'            // {href, fromPath, abs}
export const MD_SCROLL_TO_ANCHOR = 'md-scroll-to-anchor'  // {anchor, line}
export const MD_OUTLINE_CHANGED  = 'md-outline-changed'   // {sections}
export const CONTEXT_CHANGED  = 'context-changed'         // {kind:'mindmap'|'markdown'|'none', tabId}
export const TAB_REFRESH_REQUEST = 'tab-refresh-request'  // {path, kind}
export const INDEX_REBUILDING = 'index:rebuilding'        // {phase,scanned,total} | {done:true}

/**
 * 【v1.2 新增，A14-2】应用业务事件总线工厂（与既有 `$bus` 分开，见 §16.7-5）。
 * 组合根用它装配 `ctx.events`；测试可注入 spy 版。
 * ⚠️ 本文件同时承担"常量声明"与"emitter 工厂"两件事 —— 因为二者都属 L0 且零依赖。
 */
export function createEventBus(logger) {
  const handlers = new Map()                     // event → Set<fn>
  return {
    on(ev, fn) { /* ... */ return () => off(ev, fn) },
    off,
    emit(ev, payload) {
      assertDeclared(ev)                         // 未在 events.js 声明 → 开发期抛错（§16.7-1）
      for (const fn of handlers.get(ev) || []) { try { fn(payload) } catch (e) { logger.error('bus.handler', { ev, e }) } }
    },
    /** 测试用：清空 + 计数 */
    reset(), count(ev)
  }
}
```

| 事件 | payload | 生产 | 消费 |
|---|---|---|---|
| `workspace-opened` | `{root, tree, indexStatus}` | workspaceService | WorkspacePanel / 状态栏 |
| `workspace-closed` | — | workspaceService | 同上 |
| `tree-changed` | `{tree}` | workspaceService | FileTree |
| `fs:add` / `fs:change` / `fs:unlink` | `{path, rel, kind}` | io/fsWatchClient | FileTree / MdEditor / 索引维护 |
| `file-saved` | `{path, kind}` | mdDocument / Edit.vue | 状态栏 |
| `section:updated` | `{file, sectionId, rev, hash}` ⚠️ **无 `source`** | revisionService | RefBlock / MdEditor / 反链面板 |
| `ref:added` / `ref:removed` | `{file, sectionId, nodeId, refId}` | refService | RefBlock / 反链面板 / refs.json 增量更新 |
| `index:rebuilding` | `{phase,scanned,total}` / `{done:true}` | **workspaceService（转发 `workspaceIndex` 的 `onProgress`）** | 状态栏 / RefBlock（只读） |
| `link-missing` | `{href, fromPath, abs}` | fileRouter | 失效链接对话框 |
| `md-scroll-to-anchor` | `{anchor, line}` | fileRouter / MdOutline | MdEditor |
| `md-outline-changed` | `{sections}` | MdEditor（防抖 300ms） | MdOutline / 状态栏 |
| `context-changed` | `{kind:'mindmap'\|'markdown'\|'none', tabId}` | Index.vue | MdToolbar / Toolbar / 状态栏 |
| `tab-refresh-request` | `{path, kind}` | io/fsWatchClient | MdEditor（外部改动提示） |

**回声抑制（v1.1 重写 —— 唯一实现处在 IO 层）**：

```js
// 🆕 web/src/services/io/suppressionRegistry.js  —— L3：回声抑制的唯一实现处
const reg = new Map()   // absPath → { hash, until }

export const suppression = {
  /** 写盘前登记（**仅** fsApi.writeText / writeBinary 内部调用，业务层不得调用，见 §7.1/A14-3） */
  register(absPath, { hash, ttlMs = 1500 }) { reg.set(absPath, { hash, until: Date.now() + ttlMs }) },

  /**
   * 【v1.2 签名变更，A5】收到 fs:change 时判定；**只收路径**，自己读盘算 hash。
   * —— 因为 fs:change 事件只带路径（主进程推送不含内容），调用方无从预先算出 diskHash。
   * ⚠️ 是 async：调用方必须 `await`。
   */
  async hit(absPath) {
    const e = reg.get(absPath); if (!e) return false
    if (Date.now() > e.until) { reg.delete(absPath); return false }
    const r = await fsApi.readText(absPath)          // ⚠️ 读盘（多数场景是一次真回声，成本可接受）
    if (!r.ok) return false
    const same = e.hash === sha1hex(r.data.content)
    if (same) reg.delete(absPath)                    // 一次性消费
    return same
  },
  clear() { reg.clear() }                            // 测试用
}
```

**消费端统一分支（v1.2 重写 —— 与 §10 第 23/24 条对齐，A12）**：

```js
// io/fsWatchClient.js 收到语义化 fs:change 后（或 MdEditor/RefBlock 处理 tab-refresh-request 时）
async function onExternalChange(absPath, tabId) {
  const disk = await fsApi.readText(absPath)
  if (!disk.ok) return

  // ① 回声：本次是我们写的 → 丢弃
  if (await suppression.hit(absPath)) return

  const editorContent = documentStore.get(tabId)?.content ?? null

  // ② 内容一致（外部无实质改动，或抑制登记被 TTL 漏掉）→ 静默丢弃 **并补登记**
  //    【A12】这正是 §10 第 23 条的行为：比"仅 hit 命中才丢"更鲁棒
  if (editorContent !== null && normalizeForHash(disk.data.content) === normalizeForHash(editorContent)) {
    suppression.register(absPath, { hash: sha1hex(disk.data.content) })
    return
  }

  // ③ 真正的外部改动
  if (editorIsFocused(tabId) && documentStore.isDirty(tabId)) {
    emit(TAB_REFRESH_REQUEST, { path: absPath, rel: workspaceService.rel(absPath) })  // 不自动重载，提示用户
  } else {
    reloadTab(tabId, disk.data.content)                                              // 自动重载
  }
  log.info('io.write.suppress', { path: absPath, hit: false })                       // 供 P3 效果评估
}
```

> **`hit()` 为什么是 async（A5 结论）**：fs:change 只有路径、没有内容。v1.1 写成 `hit(path, diskHash)` 等于要求调用方
> 自己读盘算 hash，却又没写明——实现者必然在此卡住。改由 `hit()` 内部读盘，调用方只给路径，**语义自洽**。
> 代价是"每次 change 多一次读"；但绝大多数 change 就是自己的回声，本来就要付这次读的成本
> （若改用 mtime 比对可省，但 `fs.watch` 的 mtime 精度只到秒，反而易误判，故不采用）。

> **为什么这比 `source` 好**：① 事件载荷纯净，消费方不需要知道"谁发的"；② 抑制只在**真正写盘**的地方生效，`git checkout` / 外部程序 / 复制粘贴文件**天然不会**被误抑制（v1.0 靠 `source` 时，任何带 `source==='md-editor'` 的事件都会被丢，粒度太粗）；③ 单测只需测 `register/hit` 两个纯逻辑，不需要构造事件。

### 7.9 `commandBus.js`

```js
// 🆕 web/src/services/commandBus.js —— L4（编排）
// 【v1.2，A14-4】注册表**纯逻辑**抽到 L1 `commandRegistry.js`（register/enabled/快捷键表解析/list），
// 本文件只做"编排"（绑定事件、按 context 路由、调用 handler）。这样 `pure/commandRegistry.test.mjs` 零 mock。
import { createCommandRegistry } from './commandRegistry'    // L1

export function createCommandBus(ctx) {
  const { events, services } = ctx
  const registry = createCommandRegistry()                    // 闭包持有，无 this
  return {
    register(id, { handler, enabled, scope, title, legacy? }) → void,   // 委托 registry
    async execute(id, payload) → Result,                                // 编排：查表 → 校验 enabled → 调 handler
    isEnabled(id) → boolean,
    bindShortcuts(map) → void,       // { 'Ctrl+S': 'file.save', 'Ctrl+B': 'markdown.toggleBold' }
    list() → {id, scope, legacy}[],  // 供迁移看板与守卫测试使用
    reset() → void                    // 测试用
  }
}
```

**v1.1 新增：桥接的退场策略（响应 P10）**

v1.0 只说"`mindmap.*` 转发到 `$bus.$emit('execCommand', 大写命令)`，既有 40+ 按钮零改动"，但**没说这个桥接什么时候必须拆掉**。两套命令体系长期并存 ⇒ 新命令可能注册到 `commandBus`、也可能直接 `$emit`，命令语义分裂。现在明确：

| 里程碑 | 桥接状态 | 判定标准 |
|---|---|---|
| **P5 结束** | 桥接**保留但被登记** | 所有 `mindmap.*` 命令在注册表里标 `legacy: true` + 记 `legacyEmitter` |
| **P6 结束** | **新命令禁止走桥接** | `scripts/check-arch.mjs` 断言：`components/**` 与新增服务中不得出现 `$bus.$emit('execCommand'` |
| **二期（md 编辑器切换/工具栏重构时）** | 桥接**逐条拆除** | 迁移表 `legacy` 计数归零即删除转发分支 |

**迁移表**（实现时放在 `commandBus.js` 顶部注释 + `docs/command-migration.md`，此处给出结构）：

| 旧路径 | 新命令 id | 迁移状态 |
|---|---|---|
| `$bus.$emit('execCommand','INSERT_NODE')` | `mindmap.insertNode` | ⏳ 待迁移（桥接） |
| `$bus.$emit('execCommand','REMOVE_NODE')` | `mindmap.removeNode` | ⏳ 待迁移（桥接） |
| `$bus.$emit('execCommand','UNDO')` / `REDO` | `mindmap.undo` / `redo` | ⏳ 待迁移（桥接） |
| `$bus.$emit('requestSave')` | `file.save` | ✅ 新代码直接走 commandBus |
| `showNodeNote` | `mindmap.openNote` | ✅ 已直连 |
| （其余 40+ 见实现时的 `commandBus.list()` 输出） | | |

**守卫测试**（并入 §11.2）：① `legacy:true` 的命令数只减不增；② 新增组件不得直调 `$bus.$emit('execCommand'`；③ `commandBus.list()` 中每个 `legacy` 项必须有对应迁移行。

**默认注册表（MVP）**：

| 命令 | 作用域 | 映射到 |
|---|---|---|
| `file.new` / `file.open` / `file.save` / `file.saveAs` | 全局 | 既有 `newWorkbookFromTabs` / `requestOpen` / `requestSave` / `requestSaveAs` |
| `file.close` | 全局 | `FileTabs.onRemove` |
| `app.openWorkspace` / `app.closeWorkspace` | 全局 | workspaceService |
| `app.search` / `app.searchInWorkspace` | 全局 | `show_search` / 新全文面板 |
| `app.toggleTheme` / `app.settings` | 全局 | 既有 Theme / Setting |
| `mindmap.*`（undo/redo/insertNode/… 共 20+） | mindmap | **转发** `$bus.$emit('execCommand', '大写命令')` |
| `mindmap.openNote` / `mindmap.insertLink` | mindmap | `showNodeNote` / `showNodeLink` |
| `markdown.undo` / `redo` / `toggleBold` / `toggleItalic` / `toggleStrike` / `inlineCode` / `h1..h3` | markdown | `MdEditor` 暴露的方法（走 Toast UI 命令或直改 ProseMirror 事务） |
| `markdown.insertQuote/List/OrderedList/Task/Table/Code/Formula/Divider` | markdown | 同上（**代码块必须走 D2 的 ProseMirror 直建路径**） |
| `markdown.insertImage` / `insertLink` / `insertSectionRef` | markdown | 文件选择 / 链接对话框 / SectionPicker |
| `markdown.toggleOutline` | markdown | 侧栏切换 |

**快捷键表**（沿用既有 `shortcutGuard.js` 的守卫机制，避免与浏览器/Electron 默认冲突）：

| 快捷键 | 命令 | 备注 |
|---|---|---|
| `Ctrl+Z` / `Ctrl+Shift+Z` | `{当前作用域}.undo` / `.redo` | 按 `context-changed` 路由 |
| `Ctrl+B` / `Ctrl+I` | `markdown.toggleBold` / `toggleItalic` | 仅 md 作用域 |
| `Ctrl+S` / `Ctrl+Shift+S` | `file.save` / `file.saveAs` | 已有（Edit.vue 全局监听）→ 迁移到 commandBus |
| `Ctrl+O` / `Ctrl+N` | `file.open` / `file.new` | — |
| `Ctrl+Shift+F` | `app.searchInWorkspace` | — |
| `Ctrl+Shift+E` | `app.openWorkspace` | 需求文档未定义，本项目补 |
| `Enter` / `Tab`（节点选中） | `mindmap.addSiblingNode` / `addChildNode` | 已有行为，确保不破坏 |
| `F2` | 编辑当前节点 | 已有 |
| `Esc` | 关闭浮层/取消编辑 | 已有 `shortcutGuard` |
| `F11` | `app.toggleZenMode` | 禅模式（G1/H1，全局；v1.5 补登） |
| `Ctrl+Shift+F11` | `app.toggleZenMode` | 同上（备用键，与 F11 等价；v1.5 补登） |
| `Ctrl+Shift+T` | `app.toggleToolbar` | 工具栏折叠（G1/H1，v1.5 补登） |
| `Ctrl+Shift+B` | `app.toggleStatusBar` | 状态栏折叠（G6/H7，v1.5 补登） |

### 7.10 `MdEditor.vue`（Toast UI 封装）

```vue
<!-- 🆕 props: tabId, filePath(绝对)（v1.1：内容来自 documentStore，不再由 props 传 docState） -->
<!-- 🆕 exposes: setContent, getContent, focus, scrollToLine, exec(cmd), getSelection, insertEmbed -->
```

**7.10.0 组件拆分（v1.1 新增 —— 响应 P6）**

v1.0 的 `MdEditor.vue` 一个组件承担 6+ 个关注点（实例生命周期、自动保存、链接拦截、嵌入导图渲染、锚点、KaTeX、粘贴、性能降级），既无法单测，也让 `RefBlock` 无法复用"渲染 md 片段"的能力。现拆为**容器 + 7 个 composable**（Vue3 升级已完成，composition API 可用）：

```
components/MdEditor.vue              ← 容器（~120 行）：装配 + 布局 + 对外 expose
  ├─ composables/useToastUi.js          生命周期：markRaw / destroy / setMarkdown / getMarkdown
  ├─ composables/useAutoSave.js         防抖保存（依赖 mdDocument）
  ├─ composables/useLinkInterception.js click 委托 → fileRouter.navigate
  ├─ composables/useEmbedMindMap.js     MutationObserver → MindMapPreview 挂载/卸载
  ├─ composables/useImagePaste.js       paste → 读图 → 写盘 → 插入
  ├─ composables/useAnchorScroll.js     锚点 → ProseMirror 定位
  └─ composables/useMdOutline.js        解析大纲 → 广播（防抖 300ms）

components/RefBlock.vue ── 复用 composables/useMdRender.js（只读渲染 md 片段 → HTML）
```

**收益（二期换编辑器引擎时体现）**：切 Milkdown 只需替换 `useToastUi.js` → `useMilkdown.js`，**其余 6 个 composable 与容器完全不动**（对应 R13 / 附录二.4 的预留）。

**composable 契约（统一签名，便于替换与测试）**：

```js
export function useToastUi({ elRef, initialContent, plugins }) → { editor, setContent, getContent, focus, scrollToLine, exec, destroy }
export function useAutoSave({ tabId, getContent, debounceMs }) → { saveNow, pending }
export function useLinkInterception({ elRef, currentAbsPath, router }) → { stop }
export function useEmbedMindMap({ elRef, currentAbsPath, onOpen }) → { rescan, stop }
export function useImagePaste({ elRef, currentAbsPath, onInsert }) → { stop }
export function useAnchorScroll({ editorRef }) → { scrollToAnchor }
export function useMdOutline({ editorRef, onChanged }) → { sections, stop }
```

**单测策略**：composable 中**纯逻辑部分**（防抖合并、扫描判定、粘贴类型判定）抽为 L1 纯函数测；DOM 相关部分用 §11.3 源码守卫断言（`markRaw` 必用、必须 `stop()` 解绑）而非 jsdom 模拟。

**7.10.1 生命周期（复用备注面板踩过的坑）**

| 点 | 做法 |
|---|---|
| 实例化 | `markRaw(new Editor({ el, height:'100%', initialEditType:'wysiwyg', hideModeSwitch:true, plugins:[[codeSyntaxHighlight,{highlighter:Prism}], [katexPlugin]] }))` —— **必须 `markRaw`**，否则 ProseMirror 事务抛 `RangeError: Applying a mismatched transaction` |
| 切换 Tab | 不销毁重建；`setMarkdown(newContent)` + 重置 undo 历史（`editor.setMarkdown` 会重置），脏态由 `mdDocument` 判定 |
| 卸载 | `editor.destroy()`；`$bus.$off(...)` 解绑所有监听 |
| 只读 | 大文件（> 1MB）或非工作区打开的 md 默认只读预览 + "切换到编辑"按钮 |

**7.10.2 变更 → 自动保存**

```js
onChange: editor.on('change', () => {
  mdDocument.markDirty(tabId, editor.getMarkdown())     // 内存态，立即
  debounce(save, 1200)()                                // 磁盘态，防抖 1.2s（设置项可调）
})
save(): mdDocument.save(tabId, editor.getMarkdown())
        → fsApi.writeText(absPath, text)          // ⚠️ 内部自动 register 回声抑制（唯一登记点，此处不再手动登记）
        → mdDocument.markSaved(tabId) → emit(FILE_SAVED, {path, kind:'markdown'})
```
`Ctrl+S` → `commandBus.execute('file.save')` → 立即 `save()`（不等防抖）。

**7.10.3 链接与嵌入的拦截（调用入口 2/3）**

Toast UI 的 WYSIWYG 渲染后，DOM 会包含 `<a href>` 与（若插件转换）图片节点。采用**委托事件 + 自定义渲染**两条路：

```
① 链接点击：容器捕获阶段监听 click
   const a = e.target.closest('a[href]')
   if (a) { e.preventDefault(); e.stopPropagation(); fileRouter.navigate(a.getAttribute('href'), currentAbsPath) }
   ⚠️ 只拦"非修饰键 + 左键"；Ctrl/Cmd+点击 → 交系统浏览器（openExternal）
② 图片/嵌入：在 `change` 与初次 `setMarkdown` 之后，扫描 WYSIWYG DOM 里
   img[src$=".smm"]（Toast UI 会把 ![](./a.smm) 渲染成 <img>），替换为
   <div class="mm-embed" data-src="..."> 并挂载 MindMapPreview（只读、高 400px、点击 → fileRouter.open）
   实现方式：用 MutationObserver 监听 ww container 的子节点变化，防抖 150ms 重扫（不用 hack 编辑器 schema，降低升级风险）
③ 锚点定位：scrollToLine(line) → 用 ProseMirror doc resolve 到该行的节点 → `editor.setSelection` + `scrollIntoView`
```

**7.10.4 数学公式（KaTeX）—— 用 Decoration 插件（不依赖新库）**

参考已在用的 `codeSyntaxHighlight`（同样是 Decoration 方案）：

```
自定义 Toast UI 插件 katexPlugin：
  - 提供 `toHTMLRenderers`：把 markdown-it 的 math_inline/math_block 渲染为 <span class="katex-src">
  - 提供 ProseMirror plugin：state 里扫描文本节点，命中 /\$([^$]+)\$/ 或块级 $$...$$ 时，
    用 Decoration.widget(nodeStart, () => katex.render(tex, el)) 渲染只读公式
  - 双栏/单栏一致性：公式为"非编辑 widget"，点击时还原为源码文本（可选）
依赖：katex@0.16.9（已在依赖） + 需要 `import 'katex/dist/katex.min.css'`
```
> ⚠️ Toast UI 未内置 `$...$` 的 markdown-it 数学规则 ⇒ 需先 `editor.setOptions()` 或注入自有 md 解析规则；MVP 允许"公式以代码块/行内代码方式记录"，**公式标记为 MVP 内最后实现项**（若不达标则降级为【可选】，与需求文档的取舍在 §14 标注）。

**7.10.5 粘贴图片（F11）**

```
容器捕获 'paste' → 若 clipboardData.files 有图片：
  e.preventDefault()（注意：NodeNote.vue 有过"粘贴守卫"补丁，md 编辑器是独立实例，不受影响）
  → FileReader → base64 → fsApi.writeBinary(assets/xxx.png) → editor.exec('addImage',{imageUrl:'assets/xxx.png', altText})
  → 无工作区时写到 md 同目录 assets/
```

**7.10.6 渲染性能**：> 200KB 或 > 3000 行的 md 默认**只读 + 分块渲染**（先渲染前 500 行，滚动加载），避免 WYSIWYG 一次性构建 ProseMirror 文档卡死；提供"强制编辑模式"开关。

### 7.11 `MindMapPreview.vue`（内嵌只读导图）

```vue
props: { src(绝对路径), height: '400px', sheetId? }
emit:  'open'(src)
流程：fsApi.readText(src) → smmCodec.decodeSmm → pickActiveData(sheetId) → new MindMap({el, data, readonly:true})
      容器 click → emit('open') → fileRouter.open(src)
      卸载：mindMap.destroy()（⚠️ 注意 simple-mind-map 需先 removeAllListeners）
限制：只读、禁用自由拖拽、禁用右键菜单、禁用快捷键透传（避免与主编辑器冲突）
```

### 7.12 导图侧对接（需求文档 §6.5 的 5 个对接点）

| # | 对接点 | 落点 | 说明 |
|---|---|---|---|
| 1 | 接受外部初始数据 | ✅ 已有 | `$bus.$emit('setData', data)` → `Edit.vue#setData` |
| 2 | 数据变更自动保存 | ✅ 已有 | `data_change` → `storeData` → `smmApi.writeFile`（`autosave.js`） |
| 3 | 节点 link 点击跳转 | ✎ **新增** | 在 `Edit.vue` 构造选项里加 `customHyperlinkJump: (link, node) => fileRouter.navigate(link, currentAbsPath)`；库官方钩子，**零侵入**（`nodeCreateContents.js:330-340`） |
| 4 | 备注面板接入引用 | ✎ `NodeNote.vue` | 弹窗头部加「🔗 引用文档章节」；弹窗内嵌 `RefBlock` 列表（读 `data._mindlink`） |
| 5 | 只读渲染模式 | ✅ 已有基础 | `MindMapPreview` 用 `readonly:true` 新建独立实例（**不复用主实例**，避免状态串） |

**`Edit.vue` 改动点（精确）**：

```js
// Edit.vue：new MindMap({ ... 既有选项 }) 中追加
customHyperlinkJump: (link, node) => {
  // 交由 FileRouter 统一处理（md/smm/图片/外链）；旧行为（浏览器打开）作为兜底
  try {
    const from = getCurrentFilePath() || ''
    fileRouter.navigate(link, from)
  } catch (e) {
    console.warn('[hyperlink] 跳转失败，回退系统打开:', e)
    if (/^https?:/.test(link)) window.open(link)
  }
},
```

> 注意：`node_click` 事件已被 `Contextmenu.vue` 用于"收起右键菜单"，**不要**在 `node_click` 上重复实现跳转逻辑（否则同一点击双动作）；跳转只走 `customHyperlinkJump`（仅点超链接图标时触发）。

### 7.13 `SectionPicker.vue`（章节选择器）

```
布局：┌ 选择要引用的章节 ──────────────────────────────────────┐
      │ [文件▾ docs/requirements.md]  [🔍 过滤标题___]  [+ 新建 md 文件] │  ← v1.4 新增"新建文件"(G8)
      │ ─ 目录树 ─────────────┬─ 预览 ──────────────── │
      │ # 需求分析            │ ## 需求分析             │
      │   ## 功能列表         │ (章节正文只读预览，10行) │
      │   ## 优先级           │                        │
      │ ## 非目标             │                        │
      ├───────────────────────┴────────────────────────┤
      │ 引用模式（v1.4，F6）：                            │
      │  ( ) 仅跳转（写 node.link）                      │
      │  (•) 引用内容（写 _mindlink.refs）               │
      │  ( ) 两者都写（link + _mindlink 同时）           │
      │  [取消][确定]                                   │
      └────────────────────────────────────────────────┘
底部（当过滤无命中，v1.4，G8）：
  未找到「xxx」。
  [+ 在 requirements.md 中新建章节「xxx」]   ← 支持"边引用边创建"
```

数据：workspaceService 工作区 md 列表 → sectionService.parseSections → 树
交互：单击 = 预览；双击 = 直接确定；键盘 ↑↓/Enter 支持
**失效预选（v1.4，F2）**：当由"重新选择章节"进入且旧引用已 `missing`，打开时**自动预选与被删章节路径最接近的候选**（如"需求分析"被删但存在"需求分析（新）"则预选该节点）。
**mode 字段（v1.4，F5）**：原"只读 / 可原地编辑"双态**MVP 不显示**（`_mindlink.refs[].mode` 字段保留为预留、恒为 `'editable'`，二期视多人协作场景再启用）；避免实现者纠结"是否要做双态"（YAGNI）。
**整文件引用（v1.4，F-边界#4）**：文件下拉选择文件但**不勾选具体章节** → 生成 `sectionId: null` 的引用，RefBlock 渲染整个文件内容（标题显示文件名，无章节锚点），编辑时作用于整文件。

> **【v1.5 澄清，I4】`sectionId: null` 的编辑语义**：
> - 整文件引用编辑时，`commitEdit(refCtx, newContent)` 的 `sectionId` 为 `null` → 作用于**整文件内容**（非单章节）：`doCommitEdit` 内 `sections.find(s => s.id === null)` 不命中，改为对已解析 `sections` 的**全量文本**做"整文件 replace"（或 `replaceSectionInText` 对 `sectionId === null` 走"整文件覆盖"分支）。
> - **乐观锁**：`baseHash` / `baseRev` 对应**整文件** hash/rev（非章节）；别处改了文件任一处 → `contentHash !== baseHash` → 照常 `E_CONFLICT_stale` 冲突。
> - **同步与反链**：`syncRefSnapshots({ file, sectionId: null, ... })` 同步引用该文件的全部节点快照；`findBacklinks(file, null)` 反查"引用整文件"的节点（与按章节反查数据同源、入参不同）。
> - **UI**：标题显示文件名（无章节锚点）；编辑态**不显示**"章节标题已更新"提示（无 `sectionPath` 概念）。

### 7.14 `RefBlock.vue`（引用块）

```vue
props: { ref: RefData, node, readonly }
state: status: 'ok'|'stale'|'missing'|'file-missing'|'ambiguous', editing, draft
事件: @open-file, @commit, @unref, @refresh
```

| 区域 | 内容 |
|---|---|
| 头部 | `🔗 引用自 {file} · {sectionPath.join(' / ')}` + 状态徽标（`已同步`/`已在别处修改`/`引用失效`）+ **`被 N 处引用`** 计数（点击展开列表，N 来自 `findBacklinks`，F4/G2）；若 `node.link` 指向同章节 → 额外显示 `↗ 跳转到 link` 按钮（F6） |
| 工具条 | `↗ 打开源文件` `✏️ 编辑` `🔄 刷新`（本引用，scope='section'，**写 .smm** 校准本节点 baseHash，F3）`🔗 解除引用` |
| 面板级工具条 | **【v1.3 新增，C3】** 备注面板引用**列表**顶部提供「🔄 刷新全部引用」→ `commandBus.execute('app.refreshRefSnapshots')` → `refService.syncRefSnapshots({ scope: 'smm' })`（§7.6.6-②），校准**当前 .smm** 所有引用该 section 的节点（命令自身用 `scope:'workspace'`，见 §7.6.6-②） |
| 正文 | 非编辑态：渲染章节 markdown（复用 NodeNoteContentShow 的 Viewer 或 `markdown-it` + Prism）；**图片 `![](assets/x.png)` 相对路径以章节所在 md 的目录解析**（F-边界#6），md 链接 `[x](./b.md)` 点击的 `fromPath` 取章节所在 md（F-边界#8），章节内嵌 `![](./a.smm)` **不递归渲染**（F-边界#7）；编辑态：内嵌一个**轻量 Toast UI 单栏实例**（`markRaw`！）或 textarea+预览 二选一（MVP 建议：**textarea + 实时预览**，避免多实例开销）；**编辑态显示全文**（cachedContent 仅失效兜底，F2） |
| 视觉区分（v1.4，G2/F4） | 引用块用**专用色边框 + 浅色底**（§8.5 `--mm-ref-*`），与下方「✍️ 我的备注」白底**强区分**；块上方常驻黄色警告条"⚠️ 编辑下方引用块 = 直接修改 md 源文件" |
| 连带影响提示（v1.4，F4） | **首次进入编辑态**时，若 `findBacklinks(file, sectionId).length > 1`，在编辑区上方显示提示条"⚠️ 此章节被 N 处引用，你的修改将同步到全部"（仅提示一次，不重复打扰） |
| 转为备注内容（v1.5，F2/I2；原名"转为纯文本"） | 失效态（`missing`）下 `[转为备注内容]` 按钮的精确语义：① 计算 `merged = [原 note, '\n\n---\n\n', '# ' + 旧章节标题, '\n\n', cachedContent].join('\n')`——**保留原标题**（用原 level 的 `#`）、**追加**（不覆盖，用 `---` 分隔）、**保持 markdown 源码**；② `node.setData({ note: merged })`；③ `refService.removeRef(node, refId)` **只删这一个 ref**，其余 ref 不动；④ 写入前 `$confirm` 显示"将追加 N 字符到备注并删除此引用，不可撤销"。**多引用场景仅对失效的那个执行，其他 ref 不受影响** |
| 提交 | 失焦 或 停止输入 500ms → **`revisionService.commitEdit(refCtx, draft)`**（v1.1：提交入口唯一，`refService` 已无 `commitRef`） |
| 冲突 | **【v1.2 明确，A8】由返回值判定，不走事件**：`const res = await commitEdit(...)`；若 `!res.ok && res.error.code.startsWith('E_CONFLICT_')` → `$emit('conflict', { ref, current: res.error.current, newContent: res.error.newContent, kind: res.error.kind, impact: findBacklinks(file, sectionId).length })` → 父级弹 `ConflictDialog`（弹窗显示影响范围，§8.4，F4/G3）。**`commitEdit` 内部不 emit 冲突事件** |
| 绑定重绑提示 | `res.ok && res.data.rebound` → 小字提示"章节引用已自动重绑到新位置"（来自 `commitEdit` 内部的 `rebind`，v1.4 仅对应 §7.7.1 表最后一行场景） |
| "被 N 处引用"点击（v1.5，H2） | 头部计数可点击 → 弹出**靠右对齐到 RefBlock 头部**的反链浮层（popover）：列出每条 `findBacklinks` 命中（文件路径 + 节点文字预览 + `[↗]` 跳转）；点击节点项 → 打开该 `.smm` 并 `$bus.$emit('setData')` 后定位到节点（`activeNode`）。**浮层内不提供"解除引用"**（管理型操作在 F20 侧栏反链面板） |

> **【v1.5 澄清，H2】反链浮层与 F20 侧栏反链面板的关系（数据同源、职责不同）**：
> - **浮层** = 从"某个引用块"出发，看"还有谁引用了这个章节"（快速预览，轻量）；
> - **侧栏面板（F20）** = 从"某个章节"出发，看"工作区所有引用它的地方"（完整管理，可解除引用）；
> - 两者都调 `findBacklinks`，数据源一致；浮层底部提供"在侧栏打开完整反链面板"入口，职责不重叠。
>
> **【v1.5 澄清，H7 联动】** 禅模式下 RefBlock 内的保存状态同样靠编辑区右上状态点呈现（见 §8.1），不依赖状态栏。

> **MVP 选择 textarea+预览** 的理由：一个页面可能同时打开多个引用块，每个都建 Toast UI 实例会显著吃内存与初始化时间；且引用块编辑的是"纯 markdown 片段"，textarea 足够。二期若体验不足再换。**此决策记录在 §13-R9**。

### 7.15 全文搜索（工作区范围）

```js
// 🆕 web/src/services/workspaceSearch.js
// 【v1.2 修正，B8】v1.1 写成 `export const workspaceSearch = {...}` 模块单例，与 §16.2「L4 一律工厂」
// 冲突，且**组合根未装配它**（等于一个没人管的状态容器）。现改为工厂，并由组合根装配。
export function createWorkspaceSearch(ctx) {
  const { io, stores, services, log } = ctx
  const { fsApi } = io
  const { workspaceService } = services
  const cache = new Map()          // 内存倒排缓存（Map<trigram, Set<rel>>），工厂内私有 → 天然可多实例
  return {
    /** 文件名模糊匹配（复用 readTree 缓存） */
    async byName(query) → [{rel, name, kind}]
    /** 全文检索：md 正文 + smm 节点文字/备注 + 引用标题 */
    async fullText(query, { include = ['md','smm'], limit = 200 }) → [{rel, kind, hits:[{line, text, type:'text'|'note'|'section'}]}]
    /** 增量失效：收到 fs:change 时调用（由 L4 fsWatchClient 语义事件驱动，不是自己监听） */
    invalidate(rel) → void
    /** 查询统计（供 §16.6 的 search.run 日志） */
    stats() → { files, trigrams, hits }
  }
}
```
- `.md`：`fsApi.readText` + 逐行匹配（跳过代码围栏内的匹配？**不跳**，用户通常也想搜代码）+ 章节标题命中权重更高。
- `.smm`：`smmCodec.decodeSmm` → 遍历所有 sheet 所有节点 → `text`、`note`、`tag`、`_mindlink.refs[].sectionPath` 命中。
- 结果点击 → `fileRouter.open` +（md 用 `md-scroll-to-anchor`/行高亮，smm 用 `$bus.$emit('setData')` 后的节点定位：调用库的 `mindMap.renderer.findNodeByUid(uid)` + `activeNode`）。
- **性能**：并发 6 + 大文件跳过（> 2MB 仅搜文件名）；首次全量建**内存倒排缓存**（Map<trigram, Set<rel>>），文件变更时按 `fs:change` 增量失效。

### 7.16 md 大纲（`MdOutline.vue`）

- 复用 `Sidebar.vue` 容器与 `activeSidebar` 机制：新增侧栏项 `mdOutline`（4 语言 + 图标）。
- 数据来自 `MdEditor` 的 `md-outline-changed`（`sectionService.parseSections` 的 `level/title/startLine`）。
- 点击 → `md-scroll-to-anchor`；当前可视标题高亮（用 `editor.getSelection()` 的行号反查最近标题）。
- **与导图大纲共存**：`isOutlineEdit` 状态互斥（切 Tab 时按 `kind` 决定显示哪个）。

### 7.17 状态栏与冲突弹窗

- 状态栏（新增，位于底部，与既有 `SheetTabs`/`NavigatorToolbar` 同层）。
- **信息分组（v1.4，G6）**：左侧=重要信息（点击可操作），右侧=次要信息（可折叠）：
  - 左：`[文件路径 ▸ 相对路径]`（点击跳转文件树） · `[已保存 / 未保存●]`（点击立即保存） · `[引用状态]`（点击滚动到引用块）；
  - 右：`[字数]`（点击弹统计） · `[行:列]`（点击跳转） · `[反链:N]`（点击展开反链列表）。
  - 状态栏整体可折叠（`Ctrl+Shift+B` 或右键 → 隐藏），类似 VS Code。
- `ConflictDialog` 四按钮行为见 §7.7 表格；**v1.4 冲突弹窗升级**（diff 高亮 / 影响范围 / 撤销提示 / 按钮副标题 / 手动合并独立设计）见 **§8.4**。

---

## 八、UI 详细设计

### 8.1 布局（对齐需求文档 §7，按本工程实现方式落地）

```
┌───────────────────────────────────────────────────────────────────────────┐
│ FileTabs（既有 34px 自定义标题栏 + 文件标签 + 窗口控制）                     │
│  ⌂ 思绪思维导图 │ 📄requirements.md● │ 🧠arch.smm │ ＋                        │
├──────────────┬────────────────────────────────────────────────────────────┤
│ SidebarTrigger│ 上下文工具栏（44px，✎ 按活动 Tab 的 kind 切换组件）          │
│  （既有竖排  │  ┌─ markdown：↶↷ │ B I S ` H1H2H3 │ 引用 列表 任务 表格 代码    │
│   图标触发器）│  │             公式 分割线 │ 图片 链接 章节引用 │ 目录 │        │
│  ┌─────────┐ │  │             新建 打开 保存 另存为 │ 导出                  │
│  │ 工作区 🆕│ │  └─ mindmap：既有 Toolbar.vue（零改动，仅由 Index 决定是否渲染）│
│  │ 大纲 🆕  │ ├────────────────────────────────────────────────────────────┤
│  │ 备注/主题│ │ 编辑区（自适应）                                            │
│  │ 设置…    │ │   markdown → <MdEditor>（Toast UI 全高）                    │
│  └─────────┘ │   mindmap  → 既有 <Edit>（画布 + SheetTabs）                 │
│              ├────────────────────────────────────────────────────────────┤
│              │ 状态栏（🆕）：文件 · 字数 · 行:列 · 已保存/未保存 · 引用 · 反链 │
└──────────────┴────────────────────────────────────────────────────────────┘
```

- **侧栏**：受需求文档启发改为"可停靠 240px 左栏"，但**不推翻**现有浮动侧栏：新增 `WorkspacePanel` 走**停靠模式**（`v-if="workspaceDocked"`），其余面板（备注/主题/图标…）仍走浮动模式，二者并存。
- **工作区停靠栏**宽度可拖拽（存 `localConfig.workspaceWidth`，100 字节点），最小 160 / 最大 480。

> **【v1.4 补充，G1】"类 Typora"沉浸感**：
> - **FileTabs 即"打开的文件标签条"**：本工程**只有一层**文件标签（顶部 `FileTabs` 既含窗口控制也含打开的文件标签），**不存在第二层独立 Tab 条**——避免"两个标签概念重叠"的困惑。原评审稿误以为有两层，特此澄清。
> - **禅模式 / 专注模式（推荐落地，快捷键 `F11` 或 `Ctrl+Shift+F11` 切换）**：
>   - 隐藏 `FileTabs`、上下文工具栏、状态栏（鼠标移到顶部/底部边缘时临时浮现）；
>   - 侧栏自动折叠；只保留编辑区 + 极简顶部条（工作区名 + 关闭按钮）；
>   - 默认**不开启**（避免新用户找不到功能），首次进入 md 编辑时引导提示"按 F11 进入沉浸模式"；`Esc` 或再次 `F11` 退出；
>   - 持久化到 `localConfig.zenMode`，重启保持。
>
> **【v1.5 澄清，H1】禅模式统一（与 §2.1 `localConfig.zenMode` 的关系）**：
> - §2.1 `store.js` 既有 `localConfig.zenMode`（导图编辑器聚焦模式）与 v1.4 新增的 md 沉浸模式 **是同一个概念、同一份状态**——v1.4 起统一为 `localConfig.zenMode`（全局、跨 Tab 持久化），**不再有第二份禅模式状态**。
> - `F11` / `Ctrl+Shift+F11` 在任何编辑器下切换同一份 `zenMode`；**切 Tab 时状态保持**（存于 localConfig，不随活动编辑器重置）。
> - **编辑器差异（同一状态的不同表现）**：md 编辑态下额外显示"极简顶部条"（工作区名 + 关闭按钮）；导图编辑态下额外显示"浮动工具栏"（悬停出现）。差异只在表现层，不改变状态语义。
> - **若实现上难以合并既有代码**：保留既有导图禅模式用其原快捷键（不动，避免破坏习惯），v1.4 的 md 沉浸模式用 `F11`；两者状态各自独立、切 Tab 各自保持，并在"快捷键冲突"处显式登记——但**首选方案是合并为同一 `localConfig.zenMode`**（既有的 `store.js` 状态本就全局，合并成本最低）。
>
> **【v1.5 澄清，H7】禅模式下的保存状态呈现**：
> - 编辑区右上角常驻一个 **极简状态点**（12px 圆点）：灰=已保存 / 橙=未保存 / 红=保存失败；hover 显示 tooltip（"已保存 / 未保存 / 保存失败"）。
> - `Ctrl+S` 保存成功后状态点短暂变绿（500ms）做正向反馈。
> - 这是禅模式下**唯一**的状态指示（状态栏与 FileTabs 已隐藏），不引入更多元素。
> - **工具栏可折叠**（可选增强）：工具栏右上角"折叠"按钮，折叠后仅留"展开"图标，状态存 `localConfig.toolbarCollapsed`，`Ctrl+Shift+T` 切换。
>
> **【v1.4 补充，G5】响应式规则**（Electron 最小窗口 800×600）：
> | 窗口宽度 | 布局 |
> |---|---|
> | ≥ 1200px | 完整布局（侧栏 + 编辑区 + 大纲） |
> | 900–1200px | 大纲自动折叠 |
> | 700–900px | 侧栏自动折叠为图标条（仅图标触发器） |
> | < 700px | 显示提示"窗口过窄，建议最大化"，仍可用，工具栏进 `⋯` 溢出菜单 |
> **工具栏溢出策略**：按钮按优先级分组（文件操作 > 编辑器常用 > 插入 > 导航），溢出部分进 `⋯` 菜单，菜单项与工具栏**功能一致**。
>
> **【v1.5 澄清，H4】侧栏在窄屏下的折叠分两层（独立处理）**：
> - **停靠模式（WorkspacePanel，`workspaceDocked`）**：≥ 900px 正常显示（240px 可拖拽）；< 900px 折叠为 **48px 窄栏**（仅图标 + 折叠按钮），点击展开为浮层；状态 `localConfig.workspaceCollapsed`。
> - **浮动模式（SidebarTrigger + 各面板）**：复用**既有** `SidebarTrigger`（竖排图标触发器，无需新增），< 700px 图标条宽度 40px → 32px，点击图标弹浮层（既有机制不动）。
> - 两者**位置不同**（停靠栏在左、触发器在最左）、窄屏下**各自折叠**，**不会出现"两层图标条"重叠**——无需合成一个机制。

### 8.2 元素表

| 区域 | 元素 | 行为 |
|---|---|---|
| 顶栏 | `📁 工作区名 ▾` | 打开/切换/关闭/最近列表（最近列表 = 二期 F2） |
| 顶栏 | `🔍 搜索` | 默认搜文件名；回车 → 全文面板（工作区范围） |
| 文件树 | 节点行 | 单击打开；双击=重命名；右键菜单；拖拽移动（二期可选） |
| 文件树 | 空态 | "打开文件夹开始" + 大按钮 + 说明"`.md` 与 `.smm` 可互相引用" |
| 文件树 | 过滤框 | 输入即模糊过滤（保留层级路径，自动展开命中项） |
| 文件树 | 状态点 | 未保存 `●`；引用失效 `⚠`；外部新文件高亮 3s |
| 上下文工具栏 | 组件切换 | `context-changed` → `<MdToolbar>` / `<Toolbar>` |
| 状态栏 | 引用同步状态 | `已同步 / 别处已改 / 引用失效`（点击跳转到该引用块） |

> **【v1.4 补充，G9】快捷键总览**：菜单项 `⚙ 设置 → 快捷键` 打开总览面板——列出所有快捷键（分组：全局 / 编辑器 / 导图），支持搜索（输入"保存"筛出 `Ctrl+S`）、导出为 Markdown、冲突检测（同键绑多命令时高亮）。基础键位见 §7.9。本工程既有快捷键体系保留，新增：`F11` / `Ctrl+Shift+F11` 禅模式（G1）、`Ctrl+Shift+T` 工具栏折叠（G1）、`Ctrl+Shift+B` 状态栏折叠（G6）。自定义改绑列**三期**（本期仅展示）。
>
> **【v1.5 澄清，H9】快捷键总览的数据源**：面板**自动从 `commandRegistry.list()` 导出**（不再手工维护表格）——每个命令注册时带 `title` 与 `shortcuts[]`，总览直接渲染；`shortcuts[]` 有重叠时高亮冲突。上述 4 个 v1.4 新增快捷键已在本表与 **§7.9 快捷键表**双向登记，两处必须一致（冲突检测以 `commandRegistry` 为准）。

### 8.3 引用块视觉（备注面板内）

```
┌ 备注 ─ 节点「需求分析」 ─────────────────────────────────────┐
│                                                              │
│ ⚠️ 下方引用块为「章节引用」，编辑它 = 直接修改 md 源文件    │  ← 黄色警告条（v1.4，G2/F4）
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ 🔗 引用自 docs/requirements.md · 需求分析   ● 已同步   │  │  ← 紫色边框 + 浅紫底（--mm-ref-*，G7）
│ │ 此章节被 3 处引用，你的修改将同步到全部                  │  │  ← 连带影响提示（首次编辑显示，F4）
│ │ [↗ 打开源文件][✏️ 编辑][🔄 刷新][🔗 解除引用][↗跳转link]│  │  ← 含 link 跳转（F6）
│ │ ────────────────────────────────────────────────────  │  │
│ │ ## 需求分析                                            │  │
│ │ 本系统需要支持 md 与导图双链……（章节正文，只读渲染）    │  │
│ └────────────────────────────────────────────────────────┘  │
│                                                              │
│ ┌────────────────────────────────────────────────────────┐  │
│ │ ✍️ 我的备注                                            │  │  ← 白底无边框，明确"你自己的内容"
│ │ ────────────────────────────────────────────────────  │  │
│ │ 用户自己的备注文字（可写 markdown / 代码块）            │  │
│ └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

- **视觉区分（v1.4，G2/F4）**：引用块用 `--mm-ref-*` 专用色（紫边 + 浅紫底）与下方「✍️ 我的备注」（白底）**强区分**；块上方常驻黄色警告条明确"编辑引用块 = 改 md 源文件"，消除"误以为只是备注"的风险。
- **编辑态**：`Body` 区变为可编辑（textarea 或内联编辑器），边框变主题色，右上出现 `未提交` / `提交中…`；**首次进入编辑态若 `findBacklinks > 1` 显示连带影响提示条**（§7.14，F4）。
- **失效态**：整块左侧 4px 红条 + `引用失效` 徽标 + `重新选择章节` / `转为纯文本` 两个补救按钮（对齐需求文档 §6.7.11）；恢复路径见 §7.6.4（F2）。
- **MVP 布局规则（v1.4，F7）**：所有引用块固定在备注编辑器**上方**、按引用顺序排列；用户自有备注统一在**下方**；**不支持**在备注文字中嵌入引用块、引用块与备注混排、引用块顺序拖动（v1.4+ 若有需求再评估 Notion 式块模型）。

### 8.4 冲突弹窗

```
┌ ⚠️ 章节「需求分析」已在别处被修改 ───────────────────────────────────┐
│ 修改来源：本应用（Markdown 编辑器）· 3 秒前                             │
│ 影响范围：覆盖后，此修改将同步到 3 处引用（本节点 + 2 处其他）           │  ← v1.4 新增（F4/G3）
├────────────────────────────┬──────────────────────────────────────────┤
│ 你的修改                    │ 当前内容（磁盘）                          │
│ ## 需求分析                 │ ## 需求分析                              │
│ 本系统**必须**支持 md…       │ 本系统需要支持 md 与导图双链…            │  ← 删除线(删除)+黄底(修改)
│ （+ 新增一行）              │                                          │  ← 新增行绿底
├────────────────────────────┴──────────────────────────────────────────┤
│ ℹ️ 覆盖后原内容保存到 .mindlink/history/，可在「引用历史」中恢复        │  ← v1.4 撤销提示
│ [ 保留我的并覆盖 ] [ 用最新的 ] [ 手动合并 ] [ 取消 ]                    │
│  ↑ 同步到3处       ↑ 丢弃我的    ↑ 逐行编辑    ↑ 保留草稿             │  ← v1.4 按钮副标题
└───────────────────────────────────────────────────────────────────────┘
```
- **diff 高亮（v1.4，G3）**：左右两栏按行 diff，新增行绿底、删除行红底+删除线、修改行黄底；避免人眼逐行比对。
- **影响范围行（v1.4，F4）**：弹窗头部显示"覆盖后将同步到 N 处引用"，N 来自 `findBacklinks`（§7.14 冲突事件已带 `impact`）。
- **撤销提示（v1.4，G3）**：覆盖前**必写快照**（§7.7 `snapshot`），按钮下方小字提示快照路径与"可在历史中恢复"。
- **按钮副标题（v1.4，G3）**：四个按钮下方各一行一句话后果说明。
- **手动合并（v1.4，G3；v1.5 细化，H3）**：独立全屏**三栏**（非"双栏"——"双栏"指左右只读两栏，结果区是第三栏）：
  - **布局**：左=「你的修改」（只读）/ 中=「合并结果」（可编辑，textarea 或复用 `MdEditor` 只读实例渲染两侧、中间 textarea）/ 右=「当前内容」（只读）。
  - **差异块操作**：左、右两栏每个 diff 块右侧有 `[←]`（采用左边）/ `[→]`（采用右边）按钮，点击把该块**替换进中间结果栏**。
  - **结果栏初值**：左右自动 3-way merge 的结果；不可自动合并的块用 `<<<<<<<` 标记占位，供用户手填。
  - **确认**：走 `resolveConflict(ctx, {choice:'manual-merge'}, payload)`（§7.7）→ 写盘 → **再次提示影响范围**（toast + 快照路径，与"保留我的"一致）。

### 8.5 深色 / 毛玻璃适配

- 新组件统一样式变量：`--mm-bg`、`--mm-border`、`--mm-text`、`--mm-accent`，在 `styles/macos.less` 的 `:root` 与 `body.isDark` 下各定义一份。
- 复用既有玻璃态写法：`background-color: rgba(...)` + `backdrop-filter: blur(...)`；**⚠️ 不要把 `opacity` 与 `backdrop-filter` 放在同一元素**（本项目已知坑：会丢毛玻璃效果，opacity 需落内层）。
- 文件树/引用块/弹窗均需同时适配 `localConfig.toolbarOpacity / fileTabsOpacity`。

> **【v1.4 新增，G7】引用块专用色变量**（浅色 / 深色分别定义，避免与组件撞色、保证对比度）：
> ```less
> :root {                       /* 浅色 */
>   --mm-ref-bg:    #f3f0ff;    --mm-ref-border: #7c3aed;  --mm-ref-text: #4c1d95;
>   --mm-note-bg:   #ffffff;    --mm-note-border: transparent; --mm-note-text: inherit;
>   --mm-warn-bg:    #fef3c7;    --mm-warn-text: #92400e;
> }
> body.isDark {                 /* 深色 */
>   --mm-ref-bg:    #1e1b2e;    --mm-ref-border: #a78bfa;  --mm-ref-text: #ddd6fe;
>   --mm-note-bg:   #1a1a1a;    --mm-note-border: transparent; --mm-note-text: inherit;
>   --mm-warn-bg:    #422006;    --mm-warn-text: #fde68a;
> }
> ```
> - 引用块（紫边 + 浅紫底）vs 备注（白底无边框）→ 一眼区分；深色下深紫底浅字 vs 深灰底浅字，保持区分。
> - **毛玻璃规则**：引用块**不用**毛玻璃（紫底叠加会变浑），用纯色；其余组件（侧栏 / 状态栏 / 弹窗）用毛玻璃。
>
> **【v1.5 新增，H8】diff 高亮颜色变量**（§8.4 冲突弹窗用；浅色/深色分别定义，避免深色下对比度不足、与引用块紫/警告条黄撞色）：
> ```less
> :root {                        /* 浅色 */
>   --mm-diff-add-bg:    #dcfce7;  --mm-diff-add-text: #166534;
>   --mm-diff-del-bg:    #fee2e2;  --mm-diff-del-text: #991b1b;
>   --mm-diff-mod-bg:    #fef3c7;  --mm-diff-mod-text: #92400e;
> }
> body.isDark {                 /* 深色 */
>   --mm-diff-add-bg:    #14532d;  --mm-diff-add-text: #bbf7d0;
>   --mm-diff-del-bg:    #7f1d1d;  --mm-diff-del-text: #fecaca;
>   --mm-diff-mod-bg:    #78350f;  --mm-diff-mod-text: #fde68a;
> }
> ```
> - 深色下 diff 底与文字对比度 **≥ 4.5:1**（WCAG AA）。
> - diff 色（绿/红/黄）与引用块紫、警告条黄**色相分离**：警告条黄用于"警告条背景"、diff 修改黄用于"修改行底"，二者区域不重叠，不撞色。

### 8.6 Tab 管理完整交互（v1.4，G4）

Tab 模型沿用 `workbookState`（§5.2/D6）：`{ id, path, kind, dirty, anchor, scrollTop }`。完整交互清单：

> **【v1.5 澄清，H5】与既有 `FileTabs.vue`（§2.2，500 行）的关系**：
> - **既有能力（v1.4 不重写，仅验证/微调）**：单击切换、双击重命名（md）/ 编辑（导图）、`×` 关闭、脏点标记、窗口控制（min/max/close，Electron 自绘标题栏一部分）。
> - **v1.4 新增**：中键关闭、右键菜单（关闭其他 / 关闭右侧 / 复制文件路径 / 在文件夹中显示 / 固定）、溢出下拉 `▾`、`Ctrl+Tab` 循环、宽度约束（min 80 / max 200）。
> - **窗口控制在溢出时固定在最右**，不参与 Tab 溢出（它是标题栏控件、非 Tab）；双击重命名与右键重命名两个入口都保留（行为一致）。
> - **P1 验收**：先核对既有 `FileTabs.vue` 实际支持哪些，再定"新增清单"，避免重复实现。

- 单击切换；双击重命名（md）/ 编辑（导图）；
- **中键点击 = 关闭**（dirty 时需确认）；`×` 按钮关闭（dirty 确认）；
- **拖动排序**（跨 kind 不可，仅同区内部排序）；
- **右键菜单**：关闭 / 关闭其他 / 关闭右侧 / 复制文件路径 / 在文件夹中显示 / 固定（钉住，不受"关闭其他"影响）；
- **溢出策略**：Tab 缩到最小宽度 80px，超出部分隐藏，提供 `▾` Tab 列表下拉（列出全部打开 Tab）；`Ctrl+Tab` 循环切换；
- **宽度**：min 80px / max 200px（按文件名自适应）。

### 8.7 空态 / 加载态 / 错误态（v1.4 补充）

- **空态**：文件树空态已有（§8.2 "打开文件夹开始"）；新增——编辑区空态（"选择一个文件开始"）、搜索空态（"未找到结果"）、反链空态（"暂无引用"）、引用块空态（"尚未引用任何章节"）。

> **【v1.5 澄清，H6】空态"位置 + 触发条件"表**：
> | 空态 | 位置 | 触发条件 | 内容 |
> |---|---|---|---|
> | 文件树空态 | 侧栏内 | 未打开工作区 | "打开文件夹开始" + 大按钮 |
> | 编辑区空态 | 编辑区中央 | 工作区已打开但无 Tab | "选择一个文件开始" + 快捷键提示 |
> | 编辑区无工作区空态 | 编辑区中央 | 未打开工作区 | "打开文件夹或单个文件" + 两个按钮 |
> | 搜索空态 | 搜索面板内 | 有 query 但无结果 | "未找到结果" + 建议（模糊匹配？） |
> | 反链空态（浮层） | 浮层内 | 该章节无其他引用 | "尚无其他引用" |
> | 反链空态（侧栏） | 侧栏内 | 工作区无引用 | "工作区尚无引用" + 引导 |
> | 引用块列表空态 | 备注面板引用区 | 节点无 `_mindlink.refs` | **不显示空块**，只显示 `[🔗 引用文档章节]` 按钮 |

- **加载态**：索引重建已有进度条；新增——打开大文件（骨架屏 / 行高亮占位）、执行搜索（旋转指示 + "搜索中…"）、RefBlock 拉取章节（行占位）。

> **【v1.5 澄清，H6】加载态形式**：① 索引重建 → 进度条（既有）；② 打开大文件 → 骨架屏（前 10 行灰色占位）；③ 执行搜索 → 旋转 + "搜索中…"；④ RefBlock 拉取章节 → 行占位（2–3 行灰色）。

- **错误态**：除弹窗外，关键错误内联——引用失效（§8.3 内联红条）、索引降级（状态栏提示"未建立索引，点此重建"）、写盘失败（编辑区顶部红条 + 重试）。

---

## 九、关键流程时序

### 9.1 打开工作区

```
用户点「打开文件夹」 → fsApi.pickDirectory → workspaceService.open(dir)
  → fsApi.readTree（忽略 node_modules/.git/.mindlink）
  → readIndex('meta.json')：不存在 → 询问创建（否则 readonly-index 模式）
  → 全量解析工作区 md（并发 4）→ sections.json
  → 扫描全部 .smm → refs.json
  → fsApi.watch(dir)
  → $bus.$emit('workspace-opened') → 文件树渲染 + 状态栏显示根路径
```

### 9.2 文件树 → `.smm`

```
点击 diagrams/arch.smm → fileRouter.open(abs)
  → findByPath 命中？ 命中 → switchWorkbook + return
  → fsApi.readText → smmCodec.decodeSmm → addWorkbook({kind:'mindmap', filePath:abs})
  → $bus.$emit('setData', pickActiveData(decoded)) → Edit.vue#setData → 画布渲染
```

### 9.3 文件树 → `.md`

```
点击 docs/requirements.md → fileRouter.open(abs)
  → addWorkbook({kind:'markdown', filePath:abs})            // v1.1：只记元数据
  → documentStore.ensure(tabId, {content})                  // v1.1：内容进 documentStore
  → Index.vue 监听 workbook-switched → context-changed(kind='markdown')
  → <MdEditor> 挂载/切换 → editor.setMarkdown(content)（markRaw 实例）
  → <MdToolbar> 渲染
```

### 9.4 md 链接 → `.smm`

```
md 渲染出 <a href="./diagrams/arch.smm"> → 容器捕获 click
  → preventDefault → fileRouter.navigate('./diagrams/arch.smm', fromAbs)
  → resolveLink → {abs, kind:'mindmap'} → fsApi.stat 存在 → open(abs)
  → 新增 mindmap Tab 并激活
```

### 9.5 md 嵌入 `.smm`

```
md 源：![架构图](./diagrams/arch.smm)
  → WYSIWYG 渲染为 <img src="./diagrams/arch.smm">
  → MutationObserver 扫描命中 → 替换占位 div → 挂载 MindMapPreview
  → decodeSmm → pickActiveData → new MindMap({readonly:true})
用户点击预览 → fileRouter.open(abs) → 打开可编辑 Tab
```

### 9.6 导图节点 link → md#anchor

```
用户点节点超链接图标 → 库触发 customHyperlinkJump(link, node)
  → fileRouter.navigate('./docs/requirements.md#需求分析', currentSmmAbs)
  → resolveLink → {abs, kind:'markdown', anchor:'需求分析'}
  → open(abs,{anchor}) → 已打开则激活 + $bus.$emit('md-scroll-to-anchor')
  → MdEditor：anchor → line（buildAnchorMap）→ setSelection + scrollIntoView + 高亮 1.5s
```

### 9.7 备注引用章节（无冲突）

```
备注面板点「🔗 引用文档章节」→ SectionPicker → 选 docs/requirements.md › 需求分析 › 可编辑
  → refService.addRef(node, {...}) → node.setData({_mindlink}) → data_change → .smm 自动保存
  → RefBlock 出现 → 读取章节内容（readText + parseSections）→ 渲染
用户编辑 RefBlock → 停输入 500ms → revisionService.commitEdit
  → 读盘解析 → hash 相等 → snapshot → replaceSectionInText → writeText
  → suppression.register(abs, {hash})   // 写前登记，抑制本次写入的 fs:change 回声
  → workspaceIndex.updateSection(...) → emit(SECTION_UPDATED, {file, sectionId, rev, hash})
     // v1.1：载荷无 source；其他 RefBlock 一律刷新内容与 baseHash（靠 suppression 而非 source 区分自己）
```

### 9.8 冲突（最后写入生效）

```
RefBlock baseHash=sha1:AAA → md 编辑器保存（外部或本应用）→ 磁盘 hash=sha1:BBB
用户提交 → commitEdit → current.contentHash !== baseHash → 返回 {conflict:'stale'}
  → 弹 ConflictDialog → 用户选「保留我的并覆盖」
  → snapshot(当前内容, 时间戳) → 以磁盘最新全文 + 我的新内容重建 → writeText
  → rev = current.rev + 1 → 广播 → 快照路径展示在 toast
```

### 9.9 外部删除的失效处理

```
外部删除 docs/requirements.md → fs:unlink 事件
  → workspaceService：从树移除 → 标记 index 中该文件失效 → 广播 section:updated(file, null, reason:'file-missing')
  → 持有该文件引用的 RefBlock → status='file-missing'（显示 cachedContent，只读，红条 + "源文件已删除"）
  → 若该 md 正在 Tab 中打开：不自动关闭，标脏提示"文件已从磁盘删除，保存将重建该文件"（用户选择）
```

---

## 十、异常与边界矩阵

| # | 场景 | 检测 | 处理 | 用户可见 | 数据影响 |
|---|---|---|---|---|---|
| 1 | 源文件不存在（引用） | `fsApi.stat` exists=false | status=`file-missing`，用 `cachedContent` 只读渲染 | 红条 + "源文件已删除" + 重建/解除按钮 | 无 |
| 2 | 章节被删 | 解析后 id 与 path 均不匹配 | status=`missing` | "引用失效" + 「重选章节」/「转纯文本」 | 无（引用元数据保留待修） |
| 3 | 标题被改 | 行区间重叠匹配成功 | 自动复用 id，更新 `path`/`title` | 静默（可选 toast"章节标题已更新"） | 索引更新 |
| 4 | 重名标题歧义 | path 命中多个 | status=`ambiguous` | 让用户从候选里选一个绑定 | 无（不写盘） |
| 5 | 章节层级变化 | 新旧 level 不同 | 按 §6.4 规则 1 复用 id | 小字提示"章节边界可能已变化" | 索引更新 |
| 6 | 文件重命名 | 树事件 add+unlink 成对 | 用 id 匹配尝试修复引用（同目录 + 同内容 hash） | "检测到文件重命名，已自动修复 N 处引用" | refs.json 重建 |
| 7 | 别处改了章节 | `contentHash !== baseHash` | `stale`，弹冲突对话框 | 冲突弹窗（§8.4） | 覆盖前快照 |
| 8 | 空保存 | 归一化后内容相同 | `noop:true`，不写盘不递增 rev | 无 | 无 |
| 9 | 文件被占用（Windows EBUSY） | write 返回 `E_LOCKED` | 重试 3 次（200/600/1500ms） | 仍失败则 toast"文件被占用" | 草稿保留在内存 |
| 10 | 磁盘满 | write `ENOSPC` | 立即失败，不更新索引 | toast + 草稿保留 | 无 |
| 11 | 大文件（>1MB md / >5MB smm） | stat.size | 只读预览 + 提示；`.smm` 内嵌跳过 | "文件过大，已切换只读" | 无 |
| 12 | 编码非 UTF-8 | 读取后检测 `\uFFFD` 比例 | 提示"文件编码可能非 UTF-8"，只读打开 | 警告条 | 不写回（避免毁文件） |
| 13 | 循环链接（a.md → b.smm → a.md） | 跳转栈深度 > 5 | 停跳并提示 | "链接层级过深" | 无 |
| 14 | 嵌入导图无限递归 | 嵌入内不再渲染嵌入 | 只读纯占位 | "嵌套嵌入已省略" | 无 |
| 15 | 工作区被外部删除 | watch 报错/stat 失败 | 停监听 + 树置空 | "工作区已不可用" + 重新选择 | 内存态保留 |
| 16 | `.mindlink` 损坏 | JSON.parse 失败 | 重建索引（备份损坏文件为 `.mindlink/sections.json.bad`） | toast"索引已重建" | 索引重建，内容无损 |
| 17 | 引用指向工作区外 | `rel()` 返回 null | 拒写 `_mindlink`，提示改为工作区内路径 | toast | 无 |
| 18 | 行内 HTML 注释（legacy note） | 保存前检测 `\S<!--` | 先规范化为独立块再 `setMarkdown` | 无 | note 格式微调（有快照） |
| 19 | 编辑器实例被 Vue 代理 | 源码守卫测试 | `markRaw` 强制 | — | 防 `mismatched transaction` 崩溃 |
| 20 | 拖动列宽/侧栏与画布冲突 | — | 拖拽期间禁用画布手势（复用 `dragMaskController`） | — | 无 |
| 21 | 同文件多引用块同时提交 | 提交队列串行化（per file+section） | 后续提交基于前一次结果重新校验 hash | 若失败→冲突流程 | 无 |
| 22 | 外部编辑器正在写盘（半截内容） | 解析后 heading 数为 0 且文件非空 | 视为"文件暂时不可用"，跳过重载并在 500ms 后重试一次 | 无（静默重试） | 无 |
| **23** | **回声抑制漏判**（自己写盘却未登记，触发重载/光标跳） | `await suppression.hit()` 返回 false 且磁盘内容与编辑器一致 | 内容一致则静默丢弃**并补登记**；不一致则走外部改动提示（**与 §7.8 消费端分支 ② 逐字一致，v1.2/A12 对齐**） | 无 | 无 |
| **24** | **回声抑制误判**（外部改动被当成自己写的） | `hit()` 命中但磁盘 hash ≠ 登记 hash | **不丢弃**，走外部改动路径；记 `io.write.suppress{hit:false}` 日志 | "外部已更新"提示 | 无 |
| **25** | **索引重建被中断 / 并发调用** | single-flight 命中；或 `signal.aborted` | 并发 → 复用同一 Promise；中断 → **不写盘**，保留旧索引 | 状态栏"正在重建索引…"→ 可重试 | 旧索引继续可用 |
| **26** | **索引写锁被长期占用**（重建卡住） | `indexWriteLock` 等待 > 10s | 提交排队超时 → 返回 `E_LOCKED` + `suggestedAction:'retry'` | toast"正在重建索引，请稍后重试" | 草稿保留 |
| **27** | **迁移失败** | 迁移器返回 `E_MIGRATE_FAILED` | 该步不写盘、已成功步骤保留；整体降级 `readonly-index` | "数据升级失败，已保留备份" + 打开备份目录 | 备份目录有原文件（§17.2） |
| **28** | **传入未知冲突策略** | `strategies[choice]` 为 undefined | 返回 `E_UNKNOWN_STRATEGY`，不改任何数据 | toast"未知操作" | 无 |
| **29** | **组合根被重复初始化 / 测试串味** | `resetAppServices()` 未调用 | 单测 `afterEach` 强制 `resetAppServices()`；状态层 `clear()` | — | 防"上一个用例的 workspace 残留" |

---

## 十一、测试设计

### 11.1 分层

| 层 | 工具 | 覆盖 |
|---|---|---|
| 服务层纯逻辑 | `node --test`（零依赖） | 章节解析/写回、slug、refs 序列化、冲突判定、resolveLink、smmCodec、commandBus 注册表、搜索索引 |
| 组件契约 | 源码级回归（正则断言，沿用 `tests/regression/*.test.mjs` 风格） | `markRaw` 必用、不得直连 `fsApi`、事件解绑、无 `this.editor = new Editor()` |
| 主进程 IPC | `electron-app/tests/*.test.mjs`（解析 main.js 源码断言） | 13 个新通道均注册、`shell.trashItem` 被使用、`fs.watch` 含噪声过滤、asar 模块完整性 |
| 端到端手工 | 手工清单（§11.5） | 真机交互、Windows 路径、中文文件名 |

### 11.2 新增单测清单（v1.1 按**纯边界**分层，不再 1:1 对齐实现文件）

> **v1.1 变更（响应 M5）**：v1.0 的测试文件基本与实现文件 1:1（`sectionService.test.mjs`、`revisionService.test.mjs`…），但实现文件本身边界不清，结果**本该纯的测试被迫 mock IO**（如 `sectionService.test.mjs` 要 mock 读盘、`revisionService.test.mjs` 要 mock 三个服务）。现改为按 §16 分层对齐（v1.2 起为 L0–L4 + CG）：
> **`pure/` = 零 mock；`orchestration/` = 注入 fake；`regression/` = 源码断言。**

> **v1.2 修正指标定义（A9）**：v1.1 只写"zero-mock ≥ 70%"，**未定义分母**，且与表内数字不符（按 v1.1 表内条数实算 ≈ 60%，自相矛盾）。现明确：
>
> - **分母定义**：`本轮新增用例数` = `web/tests/{pure,orchestration,regression}/**/*.test.mjs` + `electron-app/tests/*.test.mjs` 的用例总和，**不含既有 133 个基线用例**（否则分母不可控）。
> - **分层预算（硬指标，写进 §14 验收）**：
>
> | 层 | 目录 | 用例预算 | 占比 | 性质 |
> |---|---|---|---|---|
> | pure | `web/tests/pure/` | **≥ 160** | **70.5%** | 零 mock（L0/L1/L2） |
> | orchestration | `web/tests/orchestration/` | ≥ 51 | 22.5% | 注入 fake `{io, stores, events}` |
> | regression | `web/tests/regression/` | ≥ 11 | 4.8% | 源码正则断言，零运行 |
> | electron | `electron-app/tests/` | ≥ 5 | 2.2% | 主进程源码断言 |
> | **新增合计** | | **≥ 227** | 100% | —— |
> | 全量（+ 基线 133） | | ≈ 360 | pure 占全量 44.4% | 基线 133 零回归 |
>
> **1 个用例 = 1 个 `test(...)` 调用**（含 `describe` 内的子用例），不按文件数计。
> **A 表逐条列举的是「必测项」（功能覆盖门槛，共 112 条）；每行末尾的 `≥N` 是「用例数预算」（含边界等价类扩展），实现时以后者对齐**——这是 160 与 112 的差额来源，**不是注水**；**逐文件的扩展维度表见下方 A′**（v1.3 补，C5：把 112 变成可数到 160 的施工图）。
>
> **为什么是 70% 而不是更低**：`orchestration/` 的 47 条覆盖的是**核心链路**（提交/冲突/索引/迁移），压缩它等于降低质量；因此比例靠**扩充 pure 侧等价类**达成，而不是靠削减 orchestration。若实现时 orchestration 更精简，pure 占比会自然回升。

**A. `web/tests/pure/` —— L1 纯函数，零 mock、零 IO（主战场）**

| 文件 | 用例（≥ 条数） |
|---|---|
| `pure/sectionParser.test.mjs` | ① 基本切块（3 级嵌套）② 围栏代码块内 `#` 不误判 ③ Setext 标题 ④ 引用块内标题（`> # x`）当作章节？→ 约定**不**当作章节 ⑤ 空章节 ⑥ 连续标题 ⑦ 文件尾章节 ⑧ CRLF ⑨ 标题重复 → id 稳定 ⑩ 标题改名 → id 复用 ⑪ 深层嵌套（6 级）⑫ 标题含行内标记（`**b**`/`` `c` ``）⑬ 空文件/仅标题 ⑭ 标题后立即 EOF（≥14） |
| `pure/sectionWriter.test.mjs` | ① 仅改正文不改标题 ② 替换后文件其余部分**字节级不变** ③ 越界保护（endLine=EOF）④ 自校验失败抛 `E_WRITE_VERIFY_FAILED` ⑤ 章节不存在抛 `E_SECTION_MISSING` ⑥ CRLF 保持 ⑦ 首章/末章替换 ⑧ 新内容为空（≥8） |
| `pure/hash.test.mjs` | ① normalizeForHash 对尾空白/连续空行/CRLF 不敏感 ② 归一化后 hash 稳定 ③ `reuseOrCreateId` 行区间重叠复用 ④ 6 位碰撞追加 -1 ⑤ 不同 file 同路径不同 id ⑥ 空内容 hash（≥6） |
| `pure/slugAnchor.test.mjs` | 中文/英文/数字/符号/重复标题/emoji/前后空白 + `buildAnchorMap`（≥8） |
| `pure/linkResolver.test.mjs` | ① 相对路径 ② `../` ③ 工作区绝对 `/docs/a.md` ④ anchor 拆分 ⑤ 中文 anchor ⑥ URL 编码 ⑦ 外链 ⑧ 未知扩展 ⑨ Windows 盘符 ⑩ `#` same-doc ⑪ 空串/`#` 忽略 ⑫ `resolveEmbed` 四类结果（≥12） |
| `pure/refData.test.mjs` | ① `_mindlink` 读写 ② 去重（同 file+sectionId+mode）③ legacy 块级注释解析 ④ 行内注释**不被**解析 ⑤ 往返无损 ⑥ 键名必须以 `_` 开头（防被"清除样式"删）⑦ `updateRefSnapshot` 只改 baseHash/baseRev（≥7） |
| `pure/conflictStrategies.test.mjs` | 四分支各自返回结构 + 未知策略 + `manual-merge` 语义 + `pending` 惰性同步标记（≥6） |
| `pure/smmCodec.test.mjs` | ① 多 sheet 解码 ② 单图解码 ③ 非法 JSON ④ activeId 缺失兜底 ⑤ `encode(decode(x))` 往返 ⑥ pickActiveData（≥6） |
| `pure/documentStore.test.mjs` | ① ensure/get ② setContent → dirty ③ markSaved 清脏 ④ 切 Tab 保留未保存内容 ⑤ drop 清理 ⑥ `serialize/hydrate` 往返（≥6） |
| `pure/suppressionRegistry.test.mjs` | ① register 后 `await hit` 命中 ② hash 不符不命中 ③ TTL 过期失效 ④ 一次性消费 ⑤ clear ⑥ `readText` 失败时返回 false（≥6） |
| `pure/commandRegistry.test.mjs` | ① 注册/执行 ② enabled 计算 ③ 未注册命令报错 ④ 快捷键表解析 ⑤ `list()` 暴露 legacy 计数 ⑥ 重复注册覆盖告警（≥6） |
| `pure/workspaceSearch.test.mjs` | ① 文件名模糊 ② md 行匹配 ③ smm 节点文字/备注匹配 ④ 增量失效 ⑤ limit 截断（≥5） |
| `pure/compositionRoot.test.mjs` | **【v1.2 新增，B6/A7】**① `createAppServices()` 两次互不影响（改 A 的 state 不动 B）② `resetAppServices()` 后旧 Proxy 指向**新** ctx（显式断言）③ `overrides.io / overrides.events` 真的被注入 ④ 组合根不含条件分支与业务逻辑（源码断言）（≥4） |
| `pure/logger.test.mjs` | ① 环形缓冲覆盖（写 305 条只留 300）② `child({scope})` 字段合并 ③ `export()` 格式可解析 ④ 日志**不含文件内容**（只含路径/计数）⑤ level 过滤 ⑥ localStorage 不可用时降级为纯内存（≥6） |
| `pure/errors.test.mjs` | ① `ok/fail` 结构 ② `err()` 的 `recoverable` 默认值 ③ `appError` 可被 `instanceof Error` 捕获且含 `code` ④ 未知 code 的 `suggestedAction` 为 null（≥4） |
| `pure/context.test.mjs` | ① `createWorkspaceContext` 的 `abs/rel/isInside` ③ Windows 路径与 `..` 越界 ④ `createDocumentContext` 的脏标记唯一入口（≥4） |
| `pure/eventBus.test.mjs` | **【v1.2 新增】** ① 未声明事件在开发期抛错 ② `on` 返回的 `off` 可解绑 ③ 单订阅者抛错不影响其他订阅者 ④ `reset()` 清空（≥4） |
| — | **必测项合计 112**；**用例数预算 ≥ 160**（含边界等价类扩展，逐文件拆解见 **A′**）；**凡不需要 IO 的用例一律迁到 `pure/`**（v1.1 的 `pure/sectionView.test.mjs` 已并入 `sectionParser` / `sectionWriter`，取消该文件） |

**A′. 必测项 → 用例预算的逐文件拆解（v1.3 新增 —— 响应 C5）**

> 评审指出：A 表逐条加总只有 **112**，而预算写 **160**，差额 48 没有出处 —— 验收者会逐条数，实现者会问"剩下 48 条我自己编吗"。下表给出**每一类必测项的等价类扩展维度**，使 112 变成可施工的 160。

| 文件 | 必测项 | 等价类扩展维度 | 用例数 |
|---|---|---|---|
| `sectionParser` | 14 | 围栏类型（```/`~~~`/缩进/未闭合）× 标题类型（ATX/Setext）× 嵌套层级（1–6）× 引用块内标题 | 14 → **22** |
| `sectionWriter` | 8 | 首/中/末章 × CRLF/LF × 空/单行/多行 × 越界 endLine | 8 → **12** |
| `hash` | 6 | 归一化输入族（尾空白/连续空行/CRLF/BOM/全角空格） | 6 → **8** |
| `slugAnchor` | 8 | 中/英/数/符/emoji/重复 × 大小写 × 前后空白 × `buildAnchorMap` | 8 → **12** |
| `linkResolver` | 12 | 相对/绝对/盘符 × 编码/不编码 × 外链/内链 × `../` 越界 × `#` same-doc | 12 → **20** |
| `refData` | 7 | 去重键三维（file/sectionId/mode）× legacy 块级/行内 × 往返无损 | 7 → **10** |
| `conflictStrategies` | 6 | 四分支 × 未知策略 × `manual-merge` × `pending` 标记 | 6 → **8** |
| `smmCodec` | 6 | 单/多 sheet × 缺 `activeId`/缺 `sheets`/坏 JSON × 往返 | 6 → **10** |
| `documentStore` | 6 | ensure/get/setContent/markSaved/drop 各一 × `serialize/hydrate` 往返 | 6 → **8** |
| `suppressionRegistry` | 6 | 命中/不符/过期/一次性/clear/读盘失败 | 6 → **8** |
| `commandRegistry` | 6 | 注册/执行/enabled/快捷键解析/list/重复注册 | 6 → **8** |
| `workspaceSearch` | 5 | 文件名模糊 × md 行 × smm 节点/备注 × 增量失效 × limit | 5 → **6** |
| `compositionRoot` | 4 | 双实例隔离/reset 后旧 Proxy/overrides 注入/源码无分支 | 4 → **5** |
| `logger` | 6 | 环形覆盖/child 合并/export 可解析/无内容泄漏/level 过滤/降级 | 6 → **8** |
| `errors` | 4 | ok-fail 结构/recoverable 默认/appError 可 catch/未知 code | 4 → **5** |
| `context` | 4 | abs/rel/isInside/越界 + 脏标记唯一入口 | 4 → **5** |
| `eventBus` | 4 | 未声明事件抛错/off 解绑/订阅者隔离/reset | 4 → **5** |
| **合计** | **112** | —— | **≥ 160** |

**判据**：实现时**逐文件对上表的右列**建 `describe`；若某文件实际条数低于右列，须在该文件的 `// 预算说明` 注释里写清"为什么少"，否则视为未达标。这样"112 vs 160"从**口径争议**变成**逐行可核**。

**B. `web/tests/orchestration/` —— L4 编排，注入 fake `{io, stores, events}`（不碰真实 FS）**

| 文件 | 用例（≥ 条数） |
|---|---|
| `orchestration/revisionService.test.mjs` | ① 无冲突提交 ② noop 提交（内容未变）③ hash 冲突 → stale ④ missing ⑤ ambiguous ⑥ `rebind` 自动重绑 ⑦ **`rebind` 后 `current` 必非空（A11 回归）** ⑧ **`rebind` 只改 id/path、不改 baseHash/baseRev；改名+改内容 → `stale`（C1/C2）** ⑨ 快照文件名规范 ⑩ **写盘走 `fsApi.writeText`（内部登记 suppression，服务侧不手动 register）** ⑪ 广播载荷**不含 source** ⑫ 同 file+section 串行化 ⑬ 提交后调用 `syncRefSnapshots` ⑭ **返回值含 `rebound`（D1）** ⑮ **冲突结果同时带 `code` 与 `kind`（C11）**（≥15） |
| `orchestration/refService.test.mjs` | ① 失效状态判定 5 种（ok/stale/missing/file-missing/ambiguous）② **`syncRefSnapshots` 只改 baseHash/baseRev、不写 `.md`** ③ `N>10` 时**前 10 立即写、其余标 `snapshotPending`/`pendingRev`/`pendingHash`** ④ **`force:true` 忽略阈值全量校准** ⑤ **`calibratePendingSnapshots` 清除标记且不改正文（C3）** ⑥ 反查失败不阻塞提交 ⑦ **不得存在 commitRef**（断言导出表）（≥7） |
| `orchestration/fileRouter.test.mjs` | ① `navigate` 外链 → openExternal ② 不存在 → 广播 `link-missing` ③ `.km` → importAsNew ④ Tab 去重 ⑤ anchor 透传（≥5） |
| `orchestration/workspaceService.test.mjs` | ① open 成功 ② 无权限/不存在 → `Result` 失败 ③ 索引缺失 → created ④ 索引损坏 → 备份 `.bad` + 重建 ⑤ close 停止监听 ⑥ **open 内先迁移、迁移失败降级 `readonly-index` 不阻断打开（B2）** ⑦ `rebuildIndex` 转发 onProgress → `emit(index:rebuilding)`（≥7） |
| `orchestration/workspaceIndex.test.mjs` | ① 重建幂等 ② single-flight（并发只跑一次）③ 原子写（tmp→move）④ 写锁期间提交排队 ⑤ 迁移器调用 ⑥ **`onProgress` 被调用且不 emit（L3 不依赖事件总线）**（≥6） |
| `orchestration/mdDocument.test.mjs` | ① 载入→脏→保存→干净 ② 防抖合并 ③ 外部改动 vs 本地脏 ④ `Ctrl+S` 立即保存绕过防抖 ⑤ **`serialize/hydrate` + localStorage 由本层完成（`documentStore` 不碰）**（≥5） |
| `orchestration/migrations.test.mjs` | **【v1.2 补入，B7】** ① 幂等（重复执行结果一致）② `dryRun` 零写入 ③ 单步失败不污染后续 ④ 备份文件存在且内容一致 ⑤ `migrate.log` 追加 ⑥ 未知 `v` 触发 m001（≥6） |
| — | **必测项合计 51**（v1.3：refService +1、revisionService +3，覆盖 C1/C2/C3/D1/C11）；用例数预算 ≥ 51（此层为**核心链路**，不做等价类注水，条条对应真实风险） |

**C. `web/tests/regression/` —— 源码守卫（零运行）**

| 文件 | 用例（≥ 条数） |
|---|---|
| `regression/services-isolation.test.mjs` | 见 §11.3（分层 import 矩阵 + 环检测） |
| `regression/md-editor-safety.test.mjs` | `MdEditor.vue`/`RefBlock.vue` 必须 `markRaw`；不得 `new Editor(` 直接赋给 data；composable 必须 `stop()` 解绑（≥5） |
| `regression/events-contract.test.mjs` | 🆕 所有 `services/**` 里 emit 的事件名必须存在于 `events.js` 声明；新增事件载荷**不得含 `source`**（≥3） |
| `regression/legacy-bridge.test.mjs` | 🆕 `components/**` 不得出现 `$bus.$emit('execCommand'`；`legacy:true` 命令数不增加（≥2） |

**D. `electron-app/tests/` —— 主进程**

| 文件 | 用例（≥ 条数） |
|---|---|
| `electron-app/tests/workspace-ipc.test.mjs` | ① 13 通道在 main.js 注册 ② preload 暴露同名 ③ trash 用 `shell.trashItem` ④ watch 含 ignore 正则 ⑤ 无第三方 require（≥5） |

**目标（v1.2 按 §11.2 顶部分层预算修正，A9）**：

```
node --test：既有 133 全绿（零回归） + 本轮新增 ≥ 227 → 全量 ≈ 360
  新增构成：pure ≥ 160（70.5%）· orchestration ≥ 51 · regression ≥ 11 · electron ≥ 5
  硬指标：pure/ 占**新增**用例 ≥ 70%（160/227）；分母 = 本轮新增用例（定义见本节顶部）
全绿 + `node scripts/check-arch.mjs` EXIT 0（0 环、10 类断言）才算完成。
```

> **【v1.3，C6】本指标不再靠手工数，改由脚本校验**：`scripts/check-arch.mjs` 增第 10 类断言 —— 扫描四类测试目录统计 `test(` 计数、校验 `pure/` 源码不含 `mock`/`jsdom`/`sinon`/`jest.fn`、并断言 `pure ≥ 160` 且 `pure/新增 ≥ 70%`。手工验收清单里只保留"脚本 EXIT 0"一条（避免"按数量"与"按字样"两套方法各说各话）。
### 11.3 源码级守卫（写进 `build_now.sh` + `node --test`）

**11.3.1 编译产物守卫**（防陈旧缓存"假新包"，v1.0 保留）

```bash
# [2/5] 追加守卫：新功能必须真的编译进 bundle
grep -a -q "workspace-opened" electron-app/dist/js/*.js || { echo "BUILD ASSERT FAILED: workspace 服务未编译"; exit 1; }
grep -a -q "_mindlink" electron-app/dist/js/*.js || { echo "BUILD ASSERT FAILED: 引用元数据字段未编译"; exit 1; }
grep -a -q "customHyperlinkJump" electron-app/dist/js/*.js || { echo "BUILD ASSERT FAILED: 节点 link 跳转钩子未编译"; exit 1; }
```

**11.3.2 架构规约守卫 —— `scripts/check-arch.mjs`（v1.1 新增，响应 P4）**

> **为什么不用 ESLint**：评审建议用 ESLint `no-restricted-imports`。**本工程不采纳**：Vue3 升级时已移除 ESLint（`web/package.json` 无 eslint 依赖），重新引入等于为一个检查项增加一整套工具链，与 **D5/D10「不引第三方依赖」** 相悖。改用**自研零依赖脚本**（`node scripts/check-arch.mjs`），能力等价且不增加任何依赖。

**分层 import 矩阵**（脚本据此断言，违反即 `exit 1`）：

| 层 | 目录 | ✅ 允许 import | ❌ 禁止 import |
|---|---|---|---|
| **L0 基础** | `services/{events,logger,context}.js` | 内置（**含 `localStorage`**） | 任何服务、`vue`、`.vue`、`@/store`、`@/router` |
| L1 纯函数 | `services/*.js`（除 L0/L2–L4；**含 `errors.js`**） | Node/浏览器内置、`markdown-it`、同层 L1 | **任何服务（含 L0）**、`vue`、`.vue`、`@/store`、`@/router`、**`window` / `localStorage`** |
| L2 状态 | `services/state/*` | 内置、L0、L1 | 任何服务（**含 L3/L4**）、`vue`、`.vue`、`localStorage` |
| L3 IO | `services/io/*` | 内置、**L0**、L1、**同层 L3**、`window.smmApi` | L4 服务、`vue`、`.vue` |
| L4 编排 | `services/*.js`（顶层） | 内置、L0、L1、L2、L3、`ctx` 注入 | 视图、`vue`、`.vue`、**`refService → revisionService`（环）** |
| **CG 组合根** | `services/index.js`、`migrations/**` | 全部（L0–L4） | 视图 |
| 视图 | `components/`、`composables/`、`pages/` | `@/services`（组合根）、`@/services/<L0\|L1>`、`vue`、element-plus | **`services/io/*`（含动态 `import()`）**、`window.smmApi` 直调 |

**脚本核心逻辑（伪码，v1.3 扩充 —— 断言共 10 类）**：

```js
// scripts/check-arch.mjs —— 零依赖：只用 fs/path + 自写正则解析 import
const EDGES = new Map()                       // 模块 → 它 import 的模块（仅 services 内部边）
for (const file of walk('web/src/services')) {
  const layer = layerOf(file)                 // 依 §5.2 的「层」列
  const src = readFile(file)
  for (const spec of parseImports(src)) {
    const target = resolveSpec(spec, file)
    // ① 禁入清单
    for (const bad of FORBIDDEN[layer]) assert(!matches(spec, bad), `${file} 违规 import ${spec}`)
    // ② 收集边（**含 L1 同层边**，用于环检测 —— A10：sectionWriter → sectionParser 合法，反向即环）
    if (isService(target)) EDGES.set(file, [...(EDGES.get(file)||[]), target])
  }

  // ③ L1 不得引用 window / localStorage 全局（B9：v1.1 误写成"禁止 import window"，
  //    window 不是模块，只能按"全局引用"断言）
  if (layer === 'L1') {
    assert(!/\bwindow\./.test(src), `${file} L1 不得引用 window 全局`)
    assert(!/\blocalStorage\b/.test(src), `${file} L1 不得引用 localStorage`)
  }
  if (layer === 'L2') assert(!/\blocalStorage\b/.test(src), `${file} L2 不得引用 localStorage`)

  // ④ 服务方法签名不得暴露 ctx（B4：应由工厂闭包捕获）
  if (/^L[0-4]$/.test(layer) && !/context\.js$/.test(file)) {
    assert(!/export\s+(async\s+)?function\s+\w+\s*\([^)]*\bctx\b/.test(src),
           `${file} 服务工厂签名之外不得把 ctx 作为业务方法参数`)
  }

  // ⑤ 工厂内部禁用 this（A1：解构后 this 丢失）
  if (layer === 'L4') assert(!/\bthis\./.test(src), `${file} L4 工厂内部不得使用 this（请改闭包）`)
}

// ⑥ 视图层不得直连 IO —— 含**静态 import / 动态 import() / window.smmApi 直调**（B3）
for (const f of walk('web/src/{components,composables,pages}')) {
  const src = readFile(f)
  assert(!/from\s+['"][^'"]*services\/io\//.test(src), `${f} 视图层静态 import IO`)
  assert(!/import\(\s*['"][^'"]*services\/io\//.test(src), `${f} 视图层动态 import IO`)
  assert(!/\bwindow\.smmApi\b/.test(src), `${f} 视图层直调 IPC`)
}

// ⑦ 组合根不得把 IO 层再导出（B3：否则视图可绕过边界）
const root = readFile('web/src/services/index.js')
assert(!/export[\s\S]{0,80}\bfsApi\b/.test(root), '组合根不得导出 fsApi')
assert(!/\bif\s*\(|\bswitch\s*\(/.test(root), '组合根只装配，不得含条件分支（R16）')

// ⑧ 环检测（DFS 三色标记，覆盖全部层含 L1 内部）
const cycle = findCycle(EDGES)
assert(!cycle, `检测到依赖环：${cycle?.join(' → ')}`)

// ⑨ 临时实现退场条件计数：只允许减少（§17.1 / B5）
const todos = walk('web/src').flatMap(f => extractTodos(f, /TODO\(退场条件:/g))
const snap = readJsonIfExists('.arch-todo-snapshot.json')
if (snap && todos.length > snap.count)
  fail(`TODO(退场条件) 数量增加：${snap.count} → ${todos.length}（新增临时实现必须先登记退场条件）`)
writeJson('.arch-todo-snapshot.json', { count: todos.length, at: Date.now() })
log('arch.todos', { count: todos.length, items: todos.map(t => t.file) })

// ⑩ 零 mock 指标自动校验（v1.3 新增，C6）—— 取代 §14 的两条手工勾选
const testDirs = {
  pure:          walk('web/tests/pure'),
  orchestration: walk('web/tests/orchestration'),
  regression:    walk('web/tests/regression'),
  electron:      walk('electron-app/tests')
}
const countTests = fs => fs.reduce((n, f) => n + (readFile(f).match(/(^|\s)test\s*\(/g) || []).length, 0)
const n = { pure: countTests(testDirs.pure), orchestration: countTests(testDirs.orchestration),
            regression: countTests(testDirs.regression), electron: countTests(testDirs.electron) }
const added = n.pure + n.orchestration + n.regression + n.electron
// ② pure/ 源码不得含 mock 字样（用脚本读文件判断，**不用 grep**：grep 未匹配返回 1，`== 0` 恒假）
const MOCK_RE = /\b(mock|jsdom|sinon|jest\.fn)\b/
for (const f of testDirs.pure) assert(!MOCK_RE.test(readFile(f)), `${f} pure/ 出现 mock 依赖`)
assert(n.pure >= 160, `pure/ 用例不足：${n.pure} < 160`)
assert(added >= 227, `本轮新增用例不足：${added} < 227`)
assert(n.pure / added >= 0.70, `pure/ 占比不足：${n.pure}/${added}`)
log('test.budget', { ...n, added, pureRatio: +(n.pure / added).toFixed(4) })

console.log('check-arch OK:', Object.keys(EDGES).length, 'modules, 0 cycles,',
            todos.length, 'pending-TODOs, tests', added)
```

**接入点**：`web/package.json` 的 `test` 前置（`node scripts/check-arch.mjs && node --test`）+ `build_now.sh` 的 [1/5] 之后（**构建期阻断**）。对应测试 `tests/regression/services-isolation.test.mjs` 以"脚本存在且退出码为 0"断言，兼作双重保险。

**11.3.3 既有守卫保留**

`tests/regression/*.test.mjs`（`template-bindings`、`note-editor-reactivity`、`note-img-lightbox`、`note-dialog-paste`）**全部保留**，只增不减。

### 11.4 IPC 契约测试（示例）

```js
// electron-app/tests/workspace-ipc.test.mjs
const src = fs.readFileSync(path.join(root, 'main.js'), 'utf8')
const CHANNELS = ['smm:pick-directory','smm:read-tree','smm:stat-many','smm:read-text',
  'smm:write-text','smm:write-binary','smm:mkdirp','smm:move','smm:trash',
  'smm:watch','smm:unwatch','smm:open-external','smm:reveal-in-folder']
test('所有工作区 IPC 通道均已注册', () => {
  const missing = CHANNELS.filter(c => !src.includes(`'${c}'`))
  assert.deepStrictEqual(missing, [])
})
test('删除必须走回收站（不得 fs.rm）', () => {
  assert.match(src, /shell\.trashItem/)
  assert.ok(!/fs\.rmSync\([^)]*recursive/.test(src), '禁止在主进程递归硬删')
})
```

### 11.5 手工验收脚本（真机）

```
准备：构造演示工作区 demo-ws/
   docs/overview.md（含 # 项目背景 / ## 目标 / ## 非目标 / ```python 代码块含 # 注释）
   docs/requirements.md（含 # 需求分析 / ## 功能列表，功能列表含重名子标题 ×2）
   diagrams/arch.smm（2 sheet，根节点 link=./docs/requirements.md#需求分析）
   assets/（空）

1. 打开工作区 → 树出现；.mindlink 自动生成；状态栏显示根路径
2. 点 arch.smm → 画布渲染，2 个 sheet 可切换
3. 点根节点上的超链接图标 → 打开 requirements.md 并滚到「需求分析」
4. requirements.md 里写 `[架构图](./diagrams/arch.smm)` → 点击跳转
5. 写 `![架构图](./diagrams/arch.smm)` → 出现只读内嵌导图；点击 → 打开可编辑 Tab
6. 大纲面板列出 3 级标题；点击标题定位
7. 粘贴截图 → assets/ 落盘 + 相对路径插入 + 渲染成图
8. 备注里插入 python 代码块 → 语法着色；保存 .smm 后重开仍在
9. 备注点「引用文档章节」→ 选「需求分析」→ 显示章节正文；编辑 → 500ms 后 md 文件同步变化（用外部编辑器核对）
10. 同时在 md 编辑器里改同一章节 → 导图备注提交时弹冲突 → 选「保留我的并覆盖」→ 快照出现在 `.mindlink/history/`
11. 删除某章节标题 → 引用块显示「引用失效」且不崩溃
12. 删除 requirements.md → 引用块显示「源文件已删除」+ 缓存内容，只读
13. 重命名 requirements.md → 提示"已自动修复引用"（同内容 hash 匹配）
14. 用外部编辑器改 md → 应用内 1s 内出现"外部已更新"提示（不自动冲刷未保存编辑）
15. 全文搜索 "需求" → 命中 md 标题 + smm 节点文字 + 备注内容
16. 关闭应用重开 → 工作区与 Tab 恢复，未保存的 md 内容仍在
17. 中文文件名 / 中文目录名 / 含空格路径 → 全部功能正常
18. 深色主题下所有新组件可读（含文件树、引用块、冲突弹窗）
```

---

## 十二、实施路线图

> **原则**：每阶段结束都能**独立构建 + 部署 + 手工可验**；服务层先行（可测），UI 随后；不打无守卫的大改。

> **⚠️ v1.1/v1.2 工期调整**：架构规约（§16）与迁移（§17）的工作量**前置到 P0**，因此 P0 从 3 人天 → **5 人天**；后续阶段因"纯函数先行 + 零 mock 测试"实际会**省**掉反复调试 mock 的时间，P2/P4 各 **-0.5 人天**。
> **v1.2 再调整**：L0 拆分与 Proxy trap（+0.2）、`syncRefSnapshots` 真源写回与惰性策略（+0.5）、`check-arch.mjs` 断言 3 类 → 9 类（+0.3）、`getSectionView`/`migrations`/`compositionRoot` 等补测（+0.3）。
> **v1.3 再调整**：`calibratePendingSnapshots` + 惰性同步落地路径（+0.3）、`overrides` 最小 fake 基建与 4 条补测（+0.2）、`check-arch` 断言 9 → **10 类**（+0.1，与上一条的脚本同批改动）。**C 类文档修正不占人天**。
> **总计 ≈ 36.5–38.5 人天**（相对 v1.0 +2.5）。

| 阶段 | 目标 | 交付物 | 验收 | 估（人天） |
|---|---|---|---|---|
| **P0 基建（含架构规约落地）** | IO 通道 + 分层骨架 + 守卫机制 | `main.js` 13 通道、`preload.js`、`io/fsApi.js`、`io/suppressionRegistry.js`、`io/workspaceIndex.js`、`io/fsWatchClient.js`、**L0：`events.js`（含 `createEventBus`）、`logger.js`、`context.js`**、**L1：`errors.js`（P0 必须；其余 L1 模块按阶段交付 —— `hash/sectionParser/sectionWriter/linkResolver/refData/conflictStrategies/commandRegistry/smmCodec` 分别在 P2–P5 落地，P0 不必全部到位，因为此时没有 L4 服务引用它们）**、**`services/index.js` 组合根（含 Proxy trap）**、`scripts/check-arch.mjs`（**10 类断言**）、`migrations/` 骨架、`workspace-ipc.test.mjs`、`build_now.sh` 守卫 | `node --test` 全绿；`node scripts/check-arch.mjs` EXIT 0（**0 环**）；手动调用每个通道各成功/失败一次；**解构调用服务方法不崩（A1 回归）** | **5** |
| **P1 工作区 + 文件树 + Tab 模型** | 能打开文件夹并在树里点开文件 | `workspaceService.js`、`state/workspaceStore.js`、`FileTree.vue`、`WorkspacePanel.vue`、`workbookState` 加 `kind`+`docMeta`、`state/documentStore.js`、`FileTabs` 图标、i18n×4 | 打开 demo-ws→树正确；点 .smm 打开可编辑；`workbookState` 旧用例零回归 | 5 |
| **P2 md 编辑器** | md 能所见即所得编辑并保存 | `MdEditor.vue`（容器）、**7 个 composable**、`useMdRender.js`、`MdToolbar.vue`、`mdDocument.js`、`MdOutline.vue`、`Index.vue` 上下文切换 | 编辑保存/自动保存/大纲/粘贴图片/代码高亮；`md-editor-safety` 守卫过 | 5.5 |
| **P3 调用（三种入口）** | md ⇄ 导图 全通 | **`linkResolver.js`（纯）**、`fileRouter.js`（编排）、`smmCodec.js`、`MindMapPreview.vue`、`Edit.vue` 加 `customHyperlinkJump`、失效对话框 | 手工清单 3–6 项通过；`pure/linkResolver` 10 用例**零 mock** | 4 |
| **P4 章节引用（核心）** | F23–F27 全通 | `sectionParser.js`、`sectionWriter.js`、`refData.js`、`conflictStrategies.js`、`hash.js`（均 L1 纯）、`sectionService.js`、`refService.js`、`revisionService.js`、`SectionPicker.vue`、`RefBlock.vue`、`ConflictDialog.vue`、`NodeNote.vue` 集成 | 手工清单 8–13 通过；`pure/` 覆盖切块/写回/策略；`orchestration/` 覆盖 5 种失效态 + 四分支 + 广播无 source | 8.5 |
| **P5 命令总线 + 搜索** | 快捷键统一 + 工作区搜索 | `commandRegistry.js`（L1 纯注册表）、`commandBus.js`（编排 + **迁移表** + `legacy` 登记）、`workspaceSearch.js`（`createWorkspaceSearch(ctx)`）、`Search.vue` 扩展、状态栏 | 快捷键表逐条验证；搜索命中 md/smm/备注；`legacy-bridge` 守卫过 | 4 |
| **P6 打磨与发布** | 公式、主题、文档、打包 | KaTeX 插件（可降级）、`macos.less` 扩展、README 使用说明、ADR 落地（§17.4）、版本 bump、安装包 | 验收清单 §14 全过；`build_now.sh` EXIT 0 | 3–5 |
| | | | **合计** | **≈ 36.5–38.5**（不含 P6 公式若降级则 -1.5） |

**关键依赖链**：P0（**含 §16 分层骨架，是所有阶段的前提**）→ P1 → P2 → P3 → P4（P4 依赖 P2 的编辑器与 P3 的 router）。P5 可与 P4 并行（人员 ≥2 时）。

**里程碑验收点**：

| 里程碑 | 判据 |
|---|---|
| M1（P0+P1 完成） | 打开文件夹能浏览树并打开 .smm；主进程契约测试全绿；**`check-arch.mjs` 报 0 环** |
| M2（P2 完成） | md 可编辑保存，产物 `.md` 与 Typora 打开一致（无额外注入）；**7 个 composable 均可独立 `stop()`** |
| M3（P3 完成） | md ⇄ smm 双向跳转 + 内嵌只读，三种调用路径全部可用；**`pure/linkResolver` 零 mock** |
| M4（P4 完成） | 章节引用端到端可用，冲突四分支与 5 种失效态均可复现；**`refService` 导出表无 `commitRef`** |
| M5（P5+P6 完成） | 验收清单全过 + 安装包可安装运行；**`legacy` 命令已全部登记且有迁移行** |

---

## 十三、风险登记册

| # | 风险 | 概率 | 影响 | 对策 | 触发回滚 |
|---|---|---|---|---|---|
| R1 | `markdown-it` **声明在 `devDependencies`**（`^13.0.1`，已显式声明，非传递依赖）—— 语义错误：webpack 会把它打进 bundle 故运行时可跑，但 `npm ci --omit=dev` / CI 收紧 / 依赖树漂移会炸 | 中 | 高（解析引擎缺失） | **移到 `dependencies`**；`package-lock.json` 提交；`check-arch.mjs` 断言 `services/*` 对 `markdown-it` 的 import 存在 | 启用备选自写行扫描器（§4-D3） |
| R2 | Toast UI 遇到**行内 HTML 注释**抛异常导致备注/引用块打不开 | 中 | 中 | 保存前规范化（R5）＋ 读入时 `try/catch` 降级为纯文本模式 | 引用块改用 textarea（§7.14） |
| R3 | 误把元数据写进 `note`，被 CSS 隐藏但用户仍能看到 JSON | 低 | 中 | D4 方案：元数据**不进 note**；回归测试断言 `note` 不含 `ref:` | — |
| R4 | 上划线前缀写错（`sectionRefs` 而非 `_mindlink`）→ 被"清除样式"删除 | 中 | 高（引用丢失） | 服务层唯一写入口 + 单测断言键名以 `_` 开头 | 从 `refs.json` 重建 |
| R5 | 主进程新增模块漏进 asar（`fileArgs.js` 事故重演） | 中 | 高（安装后起不来） | 本期**不新建主进程模块**；若新建，同步改 `_appstage` 拷贝行 + 既有 `asar-modules.test.mjs` 兜底 | 补打包清单重新出包 |
| R6 | `fs.watch` 在 Linux 无 `recursive` | 低 | 低（本产品主力 Windows） | 捕获异常 → 降级逐目录 watch + 30s 轮询 | — |
| R7 | `node.setData({_mindlink})` 触发不必要节点重绘/闪烁 | 中 | 低 | 优先直接改 `node.getData()` 引用后手动 `emit('data_change')`；若重绘不可接受则提供 `refService.setRefsSilent()` | — |
| R8 | 大文件 md 使用 WYSIWYG 卡顿/白屏 | 中 | 中 | > 1MB 只读 + 分块渲染；提供"强制编辑" | — |
| R9 | 多个引用块各建 Toast UI 实例导致内存/性能问题 | 中 | 中 | MVP 用 textarea+预览（§7.14 决策）；实测后二期再换 | 全局只保留 1 个共享编辑器实例 |
| R10 | 「自动保存」与「引用提交」互相触发形成广播风暴 | 中 | 高（卡死/光标乱跳） | ① **`io/suppressionRegistry` 写前登记 + 一次性消费**（v1.1：不再靠事件载荷 `source`）② 同一 `file+section` 提交串行化 ③ 只广播"已提交"变更 ④ `indexWriteLock` 防索引写交错 | 关闭自动刷新，改手动刷新按钮 |
| **R15** | **架构腐化回潮**：后续开发重新引入双向依赖 / 视图直连 IO / 事件绕过 `events.js` | 中 | 中 | `scripts/check-arch.mjs`（分层 import 矩阵 + DFS 环检测）在 `npm test` 与 `build_now.sh` **双点阻断**；`regression/{services-isolation,events-contract,legacy-bridge}` 三重断言 | 降级为人工 review 清单 |
| **R16** | **service 工厂注入导致组合根爆炸**（`services/index.js` 变成新的上帝模块） | 中 | 低 | 组合根**只做装配**（`createXxx` + 注入），不得含业务逻辑；`check-arch.mjs` 限制其行数（>150 行告警）与禁止条件分支 |
| **R17** | **`documentStore` 与 `workbookState` 脏标记不同步**（两处各记一份 dirty） | 中 | 中 | 单向：`documentStore.setContent` 是**唯一**入口；`workbookState.dirty` 由监听同步；`regression` 断言 `workbookState` 中不得出现 `content` 字段 |
| **R18** | **索引重建期间用户提交** → 基于半成品索引判定冲突 | 低 | 高 | `indexWriteLock` 排队 + `index:rebuilding` 期间引用块只读（§6.3.1） | 提交直接拒绝并提示"请等重建完成" |
| **R19** | **迁移器无 dry-run 直接改用户数据** | 低 | 高 | 迁移前**强制备份** + `migrate.log` + 单测覆盖 `dryRun:true`（§17.2） | 从备份恢复 |
| **R20** | **切编辑器引擎（Milkdown）时 composable 契约漂移**，`useToastUi` 换不掉 | 低 | 中 | §7.10.0 固定 7 个 composable 的**入参/出参契约**，新增 `useMilkdown.js` 必须同签名；`regression` 断言 composable 导出名集合稳定 | 保留 Toast UI 分支 |
| R11 | 需求文档的"240px 停靠侧栏"与现有浮动侧栏冲突 | 中 | 低 | 停靠/浮动两模式并存（§8.1）；尺寸存 `localConfig` | 只保留浮动模式 |
| R12 | md 编辑器与画布快捷键冲突（如 `Tab`） | 中 | 中 | `commandBus` 按 `context-changed` 路由作用域；`shortcutGuard.js` 复用 | — |
| R13 | KaTeX 公式在 Toast UI 里做不出来（工期黑洞） | 中 | 低 | **标记为最后一个实现项**，可降级为【可选】；预算硬上限 1.5 人天 | 降级：公式以代码块记录 |
| R14 | 版本/构建指纹不一致导致"改了没生效"（本项目高频坑） | 中 | 中 | 沿用既有流程：先 commit + bump 再生成 build-info；`build_now.sh` 守卫断言 | 重新构建对齐 |

---

## 十四、验收清单（MVP）

> 逐条可**手工验证**；每条标注验证方式。对照需求文档 §12 并补齐本项目特有项。

**工作区与文件树**

- [ ] 能打开一个含 `.md` 与 `.smm` 的文件夹，树形展示（含中文路径/中文文件名/空格路径）
- [ ] 文件树支持展开折叠、类型图标（📄/🧠/📁）、当前文件高亮、名称过滤
- [ ] 右键可新建 md/smm、重命名、移到回收站、在系统中打开、复制路径
- [ ] 外部新增/修改/删除文件后 1.5s 内在树中反映
- [ ] 关闭应用重开，工作区与上次打开的 Tab 恢复

**Markdown 编辑器**

- [ ] 所见即所得：`# ` → 标题、`**` → 粗体、表格、任务列表、引用、代码块（按语言着色）
- [ ] 自动保存（1.2s 防抖）+ `Ctrl+S` 立即保存；`●` 脏标记正确
- [ ] 粘贴图片落到 `assets/` 并插入相对路径，渲染为图片
- [ ] 大纲面板列出标题层级，点击定位并高亮
- [ ] 数学公式 `$...$` / `$$...$$`（**若 P6 降级则标注为【二期】**）

**调用（三种入口）**

- [ ] md 中 `[x](./a.smm)` 点击可跳转打开导图（含 `.km/.xmind` 走导入）
- [ ] md 中 `![](./a.smm)` 内嵌渲染只读导图，点击可打开可编辑版
- [ ] 导图节点 `link` 可跳转到 md 指定锚点（中文锚点可用）
- [ ] 链接失效时给出「创建文件 / 忽略 / 修改链接」提示，不崩溃

**章节引用（核心）**

- [ ] 备注面板可「引用文档章节」，选择后显示章节内容并可原地编辑
- [ ] 编辑后 md 文件对应章节同步更新，**标题行不被改动**
- [ ] 只有内容真变才递增 rev；空保存不写盘
- [ ] 两处同时编辑触发乐观锁 → 冲突弹窗；选「保留我的并覆盖」后 `.mindlink/history/` 有快照
- [ ] 冲突四分支（覆盖/用最新/手动合并/取消）行为与 §7.7 一致
- [ ] 章节被删 / 标题被改 / 文件被删 / 文件重命名 / 重名歧义 五种情况均有正确提示且不崩溃
- [ ] 引用信息存储于 `data._mindlink`；`note` 内不含机器元数据
- [ ] legacy `<!-- ref:… -->`（若存在）可只读识别并一键升级
- [ ] **【v1.4，F2】失效恢复**：`missing` 态显示 `cachedContent` 兜底内容；`[转为纯文本]` 写入备注并删引用（需 `$confirm`）；`[重新选择章节]` 打开 Picker 时自动预选最接近候选
- [ ] **【v1.4，F3】刷新语义**：「刷新（本引用）」写 .smm 校准本节点 baseHash（scope='section'）；「刷新全部引用」校准当前 .smm（scope='smm'）；命令 `app.refreshRefSnapshots` 校准工作区（scope='workspace'）；刷新后重开不再假 stale
- [ ] **【v1.4，F1】改名场景**：只改标题（行区间重叠）→ id 复用、`rebound:false`、提交成功；仅"id 丢失但 path 唯一命中"才 `rebound:true`
- [ ] **【v1.4，F6】** 节点可同时有 `link`（跳转）与 `_mindlink.refs`（内容）；RefBlock 在 `node.link` 指向同章节时显示「跳转到 link」
- [ ] **【v1.4，F-边界#4】整文件引用**：不选具体章节生成 `sectionId:null`，RefBlock 渲染整文件且可编辑
- [ ] **【v1.4，F20】反链面板（提升为 MVP）**：数据层 `findBacklinks` 已有，UI 提供"谁引用了我"视图（需求文档 F20），与引用功能配套
- [ ] **【v1.4，G1】禅模式**：`F11` 进入/退出沉浸模式，隐藏 FileTabs/工具栏/状态栏，鼠标移边临时浮现
- [ ] **【v1.4，G2/F4】引用块视觉**：黄色警告条"编辑=改 md"、专用紫边区分、显示"被 N 处引用"计数
- [ ] **【v1.4，G3/F4】冲突弹窗**：diff 高亮 + 影响范围行 + 撤销提示 + 按钮副标题 + 手动合并独立设计
- [ ] **【v1.4，G5/G6/G7】** 响应式三档自动折叠、状态栏分组可折叠、引用块专用色（浅/深）对比度达标

**搜索 / 命令 / 主题 / 工程**

- [ ] 文件名搜索与工作区全文搜索（覆盖 md 正文、smm 节点文字与备注）
- [ ] 工具栏按钮与快捷键触发同一命令（`commandBus`）；`Ctrl+Z/S/B` 行为按上下文正确
- [ ] 浅色/深色/跟随系统三主题下新组件均可读，毛玻璃不丢
- [ ] `cd web && node --test` 全绿（既有 133 **零回归** + 本轮新增 ≥ 227 ⇒ 全量 ≈ 360 用例）；`cd electron-app && node --test` 全绿
- [ ] `bash build_now.sh` EXIT 0，安装包可安装并运行，构建指纹一致
- [ ] 使用说明文档（如何打开工作区、如何引用章节）已写入 README 或独立文档

**架构规约（v1.1 新增，§16 可机检项）**

- [ ] `node scripts/check-arch.mjs` EXIT 0：**分层 import 矩阵全过、依赖图 0 环**
- [ ] `refService` 导出表中**不含** `commitRef`（提交入口唯一）
- [ ] `services/io/*` 之外的任何 `web/src/**` 代码**不出现** `window.smmApi` 直接调用
- [ ] 所有 `services/**` emit 的事件名都能在 `events.js` 找到声明；`section:updated` 载荷**无 `source`**
- [ ] `components/**` 内**不存在** `$bus.$emit('execCommand'`
- [ ] `services/state/*` 与 L1 模块**不 import** `vue` / `.vue` / `@/store` / `@/router`
- [ ] `workbookState` 的持久化结构里**没有** `content` 字段（文档内容只在 `documentStore`）
- [ ] **零 mock 指标（自动验收，不再手工数）**：`node scripts/check-arch.mjs` 的第 10 类断言通过 —— ① `pure/` 用例 ≥ 160；② `pure/` 占本轮新增（分母定义见 §11.2）≥ 70%；③ `web/tests/pure/**` 源码**不含** `mock` / `jsdom` / `sinon` / `jest.fn` 字样；④ 四层合计 ≥ 227。**不依赖任何手工统计**（v1.3-C6：旧写法 `grep -c … == 0` 是错的 —— `grep` 未匹配时返回 1，`== 0` 恒假；正确写法是 `! grep -rqE` 或直接由脚本读文件判断）
- [ ] **`refService.syncRefSnapshots` 生效**：提交某章节后，引用它的 `.smm` 节点 `_mindlink.refs[].baseHash/baseRev` 已更新，重新打开该 `.smm` **不出现假 `stale`**；引用数 > 10 时**前 10 立即写 + 其余标 `snapshotPending`**，打开该 `.smm` 时自动校准（`calibratePendingSnapshots`）并清标记；命令 `app.refreshRefSnapshots` 可一次性全量校准（C3）
- [ ] **`rebind` 语义**（C1/C2）：只改名不改内容 → 提交成功且 `res.data.rebound === true`（UI 提示"已自动重绑"）；**改名 + 改内容 → 报 `E_CONFLICT_stale`**（不得静默覆盖）
- [ ] **冲突结果字段**（C11）：`res.error.code` 以 `E_CONFLICT_` 开头 **且** `res.error.kind ∈ {stale,missing,ambiguous,file-missing}`；`suggestedAction` 对 `ambiguous` 为 `pickFromCandidates`
- [ ] **工厂内无 `this`**：`check-arch.mjs` 的 `this\.` 断言通过；`const { open } = workspaceService; open(p)` 解构调用**不报错**（A1 回归）
- [ ] **`commitEdit` 自动重绑后仍成功**（A11 回归）：删掉章节正文使 id 失效→按 path 唯一命中→提交成功，**不抛 TypeError**
- [ ] 组合根 `services/index.js` **不导出** io 层；`createAppServices()` 两次实例互不串味（B6）
- [ ] `TODO(退场条件:` 数量**不增加**（`.arch-todo-snapshot.json` 比对，B5）
- [ ] `localStorage` 只出现在 `logger.js` 与 `mdDocument.js`（L0/L4），`services/state/*` 与 L1 中不存在（A6/B1）
- [ ] 关键路径有结构化日志（打开工作区 / 索引重建 / commitEdit / 冲突解决 / 写盘重试），可用「导出诊断日志」拿到
- [ ] 索引重建：并发调用只跑一次（single-flight）；中断后旧索引仍可用；坏索引被备份为 `*.bad-*` 而非删除

---

## 十五、附录

### 附录 A · 实测证据（本设计决策的依据）

> 探针脚本（已入库，可重放）：
> - `.workbuddy/tools/toastui-jsdom-repro.js` —— jsdom 复现备注编辑器（markRaw 问题）
> - `.workbuddy/tools/toastui-note-ref-probe.js` —— **本次新增**，验证引用元数据载体
> - `.workbuddy/tools/prosemirror-vue-proxy-test.js` —— Vue3 代理破坏 ProseMirror 身份比较
>
> 运行方式（jsdom 隔离安装，勿污染工程依赖）：
> ```bash
> mkdir -p "$HOME/.workbuddy/binaries/node/workspace" && cd "$HOME/.workbuddy/binaries/node/workspace"
> NODE_OPTIONS= npm i jsdom --no-audit --no-fund
> cd <repo>/.workbuddy/tools
> NODE_PATH="$HOME/.workbuddy/binaries/node/workspace/node_modules" node toastui-note-ref-probe.js
> ```

**A-1 章节行号（markdown-it 13.0.2）**

```
输入: '# H1\n\ntext\n\n## H2\n\n```js\n# not a heading\n```\n\n### H3\n'
heading_open h1 map=[0,1]
heading_open h2 map=[4,5]
fence        code map=[6,9]  lang=js      ← 围栏内 "# not a heading" 未被误判
heading_open h3 map=[10,11]
```

**A-2 块级 HTML 注释：往返无损，但**在 WYSIWYG 中可见****

```
A. 仅注释            → ✅ 无损
B. 文字 + 注释       → ✅ 无损
C. 标题 + 引用块 + 注释 → ✅ 无损
DOM: <p>用户文字</p>
     <div data-html-comment="true">&lt;!-- ref:{"file":"docs/requirements.md",... --&gt;</div>
     ↑ 转义后的 JSON 会**显示给用户**
```

**A-3 行内 HTML 注释：直接抛异常**

```
E. '前文<!-- ref:{...} -->后文'
   TypeError: Cannot read properties of null (reading '1')
   at htmlInline (toastui-editor.js:22063 附近)
       var matched = html.match(reHTMLTag);   // 注释不匹配 reHTMLTag → null
       var openTagName = matched[1];          // ← 抛错
```

**A-4 simple-mind-map 自定义字段必须 `_` 前缀**

```
// src/utils/index.js:812
export const checkIsNodeStyleDataKey = key => {
  if (/^_/.test(key)) return false                    // 用户自定义字段
  if (!nodeDataNoStylePropList.includes(key)) return true   // 否则当样式字段
  return false
}
// src/core/render/Render.js:1135  _handleRemoveCustomStyles() → delete 所有"样式字段"
// src/core/render/Render.js:1980  setNodeData() → node.nodeData.data[key] = data[key]（任意键可存）
// src/utils/index.js:187          copyNodeTree() → tree.data = simpleDeepClone(rootData.data)（data 内键全量保留）
```

**A-5 其它确认过的事实**

| 事实 | 来源 |
|---|---|
| 节点超链接点击钩子 `customHyperlinkJump(link, node)`，工程未配置 | `simple-mind-map/src/core/render/node/nodeCreateContents.js:330-340` |
| `node.setData({...})` → `SET_NODE_DATA` → `Render.setNodeData` 合并键 | `nodeCommandWraps.js:2`、`Render.js:1980` |
| 本工程 `.smm` 为多 sheet 容器 | `web/src/api/index.js#getSheetsContainer/isSheetsFile` |
| 备注粘贴守卫（`closest('.nodeNoteDialog')`）已编译进 bundle，`build_now.sh` 有断言 | `build_now.sh [2/5]` |
| `app.asar` 拷贝清单不含 `node_modules` | `build_now.sh [5/5]` `cp package.json main.js preload.js …` |
| Toast UI 实例必须 `markRaw`，否则 `RangeError: Applying a mismatched transaction` | v2.0.1 修复记录 + `tests/regression/note-editor-reactivity.test.mjs` |
| `@toast-ui/editor@3.2.2`、`prismjs@1.29.0`、`katex@0.16.9`、`simple-mind-map@0.14.0-fix.3` 已在依赖 | `web/package.json` |
| 前端测试基线 133/133 | 2026-09-20 实跑 `cd web && node --test` |

### 附录 B · 与需求文档的逐条差异对照

| 需求文档 | 本文 | 原因 |
|---|---|---|
| §3 Tauri2 / Vite / Pinia / Milkdown / chokidar | Electron / Vue CLI5 / Vuex / Toast UI / `fs.watch` | 既有工程与 asar 打包约束（D1、D2、D5） |
| §5.2 `.smm` 支持 `.km/.xmind` 作为"类型" | 归为 `mindmap-import`，走既有 `Import.vue` 流 | 现有导入已实现，无需重写 |
| §5.3 `note` 存 `<!-- ref:… -->`（方案 A） | `data._mindlink`（不写 note） | A-2/A-3/A-4 三条实测 |
| §5.4 `.mindlink/history/` 仅冲突时快照 | **每次覆盖写前**都快照 | 成本极低，可回滚价值高 |
| §6.7.3 用 `remark/unified` | `markdown-it`（显式加依赖） | remark 未安装；markdown-it 已在树中 |
| §6.7.8 冲突靠 `rev` | `contentHash` 为主、`rev` 为辅 | 索引可丢可重建，hash 更可靠 |
| §7 顶栏 + 240px 固定侧栏 | 保留 FileTabs 生态 + 停靠/浮动双模式侧栏 | 不推翻现有布局（R11） |
| §11.9 `.mindlink` 建议提交 | 默认 `.gitignore`，**并**在 `meta.json` 记 hash 便于重建 | 避免索引冲突（多人/多机） |
| §12 验收清单 | §14（补齐工程项：中文路径、测试、构建指纹） | 结合本项目实际 |

### 附录 C · 术语对照

| 术语 | 含义 | 本项目落点 |
|---|---|---|
| Workspace | 用户打开的一个根文件夹 | `workspaceService.root` |
| Section | md 中一个标题及其内容 | `Section`（§6.4） |
| SectionRef / 引用块 | 导图备注中对某章节的引用视图 | `data._mindlink.refs[]` + `RefBlock.vue` |
| baseHash / currentHash | 引用读到的 / 当前的章节内容哈希 | `sha1:` 前 12 位 |
| baseRev / current.rev | 引用读到的 / 当前的章节版本号 | `.mindlink/sections.json` |
| SSOT | 内容唯一真相源 = Markdown 文件 | `replaceSectionInText` 只改 md |
| commitEdit | 引用提交入口 | `revisionService.commitEdit` |
| handleConflict | 冲突处理入口 | `revisionService.resolveConflict` |
| .smm | 思绪思维导图 JSON（多 sheet 容器） | `smmCodec` |
| FileRouter | 统一文件打开/跳转/嵌入路由 | `services/fileRouter.js` |
| CommandBus | 工具栏/快捷键统一命令总线 | `services/commandBus.js` |
| 调用 | 文件树/md/导图三者互相打开、跳转、渲染 | §7.4 三种入口 |
| 回声抑制 | 丢弃"自己保存"触发的文件监听事件 | §7.8 |

---

### 附：本文未覆盖但需在实现时决定的点（待评审）

1. **引用块的编辑器形态**（textarea+预览 vs 内联 Toast UI）——§7.14 已给 MVP 决策，建议首个里程碑后按实测调整。
2. **KaTeX 公式是否进入 MVP**——取决于 P6 的 1.5 人天预算（R13）。
3. **`.mindlink` 是否默认加入 `.gitignore`**——建议加，并在打开工作区时提示"索引可由文件重建"。
4. **md 编辑器二期是否切 Milkdown**——M3 里程碑后按体验差距评估（`MILKDOWN_ASSESSMENT.md` 已给 8–12 人天口径）；§7.10.0 的 composable 拆分已为该切换预留唯一改动点（`useToastUi` → `useMilkdown`）。
5. **多工作区（同时打开两个文件夹）**——本文按单工作区设计；**v1.1 的 Context + 工厂注入已为该场景铺路**：多工作区 = 多套 `ctx`，服务无感（§16.2）。
6. **🆕 `check-arch.mjs` 的严格度**（v1.1 新增）——是"告警不阻断"还是"阻断构建"？建议**阻断**（否则规则会腐化），但需在 P0 就接受"初期会有较多红"的代价。
7. **🆕 是否把 `services/events.js` 升级为带 schema 校验的运行时断言**（v1.1 新增）——MVP 建议只做**声明 + 守卫测试**（零运行时开销）；若后期事件数量超过 25 个，再考虑加开发期 schema 断言。

---

# §16 分层与依赖规约（v1.1 新增）

> **性质**：**规约性章节**，对 §1–§14 有约束力。凡 §7 的接口签名与本节约束冲突，**以本节为准**。
> **目的**：把"低耦合"从**口头约定**变成**可机检的机制**，避免 §16.0 列出的 3 类腐化。

## 16.0 要防的三件事（来自本次评审）

| # | 腐化形态 | 后果 | 对策 |
|---|---|---|---|
| 1 | **服务层变成"互相调用的模块单例"** | 单测必须先初始化一片世界；多工作区/多实例不可能；改一处波及全局 | §16.1 分层（L0–L4 + CG） + §16.2 Context 与工厂注入 |
| 2 | **依赖图从"树"退化成"网"** | 隐式循环；无法单独加载任一模块做测试 | §16.3 单向 DAG + §16.4 环检测 |
| 3 | **事件总线成为隐形耦合网** | 一个事件的消费者链要靠全仓库 grep；业务策略塞进事件载荷 | §16.7 事件规约（集中声明 + 载荷语义纯化 + **L3 不 emit**） |

## 16.1 分层模型（L0–L4 + 组合根）

> **v1.2 变更（A3 / A13 / B1 / A14-1）**：v1.1 的「L5 横切」把两类性质完全不同的模块混在一起：
> ① `events/logger/context` 是**零依赖**的（谁都能 import，自己谁都不 import）；② `index.js`（组合根）恰恰相反，它**必须 import 全部**。
> 混装导致两个后果：**其一**，L3 的 `workspaceIndex` 要广播 `index:rebuilding` 就得 import "L5"，而 §16.1 的 L3 允许清单里没有它 → **实质分层矛盾**；
> **其二**，L5 声明"允许 import 全部"，被 `events.js` 这类纯声明模块继承，规则形同虚设。
> 现拆为 **L0 基础层（零依赖）** 与 **CG 组合根（允许全部）**；`errors.js` 因其全是**纯值构造**（`ok/fail/err/appError`，零副作用）归入 **L1**，以符合"L1 = 纯函数"的定义。
> 同时补齐 v1.1 漏掉的 **“L3 允许同层 L3”**（`fsApi → suppressionRegistry`、`fsWatchClient → fsApi` 都是同层引用，A14-1）。

| 层 | 目录 | 职责 | 允许 import | 禁止 import | 可测性 |
|---|---|---|---|---|---|
| **L0 基础** | `services/{events,logger,context}.js` | 事件常量与总线、日志、Context 工厂 —— **零依赖、零业务**（可有内部状态，但**不 import 任何模块**） | 内置（**`logger.js` 额外允许 `localStorage`**，见 §16.6） | 任何服务、`vue`、`.vue`、store、router | 零 mock |
| **L1 纯函数** | `services/*.js`（除 L0/L2–L4）—— **含 `errors.js`** | 解析/写回/解析链接/编解码/命令表/策略/错误构造 —— **输入输出皆值** | 内置、`markdown-it`、同层 L1（含 `errors.js`） | **任何服务（含 L0）**、`vue`、`.vue`、store、router、**`window` / `localStorage` 全局** | **零 mock** `node --test` |
| **L2 状态** | `services/state/*` | 只持内存状态（`root/tree/indexCache`、`documents`）；**不持久化** | 内置、L0、L1 | **任何服务（含 L3/L4）**、`vue`、`localStorage` | 零 mock |
| **L3 IO** | `services/io/*` | 只封 IPC，不懂业务；含路径守卫、错误归一、**抑制登记**；进度经 `onProgress` 上抛 | 内置、**L0**、L1、**同层 L3**、`window.smmApi` | L4 服务、`vue`、`.vue` | 注入 fake `window.smmApi` |
| **L4 编排** | `services/*.js`（顶层） | **唯一可以互相调用的一层**；编排 L0–L3；**工厂闭包注入，禁 `this`** | 内置、L0、L1、L2、L3、`ctx` 注入 | 视图、`vue`、`.vue` | 注入 fake `{io, stores, events}` |
| **CG 组合根** | `services/index.js`、`migrations/**` | 装配依赖、导出默认单例；迁移器注册与执行 | **全部（L0–L4）** | 视图、业务分支 | 视内容（组合根有专测） |
| **视图** | `components/`、`composables/`、`pages/` | 渲染与交互 | `@/services`（组合根）、`@/services/<L0\|L1>`、`vue`、element-plus | **`services/io/*`（含动态 `import()`）**、`window.smmApi` 直调 | 源码守卫 |

**三条判据**：
1. **L1 是测试主战场**：把 70% 以上的业务规则写进 L1。若某个规则"必须访问 IO 才能表达"，说明它其实包含两部分 —— 纯判定（放 L1）+ 取数（放 L4）。
2. **L0 是"零依赖"层**：新加一个横切模块时，先问"它 import 别的东西吗？"——**若 import 任何服务，它就不是 L0**，应归 L4/CG。
3. **CG 只装配**：`index.js` 内不得出现 `if/switch` 与业务计算（`check-arch.mjs` 断言，R16）。

> **"零依赖"的精确定义（v1.3 补充 —— 响应 C9）**：L0 的"零依赖"指**不 import 任何服务模块**，**不排除浏览器内置全局**。
> `localStorage` 与 `window`、`crypto`、`structuredClone` 同级 —— 属运行时内置 API，不经 IPC、不受 `fsApi` 管辖，因此**不构成服务依赖**，`logger.js` 允许访问。
> 但必须满足两条：① **可用性检测**（`try { localStorage.setItem(k,'1') } catch {}` 判定是否可用 —— 隐私模式/配额满/测试环境都会抛）；② **不可用时降级为纯内存环形缓冲**（`pure/logger.test.mjs` 第 ⑥ 条专测此路径）。
> 相应地，`check-arch.mjs` 的断言 ③ 只对 **L1/L2** 禁 `localStorage`，**不对 L0 禁** —— 否则脚本会把 `logger.js` 自己拦下来。

## 16.2 Context 与工厂注入（替代模块级可变单例）

**问题（P2）**：v1.0 用 `export const workspaceService = { root, ... }`、`export const refService = {...}`。后果：状态散落、无法多实例、单测必须先初始化一片世界、`Ctrl+Z` 跨"md + 引用 + 导图"无法原子回滚。

**方案：组合根 + 工厂 + 默认单例**（兼顾"机制正确"与"视图少改代码"）

```js
// 🆕 web/src/services/context.js —— L0
export function createWorkspaceContext({ root = null, indexes = {} } = {}) {
  // ⚠️ v1.2：同样禁用 `this`（与 §7.3-A1 同一规约）——内部用闭包变量
  let _root = root, _tree = null
  const indexCache = indexes
  return {
    get root() { return _root },
    set root(v) { _root = v },
    get tree() { return _tree },
    set tree(v) { _tree = v },
    get indexCache() { return indexCache },
    abs(rel) { /* 路径换算只此一处 */ },
    rel(absPath) { /* ... */ },
    isInside(p) { /* ... */ }
  }
}

export function createDocumentContext({ path, kind }) {
  // 闭包状态：**脏标记唯一入口**（不暴露可变字段，只暴露方法）
  let _content = '', _saved = '', _rev = 0, _dirty = false
  return {
    path, kind,
    get content() { return _content },
    set content(v) { _dirty = (v !== _saved); _content = v },   // 唯一写入口
    get rev() { return _rev },
    isDirty() { return _dirty },
    markSaved() { _saved = _content; _dirty = false },
    /** 会话持久化由 L4 mdDocument 调用（§6.6/A6）；本层不碰 localStorage */
    serialize() { return { content: _content, saved: _saved, rev: _rev } },
    hydrate(json) { _content = json.content ?? ''; _saved = json.saved ?? ''; _rev = json.rev ?? 0; _dirty = _content !== _saved }
  }
}
```

```js
// 🆕 web/src/services/index.js —— 组合根（**只做装配，零业务逻辑**）
import { createWorkspaceContext, createDocumentContext } from './context'          // L0
import { createEventBus } from './events'                                          // L0
import { log } from './logger'                                                     // L0
import * as io from './io'                                                         // L3
import { createWorkspaceStore } from './state/workspaceStore'                      // L2
import { createDocumentStore } from './state/documentStore'                        // L2
import { createWorkspaceService } from './workspaceService'                        // L4
import { createSectionService }  from './sectionService'
import { createRefService }      from './refService'
import { createRevisionService } from './revisionService'
import { createFileRouter }      from './fileRouter'
import { createMdDocument }      from './mdDocument'
import { createCommandBus }      from './commandBus'
import { createWorkspaceSearch } from './workspaceSearch'     // 【v1.2 补，B8：v1.1 漏装配】

export function createAppServices({ workspaceRoot = null, overrides = {} } = {}) {
  const stores  = {
    workspace: overrides.stores?.workspace || createWorkspaceStore({ root: workspaceRoot }),
    documents: overrides.stores?.documents || createDocumentStore()
  }
  const events  = overrides.events || createEventBus(log)          // 测试可注入 spy
  const ioLayer = overrides.io     || io                           // 测试可注入 fake
  const ctx     = { io: ioLayer, stores, events, log, services: {} }

  // ⚠️ 装配顺序即依赖方向：被依赖者先建
  ctx.services.workspaceService = createWorkspaceService(ctx)
  ctx.services.sectionService   = createSectionService(ctx)
  ctx.services.refService       = createRefService(ctx)
  ctx.services.revisionService  = createRevisionService(ctx)
  ctx.services.fileRouter       = createFileRouter(ctx)
  ctx.services.mdDocument       = createMdDocument(ctx)
  ctx.services.commandBus       = createCommandBus(ctx)
  ctx.services.workspaceSearch  = createWorkspaceSearch(ctx)
  return ctx
}

/** 默认单例：视图层继续 `import { refService } from '@/services'`，**零改动** */
let _default = null
export function appServices() { return _default || (_default = createAppServices()) }
export function resetAppServices(opts) { _default = createAppServices(opts); return _default }  // 测试/换工作区

/**
 * Proxy 便捷入口（生产用）。
 * 【v1.2 补齐 trap，A7】只写 get 会让 `'undo' in refService` / `Object.keys(refService)` /
 * `refService instanceof X` 全部返回 undefined/空 —— 调试期极难发现。故补齐 4 个 trap。
 */
function bindProxy(name) {
  return new Proxy({}, {
    get: (_, k) => appServices().services[name][k],
    has: (_, k) => k in appServices().services[name],
    ownKeys: () => Reflect.ownKeys(appServices().services[name]),
    getOwnPropertyDescriptor: (_, k) =>
      Reflect.getOwnPropertyDescriptor(appServices().services[name], k)
  })
}
export const workspaceService = bindProxy('workspaceService')
export const refService       = bindProxy('refService')
export const revisionService  = bindProxy('revisionService')
export const fileRouter       = bindProxy('fileRouter')
export const mdDocument       = bindProxy('mdDocument')
export const commandBus       = bindProxy('commandBus')
export const workspaceSearch  = bindProxy('workspaceSearch')
// Proxy 让"单例"在运行时仍指向当前 ctx，换工作区/重测无需改视图
```

**`overrides` 契约（v1.3 新增 —— 响应 C4）**

v1.2 只写"测试可注入 fake"，但**没说 fake 要覆盖多大面** —— 实现者会卡在"fakeIo 到底要几个方法"。现给出**最小契约**：只实现被测服务**真正调用**的方法即可，其余方法不必存在（缺方法即报错，反而能暴露意外的依赖）。

| override | 必须提供 | 不必提供 | 说明 |
|---|---|---|---|
| `overrides.io` | 被测服务用到的**方法级子集**（如下例只给 `fsApi` + `workspaceIndex` + `suppression`） | 未被调用的模块（如 `fsWatchClient`） | **不是**整体替换 `* as io` 的完整形状；缺失即 `TypeError`，这是特性不是缺陷 |
| `overrides.io.fsApi` | `readText / writeText / stat / move / openExternal / readTree / watch`**中该用例用到的** | 其余 | 返回值必须是 `Result` 形状（`{ok:true,data}` / `{ok:false,error}`），**不得抛异常**（对齐 §16.5） |
| `overrides.io.workspaceIndex` | `read / write / updateSection / init / rebuild`（用到的） | — | `rebuild` 必须接受 `onProgress` 并回调至少一次（否则 §6.3.1-3 的进度链无法验证） |
| `overrides.stores.workspace` | `{ root, tree }` 可读写 + `abs/rel/isInside`（若被测服务调用） | 内部方法 | 最省事的做法：直接 `createWorkspaceStore({root})` 真品，不用手写 fake |
| `overrides.stores.documents` | 同上，直接 `createDocumentStore()` 真品即可 | — | L2 是纯内存、零 IO，**没有理由 fake 它** |
| `overrides.events` | `emit`（被断言调用次数时用 `spy`）+ `on/off` | — | 最小 spy：`{ emit: (n,p)=>calls.push([n,p]), on: ()=>()=>{}, off: ()=>{} }` |

```js
// 🆕 web/tests/orchestration/_fakes.mjs —— 单测共享的最小 fake（v1.3 示例）
export function createFakeIo({ files = {} } = {}) {
  const calls = []
  return {
    calls,
    fsApi: {
      readText: async p => files[p] !== undefined
        ? ok({ content: files[p], mtimeMs: 1 })
        : fail(err('E_NOT_FOUND', { path: p })),
      writeText: async (p, c) => { calls.push(['writeText', p]); files[p] = c; return ok({ mtimeMs: Date.now() }) },
      stat: async p => ok({ exists: files[p] !== undefined, isDir: false, mtimeMs: 1, size: (files[p] || '').length }),
      move: async () => ok(null),
      openExternal: async () => ok(null),
      readTree: async () => ok({ name: 'ws', children: [] }),
      watch: async () => ok(null)
    },
    workspaceIndex: {
      read: async () => ok({ v: 1, files: {} }),
      write: async () => ok(null),
      updateSection: async (f, s) => { calls.push(['updateSection', f, s.sectionId ?? s.id]); return ok(null) },
      updateRefEntries: async (e, patch) => { calls.push(['updateRefEntries', e.length, patch]); return ok(null) },
      init: async () => ok(null),
      rebuild: async ({ onProgress } = {}) => {
        onProgress?.({ phase: 'scan', scanned: 0, total: 0 })
        return ok({ mode: 'full', scanned: 0, files: 0, refs: 0, ms: 1 })
      }
    },
    suppression: { register: () => {}, hit: async () => false, clear: () => {} }
  }
}

// 用法（revisionService 的提交链路，零真实 FS）
const fake = createFakeIo({ files: { '/ws/docs/a.md': '# H\n正文' } })   // ⚠️ 用 /ws 前缀，勿用 E:/（跨平台）
const ctx  = createAppServices({ workspaceRoot: '/ws', overrides: { io: fake } })
await ctx.services.revisionService.commitEdit(refCtx, '新正文')
assert.equal(fake.calls.filter(c => c[0] === 'writeText').length, 1)      // 只写一次盘
```

**`fakeIo` 的三条纪律**：① 返回值**一律是 `Result`**，与真品同形；② **禁止**为了让用例通过而放宽断言（如 `hit()` 恒 `false` 掩盖了回声抑制）；③ 需要"失败注入"时用**工厂参数**（`createFakeIo({ failOn:'writeText' })`），不要在每个用例里改 fake 本体。

**四点硬规约（v1.2 补强）**：

| # | 规约 | 后果 / 强制 |
|---|---|---|
| 1 | **工厂内部一律用闭包，禁用 `this`**（A1） | 工厂返回对象字面量，调用方解构 `const { open } = svc` 后 `this` 即 `undefined`。`check-arch.mjs` 对 L4 断言 `/\bthis\./` |
| 2 | **业务方法签名不得出现 `ctx`**（B4） | `ctx` 只在工厂参数出现一次，由闭包捕获。若写成 `commitEdit(ctx, refCtx, content)` 就退回 v1.0 的参数灾难 |
| 3 | **组合根不得再导出 io 层**（B3） | 否则视图可 `import { fsApi } from '@/services'` 绕过边界；`check-arch.mjs` 断言 |
| 4 | **测试禁止 import Proxy**（A7） | `resetAppServices()` 之后，**旧的 Proxy 引用仍活着并指向新 ctx**——若上个用例的组件在 `beforeUnmount` 里调用旧引用，就会操作到新 ctx（跨用例串味的隐患，R29 只覆盖了"未 reset"，未覆盖"reset 后旧引用仍活"）。**测试必须 `createAppServices()` 拿独立实例**。`pure/compositionRoot.test.mjs` 专门断言这两点 |

**三点收益**：
1. **单测**：`createAppServices({ overrides: { io: fakeIo, events: spyBus } })` ⇒ 不碰真实文件系统。
2. **多工作区**：`createAppServices({ workspaceRoot: '/other' })` ⇒ 服务代码**无感**（`ctx.stores.workspace.root`）。
3. **换工作区/重测**：`resetAppServices()` 一行清场，避免 v1.0 里"模块级变量残留"的隐性串味。

**轻量上下文传递**：`ctx` 是**唯一**的函数间"环境"，不是把 `ctx` 塞进每个函数签名。服务内部用闭包持有 `ctx`（`createXxxService(ctx)` 已把依赖捕获），业务方法签名保持 `(file, sectionId, ...)` 这样的**领域参数**，不出现 `ctx` —— 这是"薄编排"的关键，避免参数灾难。

## 16.3 依赖方向（单向 DAG）

```
视图 ──▶ services/index.js（CG 组合根）
            ├─▶ L4 fileRouter ──▶ L4 revisionService ──▶ L4 refService ──▶ L4 sectionService ──┐
            │                       │                          │                              │
            │                       └──────────────────────────┴──────────▶ L0/L1/L2/L3 ◀───────┘
            └─▶ L4 commandBus · mdDocument · workspaceSearch · workspaceService ──▶ L0/L1/L2/L3
L1 ⇄ L1（同层可互引，必须无环）      L3 ⇄ L3（同层可互引：fsApi ↔ suppressionRegistry）
L0 events/logger/context（零依赖，被所有层 import，自身不 import 任何服务）
L1 含 errors.js（纯值构造，按"输入输出皆值"归 L1，非 L0）
CG services/index.js · migrations/（唯一允许 import 全部）
```

**允许的跨层方向**：视图 → CG/L0/L1；CG → 全部；L4 → L4（**仅限上图箭头方向**）/L3/L2/L1/L0；L3 → L3/L1/L0；L2 → L1/L0；L1 → L1；L0 → 仅内置。
**禁止**：任何 L1/L2/L3 → L4；L1 → L0 之外的任何服务；**任何环**（含 L1/L3 同层内环）。

## 16.4 机制化强制：`scripts/check-arch.mjs`

（完整伪码见 §11.3.2。接入 `npm test` 与 `build_now.sh` **双点阻断**。）

**断言清单（10 类，v1.3 扩充）**：

| # | 断言 | 拦住的腐化 |
|---|---|---|
| 1 | 分层 import 白名单（L0–L4/CG/视图） | 视图直连 IO、L1 import 服务、L3 import L4 |
| 2 | 依赖边收集（**含 L1/L3 同层边**）+ DFS 三色环检测 | `refService ⇄ revisionService` 类回潮、L1 内环 |
| 3 | L1/L2 不得引用 `window` / `localStorage` 全局 | v1.1 表述错误导致的漏检 |
| 4 | L0–L4 业务方法签名不得出现 `ctx` | 退回"每个方法传 ctx"的参数灾难 |
| 5 | **L4 工厂内不得出现 `this.`** | A1 的解构崩溃 |
| 6 | 视图不得（静态/动态）import `services/io/*`，不得直调 `window.smmApi` | 边界穿透 |
| 7 | 组合根不得导出 io 层、不得含 `if/switch` | 组合根变新上帝模块（R16） |
| 8 | `TODO(退场条件:` 计数只减不增（快照对比） | 临时实现永久化（§17.1） |
| 9 | 事件名必须在 `events.js` 声明（由 `regression/events-contract.test.mjs` 兜底） | 事件网蔓延（§16.7） |
| **10** | **测试预算自动校验**（v1.3 新增，C6）：`pure/` 用例 ≥ 160、占新增 ≥ 70%、`pure/` 源码无 `mock/jsdom/sinon/jest.fn`、四层合计 ≥ 227 | "零 mock"变成口号、验收时手工数字对不上（替换 §14 的两条手工勾选） |

**为什么不用 ESLint**：本工程 Vue3 升级时已移除 ESLint；为单一检查项重新引入整套工具链与 **D5/D10「不引第三方依赖」** 相悖。自研脚本**零依赖**（~200 行），且能表达"依赖图无环""TODO 只减不增"这类 ESLint 表达不了的规则。**此判断在第二轮评审中被明确肯定，不因任何惯例回退。**

## 16.5 统一错误模型（响应 M1）

v1.0 三种并存：`throw FsError{code}`（§7.1）、`throw SectionError`（§7.5）、`return {ok:false, conflict}`（§7.7）。现统一：

```js
// 🆕 web/src/services/errors.js —— L1
/** 业务结果：服务层**不抛异常**（除纯函数的编程错误） */
export const ok   = (data = null) => ({ ok: true,  data })
export const fail = (error)       => ({ ok: false, error })
/** 编程错误（调用方用错 API）→ 抛；可与 fail 互转 */
export const appError = (code, meta = {}, message) => Object.assign(new Error(message || code), { code, ...meta })
export const err = (code, meta = {}, message) => ({ code, message: message || code, recoverable: RECOVERABLE[code] ?? true, ...meta })
```

```ts
type Result<T> = { ok: true, data: T } | { ok: false, error: ErrorInfo }
interface ErrorInfo {
  code: string             // 'E_LOCKED' | 'E_SECTION_MISSING' | 'E_OUTSIDE_ROOT' | 'E_CONFLICT_*' | ...
  message?: string         // 已 i18n 的短描述（或 i18n key）
  kind?: string            // 仅冲突类：'stale'|'missing'|'ambiguous'|'file-missing'（UI 文案直接取用）
  path?: string            // 相关路径（便于 UI 显示与日志）
  recoverable: boolean     // UI 据此决定"重试"还是"仅提示"
  suggestedAction?: 'retry' | 'reload' | 'rebuildIndex' | 'pickAnotherPath' | 'pickFromCandidates' | null
}
```

| 层 | 约定 |
|---|---|
| L1 纯函数 | **可以抛**（只抛 `appError`，用于"调用方用错"）；业务判定失败**返回布尔/结构**，不是异常 |
| L3 IO | 一律返回 `Result`，**永不抛**（把 `EPERM/EBUSY/ENOENT` 映射为 §7.1 错误码） |
| L4 编排 | 一律返回 `Result`；遇下层 `fail` 直接**透传**（`if (!r.ok) return r`），不包装、不吞 |
| 视图 | 只认 `res.ok` / `res.error`，**不 catch 自定义异常类**；`error.suggestedAction` 决定给什么按钮 |

**错误码表**（§7.1 的 7 个 + 新增）：

| code | 触发 | suggestedAction |
|---|---|---|
| `E_NO_DESKTOP` / `E_NOT_FOUND` / `E_ACCESS` / `E_OUTSIDE_ROOT` / `E_EXISTS` / `E_LOCKED` / `E_IO` | 见 §7.1 | `retry` / `pickAnotherPath` |
| `E_NOT_DIR` | 选的路径不是目录 | `pickAnotherPath` |
| `E_SECTION_MISSING` / `E_WRITE_VERIFY_FAILED` | 章节不存在 / 写回自校验失败 | `reload` |
| `E_INDEX_CORRUPT` | 索引解析失败（已备份 `.bad`） | `rebuildIndex` |
| `E_UNKNOWN_STRATEGY` | 传入未知冲突策略 | null |
| `E_LINK_MISSING` | 跳转目标不存在 | `pickAnotherPath` |
| **`E_CONFLICT_stale`** | 章节在别处已被改（`contentHash !== baseHash`） | `reload` |
| **`E_CONFLICT_missing`** | 同文件内 `id` 与 `path` 都找不到该章节 | `reload` |
| **`E_CONFLICT_ambiguous`** | `id` 找不到但 `path` 命中多个（重名标题被拆/合） | `pickFromCandidates` |
| **`E_CONFLICT_file-missing`** | 源文件不存在 | `reload` |

> **【v1.3 补全，C11】** v1.2 的 `conflictResult()` 已产出 `E_CONFLICT_*`，但错误码表里没有登记 —— 属"清单完整性"缺口。上表 4 条即 `conflictResult(kind, …)` 的全部取值（`kind ∈ {stale, missing, ambiguous, file-missing}`）。
> **`error.code` 与 `error.kind` 双写**：`code = 'E_CONFLICT_' + kind`（机器判定，UI 用 `startsWith('E_CONFLICT_')`），同时单独给 `kind`（UI 文案直接取用，见 §7.14）—— 只给 `code` 会逼 UI 做字符串切片。

## 16.6 日志与可观测性（响应 M2）

v1.0 **全文没有任何日志设计**——而这是个"文件 IO + 索引 + 乐观锁 + 多进程监听"的系统，出问题**无法诊断**。

```js
// 🆕 web/src/services/logger.js —— L0，零依赖（**全工程唯一允许访问 localStorage 的服务模块**）
export const log = {
  debug/info/warn/error(ev, fields = {}) → void,   // fields: { file, sectionId, durMs, code, ... }
  child(base) → logger,                            // 固定上下文字段，如 log.child({ scope:'index' })
  export() → string,                               // 导出全文（用户可复制/落盘）
  ring(n = 300) → Entry[],                         // 最近 n 条
  clear() → void
}
```

**`localStorage` 的归属裁决（v1.2，B1）**：

| 规则 | 说明 |
|---|---|
| `localStorage` 属**浏览器内置 API**，不是 IO 层（不经 IPC、不受 `fsApi` 管辖） | 因此不需要为它引入 L3 依赖 |
| **L0 允许**（`logger.js` 的持久化） | 日志掉电不丢是刚需，且日志本身是"横切关注点" |
| **L1 禁止**（`check-arch.mjs` 断言 `/\blocalStorage\b/`） | L1 必须保持"纯函数可直测"，不能有隐式全局状态 |
| **L2 禁止**（`documentStore` 不自行持久化，见 §6.6/A6） | 状态层只持内存，持久化由 L4 `mdDocument` 承担 |
| **L4 允许**（`mdDocument` 的会话恢复） | 属"编排"职责，且需与 `documentStore` 的 `serialize/hydrate` 协作 |

**实现**：内存**环形缓冲 300 条** + `localStorage['smm.diag.log']` 持久化（避免刷新丢失，且不引第三方）；生产默认 `info`，`localStorage['smm.diag.level']='debug'` 可开 debug；**与既有 `web/src/utils/` 风格一致，不引第三方 logger**。

**必须打点的关键路径**（每条都对应一个"出错时最想看到的字段"）：

| 事件 `ev` | 字段 | 为什么 |
|---|---|---|
| `workspace.open` / `.close` | `dirPath, indexStatus, durMs, files` | 打开失败/慢的定位 |
| `index.rebuild` | `mode, scanned, files, refs, ms, aborted?` | 重建正确性与耗时（§6.3.1） |
| `index.corrupt` | `file, backupPath` | 数据损坏留痕（**不删的原则**） |
| `revision.commit` | `file, sectionId, rev, hash, durMs, noop?` | 提交链路的唯一权威记录 |
| `revision.conflict` | `file, sectionId, conflictKind, choice, strategy` | 冲突发生频率（决定是否做自动合并） |
| `revision.rebind` | `file, sectionId, from, to` | 自动重绑是否符合预期 |
| `io.write.retry` | `path, attempt, code` | Windows `EBUSY` 重试是否有效 |
| `io.write.suppress` | `path, hit` | 回声抑制是否误伤（**验证 P3 改动的关键指标**） |
| `fs.watch.event` | `rel, kind, ignored?` | 监听噪声过滤是否生效 |
| `migrate.step` | `from, to, applied, durMs, dryRun` | 迁移审计（§17.2） |
| `search.run` | `scope, files, hits, ms` | 大工作区性能 |

**UI 暴露**：「设置 → 诊断」提供「导出诊断日志」（`log.export()` → 另存为 txt）与「最近事件」。**必须**：日志中不得含文件**内容**（只含路径与计数），避免隐私泄漏。

**验收**：`pure/logger.test.mjs`（环形覆盖、字段格式化、export 格式）+ §14 的"关键路径有日志"勾选项。

## 16.7 事件规约（响应 P3）

| # | 规则 |
|---|---|
| 1 | **新增事件必须在 `services/events.js` 声明**（常量 + JSDoc 载荷类型）；`services/**` 里出现的任何 `emit('xxx')` 字面量必须能在该文件找到 |
| 2 | **载荷只表达"发生了什么"**，不表达"为什么忽略" —— 禁止 `source` / `origin` / `skipReload` 这类**消费侧策略**字段 |
| 3 | **回声抑制的唯一实现处是 `io/suppressionRegistry`**（登记由 `fsApi.writeText/writeBinary` 内部完成 + `await hit(absPath)` 查询），**不通过事件传递**；业务层不得手动 `register`（A14-3） |
| 4 | **只增不改**：既有 `$bus` 事件的语义与载荷**禁止修改**（v1.0 §2.5 原则保留） |
| 5 | **两类事件分开**：`$bus`（导图渲染/UI 事件，35 文件在用）/ `appBus`（应用业务事件，`events.js` 声明，由 `createEventBus()` 创建）。新业务事件走 `appBus` |
| 6 | 服务**不得监听自己广播的事件**做后续动作（避免隐式回路）；需要后续动作就在同一函数内顺序调用 |
| 7 | 事件数量 > 25 个时，评审是否引入开发期 schema 断言（见待评审 #7） |
| 8 | **L3 不得 `emit`**（A3）：L3 只允许 import 内置/L0/L1/同层。需要上报进度的 L3 模块（如 `workspaceIndex.rebuild`）改用 **`onProgress` 回调**，由 L4 转发为 `emit` |
| 9 | **事件名必须在 `events.js` 声明**，由 `regression/events-contract.test.mjs` 断言 `services/**` 中出现的 `emit('xxx')` 字面量均有声明（开发期 `assertDeclared` 兜底） |

## 16.8 分层自检清单（写代码时对照）

- 我要写的这段逻辑，**输入输出都是值**吗？→ 是则放 L1（默认选择）。
- 需要读/写文件？→ 取数放 L4，**判定放 L1**。
- 我在 import 别的服务吗？→ 检查方向是否在 §16.3 箭头内；**L1 不允许**（`errors.js` 除外，它在 L1 内部）。
- 我在写状态？→ 放 L2，且只暴露方法，不暴露可变字段；**持久化不在这里**（交 L4）。
- **我在工厂函数里写 `this.` 吗？→ 立刻改成闭包函数**（A1），否则调用方解构即崩。
- **我的业务方法签名里带 `ctx` 吗？→ 删掉**，`ctx` 只出现在 `createXxxService(ctx)` 一次（B4）。
- 我在发事件吗？→ 先在 `events.js` 声明；载荷里有没有"忽略"语义？有则删掉，改用 suppression。
  **我在 L3 里发事件吗？→ 不行**，改 `onProgress` 回调让 L4 发（规则 8）。
- 我在抛异常吗？→ L3/L4 **不抛**，返回 `Result`；L1 只抛 `appError`。
- 我用了 `window` / `localStorage` 吗？→ L1/L2 **不许**；只有 `logger.js`（L0）与 `mdDocument`（L4）可以。
- 这是个"临时实现"吗？→ 加 `// TODO(退场条件: …)` 并在 §17.1 登记（脚本会拦"只增不减"）。

---

# §17 演进与废弃（v1.1 新增）

> **性质**：规约性章节（同 §16）。回答两个 v1.0 没回答的问题：**① 临时实现什么时候必须换掉？② 数据/格式怎么平滑演进？**

## 17.1 临时实现与退场条件

v1.0 有几处明确的"临时妥协"，但**未写明何时必须替换**，长期保留会变成永久债务。逐条给退场条件：

| # | 临时实现 | 位置 | **退场条件（何时必须换）** | 替换方案 |
|---|---|---|---|---|
| T1 | `commandBus` → `$bus.$emit('execCommand')` 桥接 | §7.9 / D8 | `<legacy:true>` 命令数**归零**（或 P6 结束时新增代码禁止使用桥接） | 逐条迁移为 `commandBus.register` |
| T2 | 嵌入导图用 **MutationObserver 重扫 DOM** | §7.10.3 | ① Toast UI 升级到支持自定义 NodeView 的版本；② 或重扫导致可感知卡顿（>16ms/次） | 自定义 ProseMirror NodeView / Toast UI 插件渲染器 |
| T3 | 引用块用 **textarea + 预览**（非内联富文本） | §7.14 | 实测"一屏多引用块"无性能问题（R9 未触发）且用户要求富文本 | 内联 Toast UI 实例池 / 共享单实例 |
| T4 | 冲突处理**不自动合并** | §7.7 | 冲突日志（`revision.conflict`）显示 `stale` 占比 > 10% | 引入 `auto-merge3` 策略（三方合并，仍走策略表） |
| T5 | md 编辑器用 **Toast UI** 而非 Milkdown | D2 / R13 | ① Typora 级体验成为明确需求；② Milkdown 接入评估落地（8–12 人天） | 替换 `useToastUi.js` → `useMilkdown.js`（§7.10.0 已隔离改动点） |
| T6 | KaTeX 用**自写 Decoration 插件** | §7.10.4 | 公式需求升级（交叉引用/编号/矩阵）或插件维护成本超预算 | 切 `markdown-it-katex` + 官方 NodeView，或换编辑器引擎 |
| T7 | 索引为**单工作区单文件**（`sections.json`） | §6.3 | 文件数 > 3000 或单文件 > 5MB | 分片索引 + 懒加载（§6.3.1 末尾已给方向） |
| T8 | `appBus` 用 Proxy 暴露默认单例 | §16.2 | 需要**真正多工作区并发**时 | 视图显式接收 `ctx`（`useServices()` composable） |

**纪律**：每个临时实现**必须在代码里留 `// TODO(退场条件: <条件>)`**；`check-arch.mjs` 统计 `TODO(退场条件` 数量并与 `.arch-todo-snapshot.json` 比对，**只允许减少**（脚本实现见 §11.3.2 断言 ⑨，v1.2 已落地）。

## 17.2 迁移（`migrations/`，响应 M4）

v1.0 的迁移是**散点**的（§7.6.5 legacy 注释、D6 的 `kind` 默认值、`meta.json` 的 `v:1`），没有统一机制、没有 dry-run、没有备份与日志。现统一：

```
web/src/services/migrations/          ← CG 组合根层（允许 import 全部，见 §16.1）
  index.js        ← 注册表 + 执行器（唯一入口 runMigrations(ctx, { dryRun })）
  m001_index_v0_to_v1.js
  m002_mindlink_legacy_note.js
  m003_meta_schema.js
```

**执行器契约**：

```js
// 🆕 migrations/index.js
export const MIGRATIONS = [
  { id: 'm001_index_v0_to_v1',        from: 0,    to: 1,    async up(ctx, { dryRun }) { /* ... */ } },
  { id: 'm002_mindlink_legacy_note',  from: null, to: null, async up(ctx, { dryRun }) { /* 按需/用户确认式 */ } },
  { id: 'm003_meta_schema',           from: null, to: null, async up(ctx, { dryRun }) { /* 补默认字段 */ } },
]

/** 唯一入口。调用点：`workspaceService.open()` 的第 ① 步（见 §7.3）；dryRun 结果供"打开时提示即将迁移"用 */
export async function runMigrations(ctx, { dryRun = false, target = null, meta = null } = {}) → Result<{applied: string[], skipped: string[], log: string[]}>
// 【v1.3-C10】meta：可选。调用方（open()）已读过 meta.json 时传入，避免迁移器重复 IO；
//       不传则由迁移器自行 workspaceIndex.read('meta.json')（保持可独立调用、可单测）。
```

**每步必须满足 5 条**：

1. **幂等**：重复执行结果一致（靠写入后的 `v` 判断）。
2. **迁移前备份**：受影响文件复制到 `.mindlink/backup/<m-id>/<ts>/`（**不删原文件**）。
3. **迁移日志**：逐条写 `.mindlink/migrate.log`（追加，含 `from/to/durMs/dryRun`）+ `log.info('migrate.step', ...)`。
4. **`dryRun`**：只计算差异并返回将做的改动，**不写盘**（单测默认走这条，零副作用）。
5. **可失败可回滚**：单步失败 → 该步不写盘、报 `E_MIGRATE_FAILED`（含步 id），**整体降级为 `readonly-index`**；已成功的前序步骤保留（每步独立）。

**迁移清单（初期 3 条）**：

| id | 触发条件 | 做什么 |
|---|---|---|
| `m001_index_v0_to_v1` | `.mindlink/*.json` 的 `v` 缺失或 ≠ `CURRENT_INDEX_SCHEMA` | 备份 → 加 `v` 字段 → 补 `fileHash` → 或直接走 `workspaceIndex.rebuild({full:true})` |
| `m002_mindlink_legacy_note` | 节点 `note` 内含独占一行的 `<!-- ref:{...} -->` | **按需触发 + 用户确认**（§7.6.5）：迁移到 `data._mindlink` 并从 `note` 移除；迁移前写快照 |
| `m003_meta_schema` | `meta.json` 缺 `lastOpenedTabs` / `settings` | 补默认值（向后兼容的字段填充） |

**触发时机**：`workspaceService.open()` 内、**读索引之后、决定"新建 / 只读降级"之前**（伪码见 §7.3 的 ①/② 两步，v1.2 已把该调用补进 `open()`）；`dryRun` 结果供"打开工作区时提示即将迁移"使用。**迁移失败不阻断打开**，仅降级为 `readonly-index`（异常矩阵 §10-27）。

**测试**：`orchestration/migrations.test.mjs` ① 幂等 ② dryRun 零写入 ③ 单步失败不污染后续 ④ 备份文件存在且内容一致 ⑤ 日志追加（≥6 用例）。

## 17.3 兼容性策略（三层）

| 层 | 策略 | 例 |
|---|---|---|
| **数据（文件）** | **向后兼容读，向前谨慎写**：读时容忍旧形态（`kind` 缺失、无 `v`、legacy 注释）；写时只写新形态，且**保留未知字段**（不可"读—改—丢"） | `_mindlink` vs `<!-- ref: -->` |
| **接口（服务）** | **只增不改**：新增方法/可选参数；改签名必须走 §17.1 的临时实现通道并留退场条件 | `resolveLink` 移到 `linkResolver` 后，`fileRouter` 保留转发 |
| **事件** | **只增不改**（§16.7 规则 4） | `$bus` 既有 12 类事件语义冻结 |

**.smm 内的 `_mindlink.v` 演进**：当前 `_mindlink: { v:1, refs:[...] }`。升 v2 时：**读** v1 与 v2 都支持（`refData` 内做版本分发）；**写**统一写 v2；不做批量预迁移（惰性迁移，省事且降低风险）。

## 17.4 ADR（架构决策记录）

D1–D10 已是很好的决策记录，但混在详设里。**落地方式**：

```
design/adr/
  README.md              ← 索引（编号 / 标题 / 状态 / 日期 / 关联章节）
  D01-技术栈-Electron-Vue3.md
  D02-md编辑器-ToastUI.md
  D03-章节解析-markdownit-tokenMap.md
  D04-引用元数据-_mindlink.md
  D05-文件监听-fsWatch.md
  D06-Tab模型-kind与docMeta.md
  D07-索引-contentHash为准.md
  D08-CommandBus-薄封装.md
  D09-smm编解码.md
  D10-资源写入-writeBinary.md
  D11-分层架构与依赖注入.md          ← v1.1 新增（第一轮评审；v1.2 升级为 L0–L4 + CG）
  D12-回声抑制-IO层实现.md           ← v1.1 新增（第一轮评审）
  D13-冲突策略表.md                  ← v1.1 新增（第一轮评审）
  D14-测试按纯边界分层.md            ← v1.1 新增（第一轮评审）
  D15-L0基础层与CG组合根.md          ← v1.2 新增（第二轮评审 A3/A13/B1）
  D16-工厂闭包禁this.md              ← v1.2 新增（第二轮评审 A1）
  D17-引用快照同步syncRefSnapshots.md ← v1.2 新增（第二轮评审 A4）
  D18-抑制登记点唯一化fsApi.md        ← v1.2 新增（第二轮评审 A14-3）
  D19-rebind不豁免乐观锁.md           ← v1.3 新增（第三轮评审 C1/C2）
  D20-引用快照惰性同步.md             ← v1.3 新增（第三轮评审 C3）
```

**ADR 模板**（每条 5 段，不超过 1 页）：`状态`（提议/接受/废弃/被取代）→`背景`→`决策`→`依据（含实测证据链接）`→`代价与替代方案`。

**规则**：① 决策一旦写进 ADR 就**不可编辑结论**，只能新增"被 DXX 取代"；② 每条 ADR 必须指向详设章节；③ 详设与本目录冲突时，以**新的 ADR** 为准。

## 17.5 详设自身的演进

| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0 | 2026-09-20 | 首版 |
| v1.1 | 2026-09-20 | 架构评审响应版（见文首 §0.1）；新增 §16 §17；拆分/新增 20 个模块；删 `commitRef`；事件去掉 `source`；测试按纯边界重排 |
| **v1.2** | 2026-09-20 | **第二轮评审响应版（v1.1 自身缺陷修复）**，见文首 §0.2；新增 **§19 第二轮评审响应汇总**。核心：全文工厂闭包化禁 `this`；`commitEdit` 修 `current` 未定义崩溃；`onSectionCommitted → syncRefSnapshots`；**新增 L0 基础层 + CG 组合根层**（拆 v1.1 的 L5）；`suppression.hit` 改 async；`documentStore` 与持久化职责分离；`check-arch.mjs` 断言扩至 9 类；测试指标给出**分层预算与分母定义** |
| **v1.3** | 2026-09-20 | **第三轮评审响应版（v1.2 自身缺陷修复 + 收尾）**，见文首 §0.3；新增 **§20 第三轮评审响应汇总**。核心：`rebind` 语义定论（§7.7.1，不豁免乐观锁）；`N>10` 惰性同步落地路径（§7.6.6 + refs.json `snapshotPending`）；`overrides` 契约与最小 fake（§16.2）；A′ 等价类扩展表（§11.2）；零 mock 改脚本验收（`check-arch` 断言 9 → 10 类）；`E_CONFLICT_*` 补入 §16.5；`errors.js` 层级归属统一；自查补 `rebound` 返回、迁移失败改先重建、§7 章首 import 约定 |

**修订规则**：
1. **小改**（措辞/补细节）→ 直接改，修订记录加一行。
2. **决策变更** → 必须**新增 ADR** + 在对应章节加"⚠️ 已被 DXX 取代"指向，不删除旧文字（保留推理链）。
3. **接口签名变更** → 同步 §5.2（层/依赖列）、§16 矩阵、§11 守卫；三者不一致即视为文档缺陷。
4. **每次实现阶段的结束**（M1–M5）→ 回填"实测 vs 预估"，尤其 §12 的人天与 §13 的风险概率。
5. **任何"返回值 / 接口签名"变更 → 必须在同一次修订内 grep 全文消费端**（v1.3 新增）。依据：连续两轮评审都抓到同类缺陷 —— v1.2 的 A8（`commitEdit` 返回冲突 vs §7.14 写 `$emit`）、v1.3 的 D1（§7.14 读 `res.data.rebound` 而生产者从未返回该字段）。检查方式：改完接口后跑
   `grep -n "<字段名>" design/详细设计方案_导图与MD.md`，**产出侧与消费侧必须同时命中**；只命中一侧即为文档缺陷。
6. **凡涉及"分层归属"的表述**（某文件的 L?），必须同步 §5.2 表、§5.3 图、§16.1 表、§16.3 图、§16.8 清单**五处**（v1.3 新增；C7 就是 §5.3 与 §16.3 未跟上 §16.1 的改动）。

## 17.6 一句话总结

> **v1.0 在功能与兼容性上近乎满分；v1.1 补的是"骨架"**：把服务层从"互相调用的模块单例"改为"**围绕 Context 的纯函数 + 薄编排**"，把"低耦合"从口头约定改为**`check-arch.mjs` 可机检的机制**，把"临时妥协"改为**有退场条件的债务清单**。
> 判据：**80% 的测试零 mock、依赖图 0 环、换编辑器引擎只改一个 composable。**

---

# §18 本次评审响应汇总（v1.1）

| 评审编号 | 结论 | 落地位置 |
|---|---|---|
| P1-a 双向依赖 | ✅ 成立 | §7.6 删 `commitRef`；§5.3 重画 DAG；§16.3–16.4 环检测 |
| P1-b fileRouter ⇄ mdDocument | ❌ 不成立（文档未如此设计） | §5.3 附注说明；§7.4 加"禁止服务互相监听对方广播"纪律 |
| P1-c 索引层未独立 | ✅ 成立（+ 发现 v1.0 内部不一致） | 新增 `io/workspaceIndex.js`；§5.2 补齐；§6.3.1 协议 |
| P2 无 Context | ✅ 成立 | §16.2 组合根 + 工厂 + Proxy 单例 |
| P3 事件载荷含 `source` | ✅ 成立 | §7.8 删 `source`；新增 `io/suppressionRegistry.js`；§16.7 七条规约 |
| P4 边界仅靠约定 | ⚠️ 部分成立（已有守卫测试，缺机制强化） | §11.3.2 `check-arch.mjs`；**不采纳 ESLint**（理由见该节） |
| P5 冲突分支硬编码 | ✅ 成立 | `conflictStrategies.js`（L1）+ §7.7 分发式 `resolveConflict` |
| P6 上帝组件 | ✅ 成立 | §7.10.0 容器 + 7 composable + `useMdRender` 复用 |
| P7 纯/副作用混用 | ✅ 成立 | 拆 `linkResolver.js`(L1) / `fileRouter.js`(L4) |
| P8 sectionService IO 混用 | ⚠️ 部分成立（实为命名漂移） | §7.5 三层拆分 + 命名对照表 |
| P9 workbookState 掺内容 | ✅ 成立 | D6 改 `docMeta`；新增 `state/documentStore.js`；R17 守卫 |
| P10 桥接无退场 | ✅ 成立 | §7.9 退场策略表 + 迁移表 + `legacy-bridge` 守卫 |
| M1 错误模型不统一 | ✅ 成立 | §16.5 `Result + ErrorInfo` + 错误码表 |
| M2 无日志 | ✅ 成立（0 命中） | §16.6 `logger.js` + 11 个必打点 + 诊断导出 |
| M3 重建细节缺失 | ✅ 成立 | §6.3.1 七条协议（single-flight/写锁/原子写/回滚） |
| M4 迁移不明确 | ✅ 成立 | §17.2 `migrations/` + dry-run + 备份 + 日志 |
| M5 测试错层 | ✅ 成立 | §11.2 改 `pure/orchestration/regression`；零 mock ≥70% |
| M6 缺演进章节 | ✅ 成立 | §17（临时实现退场 / 迁移 / 兼容策略 / ADR / 本文演进） |
| **另：v1.0 自身缺陷** | 2 处 | ① `workspaceIndex` 有图无文件 ② R1 的 `markdown-it` 描述错误（已在 §5.2 / R1 修正） |

**工期影响**：v1.1 时为 ≈34–36 → **≈35–37 人天**（§12）；**v1.2 再修 §19 所列缺陷后为 ≈36–38 人天**；**v1.3 收尾后为 ≈36.5–38.5 人天**（§20.4）。收益：`pure/` 零 mock ≥70%（脚本机检）、依赖图可机检 0 环、换编辑器引擎单点改动、临时债务全部有退场条件。

---

# §19 第二轮评审响应汇总（v1.2）

> 对 **v1.1 自身**的外部复检（本轮评审的对象是 v1.1 的修订，不是 v1.0 的原始设计）。逐条核对结论见 §0.2，此处给出**落地位置索引**与**变更性质分类**。

## 19.1 逐条落地索引

| 编号 | 类型 | 结论 | 落地章节 | 变更性质 |
|---|---|---|---|---|
| A1 | 一致性（结构性错误） | ✅ 成立 | §7.3 §7.4 §7.6 §7.7 §16.2 §16.4 | **代码级**：全文工厂改闭包，禁 `this` |
| A2 | 遗漏 | ✅ 成立 | §7.5.2 | 补伪码 + 3 条硬约束 |
| A3 | **分层矛盾** | ✅ 成立 | §5.1 §5.3 §6.3.1 §16.1 §16.3 §16.7-8 | **架构级**：新增 L0；L3 改 `onProgress` |
| A4 | **语义模糊（核心链路）** | ✅ 成立 | §7.6 §7.7 §11.2 | **接口级**：`onSectionCommitted` → `syncRefSnapshots` + 性能约束 |
| A5 | 签名不可实现 | ✅ 成立 | §7.1 §7.8 §11.2 | **代码级**：`hit(absPath)` 改 async |
| A6 | 职责与层不符 | ✅ 成立 | §5.2 §6.6 §16.1 §16.6 | 持久化归 L4 |
| A7 | 可测性/调试隐患 | ✅ 成立 | §16.2 §11.2 | 补 4 个 Proxy trap + 测试纪律 |
| A8 | 两处描述不一致 | ✅ 成立 | §7.14 | 冲突走返回值 |
| A9 | **指标自相矛盾** | ✅ 成立 | §11.2 §14 | 给分层预算 + 分母定义 |
| A10 | 表述不完整 | ⚠️ 部分成立 | §11.3.2 断言 ② | 写明"含 L1/L3 同层边" |
| A11 | **伪码实际 bug** | ✅ 成立 | §7.7 步骤 ③ | 重绑后重新取 `current` |
| A12 | 两处行为不一致 | ✅ 成立 | §7.8 消费端分支 | 与 §10-23 对齐 |
| A13 | 分层过宽 | ✅ 成立 | §16.1 §16.3 §16.4 | 拆 L0 / CG |
| A14-1 | 自查：L3 同层未入白名单 | ✅ 成立 | §5.2 §16.1 §16.3 | 补"同层 L3" |
| A14-2 | 自查：`createEventBus` 无处定义 | ✅ 成立 | §7.8 §16.2 | `events.js` 同时导出常量与工厂 |
| A14-3 | 自查：`suppress.add` vs `register` + 重复登记 | ✅ 成立 | §7.1 §7.7 §7.10.2 §16.7-3 | 登记点唯一化到 `fsApi` |
| A14-4 | 自查：`commandRegistry.js` 有测无文件 | ✅ 成立 | §5.2 §7.9 §11.2 §12 | 补 L1 模块 |
| B1 | `localStorage` 归属 | ✅ 成立 | §5.2 §16.1 §16.6 §16.8 §14 | 归 L0（唯一例外），L1/L2 禁 |
| B2 | 迁移调用点缺失 | ✅ 成立 | §7.3 ① §17.2 | 补进 `open()` 伪码 |
| B3 | 守卫断言不全 | ✅ 成立 | §11.3.2 断言 ⑥⑦ | 加动态 import / `window.smmApi` / 组合根 |
| B4 | `ctx` 传参无机检 | ✅ 成立 | §11.3.2 断言 ④ §16.2 | 加正则断言 |
| B5 | TODO 检查未落地 | ✅ 成立 | §11.3.2 断言 ⑨ §17.1 | 加计数 + 快照对比 |
| B6 | 组合根无测试 | ✅ 成立 | §11.2 `pure/compositionRoot.test.mjs` | 4 用例 |
| B7 | 迁移单测未入表 | ✅ 成立 | §11.2 orchestration 表 | 6 用例 |
| B8 | `workspaceSearch` 未走工厂（且未装配） | ✅ 成立 | §5.2 §7.15 §16.2 §12 | 改工厂 + 组合根装配 |
| B9 | "禁止 import `window`" 表述错误 | ✅ 成立 | §11.3.2 断言 ③ | 改为"不得引用全局" |

## 19.2 变更性质分布

| 性质 | 条目 | 占比 |
|---|---|---|
| **代码级**（会直接造成实现 bug 或崩溃） | A1、A5、A11、A14-3 | 4 / 22 |
| **架构级**（分层模型变更） | A3、A13、A14-1、B1 | 4 / 22 |
| **接口级**（签名/语义变更） | A4、A6、A8、A14-2、B8 | 5 / 22 |
| **规约级**（文档/守卫/测试口径） | A2、A7、A9、A10、A12、A14-4、B2、B3、B4、B5、B6、B7、B9 | 13 / 22 |
| **不成立** | — | **0 / 22** |

> **判读**：本轮 22 条**全部**指向 v1.1 的"修订自身"，**没有一条推翻 v1.0 的方向性设计**（D1–D10 与 §4 全部未动）。
> 其中 4 条（A1/A5/A11/A14-3）是**实现者必踩**的代码级问题——这也说明"伪码必须可执行级精确"是详设的质量底线。

## 19.3 保留项（评审明确要求不要动，本轮零回退）

| # | 保留项 | 本轮动作 |
|---|---|---|
| 1 | **P4 拒绝 ESLint** 的理由（Vue3 升级已移除，与 D5/D10 相悖） | 保留，且在 §16.4 补一句"此判断已被第二轮评审肯定，不因惯例回退" |
| 2 | **P8 判为"命名漂移"** 而非职责混用 | 保留原判断与命名对照表 |
| 3 | §0.1「评审意见处置」表 + 统计 | 保留；新增同构的 §0.2 |
| 4 | `check-arch.mjs` 的环检测 + import 矩阵 | 保留并**增强**（9 类断言），不是替换 |
| 5 | R15–R20「新风险」自登记 | 保留（R16 因本轮 A13 而加严） |
| 6 | §17.1 临时实现退场条件表 | 保留，并把检查**真正落地到脚本**（B5） |
| 7 | §17.5 详设自身演进 | 保留；本版新增 v1.2 行 |
| 8 | `suppressionRegistry` 替代 `source` 字段 | 保留（仅修 `hit` 签名，方向不动） |

## 19.4 工期与冻结判断

- **工期**：≈35–37 → **≈36–38 人天**。增量来自：L0 拆分与 Proxy trap（+0.2）、`syncRefSnapshots` 的真源写回与惰性策略（+0.5）、`check-arch` 断言从 3 类扩到 9 类（+0.3）、`getSectionView`/`migrations`/`compositionRoot` 等补测（+0.3）。
- **冻结判断**：本轮修完后，**v1.2 可作为开发基线冻结**。判据（可机检）：
  1. `node scripts/check-arch.mjs` EXIT 0，**0 环**、9 类断言全过；
  2. 全文**无 `onSectionCommitted` / `suppress.add` / `this.` 于工厂内** / `L5` 表述；
  3. §5.2、§11.3.2、§16.1 三处**分层口径逐字一致**（本版已对齐，且此后任一处变更必须三处同步——§17.5 修订规则 3）。
- **剩余待评审项**（与 v1.1 相同，未变）：引用块编辑器形态、KaTeX 是否进 MVP、`.mindlink` 是否加 gitignore、二期是否切 Milkdown、多工作区时点、组合根 Proxy 与 `useServices()` 的取舍。

> **⚠️ 本节结论已被 v1.3 取代**：§19.4 写于 v1.2，其"9 类断言""≈36–38 人天"在 v1.3 更新为 **10 类**与 **≈36.5–38.5**；最新冻结判断见 **§20.4**。本节保留为 v1.2 当时的历史记录（§17.5 规则：不删旧文字，保留推理链）。
---

# §20 第三轮评审响应汇总（v1.3）

> **性质**：响应记录的汇总索引（同 §18/§19 的体例）。逐条核对结论见文首 **§0.3**，此处给**落地位置索引**、**变更性质分类**、**保留项**与**冻结判断**。

## 20.1 逐条落地索引

| 编号 | 问题摘要 | 落地位置 |
|---|---|---|
| **C1** | `rebind` 后 `if (!current)` 死代码；`baseHash/baseRev` 有效性未定义 | **新增 §7.7.1**（裁决表 + 4 场景行为对照）；§7.7 `rebind` 注释重写；规则表 +2 行 |
| **C2** | `sectionPath` 必须同步；`baseHash` 同步与否需拍板 | §7.7.1；§7.7 `rebind` 伪码显式 `refCtx.sectionPath = [...newSection.path]` |
| **C3** | 惰性同步无落地路径（schema / 触发点 / 入口） | §6.3 refs.json schema；**新增 §7.6.6**；§7.4 `open()` 时序；§7.6 接口 +2 方法；§7.14 面板级工具条 |
| **C4** | `overrides` 契约与 fake 覆盖面不明 | §16.2 `overrides` 契约表 + `createFakeIo` 示例 + 三纪律 |
| **C5** | 112 必测项 vs 160 预算，差额 48 无出处 | §11.2 **A′ 逐文件等价类扩展表**（17 行 → 160） |
| **C6** | 零 mock 验收两套方法 + `grep -c … == 0` 语法错误 | §14 合并为一条；§11.3.2 断言⑩；§16.4 表 +1 行；§12 P0 断言数 10 类 |
| **C7** | `errors.js` 在 §5.3 属 L0、在 §5.2/§16.1 属 L1 | §5.3 图修正；**§16.3 一并修正**（评审未提但同样有误）；顺带修 §5.3 中"L3 上报进度"与 §16.7 规则 8 的冲突 |
| **C8** | P0 交付物未说明其余 L1 模块的交付时点 | §12 P0 交付物括注 |
| **C9** | L0"零依赖"与 `logger` 用 `localStorage` 的概念张力 | §16.1 判据后新增"零依赖的精确定义"段（含断言③ 只对 L1/L2 生效的说明） |
| **C10** | `open()` 与迁移器重复读 `meta.json` | §17.2 `runMigrations({ …, meta })`；§7.3 调用点 |
| **C11** | `E_CONFLICT_*` 未登记、`ErrorInfo` 无 `kind` | §16.5 错误码表 +4 行、`ErrorInfo.kind?`、`suggestedAction` 补 `pickFromCandidates`；§7.7 `conflictResult` 双写 |
| **D1** | （自查）`commitEdit` 未返回 `rebound`，§7.14 提示永不显示 | §7.7 步骤⑥ 返回 `rebound`；§11.2 测试行；§14 勾选项 |
| **D3** | （自查）§6.3.1"迁移失败则 full 重建" vs §7.3"直接降级只读" | §7.3 改"先 rebuild({full:true}) 再降级"；§17.2 第 5 条 |
| **D4** | （自查）§7 伪码未声明省略的 import 来源 | §7 章首"伪码约定" |

## 20.2 变更性质分布

| 性质 | 编号 | 数量 |
|---|---|---|
| **代码级**（伪码/返回值会直接造成实现 bug） | C1、C2、D1、D3 | 4 / 14 |
| **数据契约级**（schema / 字段） | C3、C11 | 2 / 14 |
| **规约级**（分层归属 / 守卫 / 测试口径 / 契约） | C4、C5、C6、C7、C8、C9、C10、D4 | 8 / 14 |
| **不成立** | — | **0 / 14** |

> **判读**：本轮 **14 条全部是"收尾级"** —— **无一条触碰架构分层、模块划分、依赖方向或既有决策（D1–D10）**。
> 与第二轮（A1/A5/A11/A14-3 四条代码级、A3/A13 两条架构级）相比，严重度显著下降：v1.2 的修订已经把结构性风险清干净，v1.3 处理的是"文档与代码的最后几处不同步"。
> **值得记录的规律**：连续两轮都出现"**返回值字段与消费端读取不一致**"（v1.2 是 A8 谁触发冲突，v1.3 是 D1 的 `rebound`）。故 §17.5 修订规则新增第 5 条：**任何"返回值/接口变更"必须在同一次修订内 grep 全文消费端**。

## 20.3 保留项（评审明确肯定，本轮零回退）

| # | 保留项 | 本轮动作 |
|---|---|---|
| 1 | §19.2「变更性质分布表」的自证方法 | 保留，并在 §20.2 沿用同构体例 |
| 2 | §19.3「保留项」清单（防止"为响应评审而过度修订"） | 保留，本版新增 §20.3 |
| 3 | **A3 的处理方式**（L0 + CG 拆分 + `onProgress` 回调，而非把 `events` 降到 L1） | 零改动；评审再次肯定"保留 IO 层不依赖事件总线的边界" |
| 4 | **A1 的"硬规约 + 脚本断言"双保险** | 零改动 |
| 5 | §16.2「四点硬规约」表 | 零改动（本版仅在其前新增 `overrides` 契约，不改四点） |
| 6 | **A12 的消费端统一分支**（§10-23 与 §7.8 合并） | 零改动 |
| 7 | §16.8 自检清单 | 零改动 |
| 8 | §17.4 ADR 体例（决策不可编辑结论） | 保留，新增 D19/D20 两条 |
| 9 | `check-arch.mjs`（表达力优于 ESLint，不引 Lint 工具链） | 保留并增强至 **10 类断言** |
| 10 | **不降标到 60% 的决定**（靠扩充 pure 等价类达成 70%） | 保留；本版进一步把"扩充"落成 A′ 表 |

## 20.4 工期与冻结判断

- **工期**：v1.2 的 ≈36–38 → **≈36.5–38.5 人天**（+0.5）。增量来自：`calibratePendingSnapshots` 与惰性同步落地（+0.3）、`overrides` fake 基建与 4 条补测（+0.2）。**文档侧的 C 类修正不占人天**（属 P0 开工前的规约澄清）。
- **冻结判断**：**v1.3 达到可冻结标准**。三条机检判据（全部可脚本化，逐条对应本轮修订）：
  1. `node scripts/check-arch.mjs` EXIT 0 —— **0 环**、**10 类断言全过**（含测试预算自动校验）；
  2. 全文**无** `onSectionCommitted` / `suppress.add` / 工厂内 `this.` / `L5` 旧表述；且 **`errors.js` 层级在 §5.2、§5.3、§16.1、§16.3、§16.8 五处一致为 L1**；
  3. **消费端/生产端字段成对**：`rebound`（§7.7 产出 ↔ §7.14 消费）、`kind`（§7.7 产出 ↔ §7.14 消费）、`snapshotPending`（§7.6.6 产出 ↔ §7.6.6-② 消费）三对**均能 grep 到两侧**。
- **仍待产品/架构拍板的 6 点**（与前两轮相同，未变；这些**不阻塞 P0 开工**，但 P2/P4 前必须有结论）：
  1. 引用块编辑器形态：MVP 用 `textarea + 预览` 还是轻量 Toast UI 实例（§7.14 建议前者）；
  2. KaTeX 是否进 MVP（不进则 P6 -1.5 人天）；
  3. `.mindlink/` 是否加入 `.gitignore`（建议加，但需与团队确认是否要共享索引）；
  4. 二期是否切 Milkdown（`MILKDOWN_ASSESSMENT.md` 评估为 8–12 人天）；
  5. 多工作区的时点（本架构已支持，但 UI 未设计）；
  6. 组合根：保留 Proxy 便捷入口，还是全量改 `useServices()`（后者视图改动量大）。

> **下一步**：把本版作为**开发基线**，按 §12 从 P0 开工。P0 的第一件事是落地 `scripts/check-arch.mjs`（10 类断言）—— 它会让后续每一阶段的腐化**在构建期就暴露**，而不是等到评审。

## 20.5 未改动项 / 判为"部分成立"项的说明（本次复检的"不改"清单）

> 本节专门回答"哪些意见**没有按原建议改**、以及**为什么**"。分四类：① 判为部分成立但仍做了收尾；② 评审自己已认定为"虚警"的；③ 评审的**推荐选项未被采纳**的；④ 评审明确要求不要动的（刻意零改动）。

### ① 判为"部分成立"的两条（C2 后半、C9）——仍做了收尾，但不按原建议的力度改

| 编号 | 评审原建议 | 本版处理 | 不按建议改的理由 |
|---|---|---|---|
| **C2 后半** | 在 `rebind` 里**同步** `refCtx.baseHash = newSection.contentHash` / `baseRev` | **只同步 `sectionId` / `sectionPath`**；`baseHash/baseRev` **刻意不同步** | 评审自己也把它列为"关键决策点"并**推荐 (b) 不同步**（更安全）。更深一层：`doCommitEdit` 首行已把 `baseHash`/`baseRev` **解构成局部常量**，步骤④ 用局部值 —— 所以**就算写进 `rebind` 也不生效**（无声失效）。与其写一行"看起来在同步实则无效"的代码，不如把 (b) 写成显式规约。**这是"按评审结论做、但不采纳字面建议"的一例。** |
| **C9** | 给 L0 补一句"`localStorage` 属浏览器内置 API，不算服务依赖；允许但要检测可用性" | 采纳，写在 §16.1 判据下方 | **但额外加了一条评审没提的约束**：`check-arch.mjs` 的断言③ **只对 L1/L2 禁 `localStorage`，不对 L0 禁** —— 否则脚本会把 `logger.js` 自己拦下来。评审的建议若不落到脚本口径，就等于没说。 |

### ② 评审自己已判为"虚警"的（不改代码，只写清结论）

- **C2 前半**（评审用两段场景推演后自行结论为"所以 C2 实际是虚警——除非……"）：本版**没有引入任何新机制**，只在 §7.7.1 用**4 场景行为对照表**把既有行为写死，防止实现者"自行拍脑袋"。
- **C10**（评审自述"这是优化，不是缺陷"）：采纳为**可选参数** `runMigrations({ …, meta })`，**不强制**调用方传 —— 迁移器仍能独立读盘、可单独单测。若实现者嫌麻烦不传，行为与 v1.2 完全一致。
- **C1 中"`if (!current)` 是死代码"**：**保留该分支**（不删）。理由是它虽在构造上不可达，但一旦将来 `rebind` 改成异步/可失败，它就是唯一兜底。本版只加注释标注"防御性断言"，**不做删除式重构**。

### ③ 评审的推荐选项**未采纳**的（1 处）

| 位置 | 评审推荐 | 本版选择 | 理由 |
|---|---|---|---|
| C1 的"关键决策点"(a) vs (b) | 推荐 (b) —— **已采纳** | —— | （此条已采纳，列出以示无遗漏） |
| C5 的"或者把预算下调为 ≥145" | 评审给的两个方案之一：**下调预算** | 选**方案 (1)**：给扩展维度表，预算**上调到 160** | 下调到 145 会让 pure 占比 71.4% 仍然达标，但那等于**把"施工图缺失"转成"标准降低"**。既然扩展维度是**真实存在且必须覆盖**的（围栏 4 类、标题 2 类、嵌套 6 级……），就把它们列清楚。**不降标、也不注水**是 §19.3 保留项第 10 条的一贯立场。 |
| C6 的"统一为一条" | 建议把两条验收合并 | **采纳** | —— |
| C6 的"移到自动验收" | 建议不要只出现在发布前手工清单 | **采纳**，且并入了 `check-arch.mjs` 第 10 类断言 | —— |

（即：**没有任何一条评审推荐被"无声略过"**；除 C5 的选择不同并已说明理由外，其余推荐全部采纳。）

### ④ 刻意零改动清单（评审明确肯定，本版逐字未动）

> 详表见 §20.3；此处只列**最容易被"顺手改掉"的 4 处**，注明为何**不该动**：

| 不该动的 | 为什么不该动 |
|---|---|
| **`check-arch.mjs` 自研而非引 ESLint**（§16.4） | 本工程 Vue3 升级时已移除 ESLint；为单一检查项重新引入整套工具链与 D5/D10「不引第三方依赖」相悖。**连续三轮评审都肯定此判断**，不得因"业界惯例"回退。 |
| **pure/orchestration 比例靠扩充 pure 达成，而非削减 orchestration**（§11.2） | orchestration 的 51 条覆盖提交/冲突/索引/迁移**核心链路**，压缩它等于降低质量。若实现时 orchestration 更精简，pure 占比会**自然回升**——不需要为此调比例。 |
| **`events.js` 归 L0 而非"降级使用"**（§16.1/§16.7） | 保留"**IO 层不依赖事件总线**"的清晰边界：L3 要进度就用 `onProgress` 回调上抛，由 L4 转发 emit。**这是 A3 的最优解**（比"把 events 降到 L1 供 L3 直接用"更干净）。 |
| **`suppressionRegistry` 在 IO 层、事件载荷无 `source`**（§7.8） | 用 IO 层机制替代"事件载荷策略"方向正确（P3 的核心）。本版只改了 `hit` 的签名实现细节，**方向一字未动**。 |

### ⑤ 一句话总结

本次复检的 14 条（C1–C11 + 自查 D1/D3/D4）**全部落地**；其中 **C2 后半、C9 两条按"部分成立"处理**（做了收尾但力度不同，理由见上）；**C5 的两选项择一（选更严的）**；**C1 的"死代码分支"刻意保留为防御性断言**。**没有任何一条被判定为"不存在"** —— 三轮评审的成立情况分别是 **15/18**（v1.0 评审）、**21/22**（v1.1 复检）、**9/11**（本轮 C 类；连同 3 条自查共 12/14 全部落地），且本轮**全部指向文档与代码的不同步，无一触碰架构方向**。

# §21 第四轮评审响应汇总（v1.4）

> **性质**：功能（F1–F7）+ 界面（G1–G9）复检的汇总索引，同 §18/§19/§20 体例。逐条核对见文首 **§0.4**，此处给落地索引、变更性质、保留项与冻结判断。

## 21.1 逐条落地索引

| 编号 | 问题摘要 | 落地位置 |
|---|---|---|
| **F1** | rebind 与 §6.4 id 复用职责错位 | §6.4 两段式说明 + §7.7.1 行为对照表重写 |
| **F2** | 失效无恢复路径 / cachedContent 定位 | §6.2 不变量#2 + §7.6.4 恢复路径 + §7.7 history 时机2 |
| **F3** | 刷新两语义混用 | §7.6 `syncRefSnapshots` scope + §7.6.6-② 三档表 + §7.14 |
| **F4** | 连带影响/影响范围未提示 | §7.14 提示条 + 冲突事件 `impact` + §8.4 影响范围行 |
| **F5** | mode 无场景 | §6.2/§7.13 标"保留未启用"；§7.13 改三选项 |
| **F6** | link 与 refs 关系 | §6.2 不变量#4 + §7.13 三选项 + §7.14 跳转按钮 |
| **F7** | 引用块布局 | §8.3 MVP 固定布局 |
| **G1** | 沉浸感 | §8.1 禅模式 + 响应式 + FileTabs 澄清 |
| **G2** | 引用块视觉 | §8.3 警告条/紫边/计数 + §8.5 变量 |
| **G3** | 冲突弹窗 | §8.4 diff/影响范围/撤销/副标题/手动合并 |
| **G4** | Tab 管理 | **新增 §8.6** |
| **G5** | 响应式 | §8.1 响应式三档 |
| **G6** | 状态栏 | §7.17 分组可折叠 |
| **G7** | 引用块色 | §8.5 `--mm-ref-*` 等变量 |
| **G8** | Picker 新建 | §7.13 新建文件/边引用边创建 |
| **G9** | 快捷键 | §8.2 总览 |
| **附** | 三态/F20/边界 | §8.7 + F20 提升 MVP + §7.6.4/§7.13/§7.14 边界#1–#10 |

## 21.2 变更性质分布

| 性质 | 编号 | 数量 |
|---|---|---|
| **功能逻辑**（用户路径补全） | F1、F2、F3、F4、F6、F7 + 边界#1–#10 + F20 | 9 / 16 |
| **界面/UX**（视觉与交互） | G1、G2、G3、G4、G5、G6、G7、G8、G9 + 三态 | 10 / 16 |
| **架构/分层/数据契约** | — | **0 / 16** |

> **判读**：本轮 **16 条全部是"功能/界面补全"**，**零架构改动**——与第三轮（架构收尾）形成互补：第三轮把"文档与代码不同步"清完，第四轮把"设计没想清的用户路径"补全。核心架构、数据契约、乐观锁/冲突策略**一字未动**。

## 21.3 保留项（第三轮保留，本轮零回退）

| # | 保留项 | 本轮动作 |
|---|---|---|
| 1 | §20.3 的 10 项（含 `check-arch` 10 类断言、分层五处一致、ADR 体例） | 全部保留 |
| 2 | §7.7.1 的"rebind 不豁免乐观锁"裁决（第三轮 C1/C2） | 保留并**强化**：F1 澄清其 fallback 定位，与 id 复用不重叠 |
| 3 | §7.6.6 惰性同步落地路径（第三轮 C3） | 保留；F3 在其上补 `scope` 语义，不冲突 |

## 21.4 工期与冻结判断

- **工期**：v1.4 为**纯设计文本补全**，**不新增代码模块、不新增人天**（属 P0/P4 开工前的规约澄清，与第三轮同性质）。架构/数据契约未变 ⇒ §12 路线图工期 **≈36.5–38.5 人天** 维持。
- **冻结判断**：**v1.4 仍达可冻结标准**，且**冻结判据与 v1.3 完全一致**（三条机检判据不变）：
  1. `node scripts/check-arch.mjs` EXIT 0 —— 0 环、10 类断言全过；
  2. `errors.js` 层级五处一致为 L1；
  3. 消费端/生产端字段成对（`rebound`/`kind`/`snapshotPending`/`scope` 三对+1 均能 grep 两侧）。
- **新增字段对（v1.4）**：`scope`（§7.6 产出 ↔ §7.6.6-②/§7.14 消费）、`impact`（§7.14 产出 ↔ §8.4 消费）、`mode` 标"保留未启用"（产出 §6.2 ↔ 消费 §7.13，单侧，无运行时分支）—— 均已在本文两侧落地。
- **仍待拍板的 6 点**（见 §20.4，未变，不阻塞 P0）。

## 21.5 未改动项说明（本轮"不改"清单）

> 本轮 16 条**全部成立、全部落地**，无"不成立/虚警"条目；故无"刻意不改"项。唯一刻意"轻处理"的是 **F5**：评审给 (a) 删除 / (c) 保留未启用两选项，本版采 (c)（字段保留、标"保留未启用"），理由：避免删字段后将来二期多人协作又要加回，且数据层已预留、无运行时成本；这与"YAGNI 但保留前向兼容字段"不冲突。

### ⑤ 一句话总结（v1.4）

第四轮复检 **16 条（F1–F7 + G1–G9）全部成立、全部落地**，聚焦**功能用户路径**与**界面体验**两类补全，**零架构/分层/数据契约变更**；与 v1.3（架构收尾）互补，至此详设在"架构正确性 + 功能完整性 + 界面可达性"三个维度均达到可冻结标准，可作为开发基线按 §12 从 P0 开工。

# §22 第五轮评审响应汇总（v1.5）

> **性质**：界面（H1–H9）+ 功能（I1–I4）盲区复检的汇总索引，同 §18/§19/§20/§21 体例。逐条核对见文首 **§0.5**，此处给落地索引、变更性质、保留项与冻结判断。

## 22.1 逐条落地索引

| 编号 | 问题摘要 | 落地位置 |
|---|---|---|
| **H1** | 禅模式统一（既有 localConfig.zenMode vs v1.4 md 沉浸） | §8.1"禅模式统一"说明 |
| **H2** | 被 N 处引用点击展开 | §7.14 反链浮层设计 |
| **H3** | 手动合并三栏 + 差异块操作 | §8.4 手动合并重写 |
| **H4** | 侧栏窄屏折叠分两层 | §8.1 响应式侧栏说明 |
| **H5** | 与既有 FileTabs 关系 | §8.6"与既有 FileTabs 关系" |
| **H6** | 空态位置+触发表 | §8.7 位置+触发条件表 |
| **H7** | 禅模式保存状态点 | §8.1 禅模式状态点 |
| **H8** | 深色 diff 颜色 | §8.5 `--mm-diff-*` 变量 |
| **H9** | 快捷键总览数据源 + §7.9 补行 | §7.9 补 4 行 + §8.2 数据源 |
| **I1** | 改名后 sectionPath 同步 | §7.7.1"改名后 sectionPath 同步" |
| **I2** | 转为纯文本语义 | §7.14"转为备注内容"精确语义 |
| **I3** | scope×force 组合 | §7.6 六组合语义表 |
| **I4** | 整文件引用编辑语义 | §7.13/§7.7 整文件引用说明 |

## 22.2 变更性质分布

| 性质 | 编号 | 数量 |
|---|---|---|
| **界面/UX**（视觉与交互盲区） | H1、H2、H3、H4、H5、H6、H7、H8、H9 | 9 / 13 |
| **功能逻辑**（用户路径/语义盲区） | I1、I2、I3、I4 | 4 / 13 |
| **架构/分层/数据契约** | — | **0 / 13** |

> **判读**：本轮 **13 条全部是"界面/功能盲区补全"**，**零架构改动**——与第四轮（功能/界面补全）同性质，但更聚焦"补完后浮现的真问题"（报告称"修补到位后、真问题浮现"的正常过程）。核心架构、数据契约、乐观锁/冲突策略**一字未动**。

## 22.3 保留项（第四轮保留，本轮零回退）

| # | 保留项 | 本轮动作 |
|---|---|---|
| 1 | §21.3 的保留项（`check-arch` 10 类断言、分层五处一致、`rebind` 不豁免乐观锁、`scope`/`impact` 字段对） | 全部保留 |
| 2 | §7.7.1 行为对照表（v1.4 F1 重写） | 保留；I1 在其上补"sectionPath 同步"附则，不冲突 |
| 3 | §7.6.6 惰性同步 + `scope` 三档（v1.4 F3） | 保留；I3 在其上补 `scope×force` 组合表，不冲突 |

## 22.4 工期与冻结判断

- **工期**：v1.5 为**纯设计文本补全**，**不新增代码模块、不新增人天**（属开工前规约澄清）。架构/数据契约未变 ⇒ §12 路线图工期 **≈36.5–38.5 人天** 维持。
- **冻结判断**：**v1.5 仍达可冻结标准**，冻结判据与 v1.3/v1.4 完全一致（三条机检判据不变）：
  1. `node scripts/check-arch.mjs` EXIT 0 —— 0 环、10 类断言全过；
  2. `errors.js` 层级五处一致为 L1；
  3. 消费端/生产端字段成对（`rebound`/`kind`/`scope`/`impact`/`sectionPath` 均能 grep 两侧）。
- **新增字段对（v1.5）**：`sectionPath` 同步（§7.7.1 产出 ↔ §7.14 消费"标题已更新"）、`--mm-diff-*` 变量（§8.5 产出 ↔ §8.4 消费）、反链浮层（§7.14 产出 ↔ F20 侧栏同源）—— 均已在本文两侧落地。
- **仍待拍板的 6 点**（见 §20.4 / §21.4，未变，不阻塞 P0）。

## 22.5 未改动项说明（本轮"不改"清单）

> 本轮 13 条**全部成立、全部落地**，无"不成立/虚警"条目；故无"刻意不改"项。唯一"轻处理"的是 **H5**：报告担心 §8.6 与既有 FileTabs(500 行) 重复实现，本版处理方式为"明确罗列既有能力 vs 新增清单 + P1 先核对既有再定实现"，而非重写——既避免重复实现，又给实现者明确边界。

### ⑤ 一句话总结（v1.5）

第五轮复检 **13 条（界面 H1–H9 + 功能 I1–I4）全部成立、全部落地**，聚焦**"v1.4 补完后浮现的界面/功能盲区"**，**零架构/分层/数据契约变更**；至此详设在"架构正确性 + 功能完整性 + 界面可达性 + 边界语义清晰度"四个维度均达到可冻结标准，可作为开发基线按 §12 从 P0 开工。后续若再发现盲区，建议进入实现后以"代码+测试"反向校验，而非继续纯文本轮转。
