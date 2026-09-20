import { test } from 'node:test'
import assert from 'node:assert'
import { createWorkspaceSearch } from '../../src/services/workspaceSearch.js'
import { encode } from '../../src/services/smmCodec.js'
import { makeFakeFsApi, makeFakeLog } from './helpers.js'

const ROOT = 'D:/ws'

function smmWith(text, note, sectionPath) {
  return encode(null, {
    sheets: [{
      id: 'r',
      data: {
        id: 'r', data: { text: 'root' }, children: [{
          id: 'n1',
          data: { text, note, _mindlink: { refs: [{ file: 'a.md', sectionId: 's', sectionPath: [sectionPath] }] } },
          children: []
        }]
      }
    }],
    activeId: 'r'
  })
}

function setup(files) {
  const fsApi = makeFakeFsApi({ tree: Object.keys(files), dirs: [ROOT] })
  for (const [k, v] of Object.entries(files)) fsApi.files.set(ROOT + '/' + k, v)
  const workspaceService = { getRoot: () => ROOT }
  const search = createWorkspaceSearch({ io: { fsApi }, services: { workspaceService }, log: makeFakeLog() })
  return { fsApi, search }
}

test('① byName 文件名模糊匹配', async () => {
  const { search } = setup({ 'a.md': '# A', 'docs/b.md': '# B' })
  const r = await search.byName('b.md')
  assert.ok(r.ok)
  assert.strictEqual(r.data.results.length, 1)
  assert.strictEqual(r.data.results[0].rel, 'docs/b.md')
  assert.strictEqual(r.data.results[0].kind, 'markdown')
})

test('② fullText 命中 md 正文（含行号）', async () => {
  const { search } = setup({ 'a.md': '# 标题\n\n正文含关键字\n' })
  const r = await search.fullText('关键字')
  assert.ok(r.ok)
  const hit = r.data.results.find(x => x.rel === 'a.md')
  assert.ok(hit, '应命中 a.md')
  assert.strictEqual(hit.hits[0].line, 3)
  assert.strictEqual(hit.hits[0].type, 'text')
})

test('③ md 标题命中标记 type=section', async () => {
  const { search } = setup({ 'a.md': '# 需求分析\n\nbody\n' })
  const r = await search.fullText('需求分析')
  const hit = r.data.results.find(x => x.rel === 'a.md')
  assert.ok(hit)
  assert.strictEqual(hit.hits[0].type, 'section')
})

test('④ fullText 命中 smm 节点文字', async () => {
  const { search } = setup({ 'm.smm': smmWith('节点关键字', '', '章节') })
  const r = await search.fullText('节点关键字')
  const hit = r.data.results.find(x => x.rel === 'm.smm')
  assert.ok(hit, JSON.stringify(r.data.results))
  assert.strictEqual(hit.hits.some(h => h.type === 'text'), true)
})

test('⑤ fullText 命中 smm 备注（type=note）', async () => {
  const { search } = setup({ 'm.smm': smmWith('节点', '备注关键字', '章节') })
  const r = await search.fullText('备注关键字')
  const hit = r.data.results.find(x => x.rel === 'm.smm')
  assert.ok(hit)
  assert.strictEqual(hit.hits.some(h => h.type === 'note'), true)
})

test('⑥ fullText 命中 smm 引用标题（type=section）', async () => {
  const { search } = setup({ 'm.smm': smmWith('节点', '', '引用章节名') })
  const r = await search.fullText('引用章节名')
  const hit = r.data.results.find(x => x.rel === 'm.smm')
  assert.ok(hit)
  assert.strictEqual(hit.hits.some(h => h.type === 'section'), true)
})

test('⑦ include 过滤：只搜 md 时 smm 不出现', async () => {
  const { search } = setup({ 'a.md': '关键字', 'm.smm': smmWith('关键字', '', 'x') })
  const r = await search.fullText('关键字', { include: ['md'] })
  assert.strictEqual(r.data.results.every(x => x.rel.endsWith('.md')), true)
  const r2 = await search.fullText('关键字', { include: ['smm'] })
  assert.strictEqual(r2.data.results.every(x => x.rel.endsWith('.smm')), true)
})

test('⑧ limit 生效', async () => {
  const files = {}
  for (let i = 0; i < 8; i++) files['f' + i + '.md'] = '关键字'
  const { search } = setup(files)
  const r = await search.fullText('关键字', { limit: 3 })
  assert.ok(r.data.results.length <= 3)
})

test('⑨ 空 query 返回空（不报错）', async () => {
  const { search } = setup({ 'a.md': 'x' })
  const r = await search.fullText('')
  assert.strictEqual(r.data.results.length, 0)
  const r2 = await search.byName('')
  assert.strictEqual(r2.data.results.length, 0)
})

test('⑩ invalidate 后重建缓存（files 计数回落再回升）', async () => {
  const { search } = setup({ 'a.md': '关键字' })
  await search.fullText('关键字')
  assert.strictEqual(search.stats().files, 1)
  search.invalidate('a.md')
  assert.strictEqual(search.stats().files, 0, '失效后应清除倒排条目')
  await search.fullText('关键字')
  assert.strictEqual(search.stats().files, 1)
})

test('⑪ stats 结构完整', async () => {
  const { search } = setup({ 'a.md': '关键字abcdef' })
  await search.fullText('关键字')
  const s = search.stats()
  assert.ok(typeof s.files === 'number')
  assert.ok(typeof s.trigrams === 'number')
  assert.ok(typeof s.hits === 'number')
  assert.ok(s.trigrams > 0)
})

test('⑫ 无命中返回空数组', async () => {
  const { search } = setup({ 'a.md': 'hello' })
  const r = await search.fullText('绝对不存在的词')
  assert.strictEqual(r.data.results.length, 0)
})
