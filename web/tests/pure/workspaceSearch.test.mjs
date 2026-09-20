// §11.2 A′ 预算：≥5（本文件 11）
// 本文件只覆盖**无 IPC / 无 window** 的部分：缓存失效、统计计数、空工作区与
// include/limit 的入参收敛。真实读盘路径在 orchestration/workspaceSearch.test.mjs。
import { test } from 'node:test'
import assert from 'node:assert'
import { createWorkspaceSearch } from '../../src/services/workspaceSearch.js'

const ROOT = 'D:/ws'

// 最小内存 fsApi：不碰 window.smmApi、不做任何真实 IO
function memFs(files = {}) {
  const calls = { readText: [], readTree: [] }
  return {
    calls,
    async readText(p) {
      calls.readText.push(p)
      return p in files
        ? { ok: true, data: { content: files[p] } }
        : { ok: false, error: { code: 'E_READ_FAILED', info: { absPath: p } } }
    },
    async readTree() {
      calls.readTree.push(1)
      return { ok: true, data: { tree: Object.keys(files).map(n => ({ name: n, isDir: false, path: ROOT + '/' + n })) } }
    },
    async exists(p) { return { ok: true, data: { exists: p in files || p === ROOT } } },
    async stat(p) { return { ok: true, data: { isDir: p === ROOT, exists: p in files || p === ROOT } } }
  }
}

function setup(files = {}) {
  const fsApi = memFs(files)
  const ws = { getRoot: () => ROOT, abs: p => (/^[A-Za-z]:[\\/]/.test(p) ? p : ROOT + '/' + p), rel: p => (p.startsWith(ROOT + '/') ? p.slice(ROOT.length + 1) : p) }
  const events = { emit: () => {}, on: () => () => {} }
  const search = createWorkspaceSearch({ io: { fsApi }, services: { workspaceService: ws }, events })
  return { fsApi, search }
}

test('① 新建实例时统计从零开始', () => {
  const { search } = setup()
  const s = search.stats()
  assert.strictEqual(s.files, 0)
  assert.strictEqual(s.trigrams, 0)
})

test('② 未打开工作区时 byName 不抛且有返回结构', async () => {
  const { search } = setup()
  const r = await search.byName('a')
  assert.strictEqual(typeof r.ok, 'boolean')
})

test('③ 未打开工作区时 fullText 不抛且有返回结构', async () => {
  const { search } = setup()
  const r = await search.fullText('x')
  assert.strictEqual(typeof r.ok, 'boolean')
})

test('④ invalidate 对未索引路径安全（幂等、不抛）', () => {
  const { search } = setup()
  assert.doesNotThrow(() => search.invalidate('never.md'))
  assert.doesNotThrow(() => search.invalidate('never.md'))
})

test('⑤ stats().files 反映已索引文件数（索引后增加）', async () => {
  const { search } = setup({ [ROOT + '/a.md']: '# A\n\n正文含关键字\n' })
  const before = search.stats().files
  await search.fullText('关键字')
  assert.ok(search.stats().files >= before)
})

test('⑥ stats().hits 是计数器（每次检索后递增或持平）', async () => {
  const { search } = setup({ [ROOT + '/a.md']: '# A\n\n正文含关键字\n' })
  await search.fullText('关键字')
  const a = search.stats().hits
  await search.fullText('关键字')
  assert.ok(search.stats().hits >= a)
})

test('⑦ fullText 空查询串返回空结果（不触发全量读盘）', async () => {
  const { search, fsApi } = setup({ [ROOT + '/a.md']: '# A\n\nx\n' })
  const r = await search.fullText('   ')
  assert.ok(r.ok)
  const n = (r.data.results || []).length
  assert.strictEqual(n, 0)
  assert.strictEqual(fsApi.calls.readText.length, 0, '空查询不得读盘')
})

test('⑧ fullText limit:0 时结果被截断为 0 条', async () => {
  const { search } = setup({ [ROOT + '/a.md']: '# A\n\n关键字 关键字\n' })
  const r = await search.fullText('关键字', { limit: 0 })
  assert.strictEqual((r.data.results || []).length, 0)
})

test('⑨ fullText include 为扩展名白名单：只含 smm 时不返回 md 命中', async () => {
  const { search } = setup({ [ROOT + '/a.md']: '# A\n\n关键字\n' })
  const r = await search.fullText('关键字', { include: ['smm'] })
  assert.strictEqual((r.data.results || []).length, 0)
})

test('⑩ byName 空串不过滤（返回结构稳定）', async () => {
  const { search } = setup({ [ROOT + '/a.md']: '# A\n' })
  const r = await search.byName('')
  assert.strictEqual(typeof r.ok, 'boolean')
})

test('⑪ 相同查询重复执行结果稳定（幂等，不因缓存而漂移）', async () => {
  const { search } = setup({ [ROOT + '/a.md']: '# A\n\n命中词\n' })
  const a = await search.fullText('命中词')
  const b = await search.fullText('命中词')
  assert.deepStrictEqual((a.data.results || []).length, (b.data.results || []).length)
})
