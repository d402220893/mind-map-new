import { test } from 'node:test'
import assert from 'node:assert'
import { encode, decode, decodeSmm, pickActiveData, extractImages } from '../../src/services/smmCodec.js'

function container(sheets, activeId) {
  return JSON.stringify({ type: 'smms', data: { sheets, activeId } })
}
const SHEETS = [
  { id: 's1', data: { id: 'r1', data: { text: 'A' }, children: [] } },
  { id: 's2', data: { id: 'r2', data: { text: 'B' }, children: [] } }
]

// ── encode ──
test('encode 多 sheet → 容器格式', () => {
  const t = encode(null, { sheets: SHEETS, activeId: 's2' })
  const o = JSON.parse(t)
  assert.strictEqual(o.type, 'smms')
  assert.strictEqual(o.data.activeId, 's2')
  assert.strictEqual(o.data.sheets.length, 2)
})

test('encode 未给 activeId → 兜底第一个 sheet', () => {
  const o = JSON.parse(encode(null, { sheets: SHEETS }))
  assert.strictEqual(o.data.activeId, 's1')
})

test('encode 单图 → mindmap 格式', () => {
  const o = JSON.parse(encode({ id: 'r', children: [] }))
  assert.strictEqual(o.type, 'mindmap')
  assert.strictEqual(o.data.id, 'r')
})

test('encode 输出可被 JSON.parse（缩进 2）', () => {
  assert.ok(encode(null, { sheets: SHEETS }).includes('\n  "type"'))
})

// ── decode ──
test('decode 容器 → active sheet 的 data', () => {
  assert.strictEqual(decode(container(SHEETS, 's2')).id, 'r2')
})

test('decode 无 activeId → 第一个 sheet', () => {
  assert.strictEqual(decode(container(SHEETS)).id, 'r1')
})

test('decode activeId 不存在 → 回退第一个 sheet', () => {
  assert.strictEqual(decode(container(SHEETS, 'ghost')).id, 'r1')
})

test('decode 单图 mindmap → data', () => {
  assert.strictEqual(decode(JSON.stringify({ type: 'mindmap', data: { id: 'x' } })).id, 'x')
})

test('decode 裸 data → data', () => {
  assert.strictEqual(decode(JSON.stringify({ data: { id: 'y' } })).id, 'y')
})

test('decode 裸 root → 自身', () => {
  assert.strictEqual(decode(JSON.stringify({ id: 'z' })).id, 'z')
})

test('decode 坏 JSON → 抛 E_SMM_INVALID_JSON', () => {
  assert.throws(() => decode('{oops'), /E_SMM_INVALID_JSON/)
})

test('decode 非对象 → 抛 E_SMM_INVALID', () => {
  assert.throws(() => decode('null'), /E_SMM_INVALID/)
  assert.throws(() => decode('42'), /E_SMM_INVALID/)
})

test('decode 空 sheets → null', () => {
  assert.strictEqual(decode(container([], 'x')), null)
})

// ── decodeSmm ──
test('decodeSmm 容器 → sheets + activeId', () => {
  const r = decodeSmm(container(SHEETS, 's2'))
  assert.strictEqual(r.sheets.length, 2)
  assert.strictEqual(r.activeId, 's2')
})

// ⚠️ §32.4 Bug① 契约锁：decodeSmm 返回的是 {sheets, activeId} 纯对象，**不是** Result。
// 一旦调用方误写成 `if (!decoded.ok) return decoded` 就会因 decoded.ok 恒为 undefined
// 而永远提前返回，导致 .smm 永远打不开。
test('decodeSmm 返回的不是 Result（无 ok 字段，调用方不得判 .ok）', () => {
  const r = decodeSmm(container(SHEETS, 's2'))
  assert.strictEqual('ok' in r, false, 'decodeSmm 不得返回 {ok,...} 形状')
  assert.ok(Array.isArray(r.sheets), '真实载体是 .sheets')
  assert.strictEqual(typeof r.activeId, 'string', '真实载体是 .activeId')
})
test('decodeSmm 单图同样不是 Result（无 ok 字段）', () => {
  const r = decodeSmm(JSON.stringify({ type: 'mindmap', data: { id: 'r' } }))
  assert.strictEqual('ok' in r, false)
  assert.strictEqual(r.sheets.length, 1)
})

test('decodeSmm 缺 activeId → 兜底第一个', () => {
  const r = decodeSmm(container(SHEETS))
  assert.strictEqual(r.activeId, 's1')
})

test('decodeSmm 单图 → 包成单 sheet', () => {
  const r = decodeSmm(JSON.stringify({ type: 'mindmap', data: { id: 'r' } }))
  assert.strictEqual(r.sheets.length, 1)
  assert.strictEqual(r.sheets[0].id, 'root')
  assert.strictEqual(r.activeId, 'root')
})

test('decodeSmm 坏 JSON → 抛', () => {
  assert.throws(() => decodeSmm('nope'), /E_SMM_INVALID/)
})

// ── pickActiveData ──
test('pickActiveData 取 active', () => {
  assert.strictEqual(pickActiveData(container(SHEETS, 's2')).id, 'r2')
})

test('pickActiveData 缺 activeId → 第一个', () => {
  assert.strictEqual(pickActiveData(container(SHEETS)).id, 'r1')
})

test('pickActiveData 单图 → data', () => {
  assert.strictEqual(pickActiveData(JSON.stringify({ data: { id: 'q' } })).id, 'q')
})

// ── extractImages ──
test('extractImages 收集非 base64 的 key', () => {
  const data = { id: 'r', data: { image: 'img-key-1' }, children: [] }
  assert.deepStrictEqual(extractImages(data), ['img-key-1'])
})

test('extractImages 递归子节点', () => {
  const data = {
    id: 'r', children: [
      { id: 'a', data: { image: 'k1' }, children: [{ id: 'b', data: { image: 'k2' }, children: [] }] }
    ]
  }
  assert.deepStrictEqual(extractImages(data), ['k1', 'k2'])
})

test('extractImages 跳过内联 base64', () => {
  assert.deepStrictEqual(extractImages({ id: 'r', data: { image: 'data:image/png;base64,AAA' }, children: [] }), [])
})

test('extractImages 跳过 http 外链', () => {
  assert.deepStrictEqual(extractImages({ id: 'r', data: { image: 'https://x/y.png' }, children: [] }), [])
})

test('extractImages 无图 → 空数组', () => {
  assert.deepStrictEqual(extractImages({ id: 'r', children: [] }), [])
})

test('extractImages null → 空数组', () => {
  assert.deepStrictEqual(extractImages(null), [])
})

test('extractImages 重复 key 去重', () => {
  const data = { id: 'r', data: { image: 'k1' }, children: [{ id: 'a', data: { image: 'k1' }, children: [] }] }
  assert.deepStrictEqual(extractImages(data), ['k1'])
})

// ── 往返 ──
test('encode → decodeSmm 往返保留 activeId', () => {
  const t = encode(null, { sheets: SHEETS, activeId: 's2' })
  const r = decodeSmm(t)
  assert.strictEqual(r.activeId, 's2')
  assert.strictEqual(r.sheets[1].data.id, 'r2')
})

test('encode → pickActiveData 往返', () => {
  const t = encode(null, { sheets: SHEETS, activeId: 's1' })
  assert.strictEqual(pickActiveData(t).id, 'r1')
})

test('decode 与 pickActiveData 对同一容器结果一致', () => {
  const t = container(SHEETS, 's2')
  assert.deepStrictEqual(decode(t), pickActiveData(t))
})

test('encode 单图 → decode 还原', () => {
  const root = { id: 'r', children: [{ id: 'c', children: [] }] }
  assert.deepStrictEqual(decode(encode(root)), root)
})

test('extractImages 对真实 smm 节点（data 在下）生效', () => {
  const { sheets } = decodeSmm(encode(null, {
    sheets: [{ id: 's', data: { id: 'r', data: { image: 'k9' }, children: [] } }], activeId: 's'
  }))
  assert.deepStrictEqual(extractImages(sheets[0].data), ['k9'])
})

// ── 边界与自洽（encode/decode 往返不变量）───────────────────────────────

test('encode→decode 往返保持 sheets 数量与 activeId', () => {
  const original = {
    sheets: [
      { id: 's1', data: { id: 'r1', data: {}, children: [] } },
      { id: 's2', data: { id: 'r2', data: {}, children: [] } }
    ],
    activeId: 's2'
  }
  const back = decodeSmm(encode(null, original))
  assert.strictEqual(back.sheets.length, 2)
  assert.strictEqual(back.activeId, 's2')
})

test('encode→decode 往返保留节点自定义字段（_mindlink 不丢）', () => {
  const refs = [{ file: 'a.md', sectionId: null, sectionPath: [], baseHash: 'sha1:x' }]
  const { sheets } = decodeSmm(encode(null, {
    sheets: [{ id: 's', data: { id: 'r', data: {}, children: [{ id: 'n', data: { _mindlink: { refs } }, children: [] }] } }],
    activeId: 's'
  }))
  const n = sheets[0].data.children[0]
  assert.strictEqual(n.data._mindlink.refs[0].sectionId, null)
  assert.strictEqual(n.data._mindlink.refs[0].baseHash, 'sha1:x')
})

test('decode 对非法 JSON 抛 appError（带 code，不返回 null）', () => {
  assert.throws(() => decode('{ not json'), e => e.code === 'E_SMM_INVALID_JSON')
})

test('decodeSmm 对非法 JSON 抛错（调用方需捕获并转 Result）', () => {
  assert.throws(() => decodeSmm('{ not json'), e => e.code === 'E_SMM_INVALID_JSON')
})

test('pickActiveData 在 activeId 不存在时兜底首个 sheet', () => {
  const data = pickActiveData(encode(null, {
    sheets: [{ id: 'only', data: { id: 'r', data: {}, children: [] } }],
    activeId: 'ghost'
  }))
  assert.ok(data, '必须兜底，否则打开 .smm 白屏')
  assert.strictEqual(data.id, 'r')
})

test('extractImages 跳过 data: 内联与 http 外链（只收集 imgMap key）', () => {
  const { sheets } = decodeSmm(encode(null, {
    sheets: [{
      id: 's',
      data: {
        id: 'r', data: {}, children: [
          { id: 'a', data: { image: 'data:image/png;base64,AAAA' }, children: [] },
          { id: 'b', data: { image: 'https://x/y.png' }, children: [] },
          { id: 'c', data: { image: 'realKey' }, children: [] }
        ]
      }
    }],
    activeId: 's'
  }))
  assert.deepStrictEqual(extractImages(sheets[0].data), ['realKey'])
})

test('extractImages 递归收集多级子树', () => {
  const { sheets } = decodeSmm(encode(null, {
    sheets: [{
      id: 's',
      data: {
        id: 'r', data: { image: 'k0' }, children: [
          { id: 'a', data: { image: 'k1' }, children: [{ id: 'b', data: { image: 'k2' }, children: [] }] }
        ]
      }
    }],
    activeId: 's'
  }))
  assert.deepStrictEqual(extractImages(sheets[0].data).sort(), ['k0', 'k1', 'k2'])
})

test('extractImages 对空图/无 children 不抛', () => {
  assert.deepStrictEqual(extractImages(null), [])
  assert.deepStrictEqual(extractImages({ id: 'x' }), [])
})

// ── 多 sheet 容器与 active 语义 ──
const MULTI_SHEETS = [
  { id: 's1', name: '一', data: { id: 'r1', data: { text: 'R1' }, children: [{ data: { text: 'c', image: 'k1' }, children: [] }] } },
  { id: 's2', name: '二', data: { id: 'r2', data: { text: 'R2' }, children: [] } }
]

test('多 sheet 往返：sheets 数量、id、以及额外业务键（name）原样保留', () => {
  const d = decodeSmm(encode(null, { sheets: MULTI_SHEETS, activeId: 's2' }))
  assert.strictEqual(d.sheets.length, 2)
  assert.deepStrictEqual(d.sheets.map(s => s.id), ['s1', 's2'])
  assert.strictEqual(d.sheets[0].name, '一', '额外键必须保留（工作表名不能丢）')
  assert.strictEqual(d.activeId, 's2')
})

test('pickActiveData 取的是 activeId 指定的那一张表', () => {
  const t = encode(null, { sheets: MULTI_SHEETS, activeId: 's2' })
  assert.strictEqual(pickActiveData(t).id, 'r2')
})

test('encode 未给 activeId 时兜底第一张表的 id', () => {
  assert.strictEqual(decodeSmm(encode(null, { sheets: MULTI_SHEETS })).activeId, 's1')
})

test('activeId 指向不存在的表 → 兜底首个（不返回 null）', () => {
  const t = JSON.stringify({ type: 'smms', data: { sheets: MULTI_SHEETS, activeId: 'nope' } })
  assert.strictEqual(decodeSmm(t).activeId, 'nope')
  assert.strictEqual(pickActiveData(t).id, 'r1')
})

test('容器缺 activeId 字段 → 兜底首个', () => {
  const t = JSON.stringify({ type: 'smms', data: { sheets: [{ id: 'only', data: { id: 'o' } }] } })
  assert.strictEqual(decodeSmm(t).activeId, 'only')
})

test('单图（type=mindmap）被包成单 sheet，id 为 root', () => {
  const t = JSON.stringify({ type: 'mindmap', data: { id: 'root', data: { text: 'X' }, children: [] } })
  const d = decodeSmm(t)
  assert.strictEqual(d.sheets.length, 1)
  assert.strictEqual(d.activeId, 'root')
  assert.strictEqual(d.sheets[0].data.id, 'root')
})

test('裸 root（无 data 包裹）也能解码成单 sheet', () => {
  const t = JSON.stringify({ id: 'raw', data: { text: 'B' }, children: [] })
  const d = decodeSmm(t)
  assert.strictEqual(d.sheets.length, 1)
  assert.strictEqual(d.sheets[0].data.id, 'raw')
})

test('decode（单数据访问器）对容器返回 active 表的数据', () => {
  const t = encode(null, { sheets: MULTI_SHEETS, activeId: 's2' })
  assert.strictEqual(decode(t).id, 'r2')
})

test('extractImages 递归收集子节点图片 key，并去重', () => {
  const t = encode(null, {
    sheets: [{
      id: 'a',
      data: {
        id: 'r', data: {}, children: [
          { data: { text: 'x', image: 'k1' }, children: [{ data: { text: 'y', image: 'k2' }, children: [] }] },
          { data: { text: 'z', image: 'k1' }, children: [] }
        ]
      }
    }],
    activeId: 'a'
  })
  assert.deepStrictEqual(extractImages(decodeSmm(t).sheets[0].data).sort(), ['k1', 'k2'])
})

test('extractImages 不收集内联 base64 与外链 http（无需 key 注册）', () => {
  const root = {
    id: 'r',
    data: { image: 'data:image/png;base64,AAAA' },
    children: [{ data: { image: 'https://x/y.png' }, children: [] }, { data: { image: 'realKey' }, children: [] }]
  }
  assert.deepStrictEqual(extractImages(root), ['realKey'])
})

test('extractImages 对 null / 非对象输入返回空数组（不抛）', () => {
  assert.deepStrictEqual(extractImages(null), [])
  assert.deepStrictEqual(extractImages(undefined), [])
  assert.deepStrictEqual(extractImages('x'), [])
})

test('extractImages 也识别直接传 node.data（image 在顶层）的形态', () => {
  assert.deepStrictEqual(extractImages({ image: 'k9', children: [] }), ['k9'])
})

test('encode 的 JSON 可被 JSON.parse 回读（产物必须是合法 JSON）', () => {
  assert.doesNotThrow(() => JSON.parse(encode(null, { sheets: MULTI_SHEETS, activeId: 's1' })))
  assert.doesNotThrow(() => JSON.parse(encode({ id: 'r', children: [] })))
})
