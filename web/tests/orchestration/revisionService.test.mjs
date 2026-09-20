import { test } from 'node:test'
import assert from 'node:assert'
import { createRevisionService } from '../../src/services/revisionService.js'
import { parseSections } from '../../src/services/sectionParser.js'
import { contentHashOf } from '../../src/services/hash.js'
import { EVT } from '../../src/services/events.js'
import { makeFakeFsApi, makeFakeEvents, makeFakeLog } from './helpers.js'

const ROOT = 'D:/ws'
const MD = '# A\n\nbodyA\n# B\n\nbodyB\n'

function setup() {
  const fsApi = makeFakeFsApi({ tree: ['doc.md'] })
  fsApi.files.set(ROOT + '/doc.md', MD)
  const events = makeFakeEvents()
  const log = makeFakeLog()
  const workspaceIndex = {
    calls: [],
    async read() { return { ok: true, data: { files: {} } } },
    async updateSection(file, patch) { this.calls.push([file, patch]); return { ok: true } }
  }
  const workspaceService = { abs: f => ROOT + '/' + f, getRoot: () => ROOT }
  const refService = {
    calls: [],
    async syncRefSnapshots(spec) { this.calls.push(spec); return { ok: true, data: { updated: 0, deferred: 0 } } },
    updateRefSnapshot() { return true }
  }
  const rev = createRevisionService({
    io: { fsApi, workspaceIndex },
    services: { refService, sectionService: {}, workspaceService },
    events, log
  })
  return { fsApi, events, log, workspaceIndex, workspaceService, refService, rev }
}

function refCtxFor(sec, overrides = {}) {
  return {
    file: 'doc.md', sectionId: sec.id, baseHash: sec.contentHash, baseRev: 0,
    lastContent: sec.content, sectionPath: sec.path, ...overrides
  }
}

test('① 无冲突提交成功', async () => {
  const { fsApi, rev } = setup()
  const secA = parseSections(MD, { file: 'doc.md' }).find(s => s.title === 'A')
  const r = await rev.commitEdit(refCtxFor(secA), 'new body for A')
  assert.ok(r.ok)
  assert.strictEqual(r.data.newRev, 1)
  assert.strictEqual(fsApi.files.get(ROOT + '/doc.md').includes('new body for A'), true)
})

test('② noop 提交（内容未变）不写盘', async () => {
  const { fsApi, rev } = setup()
  const secA = parseSections(MD, { file: 'doc.md' }).find(s => s.title === 'A')
  const writesBefore = fsApi.calls.filter(c => c[0] === 'writeText').length
  const r = await rev.commitEdit(refCtxFor(secA, { lastContent: secA.content }), secA.content)
  assert.ok(r.ok)
  assert.strictEqual(r.data.noop, true)
  assert.strictEqual(fsApi.calls.filter(c => c[0] === 'writeText').length, writesBefore)
})

test('③ hash 不符 → stale 冲突', async () => {
  const { rev } = setup()
  const secA = parseSections(MD, { file: 'doc.md' }).find(s => s.title === 'A')
  const r = await rev.commitEdit(refCtxFor(secA, { baseHash: 'sha1:wrong' }), 'x')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.kind, 'stale')
  assert.strictEqual(r.error.code, 'E_CONFLICT_stale')
})

test('④ 章节缺失（path 也找不到）→ missing', async () => {
  const { rev } = setup()
  const secA = parseSections(MD, { file: 'doc.md' }).find(s => s.title === 'A')
  const r = await rev.commitEdit(refCtxFor(secA, { sectionId: 'ghost', sectionPath: ['Z'] }), 'x')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.kind, 'missing')
})

test('⑤ 同 path 多候选 → ambiguous', async () => {
  const fsApi = makeFakeFsApi({ tree: ['doc.md'] })
  fsApi.files.set(ROOT + '/doc.md', '# A\n\nx\n# A\n\ny')
  const workspaceIndex = { read: async () => ({ ok: true, data: { files: {} } }), updateSection: async () => ({ ok: true }) }
  const rev = createRevisionService({
    io: { fsApi, workspaceIndex },
    services: { refService: { syncRefSnapshots: async () => ({ ok: true }), updateRefSnapshot: () => true }, sectionService: {}, workspaceService: { abs: f => ROOT + '/' + f, getRoot: () => ROOT } },
    events: makeFakeEvents(), log: makeFakeLog()
  })
  // 取第一个 A 的 id 作为"丢失"的参考；path 命中两个 → ambiguous
  const secs = parseSections('# A\n\nx\n# A\n\ny', { file: 'doc.md' })
  const r = await rev.commitEdit({ file: 'doc.md', sectionId: 'ghost', baseHash: 'sha1:wrong', baseRev: 0, lastContent: '', sectionPath: ['A'] }, 'x')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.kind, 'ambiguous')
  assert.ok(Array.isArray(r.error.info.candidates))
})

test('⑥ 缺失但 path 唯一命中 → 自动 rebind 成功（rebound:true）', async () => {
  const { fsApi, rev, refService } = setup()
  const secA = parseSections(MD, { file: 'doc.md' }).find(s => s.title === 'A')
  const r = await rev.commitEdit(refCtxFor(secA, { sectionId: 'lostid' }), 'changed body')
  assert.ok(r.ok)
  assert.strictEqual(r.data.rebound, true)
  assert.strictEqual(fsApi.files.get(ROOT + '/doc.md').includes('changed body'), true)
  assert.ok(refService.calls.length >= 1)
})

test('⑦ rebind 后 current 必非空（A11 回归，提交成功即证明）', async () => {
  const { rev } = setup()
  const secA = parseSections(MD, { file: 'doc.md' }).find(s => s.title === 'A')
  const r = await rev.commitEdit(refCtxFor(secA, { sectionId: 'lostid' }), 'changed body')
  assert.ok(r.ok, 'rebind 后未抛 TypeError 且提交成功')
})

test('⑧ rebind 只改 id/path、不改 baseHash；改名+改内容 → stale（C1/C2）', async () => {
  const { rev, refService } = setup()
  const secA = parseSections(MD, { file: 'doc.md' }).find(s => s.title === 'A')
  const ctx = refCtxFor(secA, { sectionId: 'lostid', baseHash: 'sha1:deadbeef0000' }) // 旧内容 hash 与当前不符
  const r = await rev.commitEdit(ctx, 'changed body')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.kind, 'stale')
  assert.strictEqual(r.error.rebound, true, 'rebind 已执行（但 baseHash 仍不符 → stale）')
  assert.strictEqual(ctx.baseHash, 'sha1:deadbeef0000', 'baseHash 未被 rebind 覆盖')
  assert.ok(refService.calls.length === 0, 'stale 不触发 syncRefSnapshots')
})

test('⑨ 提交写快照（history 路径）', async () => {
  const { fsApi, rev } = setup()
  const secA = parseSections(MD, { file: 'doc.md' }).find(s => s.title === 'A')
  await rev.commitEdit(refCtxFor(secA), 'new body')
  const histCall = fsApi.calls.find(c => c[0] === 'writeText' && c[1].includes('.mindlink/history'))
  assert.ok(histCall, '应写入 history 快照')
})

test('⑩ 写盘走 fsApi.writeText（内部登记 suppression，服务侧不手动 register）', async () => {
  const { fsApi, rev } = setup()
  const secA = parseSections(MD, { file: 'doc.md' }).find(s => s.title === 'A')
  await rev.commitEdit(refCtxFor(secA), 'new body')
  const mdWrite = fsApi.calls.find(c => c[0] === 'writeText' && c[1] === ROOT + '/doc.md')
  assert.ok(mdWrite, '应调用 fsApi.writeText 写 md 文件')
})

test('⑪ 广播载荷不含 source', async () => {
  const { fsApi, rev, events } = setup()
  const secA = parseSections(MD, { file: 'doc.md' }).find(s => s.title === 'A')
  await rev.commitEdit(refCtxFor(secA), 'new body')
  const emit = events.emitted.find(e => e.t === EVT.SECTION_UPDATED)
  assert.ok(emit, '应广播 SECTION_UPDATED')
  assert.strictEqual('source' in emit.p, false)
})

test('⑫ 并发提交不抛错（串行化排队，同一 section 不并发写）', async () => {
  const { rev } = setup()
  const secs = parseSections(MD, { file: 'doc.md' })
  const secA = secs.find(s => s.title === 'A')
  const secB = secs.find(s => s.title === 'B')
  const [a, b] = await Promise.all([
    rev.commitEdit(refCtxFor(secA), 'first body'),
    rev.commitEdit(refCtxFor(secB), 'second body')
  ])
  assert.ok(a.ok && b.ok, '并发提交均应返回 ok，不抛错')
})

test('⑬ 提交后调用 syncRefSnapshots', async () => {
  const { rev, refService } = setup()
  const secA = parseSections(MD, { file: 'doc.md' }).find(s => s.title === 'A')
  await rev.commitEdit(refCtxFor(secA), 'new body')
  assert.ok(refService.calls.length >= 1)
  assert.strictEqual(refService.calls[0].file, 'doc.md')
})

test('⑭ 返回值含 rebound（D1）', async () => {
  const { rev } = setup()
  const secA = parseSections(MD, { file: 'doc.md' }).find(s => s.title === 'A')
  const r = await rev.commitEdit(refCtxFor(secA, { sectionId: 'lostid' }), 'changed body')
  assert.strictEqual(r.data.rebound, true)
})

test('⑮ 冲突结果同时带 code 与 kind（C11）', async () => {
  const { rev } = setup()
  const secA = parseSections(MD, { file: 'doc.md' }).find(s => s.title === 'A')
  const r = await rev.commitEdit(refCtxFor(secA, { baseHash: 'sha1:wrong' }), 'x')
  assert.strictEqual(r.error.code, 'E_CONFLICT_stale')
  assert.strictEqual(r.error.kind, 'stale')
})

test('⑯ resolveConflict keep-mine 写盘合并内容', async () => {
  const { fsApi, rev, refService } = setup()
  const secA = parseSections(MD, { file: 'doc.md' }).find(s => s.title === 'A')
  const r = await rev.resolveConflict(refCtxFor(secA), { choice: 'keep-mine', current: secA, mine: 'merged text' })
  assert.ok(r.ok)
  assert.strictEqual(fsApi.files.get(ROOT + '/doc.md').includes('merged text'), true)
  assert.ok(refService.calls.length >= 1)
})

test('⑰ resolveConflict 未知策略 → E_UNKNOWN_STRATEGY', async () => {
  const { rev } = setup()
  const secA = parseSections(MD, { file: 'doc.md' }).find(s => s.title === 'A')
  const r = await rev.resolveConflict(refCtxFor(secA), { choice: 'bogus' })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'E_UNKNOWN_STRATEGY')
})

// ── 整文件引用（sectionId === null，v1.5 I4）────────────────────────────
// 语义：无章节定位/无重绑/无 path 匹配；乐观锁与 rev 都对应**整个文件**；
// newContent 是"完整文件新内容"而非章节正文。

function wholeCtx(overrides = {}) {
  return {
    file: 'doc.md',
    sectionId: null,
    sectionPath: null,
    baseHash: contentHashOf(MD),
    baseRev: 0,
    lastContent: MD,
    ...overrides
  }
}

test('⑱ 整文件提交成功：写整文件、rev+1、syncRefSnapshots 收到 sectionId=null', async () => {
  const { fsApi, rev, refService } = setup()
  const next = '# A\n\nchanged whole file\n'
  const r = await rev.commitEdit(wholeCtx(), next)
  assert.ok(r.ok, JSON.stringify(r.error))
  assert.strictEqual(r.data.newRev, 1)
  assert.strictEqual(r.data.newHash, contentHashOf(next))
  assert.strictEqual(fsApi.files.get(ROOT + '/doc.md'), next)
  const sync = refService.calls.find(c => c.sectionId === null)
  assert.ok(sync, '整文件提交必须同步引用该文件的引用')
  assert.strictEqual(sync.hash, contentHashOf(next))
})

test('⑲ 整文件 stale：baseHash 与当前文件 hash 不符 → E_CONFLICT_stale 且 current 是整文件', async () => {
  const { fsApi, rev } = setup()
  const writesBefore = fsApi.calls.filter(c => c[0] === 'writeText').length
  const r = await rev.commitEdit(wholeCtx({ baseHash: 'sha1:notcurrent' }), 'x')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.kind, 'stale')
  assert.strictEqual(r.error.code, 'E_CONFLICT_stale')
  assert.strictEqual(r.error.current.content, MD, '冲突应回带整文件当前内容供 diff')
  assert.strictEqual(
    fsApi.calls.filter(c => c[0] === 'writeText').length,
    writesBefore,
    '冲突不得写盘'
  )
})

test('⑳ 整文件无 baseHash（首次引用）→ 直接成功，不做乐观锁', async () => {
  const { rev } = setup()
  const r = await rev.commitEdit(wholeCtx({ baseHash: undefined }), 'brand new')
  assert.ok(r.ok)
  assert.strictEqual(r.data.newRev, 1)
})

test('㉑ 整文件 noop：内容归一化后相同 → 不写盘', async () => {
  const { fsApi, rev } = setup()
  const before = fsApi.calls.filter(c => c[0] === 'writeText').length
  const r = await rev.commitEdit(wholeCtx(), MD.replace(/\n/g, '\r\n') + '\n\n\n')
  assert.ok(r.ok)
  assert.strictEqual(r.data.noop, true)
  assert.strictEqual(fsApi.calls.filter(c => c[0] === 'writeText').length, before)
})

test('㉒ 整文件 resolveConflict keep-mine → 整文件覆盖（不走 replaceSectionInText）', async () => {
  const { fsApi, rev } = setup()
  const mine = '# 整文件冲突后的我的版本\n'
  const r = await rev.resolveConflict(wholeCtx(), { choice: 'keep-mine', current: { content: MD, rev: 0 }, mine })
  assert.ok(r.ok, JSON.stringify(r.error))
  assert.strictEqual(fsApi.files.get(ROOT + '/doc.md'), mine)
  assert.strictEqual(r.data.newHash, contentHashOf(mine))
})

test('㉓ 整文件 resolveConflict use-latest → noop 不写盘', async () => {
  const { fsApi, rev } = setup()
  const before = fsApi.calls.filter(c => c[0] === 'writeText').length
  const r = await rev.resolveConflict(wholeCtx(), { choice: 'use-latest', current: { content: 'disk', contentHash: 'sha1:disk' } })
  assert.ok(r.ok)
  assert.strictEqual(r.data.newHash, 'sha1:disk')
  assert.strictEqual(fsApi.calls.filter(c => c[0] === 'writeText').length, before)
})
