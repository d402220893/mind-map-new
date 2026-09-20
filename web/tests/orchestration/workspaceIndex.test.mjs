import { test } from 'node:test'
import assert from 'node:assert'
import { createWorkspaceIndex } from '../../src/services/io/workspaceIndex.js'
import { makeFakeFsApi, makeFakeEvents } from './helpers.js'

const ROOT = 'D:/ws'

test('重建幂等：同文件树两次重建结果一致', async () => {
  const fsApi = makeFakeFsApi({ tree: ['a.md', 'b.smm'] })
  fsApi.files.set(ROOT + '/a.md', '# A\n\n正文')
  fsApi.files.set(ROOT + '/b.smm', JSON.stringify({ type: 'mindmap', data: { id: 'r', data: {} } }))
  const idx = createWorkspaceIndex({ fsApi })
  const r1 = await idx.rebuild({ root: ROOT })
  const r2 = await idx.rebuild({ root: ROOT })
  assert.ok(r1.ok && r2.ok)
  const a = await idx.read('sections.json', { root: ROOT })
  const b = await idx.read('sections.json', { root: ROOT })
  assert.deepStrictEqual(a.data.files['a.md'].sections, b.data.files['a.md'].sections)
})

test('single-flight：并发重建只跑一次 readTree', async () => {
  const fsApi = makeFakeFsApi({ tree: ['a.md'] })
  fsApi.files.set(ROOT + '/a.md', '# A\n')
  const idx = createWorkspaceIndex({ fsApi })
  const [a, b] = await Promise.all([idx.rebuild({ root: ROOT }), idx.rebuild({ root: ROOT })])
  assert.ok(a.ok && b.ok)
  assert.strictEqual(fsApi.calls.filter(c => c[0] === 'readTree').length, 1)
})

test('原子写：先写 tmp 再写 final，且顺序正确', async () => {
  const fsApi = makeFakeFsApi({ tree: [] })
  const idx = createWorkspaceIndex({ fsApi })
  await idx.write('x.json', { k: 1 }, { root: ROOT })
  const wt = fsApi.calls.filter(c => c[0] === 'writeText')
  const tmpIdx = wt.findIndex(c => c[1].includes('.tmp-'))
  const finalIdx = wt.findIndex(c => c[1].endsWith(ROOT + '/.mindlink/x.json'))
  assert.ok(tmpIdx >= 0)
  assert.ok(finalIdx > tmpIdx, 'final 必须在 tmp 之后写')
})

test('原子写：final 失败不覆盖旧值', async () => {
  const fsApi = makeFakeFsApi({ tree: [], failFinal: true })
  fsApi.files.set(ROOT + '/.mindlink/x.json', 'OLD')
  const idx = createWorkspaceIndex({ fsApi })
  const r = await idx.write('x.json', { k: 1 }, { root: ROOT })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(fsApi.files.get(ROOT + '/.mindlink/x.json'), 'OLD')
})

test('写锁：rebuild 期间 updateSection 排队且最终生效', async () => {
  const fsApi = makeFakeFsApi({ tree: ['a.md'] })
  fsApi.files.set(ROOT + '/a.md', '# A\n\n正文')
  const idx = createWorkspaceIndex({ fsApi })
  const p = idx.rebuild({ root: ROOT }) // 不 await
  const upd = await idx.updateSection('a.md', { id: 'habc123', rev: 2 }, { root: ROOT })
  assert.ok(upd.ok)
  await p
  const sec = await idx.read('sections.json', { root: ROOT })
  assert.strictEqual(sec.data.files['a.md'].sections['habc123'].rev, 2)
})

test('onProgress 被调用且 L3 不 emit 事件', async () => {
  const events = makeFakeEvents()
  const fsApi = makeFakeFsApi({ tree: ['a.md'] })
  fsApi.files.set(ROOT + '/a.md', '# A\n')
  const idx = createWorkspaceIndex({ fsApi })
  let prog = 0
  const r = await idx.rebuild({ root: ROOT, onProgress: () => { prog++ } })
  assert.ok(r.ok)
  assert.ok(prog > 0, 'onProgress 应被调用')
  assert.strictEqual(events.emitted.length, 0, 'L3 不得 emit')
})

test('坏索引：JSON 解析失败返回 E_INDEX_PARSE', async () => {
  const fsApi = makeFakeFsApi({ tree: [] })
  fsApi.files.set(ROOT + '/.mindlink/sections.json', '{bad json')
  const idx = createWorkspaceIndex({ fsApi })
  const r = await idx.read('sections.json', { root: ROOT })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'E_INDEX_PARSE')
})

test('init 创建三件套索引', async () => {
  const fsApi = makeFakeFsApi({ tree: [] })
  const idx = createWorkspaceIndex({ fsApi })
  const r = await idx.init(ROOT, { name: 'ws' })
  assert.ok(r.ok)
  const meta = await idx.read('meta.json', { root: ROOT })
  assert.strictEqual(meta.data.v, 1)
  const sec = await idx.read('sections.json', { root: ROOT })
  assert.deepStrictEqual(sec.data.files, {})
})

// ── .mindlink/ 目录创建（回归：全新目录下漏 mkdirp → ENOENT → 永久 readonly-index）──
// 症状：打开一个**没有任何 .mindlink/** 的新文件夹时，UI 显示「未建立索引，点此重建」，
//       且点重建也无效 —— 因为重建同样写不进不存在的目录。设计 §7.3 明确要求 init 内部 mkdirp。
test('全新工作区：写索引前先建 <root>/.mindlink（否则 fs.writeFileSync ENOENT）', async () => {
  const fsApi = makeFakeFsApi({ tree: [] }) // 注意：无 dirs ⇒ .mindlink 尚不存在
  const idx = createWorkspaceIndex({ fsApi })
  const r = await idx.init(ROOT, { name: 'ws' })
  assert.ok(r.ok, 'init 必须成功（真实 fs 下缺目录会 ENOENT）')
  const mk = fsApi.calls.filter(c => c[0] === 'mkdirp')
  assert.strictEqual(mk.length, 1, '应恰好 mkdirp 一次')
  assert.strictEqual(mk[0][1], ROOT + '/.mindlink', '目标必须是 <root>/.mindlink')
})

test('每个 root 只 mkdirp 一次（记忆化），失败后允许重试', async () => {
  const fsApi = makeFakeFsApi({ tree: ['a.md'] })
  fsApi.files.set(ROOT + '/a.md', '# A\n')
  const idx = createWorkspaceIndex({ fsApi })
  await idx.rebuild({ root: ROOT })                       // 内部写三件套
  await idx.write('x.json', { k: 1 }, { root: ROOT })     // 再写一次
  assert.strictEqual(fsApi.calls.filter(c => c[0] === 'mkdirp').length, 1, '同一 root 不得重复建目录')

  const fsApi2 = makeFakeFsApi({ tree: [], failFinal: true })
  const idx2 = createWorkspaceIndex({ fsApi: fsApi2 })
  await idx2.write('x.json', { k: 1 }, { root: ROOT })    // 失败 → 清除记忆
  await idx2.write('x.json', { k: 1 }, { root: ROOT })
  assert.strictEqual(fsApi2.calls.filter(c => c[0] === 'mkdirp').length, 2, '写失败后应重新尝试建目录')
})
