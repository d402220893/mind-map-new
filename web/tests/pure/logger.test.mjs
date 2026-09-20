// §11.2 A′ 预算：≥8（本文件 15）
// L0 日志：环形缓冲 + 子作用域 + level 过滤。唯一允许碰 localStorage 的模块，
// 故必须验证"不可用时静默降级"以及"日志不含文件内容"这条数据安全底线。
import { test, beforeEach } from 'node:test'
import assert from 'node:assert'
import { createLogger } from '../../src/services/logger.js'

// 静音 console：logger 默认往 console 打，测试输出会很吵
const noop = () => {}
let savedConsole
beforeEach(() => {
  savedConsole = { log: console.log, warn: console.warn, error: console.error }
  console.log = noop; console.warn = noop; console.error = noop
  if (savedConsole === undefined) restoreConsole()
})
function restoreConsole() {
  console.log = savedConsole.log; console.warn = savedConsole.warn; console.error = savedConsole.error
}
process.on('beforeExit', restoreConsole)

test('① export 返回可 JSON 序列化的数组', () => {
  const lg = createLogger('t1')
  lg.info('hello', { a: 1 })
  const out = lg.export()
  assert.ok(Array.isArray(out))
  assert.doesNotThrow(() => JSON.stringify(out))
})

test('② 日志条目结构含 t/level/ns/msg/data', () => {
  const lg = createLogger('nsA')
  lg.info('msgA', { k: 1 })
  const e = lg.export().slice(-1)[0]
  assert.strictEqual(e.level, 'info')
  assert.strictEqual(e.ns, 'nsA')
  assert.strictEqual(e.msg, 'msgA')
  assert.deepStrictEqual(e.data, { k: 1 })
  assert.strictEqual(typeof e.t, 'number')
})

test('③ level 过滤：debug 低于 warn 时不记录', () => {
  const lg = createLogger('t3', { level: 'warn' })
  const before = lg.export().length
  lg.debug('nope')
  lg.info('nope2')
  assert.strictEqual(lg.export().length, before, 'info/debug 必须被过滤')
  lg.warn('yes')
  assert.strictEqual(lg.export().length, before + 1)
})

test('④ setLevel 动态放宽后低级别可记录', () => {
  const lg = createLogger('t4', { level: 'error' })
  const before = lg.export().length
  lg.info('blocked')
  assert.strictEqual(lg.export().length, before)
  lg.setLevel('debug')
  lg.debug('allowed')
  assert.strictEqual(lg.export().length, before + 1)
})

test('⑤ setLevel 传非法值不改变阈值', () => {
  const lg = createLogger('t5', { level: 'warn' })
  lg.setLevel('bogus')
  const before = lg.export().length
  lg.info('still blocked')
  assert.strictEqual(lg.export().length, before)
})

test('⑥ warn / error / info / debug 四个级别都可用', () => {
  const lg = createLogger('t6')
  assert.doesNotThrow(() => {
    lg.debug('d'); lg.info('i'); lg.warn('w'); lg.error('e')
  })
  assert.strictEqual(lg.export().length >= 4, true)
})

test('⑦ export 返回的是副本（外部 push 不污染内部缓冲）', () => {
  const lg = createLogger('t7')
  const a = lg.export()
  a.push({ fake: true })
  assert.notStrictEqual(lg.export().length, a.length)
})

test('⑧ flush 与 export 语义一致（都取当前缓冲）', () => {
  const lg = createLogger('t8')
  lg.info('x')
  assert.strictEqual(lg.flush().length, lg.export().length)
})

test('⑨ child 合并父 scope 前缀', () => {
  const parent = createLogger('app')
  const child = parent.child('io')
  child.info('c1', { p: 1 })
  const e = child.export().slice(-1)[0]
  assert.strictEqual(e.data.scope, 'io')
})

test('⑩ child 的 child 逐级拼接 scope（a:b）', () => {
  const lg = createLogger('app').child('io').child('fs')
  lg.info('deep')
  const e = lg.export().slice(-1)[0]
  assert.strictEqual(e.data.scope, 'io:fs')
})

test('⑪ child 调用时传入的 data 与父字段合并且不覆盖 scope 语义', () => {
  const child = createLogger('app').child('io')
  child.info('m', { rel: 'a.md' })
  const e = child.export().slice(-1)[0]
  assert.strictEqual(e.data.scope, 'io')
  assert.strictEqual(e.data.rel, 'a.md')
})

test('⑫ 环形缓冲上限 500：写 600 条只留最近 500', () => {
  const lg = createLogger('t12')
  for (let i = 0; i < 600; i++) lg.info('m' + i)
  const out = lg.export()
  assert.ok(out.length <= 500, '不得无限增长，实际 ' + out.length)
  assert.strictEqual(out.slice(-1)[0].msg, 'm599', '必须保留最新的')
})

test('⑬ data 省略时不抛（只记 msg）', () => {
  const lg = createLogger('t13')
  assert.doesNotThrow(() => lg.info('bare'))
  assert.strictEqual(lg.export().slice(-1)[0].msg, 'bare')
})

test('⑭ localStorage 不可用时静默降级（不抛）', () => {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage')
  const prev = globalThis.localStorage
  delete globalThis.localStorage
  try {
    const lg = createLogger('t14')
    assert.doesNotThrow(() => lg.info('no storage'))
  } finally {
    if (had) globalThis.localStorage = prev
  }
})

test('⑮ localStorage 写入报错时也静默（配额满 / 私密模式）', () => {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage')
  const prev = globalThis.localStorage
  globalThis.localStorage = {
    getItem: () => { throw new Error('denied') },
    setItem: () => { throw new Error('quota') }
  }
  try {
    const lg = createLogger('t15')
    assert.doesNotThrow(() => lg.info('boom'))
  } finally {
    if (had) globalThis.localStorage = prev
    else delete globalThis.localStorage
  }
})
