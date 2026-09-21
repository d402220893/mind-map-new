// L3 IO 层：回声抑制唯一实现处。
// 写前登记 absPath + hash + TTL；hit 为 async（§7.8）。本模块不写盘、不读盘，只维护内存表。
// 依赖：../hash（L1，允许）。不静态 import fsApi（经 ctx 注入到 fsApi，避免 io 内部环）。
import { sha1hex } from '../hash.js'

export const createSuppressionRegistry = (ctx = {}) => {
  const ttl = (ctx.ttl != null ? ctx.ttl : 1500)
  // 时钟可注入（默认 Date.now，生产行为不变）：TTL 用例若依赖真实 setTimeout 凑时间，
  // 余量只有几十 ms，机器一忙就会抖成假失败（2026-09-21 出包门禁被 ⑦ 拦下的根因）。
  const now = typeof ctx.now === 'function' ? ctx.now : () => Date.now()
  const table = new Map() // absPath -> { hash, until }
  function register(absPath, content) {
    const hash = sha1hex(String(content))
    table.set(absPath, { hash, until: now() + ttl })
  }
  async function hit(absPath) {
    const e = table.get(absPath)
    if (!e) return false
    if (now() > e.until) { table.delete(absPath); return false }
    return true
  }
  function clear() { table.clear() }
  return { register, hit, clear }
}
