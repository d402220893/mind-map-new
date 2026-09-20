/**
 * 跨模块共享的全局能力（替代 Vue 2 的 `Vue.prototype.xxx` 挂载）
 *
 * Vue 3 不存在 `Vue.prototype`：全局属性必须挂到 `app.config.globalProperties`。
 * 但模块级代码（如 api/index.js）拿不到 app 实例，所以用本模块作为中介。
 */

// 由 Edit.vue 在应用初始化完成后注入：返回当前正在编辑的导图完整数据
let currentDataGetter = null

export function setCurrentDataGetter(fn) {
  currentDataGetter = typeof fn === 'function' ? fn : null
}

export function getCurrentData() {
  return currentDataGetter ? currentDataGetter() : null
}
