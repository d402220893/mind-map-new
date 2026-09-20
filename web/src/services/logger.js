// L0 基础层：结构化日志（环形缓冲 + 导出 + 子作用域 + level 过滤）。
// 本工程**唯一允许访问 localStorage 的服务模块**（§16.1 / §6.6 注）。
const RING = 500
let buf = []

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }

function persist(level, ns, data) {
  try {
    if (typeof localStorage === 'undefined') return
    const raw = localStorage.getItem('smm.log') || '[]'
    const arr = JSON.parse(raw)
    arr.push({ t: Date.now(), level, ns, data })
    while (arr.length > RING) arr.shift()
    localStorage.setItem('smm.log', JSON.stringify(arr))
  } catch {
    // localStorage 不可用（测试 / SSR）时静默
  }
}

// 单实现：createLogger(ns, {level, parent})
// - 环形缓冲（RING=500）：写满只留最近 500 条
// - child({scope})：合并父字段，生成子作用域 logger
// - export()：导出当前缓冲（数组，可 JSON 序列化）
// - level 过滤：低于 minLevel 的条目不落盘/不打印
// - 日志 entry 只含 {t,level,ns,msg,data}，**不含文件内容**（data 里只放路径/计数等元信息）
export function createLogger(ns = 'app', opts = {}) {
  let minLevel = LEVELS[opts.level] != null ? LEVELS[opts.level] : 0
  const parent = opts.parent || null
  function log(level, msg, data) {
    if (LEVELS[level] < minLevel) return
    const entry = { t: Date.now(), level, ns, msg, data: parent ? { ...parent, ...(data || {}) } : data }
    buf.push(entry)
    if (buf.length > RING) buf.shift() // 环形覆盖：写 305 条只留 300
    if (typeof console !== 'undefined') {
      const fn = level === 'error' ? console.error : (level === 'warn' ? console.warn : console.log)
      fn(`[${ns}]`, msg, data === undefined ? '' : data)
    }
    persist(level, ns, entry.data)
  }
  return {
    debug: (m, d) => log('debug', m, d),
    info: (m, d) => log('info', m, d),
    warn: (m, d) => log('warn', m, d),
    error: (m, d) => log('error', m, d),
    child: (scope) => createLogger(ns, {
      level: opts.level,
      parent: { ...parent, scope: (parent && parent.scope ? parent.scope + ':' : '') + scope }
    }),
    export: () => buf.slice(),
    flush: () => buf.slice(),
    setLevel: (l) => { const i = LEVELS[l]; if (i != null) minLevel = i }
  }
}

export const log = createLogger('app')
