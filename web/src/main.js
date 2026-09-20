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
// import VConsole from 'vconsole'
// const vConsole = new VConsole()

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

  const app = createApp(App)

  // 全局事件总线：替代 Vue 2 的 `const bus = new Vue()`。
  // 挂到 globalProperties 后，组件内 this.$bus.$on/$off/$emit 用法保持不变。
  app.config.globalProperties.$bus = bus

  app.use(router)
  app.use(store)
  app.use(i18n)
  app.use(ElementPlus, { locale: zhCn })
  app.use(VueViewer)

  app.mount('#app')

  return app
}

// 是否处于接管应用模式
if (window.takeOverApp) {
  window.initApp = initApp
} else {
  initApp()
}
