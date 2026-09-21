// §11.2 A′ 预算：≥8（本文件 14）
// 回声抑制是"自己写盘 → fs.watch 回灌"链路的唯一刹车；判错会表现为
// 光标跳动 / 误报"外部已更新"，故 TTL、覆写、多路径隔离都要钉死。
import { test } from 'node:test'
import assert from 'node:assert'
import { createSuppressionRegistry } from '../../src/services/io/suppressionRegistry.js'

test('① 登记后 hit 命中', async () => {
  const reg = createSuppressionRegistry({ ttl: 1000 })
  reg.register('/a.md', 'body')
  assert.strictEqual(await reg.hit('/a.md'), true)
})

test('② 未登记的路径不命中（不能"猜"）', async () => {
  const reg = createSuppressionRegistry({ ttl: 1000 })
  assert.strictEqual(await reg.hit('/never.md'), false)
})

test('③ hit 是 async 且返回布尔（消费端 await 语义）', async () => {
  const reg = createSuppressionRegistry({ ttl: 1000 })
  const p = reg.hit('/a.md')
  assert.strictEqual(typeof p.then, 'function')
  assert.strictEqual(await p, false)
})

test('④ TTL 过期后不命中', async () => {
  let t = 0
  const reg = createSuppressionRegistry({ ttl: 20, now: () => t })
  reg.register('/a.md', 'body')
  t = 21
  assert.strictEqual(await reg.hit('/a.md'), false)
})

test('⑤ TTL 内持续命中（不会被"一次性消费"清掉）', async () => {
  const reg = createSuppressionRegistry({ ttl: 1000 })
  reg.register('/a.md', 'body')
  assert.strictEqual(await reg.hit('/a.md'), true)
  assert.strictEqual(await reg.hit('/a.md'), true)
})

test('⑥ 过期条目被惰性清理（重登记后恢复命中）', async () => {
  let t = 0
  const reg = createSuppressionRegistry({ ttl: 20, now: () => t })
  reg.register('/a.md', 'v1')
  t = 21
  assert.strictEqual(await reg.hit('/a.md'), false)
  reg.register('/a.md', 'v2')
  assert.strictEqual(await reg.hit('/a.md'), true)
})

test('⑦ 同路径重复登记刷新 TTL（连写场景）', async () => {
  // 假时钟替代真实 setTimeout：本用例的语义是"等待必须短于 TTL 余量"，
  // 真实定时器在负载下会抖（曾把 80ms TTL 的 30ms 余量吃掉 → 出包门禁假失败，2026-09-21）
  let t = 0
  const reg = createSuppressionRegistry({ ttl: 80, now: () => t })
  reg.register('/a.md', 'v1')
  t = 50
  reg.register('/a.md', 'v2') // 过期时间由 80 刷到 130
  t = 100
  assert.strictEqual(await reg.hit('/a.md'), true, '第二次登记应把过期时间往后推')
  t = 131
  assert.strictEqual(await reg.hit('/a.md'), false, '超过刷新后的过期时间仍应失效')
})

test('⑧ 多路径互不干扰', async () => {
  const reg = createSuppressionRegistry({ ttl: 1000 })
  reg.register('/a.md', 'A')
  reg.register('/b.md', 'B')
  assert.strictEqual(await reg.hit('/a.md'), true)
  assert.strictEqual(await reg.hit('/b.md'), true)
  assert.strictEqual(await reg.hit('/c.md'), false)
})

test('⑨ clear 后全部不命中', async () => {
  const reg = createSuppressionRegistry({ ttl: 1000 })
  reg.register('/a.md', 'A')
  reg.clear()
  assert.strictEqual(await reg.hit('/a.md'), false)
})

test('⑩ 登记空内容不抛（空文件保存场景）', async () => {
  const reg = createSuppressionRegistry({ ttl: 1000 })
  assert.doesNotThrow(() => reg.register('/a.md', ''))
  assert.strictEqual(await reg.hit('/a.md'), true)
})

test('⑪ 登记 null / undefined 内容不抛', async () => {
  const reg = createSuppressionRegistry({ ttl: 1000 })
  assert.doesNotThrow(() => reg.register('/a.md', null))
  assert.doesNotThrow(() => reg.register('/b.md', undefined))
})

test('⑫ 不传 ttl 时使用默认值（登记后立即命中）', async () => {
  const reg = createSuppressionRegistry({})
  reg.register('/a.md', 'x')
  assert.strictEqual(await reg.hit('/a.md'), true)
})

test('⑬ 无参构造不抛（组合根可能省略 ctx）', async () => {
  const reg = createSuppressionRegistry()
  assert.doesNotThrow(() => reg.register('/a.md', 'x'))
  assert.strictEqual(await reg.hit('/a.md'), true)
})

test('⑭ 本模块不依赖 fsApi（经 ctx 注入到 fsApi，避免 io 内部环）', async () => {
  const src = await import('node:fs').then(fs =>
    fs.readFileSync(new URL('../../src/services/io/suppressionRegistry.js', import.meta.url), 'utf8')
  )
  assert.strictEqual(/from\s+['"]\.\/fsApi/.test(src), false, '不得静态 import fsApi')
})
