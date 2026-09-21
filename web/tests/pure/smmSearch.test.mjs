import { test } from 'node:test'
import assert from 'node:assert'
import {
  stripHtml,
  truncate,
  nodeSearchText,
  searchMindTree,
  searchSmmContainer
} from '../../src/utils/smmSearch.js'

// 构造裸节点树（与 decodeSmm 产物一致：{ data:{...}, children:[...] }）
function node(text, opts = {}, children = []) {
  return { data: { text, ...opts }, children }
}
const TREE = node('根节点', { uid: 'u-root' }, [
  node('光模块分类', { uid: 'u-a' }, [
    node('MTF 测试要点', { uid: 'u-a1', note: '注意 <b>奈奎斯特</b>频率' }),
    node('普通节点', { uid: 'u-a2' })
  ]),
  node('引用节点', {
    uid: 'u-b',
    _mindlink: { refs: [{ title: 'Auto Save 章节', cachedContent: 'autoSaveTimer 默认 5 分钟' }] }
  })
])

// ── stripHtml / truncate ──
test('stripHtml 去标签并压缩空白', () => {
  assert.strictEqual(stripHtml('<b>奈奎斯特</b>\n  频率'), '奈奎斯特 频率')
  assert.strictEqual(stripHtml(''), '')
  assert.strictEqual(stripHtml(null), '')
})

test('truncate 超长截断加省略号', () => {
  const s = 'x'.repeat(100)
  assert.strictEqual(truncate(s, 80).length, 81)
  assert.ok(truncate(s, 80).endsWith('…'))
  assert.strictEqual(truncate('短', 80), '短')
})

// ── nodeSearchText ──
test('nodeSearchText 汇总 text/note/refs', () => {
  const r = nodeSearchText({
    text: '标题',
    note: '备注内容',
    _mindlink: { refs: [{ title: '章节T', cachedContent: '章节正文' }] }
  })
  assert.strictEqual(r.text, '标题')
  assert.strictEqual(r.note, '备注内容')
  assert.ok(r.refText.includes('章节T'))
  assert.ok(r.hay.includes('章节正文'))
})

test('nodeSearchText 对非法输入容错', () => {
  const r = nodeSearchText(null)
  assert.strictEqual(r.text, '')
  assert.strictEqual(r.hay, '\n\n')
})

// ── searchMindTree ──
test('searchMindTree 命中节点 text（大小写不敏感）', () => {
  const hits = searchMindTree(TREE, 'MTF')
  assert.strictEqual(hits.length, 1)
  assert.strictEqual(hits[0].uid, 'u-a1')
  assert.strictEqual(hits[0].path, '根节点 > 光模块分类 > MTF 测试要点')
})

test('searchMindTree 命中备注 note', () => {
  const hits = searchMindTree(TREE, '奈奎斯特')
  assert.strictEqual(hits.length, 1)
  assert.ok(hits[0].preview.includes('奈奎斯特'))
})

test('searchMindTree 命中引用 title / cachedContent', () => {
  const hits = searchMindTree(TREE, 'autosavetimer')
  assert.strictEqual(hits.length, 1)
  assert.strictEqual(hits[0].uid, 'u-b')
})

test('searchMindTree 未命中返回空数组；空关键词返回空', () => {
  assert.deepStrictEqual(searchMindTree(TREE, '不存在的关键词'), [])
  assert.deepStrictEqual(searchMindTree(TREE, ''), [])
  assert.deepStrictEqual(searchMindTree(TREE, '   '), [])
})

test('searchMindTree 对 null / 非对象根容错', () => {
  assert.deepStrictEqual(searchMindTree(null, 'x'), [])
  assert.deepStrictEqual(searchMindTree('str', 'x'), [])
})

test('searchMindTree 无 uid 节点命中时 uid 为空串', () => {
  const hits = searchMindTree(node('只有文字'), '只有')
  assert.strictEqual(hits.length, 1)
  assert.strictEqual(hits[0].uid, '')
})

// ── searchSmmContainer ──
test('searchSmmContainer 跨 sheet 汇总并带 sheet 名', () => {
  const decoded = {
    activeId: 's1',
    sheets: [
      { id: 's1', name: '表一', data: node('光模块', { uid: 'x1' }) },
      { id: 's2', data: node('光模块对比', { uid: 'x2' }) } // 无名 sheet 兜底 Sheet2
    ]
  }
  const hits = searchSmmContainer(decoded, '光模块')
  assert.strictEqual(hits.length, 2)
  assert.strictEqual(hits[0].sheetName, '表一')
  assert.strictEqual(hits[1].sheetName, 'Sheet2')
})

test('searchSmmContainer 非容器输入返回空', () => {
  assert.deepStrictEqual(searchSmmContainer(null, 'x'), [])
  assert.deepStrictEqual(searchSmmContainer({}, 'x'), [])
})

// ── 追加：live 搜索同构场景（裸节点 getData 双形态 + 路径/preview 细节）──
test('searchMindTree path 只含命中节点的祖先链', () => {
  const hits = searchMindTree(TREE, '普通节点')
  assert.strictEqual(hits.length, 1)
  assert.strictEqual(hits[0].path, '根节点 > 光模块分类 > 普通节点')
  assert.strictEqual(hits[0].preview, '普通节点')
})

test('searchMindTree preview 优先 note，其次引用，最后 text', () => {
  const withNote = node('标题', { uid: 'n1', note: '这是备注' })
  assert.strictEqual(searchMindTree(withNote, '标题')[0].preview, '这是备注')
  const withRef = node('标题2', {
    uid: 'n2',
    _mindlink: { refs: [{ title: '章节', cachedContent: '引用正文缓存' }] }
  })
  // preview 取 refText（title+正文合并），须包含正文缓存
  const pv = searchMindTree(withRef, '标题2')[0].preview
  assert.ok(pv.includes('引用正文缓存'))
})

test('searchMindTree preview 超长走 truncate（默认 80 字）', () => {
  const longText = '长'.repeat(120)
  const hits = searchMindTree(node(longText, { uid: 'n3' }), longText.slice(0, 4))
  assert.strictEqual(hits.length, 1)
  assert.strictEqual(hits[0].preview.length, 81)
  assert.ok(hits[0].preview.endsWith('…'))
})

test('nodeSearchText refs 缺失 title 时仅用 cachedContent', () => {
  const r = nodeSearchText({
    text: 't',
    _mindlink: { refs: [{ cachedContent: '只有缓存正文' }] }
  })
  assert.ok(r.hay.includes('只有缓存正文'))
  assert.ok(!r.refText.includes('undefined'))
})

test('nodeSearchText _mindlink.refs 非数组时不抛且忽略', () => {
  const r = nodeSearchText({ text: 't', _mindlink: { refs: 'broken' } })
  assert.strictEqual(r.refText, '')
  assert.strictEqual(r.text, 't')
})

test('searchSmmContainer sheets 为空数组返回空', () => {
  assert.deepStrictEqual(searchSmmContainer({ activeId: 's1', sheets: [] }, 'x'), [])
})
