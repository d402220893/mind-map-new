// 自动保存纯逻辑（零依赖，可在 Node 下单测，不依赖 @/ 别名）
// 设计要点：
// - 已保存文件（绝对路径） => 静默覆盖写盘（target='file'）
// - 未保存文件（无路径）  => 仅保留 localStorage 草稿（target='draft'）

// 判断是否为绝对路径（Windows 盘符路径或 Unix 绝对路径）
// 与 workbookState.isAbsolutePath 保持一致，便于在 Node 下直接单测
export function isAbsolutePath(p) {
  if (!p || typeof p !== 'string') return false
  return /^[a-zA-Z]:[\\/]/.test(p) || /^\//.test(p)
}

// 判定当前文件自动保存的目标
// filePath: 当前激活 workbook 的 filePath（绝对路径表示已落盘）
// 返回 'file'（写盘）| 'draft'（仅草稿）
export function resolveAutosaveTarget(filePath) {
  return isAbsolutePath(filePath) ? 'file' : 'draft'
}

// 防抖调度器：连续 trigger 只在静默 delay 后真正执行一次 onSave
// 支持注入 now（便于测试），默认使用 Date.now
export function createAutosaveScheduler({ delay = 30000, onSave, now = () => Date.now() } = {}) {
  let timer = null
  let lastTrigger = 0
  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
  return {
    // 编辑变更时调用：重置防抖计时
    trigger() {
      clear()
      lastTrigger = now()
      timer = setTimeout(() => {
        timer = null
        if (typeof onSave === 'function') onSave()
      }, delay)
    },
    // 立即执行待保存（如应用退出前）
    flush() {
      if (timer !== null) {
        clear()
        if (typeof onSave === 'function') onSave()
        return true
      }
      return false
    },
    // 取消待保存（如用户手动保存刚完成）
    cancel() {
      clear()
    },
    isPending() {
      return timer !== null
    },
    get lastTriggerTime() {
      return lastTrigger
    },
    get delay() {
      return delay
    }
  }
}
