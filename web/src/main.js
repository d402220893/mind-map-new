import Vue from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
import ElementUI from 'element-ui'
import 'element-ui/lib/theme-chalk/index.css'
import '@/assets/icon-font/iconfont.css'
import 'viewerjs/dist/viewer.css'
import VueViewer from 'v-viewer'
import i18n from './i18n'
import { getLang } from '@/api'
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

Vue.config.productionTip = false
const bus = new Vue()
Vue.prototype.$bus = bus
Vue.use(ElementUI)
Vue.use(VueViewer)

const initApp = () => {
  i18n.locale = getLang()
  new Vue({
    render: h => h(App),
    router,
    store,
    i18n
  }).$mount('#app')
}

// 是否处于接管应用模式
if (window.takeOverApp) {
  window.initApp = initApp
  window.$bus = bus
} else {
  initApp()
}
