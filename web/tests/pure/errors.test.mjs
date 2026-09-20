import { test } from 'node:test'
import assert from 'node:assert'
import { ok, fail, err, appError } from '../../src/services/errors.js'

test('ok 形状', () => {
  assert.deepStrictEqual(ok(1), { ok: true, data: 1 })
})
test('fail 接受 ErrorInfo 对象', () => {
  const r = fail({ code: 'X', message: 'm', info: {} })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'X')
})
test('fail 接受字符串 code 自动包装', () => {
  const r = fail('E_NO')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'E_NO')
})
test('err 形状', () => {
  assert.deepStrictEqual(err('C'), { code: 'C', message: 'C', info: {} })
})
test('err 带 info', () => {
  assert.deepStrictEqual(err('C', { a: 1 }), { code: 'C', message: 'C', info: { a: 1 } })
})
test('appError 返回 Error 且带 code', () => {
  const e = appError('E_X', { k: 1 })
  assert.ok(e instanceof Error)
  assert.strictEqual(e.code, 'E_X')
  assert.deepStrictEqual(e.info, { k: 1 })
})
test('ok 透传任意 data', () => {
  const d = { a: [1, 2] }
  assert.strictEqual(ok(d).data, d)
})
test('fail 保留 info 字段', () => {
  const r = fail({ code: 'C', message: 'm', info: { path: 'f' } })
  assert.deepStrictEqual(r.error.info, { path: 'f' })
})

// ── Result 契约（§16.5）──
test('ok 的 data 可为 undefined', () => {
  assert.deepStrictEqual(ok(undefined), { ok: true, data: undefined })
})
test('ok 的 data 可为 null', () => {
  assert.strictEqual(ok(null).data, null)
})
test('fail 的 error 恒有 code', () => {
  assert.ok(fail('E_A').error.code)
})
test('fail 传入无 code 的对象时按 ErrorInfo 处理', () => {
  const r = fail({ code: undefined, message: 'm' })
  assert.strictEqual(r.ok, false)
})
test('err 默认 info 为空对象（各次调用互不共享）', () => {
  const a = err('C')
  a.info.x = 1
  assert.deepStrictEqual(err('C').info, {})
})
test('err 的 message 默认等于 code', () => {
  assert.strictEqual(err('E_STALE').message, 'E_STALE')
})
test('err info 可含嵌套结构', () => {
  const e = err('E_C', { candidates: [{ id: 1 }] })
  assert.strictEqual(e.info.candidates[0].id, 1)
})
test('fail 可携带额外顶层字段（消费方少钻一层 info）', () => {
  const r = fail({ ...err('E_C', { step: 'm001' }), step: 'm001' })
  assert.strictEqual(r.error.step, 'm001')
  assert.strictEqual(r.error.info.step, 'm001')
})
test('appError 可 throw 并被 catch', () => {
  assert.throws(() => { throw appError('E_P') }, /E_P/)
})
test('appError 默认 info 为空对象', () => {
  assert.deepStrictEqual(appError('E_P').info, {})
})
test('appError 的 name 为 Error', () => {
  assert.strictEqual(appError('E_P').name, 'Error')
})
test('ok/fail 互斥：不存在同时为真的形状', () => {
  assert.notStrictEqual(ok(1).ok, fail('E').ok)
})
test('err 与 fail 组合：fail(err(...)) 等价', () => {
  assert.deepStrictEqual(fail(err('C', { a: 1 })), { ok: false, error: { code: 'C', message: 'C', info: { a: 1 } } })
})

// ── Result 形状契约（L3/L4 一律不抛、只回 Result；形状错了消费端就会 r.data.x 崩）──
test('appError 是真正的 Error 实例（L1 唯一允许抛出的形态）', () => {
  const e = appError('E_X', { path: 'p' })
  assert.ok(e instanceof Error, 'appError 必须 instanceof Error，否则 throw 后丢失 stack')
  assert.ok(typeof e.stack === 'string' && e.stack.length > 0)
})

test('appError 的 code/info 在顶层（消费端直读 e.code，不必下钻 e.info.code）', () => {
  const e = appError('E_X', { path: 'p' })
  assert.strictEqual(e.code, 'E_X')
  assert.deepStrictEqual(e.info, { path: 'p' })
  assert.strictEqual(e.message, 'E_X')
})

test('ok() 的 data 键恒存在（无参时为 undefined，消费端可无条件读 r.data）', () => {
  // ⚠️ 别用 JSON.stringify 观察：它会丢掉 undefined 值，看着像"没有 data 键"。
  assert.strictEqual('data' in ok(), true)
  assert.strictEqual(ok().data, undefined)
  assert.strictEqual(ok(null).data, null)
})

test('fail(err(...)) 结构稳定为 {ok:false,error:{code,message,info}}', () => {
  const r = fail(err('E_Z'))
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'E_Z')
  assert.strictEqual(r.error.message, 'E_Z')
  assert.deepStrictEqual(r.error.info, {})
})

test('err() 默认 message 等于 code（无文案时也有可读信息，不留空串）', () => {
  assert.strictEqual(err('E_Q').message, 'E_Q')
})

test('ok() 返回的对象不含 error 键（消费端可安全按 r.ok 分支）', () => {
  assert.strictEqual('error' in ok({ a: 1 }), false)
})
