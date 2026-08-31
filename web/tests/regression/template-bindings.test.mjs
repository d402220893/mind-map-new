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
  assert.ok(/window\.smmApi\.writeFileSync/.test(vue), 'syncSaveOnExit 应调用 window.smmApi.writeFileSync')
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
