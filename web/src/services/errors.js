// L1 纯函数：统一 Result / ErrorInfo（§16.5）。纯值构造，零副作用。
// 归 L1（非 L0）：因全是纯值构造，符合"L1 = 纯函数"定义（§16.1 / A13）。
export function ok(data) {
  return { ok: true, data }
}

// 接受 {code, message, info} 形式的 ErrorInfo；若传字符串 code 则包成 ErrorInfo。
export function fail(error) {
  if (error && typeof error === 'object' && 'code' in error) return { ok: false, error }
  return { ok: false, error: err(error) }
}

export function err(code, info = {}) {
  return { code, message: code, info }
}

// 编程错误构造（业务失败一律走 Result，不抛；仅"调用方用错"才 appError 后抛）
export function appError(code, info = {}) {
  const e = new Error(code)
  e.code = code
  e.info = info
  return e
}
