/**
 * 轻量事件总线
 *
 * Vue 3 移除了 `new Vue()` 创建的事件实例（`$on` / `$off` / `$emit` 这些实例方法已不存在），
 * 而本工程有 35 个文件、约 180 处通过 `this.$bus.$on(...)` / `this.$bus.$off(...)` 通信。
 *
 * 这里实现一个与原 Vue 事件 API 语义一致的最小 emitter，并作为全局单例导出，
 * 使业务代码（this.$bus.xxx）完全不需要改动。
 */
class EventBus {
  constructor() {
    // eventName -> Array<{ fn: Function, once: boolean }>
    this._handlers = new Map()
  }

  $on(name, fn) {
    if (typeof fn !== 'function') return this
    if (!this._handlers.has(name)) this._handlers.set(name, [])
    this._handlers.get(name).push({ fn, once: false })
    return this
  }

  $once(name, fn) {
    if (typeof fn !== 'function') return this
    if (!this._handlers.has(name)) this._handlers.set(name, [])
    this._handlers.get(name).push({ fn, once: true })
    return this
  }

  $off(name, fn) {
    // $off() 清空全部
    if (!name) {
      this._handlers.clear()
      return this
    }
    const list = this._handlers.get(name)
    if (!list) return this
    // $off(name) 清空该事件
    if (typeof fn !== 'function') {
      this._handlers.delete(name)
      return this
    }
    // $off(name, fn) 移除指定回调
    this._handlers.set(
      name,
      list.filter(item => item.fn !== fn)
    )
    return this
  }

  $emit(name, ...args) {
    const list = this._handlers.get(name)
    if (!list || list.length === 0) return this
    // 复制一份快照，避免回调内部调用 $off 导致遍历错乱
    const snapshot = list.slice()
    snapshot.forEach(item => {
      try {
        item.fn.apply(this, args)
      } catch (e) {
        // 单个监听器异常不应中断其余监听器
        console.error(`[eventBus] handler error on "${name}":`, e)
      }
      if (item.once) {
        this.$off(name, item.fn)
      }
    })
    return this
  }
}

// 全局单例：main.js 挂到 app.config.globalProperties.$bus，其他模块可直接 import
const bus = new EventBus()

export { EventBus }
export default bus
