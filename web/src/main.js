import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import '@/assets/icon-font/iconfont.css'
// element-ui 的字体图标（el-icon-*）。
// Element Plus 移除了内置图标字体，但本工程模板中有约 25 处沿用 el-icon-xxx 类名，
// 这里把这套字体与类定义随项目一起维护，避免改模板。
import '@/assets/icon-font/element-icons/icon.css'
import 'viewerjs/dist/viewer.css'
import VueViewer from 'v-viewer'
import i18n from './i18n'
import { getLang } from '@/api'
import bus from '@/utils/eventBus'
// 服务层（L0–L4 + 组合根）与视图之间的门面：内部持有服务单例，并把
// tabs / confirm / importer 三个运行时钩子补挂进去（组合根创建时 UI 尚未挂载）。
import {
  tabsAdapter,
  getServices,
  startEventBridge,
  startFsBridge
} from '@/utils/workspaceBridge'
import { nsHas } from '@/utils/lateBind.js'
// import VConsole from 'vconsole'
// const vConsole = new VConsole()

// ─────────────────────────────────────────────────────────────────────────────
// 启动诊断：白屏 = Vue 挂载前抛异常，页面一片空白且用户无从下手。
// 这里做三件事，让"白屏"这种故障**不可能再静默发生**：
//   ① 全局捕获 error / unhandledrejection / Vue 渲染异常 → 交给主进程落盘
//      （主进程 webContents 'console-message' 把 level>=2 写进 resources/renderer.log，
//        level>=3 还会弹原生错误框 —— 所以报错不要吞掉：致命用 console.error，降级用 console.warn）
//   ② 服务层装配失败**不阻断挂载**（降级运行，侧栏/双链不可用但导图仍能用）
//   ③ 挂载后看门狗：若 #app 内没有任何元素（真白屏），把错误原文渲染到页面上
// ─────────────────────────────────────────────────────────────────────────────
const startupErrors = []

function describe(err) {
  if (!err) return '(no detail)'
  if (err.stack) return String(err.stack)
  if (err.message) return String(err.message)
  return String(err)
}

/**
 * @param {string} kind 阶段名
 * @param {any} err 错误
 * @param {boolean} fatal true=致命（弹原生框 + 全屏面板）；false=可降级（仅日志 + 顶部横幅）
 */
function recordError(kind, err, fatal = false) {
  const text = describe(err)
  startupErrors.push({ kind, text, fatal })
  window.__STARTUP_ERRORS__ = startupErrors
  // ⚠️ 主进程只捕获 level>=2：console.warn(2) 落 renderer.log，console.error(3) 还会弹框。
  //    非致命错误只 warn，避免"每次启动都弹窗"把用户训练成无脑点掉。
  try {
    if (fatal) console.error('[思绪] ' + kind + ' → ' + text)
    else console.warn('[思绪] ' + kind + ' → ' + text)
  } catch (e) {
    /* 控制台本身不可用时不阻塞 */
  }
  // 非致命：把问题顶到页面顶部（可关闭），用户能直接截图反馈，不用去翻日志
  if (!fatal) showErrorBanner()
}

function showErrorBanner() {
  try {
    const host = document.body
    if (!host || document.querySelector('[data-startup-banner]')) return
    const bar = document.createElement('div')
    bar.setAttribute('data-startup-banner', '1')
    bar.style.cssText = [
      'position:fixed', 'left:0', 'right:0', 'top:0', 'z-index:99998',
      'background:#fdf3d0', 'color:#6b5200', 'border-bottom:1px solid #f0dda0',
      'padding:6px 34px 6px 12px', 'font:12px/1.6 -apple-system,"Segoe UI",sans-serif'
    ].join(';')
    const msg = document.createElement('span')
    const first = startupErrors[0]
    msg.textContent =
      '启动时有 ' + startupErrors.length + ' 项异常（功能可能不完整）：' +
      (first ? first.kind + ' — ' + first.text.split('\n')[0].slice(0, 160) : '') +
      '　完整日志见程序目录 resources/renderer.log'
    const close = document.createElement('span')
    close.textContent = '✕'
    close.style.cssText = 'position:absolute;right:10px;top:4px;cursor:pointer;font-size:13px'
    close.onclick = () => bar.remove()
    bar.appendChild(msg)
    bar.appendChild(close)
    host.appendChild(bar)
  } catch (e) {
    /* 横幅失败不影响业务 */
  }
}

window.addEventListener('error', e => recordError('window.error', e.error || e.message))
window.addEventListener('unhandledrejection', e => recordError('unhandledrejection', e.reason))

/** 把错误渲染成页面上的可见面板（仅在真白屏时调用），替代"什么都没有" */
function renderStartupFailure() {
  const host = document.getElementById('app') || document.body
  if (!host) return
  const box = document.createElement('div')
  box.setAttribute('data-startup-failure', '1')
  box.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99999', 'overflow:auto',
    'background:#fff', 'color:#1f2329', 'padding:28px 32px',
    'font:13px/1.7 -apple-system,"Segoe UI",Menlo,Consolas,monospace'
  ].join(';')
  const title = document.createElement('div')
  title.textContent = '应用启动失败（界面未能渲染）'
  title.style.cssText = 'font-size:16px;font-weight:600;color:#d93026;margin-bottom:10px'
  const hint = document.createElement('div')
  hint.textContent =
    '请把下面这段文字完整截图或复制反馈；完整日志在程序目录 resources/renderer.log。'
  hint.style.cssText = 'color:#5c6670;margin-bottom:14px'
  const pre = document.createElement('pre')
  pre.textContent = startupErrors.length
    ? startupErrors.map(e => e.kind + ': ' + e.text).join('\n\n')
    : '(没有捕获到错误 —— 可能是某个组件在渲染中静默失败)'
  pre.style.cssText =
    'white-space:pre-wrap;word-break:break-all;background:#f5f6f7;border:1px solid #e3e5e8;' +
    'border-radius:6px;padding:12px;margin:0 0 14px;max-height:60vh;overflow:auto'
  const meta = document.createElement('div')
  meta.style.cssText = 'color:#8a939c'
  meta.textContent = 'build: ' + (window.__BUILD_INFO__ || '(unknown)')
  box.appendChild(title)
  box.appendChild(hint)
  box.appendChild(pre)
  box.appendChild(meta)
  host.appendChild(box)
  // 同时打印一次，保证 renderer.log 里有一份"页面确实白屏"的记录
  try {
    console.error('[思绪] 启动失败面板已显示，捕获到 ' + startupErrors.length + ' 条错误')
  } catch (e) {}
}

// 构建指纹：启动后在控制台打印，便于核对当前运行的是哪一次构建
// （version / 构建时间 / git hash）。用来区分"真 bug"还是"改动根本没部署上去"。
;(function printBuildFingerprint() {
  try {
    if (typeof fetch !== 'function') return
    fetch('/dist/build-info.json?_=' + Date.now())
      .then(function (r) { return r && r.ok ? r.json() : null })
      .then(function (info) {
        if (info && info.version) {
          var t = info.buildTime ? ' · ' + info.buildTime : ''
          var g = info.gitHash ? ' · ' + info.gitHash : ''
          window.__BUILD_INFO__ = 'v' + info.version + t + g
          console.log(
            '%c[思绪思维导图]%c v' + info.version + t + g,
            'color:#3a7afe;font-weight:bold',
            'color:#888'
          )
        }
      })
      .catch(function () {})
  } catch (e) {}
})()

const initApp = () => {
  i18n.global.locale = getLang()

  // 服务层装配：任何一步失败都不得阻断挂载（否则整页白屏，且用户看不到任何可用功能）
  wireServices()

  const app = createApp(App)

  // 全局事件总线：替代 Vue 2 的 `const bus = new Vue()`。
  // 挂到 globalProperties 后，组件内 this.$bus.$on/$off/$emit 用法保持不变。
  app.config.globalProperties.$bus = bus

  // Vue 组件内未捕获的渲染/生命周期异常（默认只 console.error，这里补上统一前缀与留档）
  app.config.errorHandler = (err, instance, info) => {
    recordError('vue.' + (info || 'error'), err)
  }

  app.use(router)
  app.use(store)
  app.use(i18n)
  app.use(ElementPlus, { locale: zhCn })
  app.use(VueViewer)

  try {
    app.mount('#app')
  } catch (e) {
    recordError('app.mount', e, true)
  }

  // 看门狗：挂载后若 #app 内没有任何元素，说明页面确实是白的 —— 把错误顶到用户眼前
  setTimeout(() => {
    const host = document.getElementById('app')
    const blank = !host || host.querySelectorAll('*').length === 0
    if (blank) {
      recordError('blankScreen', new Error('#app 挂载后仍为空（白屏）'), true)
      renderStartupFailure()
    }
  }, 2500)

  return app
}

/**
 * 装配服务层运行时钩子。每一步独立 try/catch：三者互不影响，且任一失败都不阻断启动。
 * @returns {object|null} services 对象（失败时为 null，调用方需容错）
 */
function wireServices() {
  let services = null
  try {
    services = getServices()
  } catch (e) {
    recordError('getServices', e, true)
    return null
  }
  if (!services) {
    recordError('getServices', new Error('services 为空（组合根未正确导出）'), true)
    return null
  }
  // ⚠️ getServices() 返回的是 lateNs 代理，**恒为 truthy** —— 所以上面那个 `!services`
  // 实际拦不住"组合根没装配好"。必须做能力探测把问题暴露成一条可见记录
  // （但不 return：缺一个服务不该让整页白屏，其余功能仍应可用）。
  if (!nsHas(services, 'fileRouter') && !nsHas(services, 'workspaceService')) {
    recordError(
      'getServices',
      new Error('services 代理背后为空：组合根未装配（fileRouter / workspaceService 均不可用）'),
      true
    )
  }

  // 事件桥：服务层 events ⇄ 视图 $bus；主进程 fs 事件 → 服务层 FS_* 事件
  try {
    startEventBridge()
  } catch (e) {
    recordError('startEventBridge', e)
  }
  try {
    startFsBridge()
  } catch (e) {
    recordError('startFsBridge', e)
  }
  // 运行时补挂：Tab 适配器（服务层 open 一个文件 → 既有 workbook 状态机）
  try {
    if (services.fileRouter && typeof services.fileRouter.setTabs === 'function') {
      services.fileRouter.setTabs(tabsAdapter)
    } else {
      recordError('fileRouter.setTabs', new Error('fileRouter.setTabs 不存在'))
    }
  } catch (e) {
    recordError('fileRouter.setTabs', e)
  }
  // 运行时补挂：建索引确认（走原生确认框，用户拒绝则降级为只读索引）
  try {
    if (services.workspaceService && typeof services.workspaceService.setConfirm === 'function') {
      services.workspaceService.setConfirm(({ dirPath }) =>
        window.confirm(
          '该文件夹尚未建立 .mindlink 索引。\n是否现在建立？（建立后支持 md ↔ 导图 双链、引用同步与全文搜索）\n\n' +
            dirPath
        )
      )
    } else {
      recordError('workspaceService.setConfirm', new Error('workspaceService.setConfirm 不存在'))
    }
  } catch (e) {
    recordError('workspaceService.setConfirm', e)
  }

  return services
}

// 是否处于接管应用模式
if (window.takeOverApp) {
  window.initApp = initApp
} else {
  initApp()
}
