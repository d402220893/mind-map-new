// L3 fsApi 编排测试：IPC 通道映射 + §10 边界（#9 占用重试 / #12 编码探测）。
// fsApi 只依赖 window.smmApi，用 globalThis.window 注入 fake 即可，无需 Electron。
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { createFsApi } from '../../src/services/io/fsApi.js'

let savedWindow
beforeEach(() => { savedWindow = globalThis.window })
afterEach(() => {
  if (savedWindow === undefined) delete globalThis.window
  else globalThis.window = savedWindow
})

function install(fake) {
  globalThis.window = { smmApi: fake }
}

test('① writeText 走新通道并透出 mtimeMs', async () => {
  const calls = []
  install({ async writeText(p, c) { calls.push([p, c]); return { ok: true, mtimeMs: 42 } } })
  const r = await createFsApi({}).writeText('/a.md', 'hi')
  assert.ok(r.ok)
  assert.strictEqual(r.data.mtimeMs, 42)
  assert.strictEqual(calls.length, 1)
})

test('② writeText 的 E_MTIME_CHANGED 视为"告警不阻断"（盘已写）', async () => {
  install({ async writeText() { return { ok: false, code: 'E_MTIME_CHANGED' } } })
  const r = await createFsApi({}).writeText('/a.md', 'hi')
  assert.ok(r.ok, '盘已写，不得当失败')
  assert.strictEqual(r.data.warned, 'E_MTIME_CHANGED')
})

test('③ §10-#9 文件被占用（E_LOCKED）→ 退避重试后成功', async () => {
  let n = 0
  install({
    async writeText() {
      n++
      return n < 2 ? { ok: false, code: 'E_LOCKED', message: 'busy' } : { ok: true }
    }
  })
  const r = await createFsApi({}).writeText('/a.md', 'hi')
  assert.ok(r.ok, '第 2 次应成功')
  assert.strictEqual(n, 2)
  assert.strictEqual(r.data.attempts, 2)
})

test('④ §10-#9 持续占用 → 重试 3 次后返回 E_LOCKED（共 4 次尝试）', async () => {
  let n = 0
  install({ async writeText() { n++; return { ok: false, code: 'E_LOCKED' } } })
  const r = await createFsApi({}).writeText('/a.md', 'hi')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'E_LOCKED')
  assert.strictEqual(n, 4, '1 次原始 + 3 次重试')
})

test('⑤ 抛出的 EBUSY 同样归一为 E_LOCKED 并重试', async () => {
  let n = 0
  install({
    async writeText() {
      n++
      if (n < 3) { const e = new Error('EBUSY'); e.code = 'EBUSY'; throw e }
      return { ok: true }
    }
  })
  const r = await createFsApi({}).writeText('/a.md', 'hi')
  assert.ok(r.ok)
  assert.strictEqual(n, 3)
})

test('⑥ 不可重试错误（EACCES）立即失败，不做退避（避免白等 2.3s）', async () => {
  let n = 0
  install({ async writeText() { n++; return { ok: false, code: 'EACCES' } } })
  const r = await createFsApi({}).writeText('/a.md', 'hi')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'EACCES')
  assert.strictEqual(n, 1, '只尝试一次')
})

test('⑦ writeText 在写盘前登记回声抑制（唯一登记点）', async () => {
  const registered = []
  install({ async writeText() { return { ok: true } } })
  const api = createFsApi({ suppressionRegistry: { register: (p, c) => registered.push([p, c]) } })
  await api.writeText('/a.md', 'body')
  assert.deepStrictEqual(registered, [['/a.md', 'body']])
})

test('⑧ §10-#12 非 UTF-8（U+FFFD ≥ 3）→ encodingSuspect 为真', async () => {
  install({ async readText() { return { ok: true, content: 'abc\uFFFD\uFFFD\uFFFDdef' } } })
  const r = await createFsApi({}).readText('/a.md')
  assert.ok(r.ok)
  assert.strictEqual(r.data.encodingSuspect, true)
  assert.ok(r.data.replacementRatio > 0)
})

test('⑨ 正常 UTF-8 文本 encodingSuspect 为假', async () => {
  install({ async readText() { return { ok: true, content: '# 标题\n\n中文正文' } } })
  const r = await createFsApi({}).readText('/a.md')
  assert.strictEqual(r.data.encodingSuspect, false)
  assert.strictEqual(r.data.replacementRatio, 0)
})

test('⑩ 少量 U+FFFD（1~2 个，可能是正文正当字符）不判为编码问题', async () => {
  install({ async readText() { return { ok: true, content: 'a\uFFFDb' } } })
  const r = await createFsApi({}).readText('/a.md')
  assert.strictEqual(r.data.encodingSuspect, false)
})

test('⑪ 空文件不触发编码误报', async () => {
  install({ async readText() { return { ok: true, content: '' } } })
  const r = await createFsApi({}).readText('/a.md')
  assert.strictEqual(r.data.encodingSuspect, false)
})

test('⑫ 旧通道回退：无 readText 时用 readFile', async () => {
  install({ async readFile() { return 'legacy body' } })
  const r = await createFsApi({}).readText('/a.md')
  assert.ok(r.ok)
  assert.strictEqual(r.data.content, 'legacy body')
})

test('⑬ 无 window.smmApi 时返回 E_NO_IPC（不抛）', async () => {
  delete globalThis.window
  const r = await createFsApi({}).readText('/a.md')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'E_NO_IPC')
})

test('⑭ 通道缺失（stat 不支持）返回 E_NOT_SUPPORTED 而非崩溃', async () => {
  install({})
  const r = await createFsApi({}).stat('/a.md')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'E_NOT_SUPPORTED')
})

test('⑮ stat 支持 statMany 时按路径取回该条', async () => {
  install({ async statMany(paths) { return { stats: { [paths[0]]: { isDir: false, exists: true, size: 7 } } } } })
  const r = await createFsApi({}).stat('/a.md')
  assert.ok(r.ok)
  assert.strictEqual(r.data.size, 7)
})

test('⑯ writeBinary 走新通道并以 base64 传输', async () => {
  let got = null
  install({ async writeBinary(p, base64) { got = base64; return { ok: true, size: 3 } } })
  const r = await createFsApi({}).writeBinary('/a.png', new Uint8Array([1, 2, 3]))
  assert.ok(r.ok)
  assert.strictEqual(typeof got, 'string')
  assert.strictEqual(r.data.size, 3)
})

test('⑰ exists 委托 stat 并给出布尔结果', async () => {
  install({ async statMany(p) { return { stats: { [p[0]]: { exists: true, isDir: false } } } } })
  const r = await createFsApi({}).exists('/a.md')
  assert.strictEqual(r.data.exists, true)
})

test('⑱ pickDirectory 用户取消 → E_CANCELED', async () => {
  install({ async pickDirectory() { return { canceled: true } } })
  const r = await createFsApi({}).pickDirectory({})
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'E_CANCELED')
})
