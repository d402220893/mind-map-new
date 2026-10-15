# 项目交接文档

## 项目目标
把开源 `mind-map`（Electron + Vue + simple-mind-map）改造为支持「多 Sheet（类 Excel）」的本地思维导图工具「思绪思维导图」，并提供导入/导出扩展、写安全（防覆盖丢数据）与自动隐藏 UI。

## 当前进度
- 已完成：
  - v2.0.60：P0b 写安全落地。`electron-app/safeWriteFile.js` 四步原子写（覆盖前备份 `.bak.<毫秒时间戳>` FIFO5 → tmp+rename 原子替换 → 轻量回读校验（.smm 走 JSON.parse+magic+总节点数比对）→ 失败回滚）；两个写 IPC 收敛到 safeWriteFile；`isQuitting` 幂等守卫；退出同步落盘 `syncSaveOnExit` 加闸门 A。
  - v2.0.61：修复「反复打开内容丢失」两个回归——① `bindSaveEvent#data_change` 在 `_isLoading` 期间误写回当前文件（串档）；② `loadSheetData` 注册 `node_tree_render_end` 闭包从不清理导致卡 loading、闸门 A 永久拒绝保存。
  - P0a（代码已落地、未出包，2026-10-14）：`workbookState` 每 workbook 增 `loadPhase`(idle/loading/loaded/failed)+`lastGoodSize/lastSavedHash/lastNodeCount`；`Edit.manualSave/silentSaveToFile/autoSave` 统一加 `isSaveAllowed` 闸门 A（仅 loaded 放行）。纯模块 `web/src/utils/saveGuard.js`。
  - 历史批次（详见 `HANDOVER.md` §1–§44）：多 Sheet、文件树多选、系统双击关联打开、备注代码高亮、macOS 风格视觉、画布背景主题驱动、asar 打包、NSIS 安装包等均已落地。
- 未完成：
  - P0a 尚未出包（仅源码+单测，需构建部署并真机验证闸门 A）。
  - P0.5：强杀感知（`.running.lock` + 启动查主文件完整性优先；完好则删 lock 不弹，损坏才推荐 recover>.bak>快照；恢复面板三出路）。
  - P1：Worker 异步初始化 + 完整 `Idle→Loading→Loaded/Failed` 状态机 + stall 探测器（仅报慢不翻 failed）。
  - P2：gate B（结构完整性优先于合法空判定，一律 recover）、`.recover` 通道（主进程 `safeWriteFile(mode='recover')` 只写 .recover 不碰原文件/不产生 .bak）、contentHash 规范化 volatile 黑白名单。
- 已知问题：
  - 【环境性】真机打开大目录/文件巨慢（~20s，复现概率高）。经 A/B（asar/散目录/--disable-gpu 都慢）与 per-open 基准（冷 ~3.7ms/次）定位为**企业 AV/EDR 对每次文件 open 惩罚**，非 app 代码回归。建议把安装目录与常用工作目录加 AV 排除项。
  - `electron-app/tests` 7 项失败（asar 守卫硬编码 `dist-electron/`），待对齐。
  - 服务层 `web/src/services/io/fsApi.js:trash` 对主进程 `{ok,failed,skipped}` 二次包装丢明细，批量删除无法逐条提示（需改 fsApi 透传）。
  - P2 同源：refService#nodeById、workspaceSearch/workspaceIndex 的 collectNodes 直接 walk `sh.data`，对 `{root}` 包装体失明，引用重建/全文检索可能零命中。
  - P0a 闸门 A 真机 UI 验证（加载中大文件时是否真拦保存、退出是否走原子写）待补。

## 关键技术决策
- 技术栈：Electron（无边框 BrowserWindow）+ Vue2 前端 + simple-mind-map（画布库）+ PrismJS（代码高亮）；打包用 electron-builder + NSIS（取代早期 WinRAR SFX），产物 `electron-app/dist-electron2_<时间戳>/思绪思维导图 Setup.exe`；测试用 `node --test`。
- 目录结构约定：
  - 前端源码 `web/src/`（pages/Edit 是核心，`utils/saveGuard.js` 是写安全纯模块）。
  - 主进程 `electron-app/`（main.js、safeWriteFile.js、backupManager.js）。
  - 构建真源 `build_now.sh`（唯一入口）；版本真源 `electron-app/package.json`。
  - 设计稿 `design/覆盖文件防护方案_v5.md` 等。
  - 随包 devtools：`scripts/code2mm.md`+`code2mm.mjs` → 安装后 `resources/devtools/`（不被 asar 包裹，可外部读取）。
- 命名规范：自定义字段必须 `_` 前缀（如 `_mindlink`、`_isLoading`、`_loadRenderEnd`）；Sheet/workbook 状态机字段 `loadPhase/lastGoodSize/lastSavedHash/lastNodeCount`；纯 Node 单测归 `web/tests/pure/`（check-arch 纯占比闸门 0.70 的计入口径）。
- 已确定的架构方案：
  - 【写安全】所有落盘收敛到主进程 `safeWriteFile`（四步原子写），渲染进程无直写文件权。
  - 【加载态闸门】`loadPhase` 状态机 + 保存闸门 A（仅 `loaded` 放行），是「半加载/空数据冲掉当前文件」的真实止血。
  - 【画布背景】直接写 `mindMap.el.style` + 包装 `initTheme` 清透明，背景真源 `localConfig.canvasBackground`，**不写 .smm**。
  - 【.smm 落盘 schema】`{app:'smm-multisheet',version,activeId,sheets:[{data:{root}}]}`（外部工具产 .smm 一律写此形状）。
  - 【分层备份】`safeWriteFile` 覆盖前自动 `.bak`（FIFO5）；另 `backupManager` 三层（30min/6h/day）本地备份。

## 已知坑与注意事项
- 【重要·构建】Windows Defender / 企业 EDR 会卡死构建：safe-delete 钩子拦截收尾删除、热缓存 IO 卡死。须 `dangerouslyDisableSandbox` 跑 vue 构建、`BUILD_LOW_MEM=1` 全链零 worker、**不要加 `SKIP_CACHE_CLEAR`**（v2.0.36 经验该标志致 24min 卡死）。
- 【重要·运行】企业 AV/EDR 对每次文件 open 惩罚（冷 ~3.7ms/次），大目录打开巨慢。把安装目录/工作目录加排除项可缓解。
- 【重要·asar】Electron 加载优先级 `app/` 目录 > `app.asar`。部署必须移除过时散目录 `resources/app`（改名 `app.bak_*` 作回滚点），否则 asar 不生效。验证：`D:\…\resources\app.asar` 与本地 `electron-app/_appstage.asar` 逐字节一致。
- 【重要·部署真源】用户真实运行入口 = `D:\Program Files (x86)\思绪思维导图\mind-map\思绪思维导图.exe`；部署目标必须 = 实际有 exe 的 `mind-map/resources`，改前先 `ls` 确认 exe 位置（历史上多次误投到无 exe 的孤儿目录）。
- 【重要·第三方库】simple-mind-map 内部类**禁止直接 import 做 monkey-patch**（会让 vue-cli build 在 thread-loader worker 报 `Cannot read properties of null (reading 'content')`）。要源头拦截就包装实例方法（如 `mindMap.initTheme` 返回后清背景）。
- simple-mind-map 构造期做尺寸校验，必须等容器可见（`initWhenReady` + ResizeObserver），否则尺寸 0 抛异常；所有经 window/document 触达 `this.mindMap` 的入口要判空。
- SVG.js `rbox()` 对未挂载元素必 throw —— eventBus 事件处理器里调渲染链的入口要 try/catch 兜底，插件异常不得弹用户错误框。
- 第三方库 `getData(true)` 返回包装体 `{layout,root,theme,view}`，**root 才是节点树**；单测必须用真实导出形状，假节点掩盖真实形态。
- 沙箱启动 GUI exe 必须 `env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS`，否则被当纯 Node 报 `bad option` 秒退。
- 含中文的 .ps1 出包脚本必须带 UTF-8 BOM，否则 PowerShell 5.1 按 GBK 读 UTF-8 致行合并、部署卡死。

## 下一步待办
1. 出包 P0a（建议 v2.0.62）：把已落地的 `loadPhase` + 闸门 A 构建部署，并补真机 UI 验证闸门 A。
2. 落地 P0.5（强杀感知 + 恢复面板三出路）。
3. 落地 P1（Worker 异步 + 完整状态机 + stall 探测器）。
4. 落地 P2（gate B + `.recover` 通道 + contentHash 规范化）。
5. 对齐 `electron-app/tests` 7 项失败（asar 守卫硬编码）。
6. 修复 `fsApi.trash` 透传明细；修复 refService/workspaceSearch 对 `{root}` 包装体失明（P2 同源）。
7. 与用户 IT 沟通把安装目录/工作目录加 AV 排除项，缓解 20s 打开慢。
8. 真机验证数据恢复（`.bak` 改名回 `.smm`）。
