import { test } from 'node:test'
import assert from 'node:assert'
import { createRefService } from '../../src/services/refService.js'
import { parseSections } from '../../src/services/sectionParser.js'
import { contentHashOf } from '../../src/services/hash.js'
import { decodeSmm } from '../../src/services/smmCodec.js'
import { makeFakeFsApi, makeFakeLog } from './helpers.js'

const ROOT = 'D:/ws'
const MD = '# A\n\nbodyA\n# B\n\nbodyB\n# Dup\n\nx\n# Dup\n\ny'

function makeFakeIndex(initial = {}) {
  const store = {
    'refs.json': initial.refs || { v: 1, refs: [] },
    'sections.json': initial.sections || { v: 1, files: {} },
    'meta.json': { v: 1 }
  }
  const calls = { updateRefEntries: [], updateSection: [] }
  return {
    store, calls,
    async read(name) { return name in store ? { ok: true, data: store[name] } : { ok: false, error: { code: 'E_INDEX_PARSE' } } },
    async write(name, data) { store[name] = data; return { ok: true } },
    async updateSection(file, patch) { calls.updateSection.push([file, patch]); return { ok: true } },
    async updateRefEntries(targets, patch) {
      calls.updateRefEntries.push([targets, patch])
      for (const t of targets) {
        const e = store['refs.json'].refs.find(x => x.source === t.source && x.nodeId === t.nodeId && x.sectionId === t.sectionId)
        if (e) Object.assign(e, patch)
      }
      return { ok: true }
    },
    async rebuild() { return { ok: true, data: { mode: 'full' } } }
  }
}

function makeWs(index) {
  return {
    abs: f => ROOT + '/' + f,
    rel: a => a.startsWith(ROOT + '/') ? a.slice(ROOT.length + 1) : a,
    getRoot: () => ROOT,
    index
  }
}

// 真实 smm 节点形状：自定义字段挂在 node.data 下（_ 前缀）
function buildSmm(nodeIds, refFactory) {
  const children = nodeIds.map(id => ({ id, data: { _mindlink: { refs: [refFactory(id)] } }, children: [] }))
  return JSON.stringify({ type: 'smms', data: { sheets: [{ id: 'root', data: { id: 'root', data: {}, children } }], activeId: 'root' } })
}

function setup({ refs = { v: 1, refs: [] }, smmNodes = [], smmPath = 'map.smm' } = {}) {
  const fsApi = makeFakeFsApi({ tree: ['doc.md', smmPath] })
  fsApi.files.set(ROOT + '/doc.md', MD)
  if (smmNodes.length) fsApi.files.set(ROOT + '/' + smmPath, buildSmm(smmNodes, () => ({ file: 'doc.md', sectionId: 'secA', baseHash: 'old', baseRev: 0 })))
  const index = makeFakeIndex({ refs })
  const ws = makeWs(index)
  const ref = createRefService({ io: { fsApi, workspaceIndex: index }, services: { sectionService: {}, workspaceService: ws }, log: makeFakeLog() })
  return { fsApi, index, ws, ref }
}

test('① 失效状态 5 种：ok/stale/missing/file-missing/ambiguous', async () => {
  const { ref } = setup()
  const secs = parseSections(MD, { file: 'doc.md' })
  const secA = secs.find(s => s.title === 'A')
  const secDup = secs.filter(s => s.title === 'Dup')
  const okR = await ref.checkValidity('doc.md', [{ sectionId: secA.id, baseHash: secA.contentHash, sectionPath: ['A'] }])
  assert.strictEqual(okR.data.results[0].status, 'ok')
  const staleR = await ref.checkValidity('doc.md', [{ sectionId: secA.id, baseHash: 'sha1:old', sectionPath: ['A'] }])
  assert.strictEqual(staleR.data.results[0].status, 'stale')
  const missR = await ref.checkValidity('doc.md', [{ sectionId: 'ghost', baseHash: 'x', sectionPath: ['Z'] }])
  assert.strictEqual(missR.data.results[0].status, 'missing')
  const ambR = await ref.checkValidity('doc.md', [{ sectionId: 'ghost2', baseHash: 'x', sectionPath: ['Dup'] }])
  assert.strictEqual(ambR.data.results[0].status, 'ambiguous')
  const fmR = await ref.checkValidity('nope.md', [{ sectionId: 'x', baseHash: 'y', sectionPath: ['A'] }])
  assert.strictEqual(fmR.data.results[0].status, 'file-missing')
})

test('② syncRefSnapshots 只改 baseHash/baseRev，不写 .md', async () => {
  const refs = { v: 1, refs: [{ file: 'doc.md', sectionId: 'secA', nodeId: 'n1', source: 'map.smm', mode: 'content', baseHash: 'old', baseRev: 0 }] }
  const { fsApi, ref } = setup({ refs, smmNodes: ['n1'] })
  const r = await ref.syncRefSnapshots({ file: 'doc.md', sectionId: 'secA', rev: 3, hash: 'sha1:new' })
  assert.ok(r.ok)
  const smm = decodeSmm(fsApi.files.get(ROOT + '/map.smm'))
  const node = smm.sheets[0].data.children[0]
  assert.strictEqual(node.data._mindlink.refs[0].baseHash, 'sha1:new')
  assert.strictEqual(node.data._mindlink.refs[0].baseRev, 3)
  const mdWrites = fsApi.calls.filter(c => c[0] === 'writeText' && c[1] === ROOT + '/doc.md')
  assert.strictEqual(mdWrites.length, 0, '不得写 .md 章节')
})

test('③ N>10：前 10 立即写 .smm，其余标 snapshotPending', async () => {
  const nodeIds = Array.from({ length: 12 }, (_, i) => 'n' + (i + 1))
  const refs = { v: 1, refs: nodeIds.map(id => ({ file: 'doc.md', sectionId: 'secA', nodeId: id, source: 'map.smm', mode: 'content', baseHash: 'old', baseRev: 0 })) }
  const { fsApi, index, ref } = setup({ refs, smmNodes: nodeIds })
  const r = await ref.syncRefSnapshots({ file: 'doc.md', sectionId: 'secA', rev: 2, hash: 'sha1:new' })
  assert.ok(r.ok)
  assert.strictEqual(r.data.updated, 10)
  assert.strictEqual(r.data.deferred, 2)
  const smm = decodeSmm(fsApi.files.get(ROOT + '/map.smm'))
  const updated = smm.sheets[0].data.children.filter(n => n.data._mindlink.refs[0].baseHash === 'sha1:new').length
  assert.strictEqual(updated, 10)
  const pendingEntries = index.store['refs.json'].refs.filter(e => e.snapshotPending)
  assert.strictEqual(pendingEntries.length, 2)
  assert.strictEqual(pendingEntries[0].pendingHash, 'sha1:new')
})

test('④ force:true 忽略阈值全量校准', async () => {
  const nodeIds = Array.from({ length: 12 }, (_, i) => 'n' + (i + 1))
  const refs = { v: 1, refs: nodeIds.map(id => ({ file: 'doc.md', sectionId: 'secA', nodeId: id, source: 'map.smm', mode: 'content', baseHash: 'old', baseRev: 0 })) }
  const { fsApi, ref } = setup({ refs, smmNodes: nodeIds })
  const r = await ref.syncRefSnapshots({ file: 'doc.md', sectionId: 'secA', rev: 2, hash: 'sha1:new', force: true })
  assert.ok(r.ok)
  assert.strictEqual(r.data.deferred, 0)
  assert.strictEqual(r.data.updated, 12)
  const smm = decodeSmm(fsApi.files.get(ROOT + '/map.smm'))
  const updated = smm.sheets[0].data.children.filter(n => n.data._mindlink.refs[0].baseHash === 'sha1:new').length
  assert.strictEqual(updated, 12)
})

test('⑤ calibratePendingSnapshots 清除标记且不改正文', async () => {
  const refs = { v: 1, refs: [
    { file: 'doc.md', sectionId: 'secA', nodeId: 'n1', source: 'map.smm', snapshotPending: true, pendingHash: 'sha1:pending', pendingRev: 5 },
    { file: 'doc.md', sectionId: 'secA', nodeId: 'n2', source: 'map.smm', snapshotPending: true, pendingHash: 'sha1:pending', pendingRev: 5 }
  ] }
  const { fsApi, index, ref } = setup({ refs, smmNodes: ['n1', 'n2'] })
  const r = await ref.calibratePendingSnapshots({ abs: ROOT + '/map.smm' })
  assert.ok(r.ok)
  assert.strictEqual(r.data.calibrated, 2)
  const smm = decodeSmm(fsApi.files.get(ROOT + '/map.smm'))
  for (const n of smm.sheets[0].data.children) {
    assert.strictEqual(n.data._mindlink.refs[0].baseHash, 'sha1:pending')
    assert.strictEqual(n.data._mindlink.refs[0].baseRev, 5)
  }
  const stillPending = index.store['refs.json'].refs.filter(e => e.snapshotPending)
  assert.strictEqual(stillPending.length, 0, '标记应被清除')
})

test('⑥ 反查失败不阻塞提交（返回 ok updated:0）', async () => {
  const index = makeFakeIndex({})
  // 强制 read('refs.json') 失败：覆盖为返回 fail
  index.read = async () => ({ ok: false, error: { code: 'E_INDEX_PARSE' } })
  const fsApi = makeFakeFsApi({ tree: ['doc.md', 'map.smm'] })
  fsApi.files.set(ROOT + '/doc.md', MD)
  const ws = makeWs(index)
  const ref = createRefService({ io: { fsApi, workspaceIndex: index }, services: { sectionService: {}, workspaceService: ws }, log: makeFakeLog() })
  const r = await ref.syncRefSnapshots({ file: 'doc.md', sectionId: 'secA', rev: 1, hash: 'sha1:new' })
  assert.ok(r.ok)
  assert.strictEqual(r.data.updated, 0)
})

test('⑦ refService 不得导出 commitRef（破 v1.0 双向环）', async () => {
  const { ref } = setup()
  assert.strictEqual(ref.commitRef, undefined, '不得存在 commitRef')
})

// ── 整文件引用（sectionId === null，v1.5 I4）────────────────────────────

test('⑧ 整文件引用失效检测：hash 相同 ok / 不同 stale，且回带整文件内容', async () => {
  const { ref } = setup()
  const fileHash = contentHashOf(MD)
  const okR = await ref.checkValidity('doc.md', [{ sectionId: null, baseHash: fileHash, sectionPath: null }])
  assert.strictEqual(okR.data.results[0].status, 'ok')
  const staleR = await ref.checkValidity('doc.md', [{ sectionId: null, baseHash: 'sha1:old', sectionPath: null }])
  assert.strictEqual(staleR.data.results[0].status, 'stale')
  assert.strictEqual(staleR.data.results[0].current.content, MD)
})

test('⑨ findBacklinks 的 sectionId 三态语义（undefined=全部 / null=整文件 / 字符串=该章节）', async () => {
  const refs = {
    v: 1,
    refs: [
      { file: 'doc.md', sectionId: null, nodeId: 'w1', source: 'map.smm' },
      { file: 'doc.md', sectionId: 'secA', nodeId: 'n1', source: 'map.smm' },
      { file: 'other.md', sectionId: null, nodeId: 'w2', source: 'map.smm' }
    ]
  }
  const { ref } = setup({ refs })
  const whole = await ref.findBacklinks({ file: 'doc.md', sectionId: null })
  assert.deepStrictEqual(whole.data.backlinks.map(b => b.nodeId), ['w1'])
  const one = await ref.findBacklinks({ file: 'doc.md', sectionId: 'secA' })
  assert.deepStrictEqual(one.data.backlinks.map(b => b.nodeId), ['n1'])
  const all = await ref.findBacklinks({ file: 'doc.md', sectionId: undefined })
  assert.deepStrictEqual(all.data.backlinks.map(b => b.nodeId).sort(), ['n1', 'w1'])
})

test('⑩ 整文件 syncRefSnapshots：整文件 ref 用文件 hash、章节 ref 用该章节自己的 hash', async () => {
  const fileHash = contentHashOf(MD)
  const secA = parseSections(MD, { file: 'doc.md' }).find(s => s.title === 'A')
  const refs = {
    v: 1,
    refs: [
      { file: 'doc.md', sectionId: null, nodeId: 'w1', source: 'map.smm', baseHash: 'old', baseRev: 0 },
      { file: 'doc.md', sectionId: secA.id, nodeId: 'n1', source: 'map.smm', baseHash: 'old', baseRev: 0 }
    ]
  }
  const fsApi = makeFakeFsApi({ tree: ['doc.md', 'map.smm'] })
  fsApi.files.set(ROOT + '/doc.md', MD)
  fsApi.files.set(ROOT + '/map.smm', JSON.stringify({
    type: 'smms',
    data: {
      sheets: [{
        id: 'root',
        data: {
          id: 'root', data: {}, children: [
            { id: 'w1', data: { _mindlink: { refs: [{ file: 'doc.md', sectionId: null, baseHash: 'old', baseRev: 0 }] } }, children: [] },
            { id: 'n1', data: { _mindlink: { refs: [{ file: 'doc.md', sectionId: secA.id, baseHash: 'old', baseRev: 0 }] } }, children: [] }
          ]
        }
      }],
      activeId: 'root'
    }
  }))
  const index = makeFakeIndex({ refs })
  const ref = createRefService({ io: { fsApi, workspaceIndex: index }, services: { sectionService: {}, workspaceService: makeWs(index) }, log: makeFakeLog() })
  const r = await ref.syncRefSnapshots({ file: 'doc.md', sectionId: null, rev: 2 })
  assert.ok(r.ok, JSON.stringify(r.error))
  assert.strictEqual(r.data.updated, 2)
  const smm = decodeSmm(fsApi.files.get(ROOT + '/map.smm'))
  const w = smm.sheets[0].data.children.find(n => n.id === 'w1')
  const n = smm.sheets[0].data.children.find(n => n.id === 'n1')
  assert.strictEqual(w.data._mindlink.refs[0].baseHash, fileHash)
  assert.strictEqual(w.data._mindlink.refs[0].baseRev, 2)
  assert.strictEqual(
    n.data._mindlink.refs[0].baseHash,
    secA.contentHash,
    '章节 ref 必须写自己的 hash —— 若被整文件 hash 覆盖会假"已同步"'
  )
})

test('⑪ 整文件 sync 不写 .md（写盘入口仍唯一）', async () => {
  const { fsApi, ref } = setup()
  const writesBefore = fsApi.calls.filter(c => c[0] === 'writeText' && c[1] === ROOT + '/doc.md').length
  await ref.syncRefSnapshots({ file: 'doc.md', sectionId: null, rev: 1 })
  assert.strictEqual(
    fsApi.calls.filter(c => c[0] === 'writeText' && c[1] === ROOT + '/doc.md').length,
    writesBefore
  )
})
