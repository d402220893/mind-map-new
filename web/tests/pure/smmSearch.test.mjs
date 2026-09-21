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
