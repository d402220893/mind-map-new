// L3 IO 层：fs.watch 事件语义化 + 噪声过滤 + 抑制判定（suppression.hit）。
// 依赖：../events（L0，允许）。fsApi / suppressionRegistry 经 ctx 注入（不静态 import，避免环）。
import { EVT } from '../events.js'

export const createFsWatchClient = (ctx = {}) => {
  const { fsApi, suppressionRegistry, events } = ctx
  let watcher = null
  function start(root, onChange) {
    if (typeof require === 'undefined' || !fsApi) return null
    try {
      const fs = require('fs')
      watcher = fs.watch(root, { recursive: true }, async (event, filename) => {
        if (!filename) return
        const absPath = root + '/' + filename
        if (suppressionRegistry && await suppressionRegistry.hit(absPath)) return // 回声抑制
        if (events && events.emit) events.emit(EVT.FILE_CHANGED, { absPath, event })
        if (onChange) onChange({ absPath, event })
      })
    } catch {
      watcher = null
    }
    return watcher
  }
  function stop() { if (watcher && watcher.close) watcher.close(); watcher = null }
  return { start, stop }
}
