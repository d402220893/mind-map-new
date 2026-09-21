// 代码契约回归（轻量文本断言）：确认关键 bug 修复已落到源码。
// 用于无法在 Node 直接渲染 Vue 组件 / 主进程的 UI 与装配类修复。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = new URL('../../src/', import.meta.url)
const APP = new URL('../../../electron-app/', import.meta.url)

function read(p) {
  return readFileSync(new URL(p, import.meta.url), 'utf8')
}

test('[侧栏透明度] Sidebar.vue 已绑定 sidebarOpacity', () => {
  const vue = read(new URL('pages/Edit/components/Sidebar.vue', SRC))
  assert.ok(/sidebarOpacity/.test(vue), 'Sidebar.vue 应包含 sidebarOpacity 绑定')
})

test('[快捷键守卫] Edit.vue 接入 shouldFireGlobalShortcut', () => {
  const vue = read(new URL('pages/Edit/components/Edit.vue', SRC))
  assert.ok(/shouldFireGlobalShortcut/.test(vue), 'Edit.vue 应调用 shouldFireGlobalShortcut')
})

test('[存储误报] api/index.js 改用 isQuotaExceededError，移除恒真判断', () => {
  const src = read(new URL('api/index.js', SRC))
  assert.ok(/isQuotaExceededError/.test(src), '应引用 isQuotaExceededError')
  assert.ok(!/if \('exceeded'\)/.test(src), "不得再出现 if ('exceeded') 恒真判断")
})

test('[安装器 exe 名] main.js 使用 getAppExeName(app.getName())', () => {
  const main = read(new URL('main.js', APP))
  assert.ok(/getAppExeName\(app\.getName\(\)\)/.test(main), 'main.js 应使用 getAppExeName(app.getName())')
  assert.ok(!/const APP_EXE = 'MindMap\.exe'/.test(main), '不得再写死 MindMap.exe')
})

test('[自动保存] Edit.vue 接入 initAutosave 与 autosave 调度', () => {
  const vue = read(new URL('pages/Edit/components/Edit.vue', SRC))
  assert.ok(/initAutosave/.test(vue), 'Edit.vue 应包含 initAutosave 初始化')
  assert.ok(/autosaveScheduler/.test(vue), 'Edit.vue 应持有 autosaveScheduler 实例')
  assert.ok(/createAutosaveScheduler/.test(vue), 'Edit.vue 应调用 createAutosaveScheduler')
  assert.ok(/silentSaveToFile/.test(vue), 'Edit.vue 应实现 silentSaveToFile 静默写盘')
})

test('[自动保存] autosave.js 零依赖（不 import @/ 别名，可在 Node 单测）', () => {
  const src = read(new URL('utils/autosave.js', SRC))
  assert.ok(!/from ['"]@\//.test(src), 'autosave.js 不得依赖 @/ 别名（否则 Node 单测无法解析）')
  assert.ok(/createAutosaveScheduler/.test(src), 'autosave.js 应导出 createAutosaveScheduler')
  assert.ok(/resolveAutosaveTarget/.test(src), 'autosave.js 应导出 resolveAutosaveTarget')
})

test('[自动保存] Setting.vue 暴露 autosave 开关与间隔', () => {
  const vue = read(new URL('pages/Edit/components/Setting.vue', SRC))
  assert.ok(/updateLocalConfig\('autosave'/.test(vue), 'Setting.vue 应绑定 autosave 开关')
  assert.ok(/updateLocalConfig\('autosaveDelay'/.test(vue), 'Setting.vue 应绑定 autosaveDelay 间隔')
})

// ===== 修复：退出前丢盘（HIGH）=====
// beforeunload 是同步上下文，异步 ipcRenderer.invoke 写盘来不及完成会丢文件，
// 必须改用同步 IPC（sendSync）在窗口关闭前完成落盘。
test('[退出丢盘] preload 暴露同步写盘 writeFileSync（sendSync）', () => {
  const pre = read(new URL('preload.js', APP))
  assert.ok(/writeFileSync:/.test(pre), 'preload.js 应暴露 writeFileSync')
  assert.ok(
    /ipcRenderer\.sendSync\('smm:write-file-sync'/.test(pre),
    'writeFileSync 应走 ipcRenderer.sendSync（同步）而非 invoke'
  )
})

test('[退出丢盘] main.js 注册 smm:write-file-sync 同步处理器（fs.writeFileSync + returnValue）', () => {
  const main = read(new URL('main.js', APP))
  assert.ok(/smm:write-file-sync/.test(main), 'main.js 应注册 smm:write-file-sync 处理器')
  assert.ok(/fs\.writeFileSync/.test(main), '同步处理器应使用 fs.writeFileSync')
  assert.ok(/event\.returnValue/.test(main), 'sendSync 处理器必须用 event.returnValue 返回结果')
})

test('[退出丢盘] Edit.vue 在 beforeunload 走同步落盘 syncSaveOnExit（不再依赖异步 flush）', () => {
  const vue = read(new URL('pages/Edit/components/Edit.vue', SRC))
  assert.ok(/syncSaveOnExit/.test(vue), 'Edit.vue 应实现 syncSaveOnExit 同步落盘方法')
  assert.ok(
    /handleBeforeUnload\(\)\s*\{[\s\S]*?syncSaveOnExit\(\)/.test(vue),
    'handleBeforeUnload 应调用 syncSaveOnExit 同步落盘'
  )
  // 视图已收口到 bridge 的 shell 网关（不再直调 window.smmApi）；
  // 同步语义由 shell.writeFileSync 保证 —— 这里额外断言**没有 await**，
  // 否则会退化成"发起写盘就销毁窗口"，一样丢文件。
  assert.ok(/shell\.writeFileSync\(/.test(vue), 'syncSaveOnExit 应经 shell 网关同步写盘')
  assert.strictEqual(
    /await\s+shell\.writeFileSync\(/.test(vue), false,
    'syncSaveOnExit 不得 await（beforeunload 是同步上下文，await 等于没写）'
  )
})

// ===== 修复：storeData 三写放大（MED）=====
// 历史冗余键 SIMPLE_MIND_MAP_DATA / SIMPLE_MIND_MAP_SHEETS 在 web/src 无任何读取方，
// 每次编辑却要重复序列化写 localStorage 三次，大图下放大配额压力。现仅保留
// workbookState.persistState() 写入 SIMPLE_MIND_MAP_WORKBOOKS 单一权威来源。
test('[存储三写] api/index.js 移除冗余的 SIMPLE_MIND_MAP_DATA / SHEETS 写入', () => {
  const src = read(new URL('api/index.js', SRC))
  assert.ok(
    !/localStorage\.setItem\(SIMPLE_MIND_MAP_DATA/.test(src),
    '不得再写 SIMPLE_MIND_MAP_DATA 兼容键'
  )
  assert.ok(
    !/localStorage\.setItem\(SIMPLE_MIND_MAP_SHEETS/.test(src),
    '不得再写 SIMPLE_MIND_MAP_SHEETS 兼容键'
  )
  assert.ok(/WB\.persistState\(\)/.test(src), '应保留 workbookState.persistState() 单一权威写入')
})

// ===== 修复：切换文件误标 dirty（MED）=====
// simple-mind-map 的 data_change 是渲染后触发的异步事件，原 setTimeout(80)
// 经常在事件到达前就放行，导致切换文件后被错误地标 dirty。
// 现改为监听 node_tree_render_end 兜底（一次完整渲染结束才放行）。
test('[dirty 误报] Edit.vue loadSheetData 用 node_tree_render_end 兜底，不用 setTimeout(80)', () => {
  const vue = read(new URL('pages/Edit/components/Edit.vue', SRC))
  // 一次性注册 on/off 模式
  assert.ok(
    /mindMap\.on\(['"]node_tree_render_end['"]/.test(vue),
    'loadSheetData 应 mindMap.on(node_tree_render_end) 监听渲染结束'
  )
  assert.ok(
    /mindMap\.off\(['"]node_tree_render_end['"]/.test(vue),
    'loadSheetData 应 mindMap.off(node_tree_render_end) 一次性解绑'
  )
  // 旧的 80ms setTimeout 不应再出现
  assert.ok(
    !/setTimeout\(\(\)\s*=>\s*\{[\s\S]*?_isLoading\s*=\s*false[\s\S]*?\}\s*,\s*80\s*\)/.test(vue),
    'loadSheetData 不应再用 setTimeout(80) 放行 dirty 守卫'
  )
  // bindSaveEvent 中 dirty 守卫仍以 _isLoading 为准
  assert.ok(/if\s*\(this\._isLoading\)\s*return/.test(vue), 'bindSaveEvent 仍应保留 _isLoading 守卫')
  // 2026-09-21 启动异常「容器元素el的宽高不能为0」：Index.vue 用 v-show 保留导图实例，
  // 激活页是 Markdown 时导图容器 display:none → 宽高 0 → simple-mind-map 构造抛错。
  // 修复：容器不可见时延后创建（ResizeObserver 等尺寸就绪），数据入口先挂起、就绪后补执行。
  assert.ok(/initWhenReady\s*\(\)\s*\{/.test(vue), 'Edit.vue 应有 initWhenReady 容器可见性守卫')
  assert.ok(/new ResizeObserver/.test(vue), 'initWhenReady 应用 ResizeObserver 等容器尺寸就绪')
  assert.ok(
    /mounted\(\)\s*\{[\s\S]{0,200}?this\.initWhenReady\(\)/.test(vue),
    'mounted 应走 initWhenReady（不得在容器可能隐藏时直接 init）'
  )
  assert.ok(
    (vue.match(/if \(this\.deferUntilReady\(/g) || []).length >= 2,
    'loadSheetData 与 setData 都应通过 deferUntilReady 挂起未就绪期的数据调用'
  )
  assert.ok(/flushPendingReadyCall/.test(vue), '实例就绪后应 flushPendingReadyCall 补执行挂起调用')
  assert.ok(
    /if \(this\.mindMap\) this\.mindMap\.destroy\(\)/.test(vue),
    'beforeUnmount 的 destroy 必须判空（容器一直不可见时从未创建实例）'
  )
  // md 内嵌 .smm 预览同样兜底，避免同类异常冒到全局报错横幅
  const preview = read(new URL('pages/Edit/components/MindMapPreview.vue', SRC))
  assert.ok(/catch \(e\)/.test(preview), 'MindMapPreview 的 new MindMap 应 try/catch 兜底')
  assert.ok(/getBoundingClientRect\(\)/.test(preview), 'MindMapPreview 构造前应校验容器尺寸非 0')
  // 实例未就绪期（mindMap=null）的连带空指针：窗口 resize / 全屏切换都会触达 resize
  assert.ok(
    /handleResize\(\)\s*\{[\s\S]{0,200}?if \(this\.mindMap\) this\.mindMap\.resize\(\)/.test(vue),
    'handleResize 必须判空（md 页启动时实例未建，窗口 resize/全屏会触发）'
  )
  const fullscreen = read(new URL('pages/Edit/components/Fullscreen.vue', SRC))
  assert.ok(
    /if \(this\.mindMap\) this\.mindMap\.resize\(\)/.test(fullscreen),
    'Fullscreen 的 fullscreenchange 回调必须判空（mindMap prop 经事件广播，可能为 null）'
  )
  assert.ok(
    /toFullscreenShow\(\)\s*\{\s*if \(!this\.mindMap\) return/.test(fullscreen),
    'toFullscreenShow 必须在实例未建时直接返回（否则 fullScreen(this.mindMap.el) 抛错）'
  )
})

// ===== 修复：右侧 SidebarTrigger 上下黑框（MED）=====
// 容器原来用 `position:fixed; top:110px; bottom:80px` 撑满中部，但 trigger 卡片
// 高度只够 6*60=360px，容器多出的 75px 透明空白在深色画布下显示为黑框。
// 现删除 bottom，trigger 自身用 max-height: calc(100vh - 190px) 防溢出。
test('[trigger 黑框] SidebarTrigger.vue 删除 bottom:80px，让容器高度 = 内容高度', () => {
  const vue = read(new URL('pages/Edit/components/SidebarTrigger.vue', SRC))
  // 容器不再 fixed bottom
  assert.ok(
    !/position:\s*fixed;[\s\S]{0,200}bottom:\s*80px/.test(vue),
    '容器不应再同时固定 top 与 bottom（会撑出上下空白）'
  )
  // trigger 自身 max-height 用 calc(100vh - 190px) 防溢出
  assert.ok(
    /max-height:\s*calc\(100vh\s*-\s*190px\)/.test(vue),
    'trigger 应使用 max-height: calc(100vh - 190px) 防溢出'
  )
})

test('[trigger 黑框] SidebarTrigger.vue 模板不再把 maxHeight 绑到容器 inline style', () => {
  const vue = read(new URL('pages/Edit/components/SidebarTrigger.vue', SRC))
  assert.ok(
    !/maxHeight:\s*maxHeight\s*\+\s*'px'/.test(vue),
    '模板里不应再将 maxHeight 数据绑到 sidebarTriggerContainer 容器 style'
  )
})

// ===== 修复：右边菜单栏黑边（Sidebar 阴影泄漏）（MED）=====
// 复现：侧栏未弹出时（right:-320px 隐藏态），box-shadow:-16px 0 44px rgba(0,0,0,0.16)
// 仍在容器左侧画阴影，阴影向画布渗出 44px → 深色画布下显示为右边黑边。
// 修复：box-shadow 移到 .sidebarContainer.show 内，仅展开时生效。
test('[sidebar 黑边] Sidebar.vue 把 box-shadow 从容器 base 移到 .show', () => {
  const vue = read(new URL('pages/Edit/components/Sidebar.vue', SRC))
  // base 容器不应再带 box-shadow
  const baseMatch = /\.sidebarContainer\s*\{[^}]*\}/.exec(vue)
  assert.ok(baseMatch, '应能找到 .sidebarContainer base rule')
  const baseBlock = baseMatch[0]
  assert.ok(
    !/box-shadow:\s*-16px 0 44px/.test(baseBlock),
    'base .sidebarContainer 不应带 box-shadow（防隐藏态阴影泄漏）'
  )
  // .show rule 内应有 box-shadow（LESS 嵌套写法：&.show { ... }）
  const showMatch = /&\.show\s*\{[^}]*\}/.exec(vue)
  assert.ok(showMatch, '应能找到 &.show 嵌套 rule（LESS 编译后 = .sidebarContainer.show）')
  const showBlock = showMatch[0]
  assert.ok(
    /box-shadow:\s*-16px 0 44px/.test(showBlock),
    'show rule 应带 box-shadow（仅展开态生效）'
  )
})

// ===== 修复：throttled addHistory 绕过 dirty 守卫（HIGH）=====
// 复现：切换/打开文件时，simple-mind-map 的 addHistory 被 throttle 100ms，
// 但 node_tree_render_end 在 reRender 后 ~16ms 就触发；v1.0.18 仅以
// node_tree_render_end 为 _isLoading 清零信号，导致 100ms 后节流 timer 落地、
// emit data_change 时 _isLoading 已为 false → 新载入文件被误标 dirty。
// 修复：在 onRenderEnd 内显式调一次 originAddHistory()（未节流），让 history 快照
// 同步落库并被 _isLoading 守卫挡住；后续节流 timer 的 addHistory 走 lastDataStr
// 去重逻辑、不再 emit data_change。
test('[dirty 节流竞态] Edit.vue loadSheetData 用 originAddHistory 同步落库', () => {
  const vue = read(new URL('pages/Edit/components/Edit.vue', SRC))
  assert.ok(
    /command\.originAddHistory\s*\(\s*\)/.test(vue),
    '应在 onRenderEnd 调一次 originAddHistory()，防节流 addHistory 绕过 _isLoading 守卫'
  )
  // originAddHistory 调用必须在 loadSheetData / onRenderEnd 上下文里（不在其他全局位置）
  const loadSheet = /loadSheetData\(data\)\s*\{[\s\S]*?\}\s*,/.exec(vue)
  assert.ok(loadSheet, '应能找到 loadSheetData 函数体')
  assert.ok(
    /command\.originAddHistory/.test(loadSheet[0]),
    'originAddHistory 调用应在 loadSheetData 内（onRenderEnd 闭包中）'
  )
})

// ===== 修复：修改备注对话框弹出时不应同时显示右侧备注侧栏（MED）=====
// 复现：触发"修改备注"（右键节点 → 备注，或节点选中工具条 → 📝 图标）后，左侧
// NodeNote 对话框（toastui Editor）会与右侧 NodeNoteSidebar 同步显示，两份完全
// 相同的备注内容叠加，挤占画布视野。
// 修复：在 handleShowNodeNote 内（设置 dialogVisible=true 之前）emit
// 'closeSideBar'，所有 <Sidebar> 实例响应并 setActiveSidebar(null)，右侧栏即
// 时收回。语义上"修改备注"是模态编辑，与 Search.vue:156 emit closeSideBar
// 保持一致。
test('[sidebar 重复弹出] NodeNote.vue handleShowNodeNote 触发时 emit closeSideBar', () => {
  const vue = read(new URL('pages/Edit/components/NodeNote.vue', SRC))
  // 1) 应有 handleShowNodeNote 方法体
  const handler = /handleShowNodeNote\s*\(\s*node\s*\)\s*\{[\s\S]*?\n\s\s\s\s\},/.exec(vue)
  assert.ok(handler, '应能找到 handleShowNodeNote 方法体')
  // 2) 在该方法体内必须 emit closeSideBar
  assert.ok(
    /\$bus\.\$emit\(\s*['"]closeSideBar['"]\s*\)/.test(handler[0]),
    'handleShowNodeNote 内必须 emit closeSideBar，防止右侧备注侧栏与对话框同时显示'
  )
  // 3) emit 必须在 dialogVisible = true 之前（先关 sidebar 再显示对话框）
  const emitIdx = handler[0].indexOf("$bus.$emit('closeSideBar')")
  const dialogIdx = handler[0].indexOf('dialogVisible = true')
  assert.ok(emitIdx > -1 && dialogIdx > -1, '应能找到 emit 与 dialogVisible 赋值')
  assert.ok(emitIdx < dialogIdx, 'emit closeSideBar 必须先于 dialogVisible=true')
  // 4) startTextEdit 应仍然在 handleShowNodeNote 触发（保持画布文本编辑撤销）
  assert.ok(
    /\$bus\.\$emit\(\s*['"]startTextEdit['"]\s*\)/.test(handler[0]),
    'handleShowNodeNote 仍应 emit startTextEdit（不破坏现有画布编辑衔接）'
  )
})

// ===== 修复：备注对话框点击周围区域「不」关闭（MEDIUM）=====
// 诉求：打开「修改备注」对话框后，只有取消/确定/叉号能关；点遮罩或画布等
// 周围空白区域「不应」关闭，以免误点导致未保存的备注内容丢失。
// 实现：el-dialog 显式 :close-on-click-modal="false"，且不要任何
// document mousedown 兜底关闭逻辑（v1.0.20 曾错误地加了「点外面关闭」，
// 与用户诉求相反，本次回退）。
test('[备注对话框点击外不关] NodeNote.vue 点击外部区域不应关闭', () => {
  const vue = read(new URL('pages/Edit/components/NodeNote.vue', SRC))
  // 1) el-dialog 必须显式声明 close-on-click-modal=false（防止点遮罩误关）
  assert.ok(
    /:close-on-click-modal="false"/.test(vue),
    'el-dialog 必须显式 :close-on-click-modal="false"，点遮罩/画布不关闭对话框'
  )
  // 2) 绝不能有 document mousedown 监听去「点外面关闭」（这是 v1.0.20 的错误实现）
  assert.ok(
    !/document\.addEventListener\(\s*['"]mousedown['"]/.test(vue),
    'NodeNote 不应注册 document mousedown 监听——点外部关闭会与「防误丢」诉求冲突'
  )
  // 3) 不应存在 _onDocMouseDown 兜底关闭回调
  assert.ok(
    !/_onDocMouseDown/.test(vue),
    '不应存在 _onDocMouseDown（点外部关闭的兜底回调）'
  )
  // 4) 也不应挂载时注册、卸载时注销此类监听
  assert.ok(
    !/removeEventListener\(\s*['"]mousedown['"]/.test(vue),
    'beforeDestroy 不应残留 mousedown 监听注销逻辑'
  )
  // 5) mounted 钩子不应再存在（v1.0.20 的关闭逻辑挂在 mounted 里）
  assert.ok(
    !/mounted\s*\(\)\s*\{/.test(vue),
    'NodeNote 不应再有 mounted 钩子（点外部关闭逻辑已整体移除）'
  )
})

// ===== 修复：跨工作表复制带图节点后图片破图（HIGH）=====
// 复现：NodeBase64ImageStorage 把 base64 节点图片抽成 key 存在「每个工作表各一份」
// 的 imgMap 里，而 simple-mind-map 的复制只带节点 data（image 字段是 smm_img_key_xxx），
// 跨表粘贴后目标表 imgMap 无此 key → 地址退化为 'smm_img_key_xxx' 字符串 → 破图。
// 修复：模块级 key 注册表跨表共享 + beforeAddHistory 钩子补全悬空 key + 载入前预修复老文件。
test('[跨表图片] Edit.vue 接入 nodeImageKeys 修复（import + 钩子 + 载入预修复）', () => {
  const vue = read(new URL('pages/Edit/components/Edit.vue', SRC))
  // 1) 必须 import 修复工具
  assert.ok(
    /from\s+['"]@\/utils\/nodeImageKeys['"]/.test(vue),
    'Edit.vue 应 import @/utils/nodeImageKeys 修复工具'
  )
  assert.ok(
    /harvestImageKeysFromContainer/.test(vue),
    'Edit.vue 应调用 harvestImageKeysFromContainer 登记工作簿图片 key'
  )
  assert.ok(
    /repairDanglingImageKeys/.test(vue),
    'Edit.vue 应调用 repairDanglingImageKeys 补全悬空 key'
  )
  // 2) mounted 里注册 beforeAddHistory 钩子，且绑到 handleBeforeAddHistory
  assert.ok(
    /mindMap\.on\(\s*['"]beforeAddHistory['"]\s*,\s*this\.handleBeforeAddHistory\s*\)/.test(vue),
    'mounted 应 mindMap.on(beforeAddHistory, handleBeforeAddHistory) 注册修复钩子'
  )
  // 3) 必须定义 handleBeforeAddHistory 方法体
  const handler = /handleBeforeAddHistory\s*\(\)\s*\{[\s\S]*?\n\s\s\s\s\},/.exec(vue)
  assert.ok(handler, '应能找到 handleBeforeAddHistory 方法体')
  assert.ok(
    /repairDanglingImageKeys\(tree\)/.test(handler[0]),
    'handleBeforeAddHistory 内必须 repairDanglingImageKeys(tree) 补全悬空 key'
  )
  assert.ok(
    /this\.mindMap\.reRender\(\)/.test(handler[0]),
    'handleBeforeAddHistory 补全后应 reRender() 重绘（否则画布仍是悬空 key）'
  )
  // 4) beforeDestroy 解绑，防组件复用/切换时重复触发
  assert.ok(
    /mindMap\.off\(\s*['"]beforeAddHistory['"]\s*,\s*this\.handleBeforeAddHistory\s*\)/.test(vue),
    'beforeDestroy 应 mindMap.off(beforeAddHistory, handleBeforeAddHistory) 解绑'
  )
  // 5) loadSheetData 载入前预修复老文件残留的悬空 key
  const loadSheet = /loadSheetData\(data\)\s*\{[\s\S]*?\n\s\s\s\s\},/.exec(vue)
  assert.ok(loadSheet, '应能找到 loadSheetData 方法体')
  assert.ok(
    /harvestImageKeysFromContainer\(getSheetsContainer\(\)\)/.test(loadSheet[0]),
    'loadSheetData 载入前应 harvestImageKeysFromContainer 登记全工作簿 key'
  )
  assert.ok(
    /repairDanglingImageKeys\(data\)/.test(loadSheet[0]),
    'loadSheetData 载入前应 repairDanglingImageKeys(data) 修老文件悬空 key'
  )
})

// ===== 2026-09-21 四连修（offset 诊断 / 引用块折叠 / 统一搜索 / 蓝色竖条）=====

test('[引用块折叠] RefBlock 默认折叠预览，可展开', () => {
  const vue = read(new URL('pages/Edit/components/RefBlock.vue', SRC))
  assert.ok(/expanded:\s*false/.test(vue), 'RefBlock 应有 expanded 状态，默认 false')
  assert.ok(/rbCollapsed:\s*!expanded/.test(vue), 'rbContent 应绑定 rbCollapsed')
  assert.ok(/展开全部/.test(vue), '应有展开全部/收起切换')
})

test('[备注二选一] NodeNote 写备注/引用章节互斥，永不共存', () => {
  const vue = read(new URL('pages/Edit/components/NodeNote.vue', SRC))
  // v1.6：标题行二选一模式切换（写备注 | 引用章节）
  assert.ok(/class="modeSwitch"/.test(vue), '应有 modeSwitch 模式切换控件')
  assert.ok(/switchMode\('note'\)/.test(vue) && /switchMode\('ref'\)/.test(vue), '两个模式按钮都应绑定 switchMode')
  // 条件渲染：弹窗内任意时刻只显示其一（v-if mode === 'note' / v-else）
  assert.ok(/v-if="mode === 'note'"/.test(vue), "note 区域应 v-if mode==='note' 条件渲染")
  assert.ok(/mode === 'ref'/.test(vue), '应有 ref 模式分支')
  // 禁止"引用块和备注同屏显示"：refArea 不得再嵌在 noteBox 内（noteBox 只包编辑器）
  const iNoteBox = vue.indexOf('.noteBox {')
  const iRefArea = vue.indexOf('class="refArea"')
  assert.ok(iNoteBox > -1 && iRefArea > -1, 'noteBox 与 refArea 应同时存在')
  // 切换时的二次确认文案（§v1.6 2.3）
  assert.ok(/切换会清空当前备注文字/.test(vue), 'note→ref 应有清空备注确认')
  assert.ok(/切换会删除当前引用/.test(vue), 'ref→note 应有删除引用确认')
  assert.ok(/源 md 文件不受影响/.test(vue), '确认文案应说明源文件不受影响')
  // 保存按模式分流（§v1.6 三）
  assert.ok(/setMode\(node, 'note'\)/.test(vue), "confirm note 模式应 setMode(node,'note')")
  assert.ok(/setMode\(node, 'ref'\)/.test(vue), "confirm ref 模式应 setMode(node,'ref')")
  // 关闭防丢（§v1.6 三）：未保存改动须确认
  assert.ok(/放弃修改/.test(vue), '取消时应弹「放弃修改」确认')
  // ref 模式空态（§v1.6 2.2）
  assert.ok(/尚未引用任何章节/.test(vue), 'ref 模式无引用应显示空态')
  assert.ok(/class="refEmpty"/.test(vue), '空态应有 refEmpty 容器')
  // 编辑器自适应高度保留（v2.0.19 修复不回退）
  assert.ok(/height:\s*'auto'/.test(vue), '编辑器应 height:auto 自适应内容，不得固定 500px')
  assert.ok(!/height:\s*'500px'/.test(vue), '编辑器不应再固定 500px 高度')
  assert.ok(/\.toastui-editor-ww-container\s*\{[^}]*min-height/s.test(vue), '编辑区应有 min-height 保底编辑落点')
  assert.ok(/\.toastui-editor-ww-container\s*\{[^}]*max-height/s.test(vue), '编辑区应有 max-height 过长内部滚动')
  // 2026-09-21 反馈「框再大一点，高度增加一倍」：弹窗高度翻倍，
  // ref 模式（引用区）与 note 模式（编辑区）最小高度同时提到 400px，两模式等高
  assert.ok(
    /\.refArea\s*\{[^}]*min-height:\s*400px/s.test(vue),
    '引用区应有 400px 最小高度（弹窗高度翻倍）'
  )
  assert.ok(
    />\s*\.refBlock\s*\{[^}]*flex:\s*1/s.test(vue),
    '引用卡片应撑满引用区（占满放大的弹窗）'
  )
  assert.ok(
    /\.toastui-editor-ww-container\s*\{[^}]*min-height:\s*400px/s.test(vue),
    '编辑区最小高度应与引用区等高(400px)'
  )
})

test('[引用块视觉弱化] RefBlock 左紫竖线+浅紫底，去四边框', () => {
  const vue = read(new URL('pages/Edit/components/RefBlock.vue', SRC))
  // 去四边框（"像输入框"主因）→ 左侧 4px 紫竖线 + 浅紫底（§v1.6 2.4）
  assert.ok(/\.refBlock\s*\{[^}]*border:\s*none/s.test(vue), '引用块应去掉四边边框')
  assert.ok(/\.refBlock\s*\{[^}]*border-left:\s*4px[^;]*124,\s*58,\s*237/s.test(vue), '引用块应有左侧 4px 紫色竖线')
  assert.ok(/\.refBlock\s*\{[^}]*background:\s*rgba\(124,\s*58,\s*237,\s*0\.0\d\)/s.test(vue), '引用块应有浅紫背景')
  // 头部 ✏️ 编辑按钮（只读渲染，点此进入编辑）
  assert.ok(/rbEditBtn/.test(vue), '头部应有 ✏️ 编辑按钮')
  assert.ok(/toggleEdit/.test(vue), '✏️ 按钮应绑定 toggleEdit')
  // 警示只在编辑态显示（只读浏览不占视觉）
  assert.ok(/v-if="editing"[^>]*class="rbWarn"|class="rbWarn"[^>]*v-if="editing"|v-if="editing"\s*class="rbWarn"/.test(vue), 'rbWarn 应仅在编辑态渲染')
  // 2026-09-21 弹窗高度翻倍后卡片同步放大：纵向 flex 撑满、操作行贴底、预览行数放大
  assert.ok(
    /\.refBlock\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s.test(vue),
    '引用卡片应改纵向 flex（撑满引用区、操作行贴底）'
  )
  assert.ok(/\.rbTools\s*\{[^}]*margin:\s*auto/s.test(vue), '操作行应贴卡片底部(margin:auto)')
  assert.ok(/\.rbCollapsed\s*\{[^}]*max-height:\s*150px/s.test(vue), '折叠预览应放大到 150px（约 7 行）')
  // 展开预览契约见上方「[引用块折叠]」既有用例，此处不重复
})

test('[统一搜索] WorkspacePanel 去掉模式切换，单框同搜 md+smm', () => {
  const vue = read(new URL('pages/Edit/components/WorkspacePanel.vue', SRC))
  assert.ok(!/searchMode/.test(vue), '不得再保留 searchMode 模式切换')
  assert.ok(!/wsSearchTabs/.test(vue), '不得再保留 wsSearchTabs 标签')
  assert.ok(!/nodeSearchResults/.test(vue), '不得再保留 nodeSearchResults 旧字段')
  assert.ok(/runSmmSearch/.test(vue), '应实现 runSmmSearch 搜 smm 文件')
  assert.ok(/collectSmmFiles/.test(vue), '应实现 collectSmmFiles 收集工作区 smm')
  assert.ok(/searchSmmContainer/.test(vue), '应复用 utils/smmSearch 的 searchSmmContainer')
  assert.ok(/decodeSmm/.test(vue), '应用 decodeSmm 解析 smm 容器')
  // 目录折叠：点击目录行 toggleDir 切换 collapsedDirs，flatFiles 跳过折叠目录子级，状态按工作区持久化
  assert.ok(/collapsedDirs:\s*\[\]/.test(vue), '应有 collapsedDirs 状态')
  assert.ok(/toggleDir\(/.test(vue), '应实现 toggleDir 折叠切换')
  assert.ok(/isDirCollapsed\(/.test(vue), '应实现 isDirCollapsed 判定')
  assert.ok(/if \(f\.isDir\) return this\.toggleDir\(f\.path\)/.test(vue), '点击目录行应切换折叠而非无反应')
  assert.ok(/kw \|\| !this\.isDirCollapsed\(n\.path\)/.test(vue), '无过滤词时折叠目录不递归子级；搜索时自动展开')
  assert.ok(/wsCollapsedDirs:/.test(vue), '折叠状态应按工作区 root 持久化到 localStorage')
  assert.ok(/class="wsCaret"/.test(vue), '目录行应有折叠箭头 wsCaret')
})

test('[live搜索] mindMap 实例经 mindmap-inited 事件广播（$refs 非响应式 prop 恒 null）', () => {
  const edit = read(new URL('pages/Edit/components/Edit.vue', SRC))
  assert.ok(/\$bus\.\$emit\('mindmap-inited', this\.mindMap\)/.test(edit), 'Edit.vue 创建 mindMap 后应广播 mindmap-inited')
  const vue = read(new URL('pages/Edit/components/WorkspacePanel.vue', SRC))
  assert.ok(/\$bus\.\$on\('mindmap-inited'/.test(vue), 'WorkspacePanel 应监听 mindmap-inited')
  assert.ok(/liveMindMap/.test(vue), '应有 liveMindMap 存实例')
  assert.ok(/activeMind\(\)/.test(vue), '应经 activeMind() 取可用实例')
  assert.ok(/liveAvailable/.test(vue), '无 live 实例时磁盘搜索不应跳过当前文件')
})

test('[蓝色竖条] wsPill 与右侧 SidebarTrigger 同款外观', () => {
  const vue = read(new URL('pages/Edit/components/WorkspacePanel.vue', SRC))
  assert.ok(/iconjiantouyou/.test(vue), 'wsPill 应使用与右侧一致的箭头图标 iconjiantouyou')
  // ⚠️ 尺寸口径 = 右侧「实际可见」的蓝缝，不是右侧 CSS 里的 35×60：
  //    右侧 toggleShowBtn 被白色侧栏卡片盖住，常态只露 6px、hover 滑出 18px。
  //    左侧 wsPill 无遮挡（z-index:3000），照抄 35×60 会整块露出 → 用户反馈「太大了」。
  assert.ok(
    /^\s*width:\s*6px/m.test(vue),
    'wsPill 常态宽度应为 6px（= 右侧实际可见蓝缝宽度），不得用 35px 整块外露'
  )
  assert.ok(
    /&:hover\s*\{[^}]*width:\s*18px/s.test(vue),
    'wsPill 悬停应滑出到 18px（与右侧 hover 可见宽度一致）'
  )
  assert.ok(
    /\.wsPillIcon\s*\{[^}]*opacity:\s*0/s.test(vue),
    '6px 细缝放不下图标：常态图标 opacity:0，悬停滑出后再显示'
  )
  assert.ok(
    /&:hover\s+\.wsPillIcon\s*\{[^}]*opacity:\s*1/s.test(vue),
    '悬停时图标应显现'
  )
  assert.ok(!/box-shadow/.test(vue.slice(vue.lastIndexOf('<style lang="less">'))), '蓝缝不应带阴影（与右侧无阴影观感一致）')
  assert.ok(/border-top-right-radius:\s*10px/.test(vue), '蓝条圆角应与右侧一致(10px)')
  assert.ok(/<Teleport to="body">/.test(vue), '蓝条必须 Teleport 到 body（否则被 fixed 画布盖住，收起后找不到）')
  assert.ok(/z-index:\s*3000/.test(vue), '蓝条 z-index 必须高于画布')
  // ⚠️ 2026-09-21 真根因：Teleport 到 body 后祖先不再是 .workspacePanel，scoped 编译出的
  //    `.workspacePanel .wsPill[data-v-x]` 与 DOM 结构不匹配 → 规则整条失效 → 蓝块无样式。
  //    用户反馈「加一个蓝色的块，隐藏文件树栏」即此。规则必须落在非 scoped 样式块里。
  const iScoped = vue.indexOf('<style lang="less" scoped>')
  const iGlobal = vue.lastIndexOf('<style lang="less">')
  assert.ok(
    iScoped > -1 && iGlobal > iScoped,
    '必须有独立的非 scoped <style lang="less"> 块承载 .wsPill（Teleport 节点不受 scoped 保护）'
  )
  const globalCss = vue.slice(iGlobal)
  assert.ok(/^\.wsPill\s*\{/m.test(globalCss), 'wsPill 基本规则必须写在全局样式块内')
  assert.ok(/left:\s*240px/.test(globalCss), '展开态：蓝块贴文件栏右缘(240px)完全可见')
  assert.ok(
    /collapsed\s*\{[^}]*left:\s*0/s.test(globalCss),
    '收起态：蓝块贴屏幕左缘(left:0)'
  )
})

test('[错误诊断] renderer.log 改写到 userData（Program Files 不可写）', () => {
  const main = read(new URL('main.js', APP))
  assert.ok(/rendererLogPath/.test(main), 'main.js 应实现 rendererLogPath()')
  assert.ok(/app\.getPath\('userData'\)/.test(main), '日志应落 userData（必可写）')
  assert.ok(!/path\.join\(APP_DIR, '\.\.', 'renderer\.log'\)/.test(main), '不得再写 Program Files 下的 renderer.log')
})

test('[错误诊断] Vue errorHandler 附加组件名', () => {
  const main = read(new URL('main.js', SRC))
  assert.ok(/t\.name \|\| t\.__name/.test(main), 'errorHandler 应取组件 name/__name')
  assert.ok(/'@' \+ comp/.test(main), 'kind 应附加 @组件名')
})

