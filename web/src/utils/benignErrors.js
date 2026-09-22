// 浏览器「良性告警」白名单（L0 纯函数，无依赖）。
//
// 为什么需要这一层：有些浏览器告警**不是 bug**，但 Chromium 会以 error 级
// 控制台消息抛出，于是穿透我们所有的兜底层，把用户吓一跳：
//   ① web/src/main.js 的全局 error 监听把它记进「启动时有 N 项异常」横幅；
//   ② 主进程 console-message(level>=3) 还会再弹一个原生「页面脚本错误」框。
//
// 典型成员：ResizeObserver loop limit exceeded —— 规范级提示，含义是
// 「同帧内布局变化又触发了观察回调，本轮投递作废，下一帧继续」，功能完全正常。
// 本应用新建 .smm 时会从 md 页切到画布（容器 display:none → 可见），
// 必然引来一次布局抖动，所以这条告警会稳定复现，不处理就是每次建文件都弹窗。
//
// 纪律：只放行**明确已知良性**的模式，并保持窄匹配（越宽越可能吃掉真错误）。

/** @type {RegExp[]} 已知良性告警模式 */
export const BENIGN_ERROR_PATTERNS = [
  // 两种写法都存在：limit exceeded（循环超限）/ completed with undelivered notifications（新版措辞）
  /ResizeObserver loop (limit exceeded|completed with undelivered notifications)/
]

/**
 * 判断一段错误文本（message 或 stack 或 console 消息）是否属于已知良性告警。
 * @param {unknown} input 错误对象 / 字符串 / undefined
 * @returns {boolean} true = 良性，调用方应只留日志、不告警
 */
export function isBenignError(input) {
  if (input === null || input === undefined) return false
  const text = typeof input === 'string' ? input : String(input)
  if (!text) return false
  return BENIGN_ERROR_PATTERNS.some(re => re.test(text))
}

export default { BENIGN_ERROR_PATTERNS, isBenignError }
