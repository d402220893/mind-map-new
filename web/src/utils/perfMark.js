// 启动性能埋点（纯 instrumentation，不影响业务逻辑）。
// 双通道：
//  1) console.log —— dev 环境可见（prod 下被 terser 摘除，见 2026-10-15 教训）；
//  2) perf sink —— 由 workspaceBridge（shell 网关，契约⑥唯一合法出口）在模块加载时
//     setPerfSink 注册，转发到 smm:startup-perf IPC 落盘主进程（prod 唯一落盘通道）。
// 本模块保持零依赖（不 import 任何带 @ 别名/浏览器 API 的模块，Node 单测可安全导入）；
// 未注册 sink 时仅 console.log，绝不直碰宿主全局 API（守卫测试 ⑥ 强制）。
let __sink = null

// 由 workspaceBridge 注册（单向：bridge → 本模块，无环）
export function setPerfSink(fn) {
  __sink = typeof fn === 'function' ? fn : null
}

export function perfMark(name, extra) {
  try {
    // eslint-disable-next-line no-console
    console.log('[PERF]', name, Date.now(), extra !== undefined ? String(extra) : '')
  } catch (e) {}
  if (__sink) {
    try {
      __sink({ name, ts: Date.now(), extra: extra !== undefined ? String(extra) : undefined })
    } catch (e) {}
  }
}
