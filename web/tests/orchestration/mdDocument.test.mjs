// mdDocument（L4）编排测试：载入 / 脏标记唯一入口 / 保存 / 防抖自动保存 / §10-#12 编码保护。
import { test } from 'node:test'
import assert from 'node:assert'
import { createMdDocument } from '../../src/services/mdDocument.js'
import { createDocumentStore } from '../../src/services/state/documentStore.js'
import { makeFakeFsApi, makeFakeLog } from './helpers.js'

const ROOT = 'D:/ws'

function setup({ files = {}, readOverride } = {}) {
  const fsApi = makeFakeFsApi({ tree: Object.keys(files) })
  for (const [k, v] of Object.entries(files)) fsApi.files.set(k, v)
  if (readOverride) fsApi.readText = readOverride
  const stores = { document: createDocumentStore() }
  const events = { emitted: [], on: () => () => {}, emit: (t, p) => events.emitted.push({ t, p }) }
  const md = createMdDocument({ io: { fsApi }, stores, services: {}, events, log: makeFakeLog() })
  return { fsApi, stores, events, md }
}

test('① load 把内容写入 documentStore 且初始不脏', async () => {
  const { md, stores } = setup({ files: { [ROOT + '/a.md']: '# A\n' } })
  const r = await md.load('t1', ROOT + '/a.md')
  assert.ok(r.ok)
  assert.strictEqual(r.data.content, '# A\n')
  const doc = stores.document.get('t1')
  assert.strictEqual(doc.dirty, false)
  assert.strictEqual(doc.savedContent, '# A\n')
})

test('② setContent 是唯一打脏入口并广播 DOC_DIRTY', async () => {
  const { md, events } = setup({ files: { [ROOT + '/a.md']: '# A\n' } })
  await md.load('t1', ROOT + '/a.md')
  md.setContent('t1', '# A\n\nnew')
  assert.strictEqual(md.isDirty('t1'), true)
  assert.ok(events.emitted.some(e => e.t === 'doc:dirty' && e.p.dirty === true))
})

test('③ save 成功后清脏并广播 DOC_SAVED + FILE_SAVED', async () => {
  const { md, events, fsApi } = setup({ files: { [ROOT + '/a.md']: '# A\n' } })
  await md.load('t1', ROOT + '/a.md')
  md.setContent('t1', '# A changed\n')
  const r = await md.save('t1', ROOT + '/a.md')
  assert.ok(r.ok)
  assert.strictEqual(md.isDirty('t1'), false)
  assert.strictEqual(fsApi.files.get(ROOT + '/a.md'), '# A changed\n')
  assert.ok(events.emitted.some(e => e.t === 'doc:saved'))
  assert.ok(events.emitted.some(e => e.t === 'file-saved' || e.t === 'FILE_SAVED'))
})

test('④ save 未载入的 tab → E_DOC_NOT_LOADED', async () => {
  const { md } = setup()
  const r = await md.save('ghost', ROOT + '/a.md')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'E_DOC_NOT_LOADED')
})

test('⑤ save 写盘失败时不清脏（否则用户关窗即丢改动）', async () => {
  const { md, fsApi } = setup({ files: { [ROOT + '/a.md']: '# A\n' } })
  await md.load('t1', ROOT + '/a.md')
  md.setContent('t1', '# changed\n')
  // 注入写盘失败
  fsApi.writeText = async () => ({ ok: false, error: { code: 'E_WRITE_FAILED', message: 'disk full' } })
  const r = await md.save('t1', ROOT + '/a.md')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'E_WRITE_FAILED')
  assert.strictEqual(md.isDirty('t1'), true, '失败必须保持脏标记')
})

// ── §10-#12 非 UTF-8 保护 ───────────────────────────────────────────────

test('⑥ 疑似非 UTF-8 → load 回带 encodingSuspect，且 doc 上打标', async () => {
  const content = 'abc\uFFFD\uFFFD\uFFFDdef'
  const { md, stores } = setup({
    readOverride: async () => ({ ok: true, data: { content, encodingSuspect: true, replacementRatio: 0.3 } })
  })
  const r = await md.load('t1', ROOT + '/gbk.md')
  assert.strictEqual(r.data.encodingSuspect, true)
  assert.strictEqual(stores.document.get('t1').encodingSuspect, true)
})

test('⑦ 疑似非 UTF-8 时 save 被拒（E_ENCODING_SUSPECT），不写盘', async () => {
  const content = 'abc\uFFFD\uFFFD\uFFFDdef'
  const { md, fsApi } = setup({
    readOverride: async () => ({ ok: true, data: { content, encodingSuspect: true, replacementRatio: 0.3 } })
  })
  await md.load('t1', ROOT + '/gbk.md')
  md.setContent('t1', 'changed')
  const before = fsApi.calls.filter(c => c[0] === 'writeText').length
  const r = await md.save('t1', ROOT + '/gbk.md')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'E_ENCODING_SUSPECT')
  assert.strictEqual(fsApi.calls.filter(c => c[0] === 'writeText').length, before, '必须拒写')
  assert.strictEqual(md.isDirty('t1'), true)
})

test('⑧ 正常文件不受编码保护影响（encodingSuspect 缺省 false）', async () => {
  const { md } = setup({ files: { [ROOT + '/a.md']: '# A\n' } })
  await md.load('t1', ROOT + '/a.md')
  assert.strictEqual(md.get('t1').encodingSuspect, false)
  md.setContent('t1', '# B\n')
  const r = await md.save('t1', ROOT + '/a.md')
  assert.ok(r.ok)
})

// ── 防抖自动保存 ────────────────────────────────────────────────────────

test('⑨ scheduleSave 防抖：连续调用只保留最后一个定时器', async () => {
  const { md, fsApi } = setup({ files: { [ROOT + '/a.md']: '# A\n' } })
  await md.load('t1', ROOT + '/a.md')
  md.setContent('t1', '# 1\n')
  md.scheduleSave('t1', ROOT + '/a.md', 50)
  md.setContent('t1', '# 2\n')
  md.scheduleSave('t1', ROOT + '/a.md', 50)
  await new Promise(r => setTimeout(r, 150))
  assert.strictEqual(md.isDirty('t1'), false, '防抖后应已落盘并清脏')
  assert.strictEqual(fsApi.files.get(ROOT + '/a.md'), '# 2\n', '落盘的是最后一次内容')
})

test('⑩ cancelSave 取消后不落盘', async () => {
  const { md, fsApi } = setup({ files: { [ROOT + '/a.md']: '# A\n' } })
  await md.load('t1', ROOT + '/a.md')
  md.setContent('t1', '# changed\n')
  md.scheduleSave('t1', ROOT + '/a.md', 50)
  md.cancelSave('t1')
  await new Promise(r => setTimeout(r, 120))
  assert.strictEqual(fsApi.files.get(ROOT + '/a.md'), '# A\n', '取消后不得写盘')
  assert.strictEqual(md.isDirty('t1'), true)
})

test('⑪ drop 丢弃文档并取消待执行的保存', async () => {
  const { md } = setup({ files: { [ROOT + '/a.md']: '# A\n' } })
  await md.load('t1', ROOT + '/a.md')
  md.setContent('t1', '# changed\n')
  md.scheduleSave('t1', ROOT + '/a.md', 50)
  md.drop('t1')
  await new Promise(r => setTimeout(r, 120))
  assert.strictEqual(md.get('t1'), null)
})

test('⑫ serialize / hydrate 往返保持内容与脏标记', async () => {
  const { md } = setup({ files: { [ROOT + '/a.md']: '# A\n' } })
  await md.load('t1', ROOT + '/a.md')
  md.setContent('t1', '# round\n')
  const json = md.serialize('t1')
  md.drop('t1')
  md.hydrate('t2', json)
  assert.strictEqual(md.get('t2').content, '# round\n')
  assert.strictEqual(md.isDirty('t2'), true)
})
