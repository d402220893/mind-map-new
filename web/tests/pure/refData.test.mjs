import { test } from 'node:test'
import assert from 'node:assert'
import { getNodeRefs, setNodeRefs, addRef, removeRef, updateRefSnapshot, parseLegacyRefs, nodeDataOf } from '../../src/services/refData.js'

// 裸节点（.smm / JSON 解码产物）：数据挂在 node.data
function node() { return { data: {} } }

// ⚠️ 复刻 simple-mind-map 的运行时节点实例 MindMapNode：
//   数据在 node.nodeData.data，官方访问器是 getData(key) / setData(patch)，
//   实例上**没有** .data 属性 —— 这正是 §32.4 Bug② 的根因（旧实现读 node.data 恒 undefined，
//   于是 getNodeRefs 恒 []、setNodeRefs 恒 false，引用写不进也读不出）。
function mindMapNode() {
  const nodeData = { data: {}, children: [] }
  const patches = []
  return {
    nodeData,
    _patches: patches,
    getData(key) { return key ? nodeData.data[key] : nodeData.data },
    setData(patch) {
      patches.push(patch)
      Object.keys(patch).forEach(k => { nodeData.data[k] = patch[k] })
    }
  }
}

test('getNodeRefs 空节点返回 []', () => {
  assert.deepStrictEqual(getNodeRefs(node()), [])
})
test('addRef 返回带默认值的 ref', () => {
  const n = node()
  const r = addRef(n, { file: 'a.md', sectionId: 's1' })
  assert.strictEqual(r.file, 'a.md')
  assert.strictEqual(r.sectionId, 's1')
  assert.strictEqual(r.mode, 'content')
})
test('addRef 后 getNodeRefs 可见', () => {
  const n = node()
  addRef(n, { file: 'a.md', sectionId: 's1' })
  assert.strictEqual(getNodeRefs(n).length, 1)
})
test('addRef 同 file+sectionId+mode 去重', () => {
  const n = node()
  addRef(n, { file: 'a.md', sectionId: 's1' })
  const r2 = addRef(n, { file: 'a.md', sectionId: 's1' })
  assert.strictEqual(getNodeRefs(n).length, 1)
  assert.ok(r2)
})
test('removeRef 删除', () => {
  const n = node()
  const r = addRef(n, { file: 'a.md', sectionId: 's1' })
  assert.strictEqual(removeRef(n, r.refId), true)
  assert.strictEqual(getNodeRefs(n).length, 0)
})
test('removeRef 错误 id 不报错返回 false', () => {
  const n = node()
  addRef(n, { file: 'a.md', sectionId: 's1' })
  assert.strictEqual(removeRef(n, 'nope'), false)
})
test('setNodeRefs 直接写入', () => {
  const n = node()
  setNodeRefs(n, [{ file: 'a.md', sectionId: 's1', mode: 'content' }])
  assert.strictEqual(getNodeRefs(n).length, 1)
})
test('updateRefSnapshot 校准 baseHash/baseRev', () => {
  const n = node()
  const r = addRef(n, { file: 'a.md', sectionId: 's1' })
  updateRefSnapshot(n, r.refId, { baseHash: 'h1', baseRev: 3 })
  const got = getNodeRefs(n).find(x => x.refId === r.refId)
  assert.strictEqual(got.baseHash, 'h1')
  assert.strictEqual(got.baseRev, 3)
})
test('parseLegacyRefs 解析备注行', () => {
  const out = parseLegacyRefs('📌 引用自 a.md · 需求分析')
  assert.strictEqual(out.length, 1)
  assert.strictEqual(out[0].file, 'a.md')
  assert.deepStrictEqual(out[0].sectionPath, ['需求分析'])
})
test('使用 _mindlink 键（非下划线剥离）', () => {
  const n = node()
  addRef(n, { file: 'a.md', sectionId: 's1' })
  assert.ok(n.data._mindlink && Array.isArray(n.data._mindlink.refs))
})
test('addRef mode 区分跳转与内容', () => {
  const n = node()
  addRef(n, { file: 'a.md', sectionId: 's1', mode: 'content' })
  addRef(n, { file: 'a.md', sectionId: 's1', mode: 'jump' })
  assert.strictEqual(getNodeRefs(n).length, 2)
})
test('getNodeRefs 补齐 refId', () => {
  const n = node()
  setNodeRefs(n, [{ file: 'a.md', sectionId: 's1' }])
  const refs = getNodeRefs(n)
  assert.ok(refs[0].refId)
})
test('addRef 多引用各自独立', () => {
  const n = node()
  addRef(n, { file: 'a.md', sectionId: 's1' })
  addRef(n, { file: 'b.md', sectionId: 's2' })
  assert.strictEqual(getNodeRefs(n).length, 2)
})

// ── getNodeRefs 边界 ──
test('getNodeRefs null → []', () => { assert.deepStrictEqual(getNodeRefs(null), []) })
test('getNodeRefs 无 data → []', () => { assert.deepStrictEqual(getNodeRefs({}), []) })
test('getNodeRefs _mindlink 无 refs → []', () => {
  assert.deepStrictEqual(getNodeRefs({ data: { _mindlink: {} } }), [])
})
test('getNodeRefs refs 非数组 → []', () => {
  assert.deepStrictEqual(getNodeRefs({ data: { _mindlink: { refs: 'x' } } }), [])
})
test('refId 仅运行时：写入时剥离，读回为合成值', () => {
  const n = node()
  setNodeRefs(n, [{ file: 'a.md', sectionId: 's1', refId: 'keep' }])
  assert.strictEqual(n.data._mindlink.refs[0].refId, undefined, '持久化层不得含 refId')
  assert.strictEqual(getNodeRefs(n)[0].refId, 'r0', '读回时按序号合成')
})
test('getNodeRefs 不修改原对象', () => {
  const n = node()
  addRef(n, { file: 'a.md', sectionId: 's1' })
  const before = JSON.stringify(n)
  getNodeRefs(n)
  assert.strictEqual(JSON.stringify(n), before)
})

// ── setNodeRefs ──
test('setNodeRefs 空数组清空', () => {
  const n = node()
  addRef(n, { file: 'a.md', sectionId: 's1' })
  setNodeRefs(n, [])
  assert.deepStrictEqual(getNodeRefs(n), [])
})
test('setNodeRefs 无 data → false（不抛）', () => {
  assert.strictEqual(setNodeRefs({}, []), false)
})
test('setNodeRefs null 节点 → false', () => {
  assert.strictEqual(setNodeRefs(null, []), false)
})
test('setNodeRefs 剥离运行时 refId（不持久化）', () => {
  const n = node()
  setNodeRefs(n, [{ file: 'a.md', sectionId: 's1', refId: 'r0' }])
  assert.strictEqual(n.data._mindlink.refs[0].refId, undefined)
})
test('setNodeRefs 保留 _mindlink 其它字段', () => {
  const n = { data: { _mindlink: { foo: 1 } } }
  setNodeRefs(n, [{ file: 'a.md', sectionId: 's1' }])
  assert.strictEqual(n.data._mindlink.foo, 1)
})

// ── addRef ──
test('addRef 默认 sectionPath 为空数组', () => {
  const n = node()
  const r = addRef(n, { file: 'a.md', sectionId: 's1' })
  assert.deepStrictEqual(r.sectionPath, [])
})
test('addRef 默认 baseHash 空 / baseRev 0', () => {
  const n = node()
  const r = addRef(n, { file: 'a.md', sectionId: 's1' })
  assert.strictEqual(r.baseHash, '')
  assert.strictEqual(r.baseRev, 0)
})
test('addRef 去重时返回既有 ref（不改长度）', () => {
  const n = node()
  const a = addRef(n, { file: 'a.md', sectionId: 's1' })
  const b = addRef(n, { file: 'a.md', sectionId: 's1' })
  assert.strictEqual(a.refId, b.refId)
})
test('addRef refId 按序号递增 r0/r1', () => {
  const n = node()
  assert.strictEqual(addRef(n, { file: 'a.md', sectionId: 's1' }).refId, 'r0')
  assert.strictEqual(addRef(n, { file: 'b.md', sectionId: 's2' }).refId, 'r1')
})

// ── §32.4 Bug②：addRef 必须持久化 title/cachedContent（引用后备注才显示被引用内容）──
test('addRef 持久化 title 与 cachedContent（Bug② 回归）', () => {
  const n = node()
  const r = addRef(n, {
    file: 'a.md',
    sectionId: 's1',
    title: '需求分析',
    cachedContent: '# 需求分析\n正文内容'
  })
  assert.strictEqual(r.title, '需求分析')
  assert.strictEqual(r.cachedContent, '# 需求分析\n正文内容')
  const got = getNodeRefs(n).find(x => x.refId === r.refId)
  assert.strictEqual(got.title, '需求分析', 'title 经 addRef 落地到 _mindlink.refs')
  assert.strictEqual(got.cachedContent, '# 需求分析\n正文内容', 'cachedContent 经 addRef 落地到 _mindlink.refs')
})

test('addRef 去重命中既有引用时回填缺失的 title（Bug② 续）', () => {
  const n = node()
  const a = addRef(n, { file: 'a.md', sectionId: 's1' }) // 无 title
  assert.strictEqual(a.title, '')
  // 再次以带 title 的入参命中去重分支
  const b = addRef(n, { file: 'a.md', sectionId: 's1', title: '回填标题' })
  assert.strictEqual(getNodeRefs(n).length, 1, '去重不增条数')
  assert.strictEqual(getNodeRefs(n)[0].title, '回填标题', '去重时把 title 回填进既有 ref')
})

// ── removeRef ──
test('removeRef 空节点不抛', () => { assert.strictEqual(removeRef(node(), 'r0'), false) })
test('removeRef 只删指定项', () => {
  const n = node()
  addRef(n, { file: 'a.md', sectionId: 's1' })
  const b = addRef(n, { file: 'b.md', sectionId: 's2' })
  removeRef(n, b.refId)
  assert.strictEqual(getNodeRefs(n).length, 1)
  assert.strictEqual(getNodeRefs(n)[0].file, 'a.md')
})

// ── updateRefSnapshot ──
test('updateRefSnapshot 未命中 refId 不影响其它项', () => {
  const n = node()
  const a = addRef(n, { file: 'a.md', sectionId: 's1', baseHash: 'old' })
  updateRefSnapshot(n, 'ghost', { baseHash: 'new', baseRev: 9 })
  assert.strictEqual(getNodeRefs(n).find(x => x.refId === a.refId).baseHash, 'old')
})
test('updateRefSnapshot 返回 true', () => {
  const n = node()
  const a = addRef(n, { file: 'a.md', sectionId: 's1' })
  assert.strictEqual(updateRefSnapshot(n, a.refId, { baseHash: 'h', baseRev: 1 }), true)
})

// ── parseLegacyRefs ──
test('parseLegacyRefs 无匹配 → []', () => { assert.deepStrictEqual(parseLegacyRefs('普通备注'), []) })
test('parseLegacyRefs null → []', () => { assert.deepStrictEqual(parseLegacyRefs(null), []) })
test('parseLegacyRefs 多行多引用', () => {
  const out = parseLegacyRefs('引用自 a.md · X\n引用自 b.md · Y')
  assert.strictEqual(out.length, 2)
  assert.strictEqual(out[1].file, 'b.md')
})
test('parseLegacyRefs 无 · 时 sectionPath 为空', () => {
  const out = parseLegacyRefs('引用自 a.md')
  assert.deepStrictEqual(out[0].sectionPath, [])
})
test('parseLegacyRefs 标记 legacy', () => {
  assert.strictEqual(parseLegacyRefs('引用自 a.md · X')[0].legacy, true)
})
test('parseLegacyRefs 多级路径拆分', () => {
  const out = parseLegacyRefs('引用自 a.md · 需求 / 子节')
  assert.deepStrictEqual(out[0].sectionPath, ['需求', '子节'])
})

// ── 整文件引用（sectionId === null，v1.5 I4）────────────────────────────

test('addRef 支持整文件引用（sectionId null + 空 sectionPath）', () => {
  const n = node()
  const r = addRef(n, { file: 'doc.md', sectionId: null, sectionPath: [], baseHash: 'sha1:abc' })
  assert.strictEqual(r.sectionId, null)
  assert.strictEqual(getNodeRefs(n)[0].sectionId, null)
})

test('addRef 整文件引用与章节引用不互相去重', () => {
  const n = node()
  addRef(n, { file: 'doc.md', sectionId: null, sectionPath: [] })
  addRef(n, { file: 'doc.md', sectionId: 'secA', sectionPath: ['A'] })
  assert.strictEqual(getNodeRefs(n).length, 2, '同 file 但 sectionId 不同必须视为两个引用')
})

test('addRef 整文件引用重复添加只保留一条', () => {
  const n = node()
  addRef(n, { file: 'doc.md', sectionId: null, sectionPath: [] })
  addRef(n, { file: 'doc.md', sectionId: null, sectionPath: [] })
  assert.strictEqual(getNodeRefs(n).length, 1)
})

test('setNodeRefs 保留 sectionId null（不被默认值改写）', () => {
  const n = node()
  setNodeRefs(n, [{ file: 'doc.md', sectionId: null, sectionPath: [], mode: 'content' }])
  assert.strictEqual(n.data._mindlink.refs[0].sectionId, null)
})

test('sectionId null 与 undefined 在此模型下不可互换（undefined 会被默认成 null）', () => {
  const n = node()
  const r = addRef(n, { file: 'doc.md' })
  assert.strictEqual(r.sectionId, null, '缺省 sectionId 收敛为 null，语义即"整文件"')
})

test('parseLegacyRefs 产出 sectionId null 且带 sectionPath（不可当整文件处理）', () => {
  const out = parseLegacyRefs('引用自 a.md · 需求分析')
  assert.strictEqual(out[0].sectionId, null)
  assert.deepStrictEqual(out[0].sectionPath, ['需求分析'])
  assert.strictEqual(out[0].sectionPath.length > 0, true, 'legacy 靠 path 定位，不能按整文件比 hash')
})

test('updateRefSnapshot 可校准整文件引用的 baseHash', () => {
  const n = node()
  const r = addRef(n, { file: 'doc.md', sectionId: null, sectionPath: [], baseHash: 'old' })
  updateRefSnapshot(n, r.refId, { baseHash: 'sha1:new', baseRev: 3 })
  assert.strictEqual(getNodeRefs(n)[0].baseHash, 'sha1:new')
  assert.strictEqual(getNodeRefs(n)[0].baseRev, 3)
})

test('getNodeRefs 对缺失 _mindlink 返回空数组（整文件引用未建立时不炸）', () => {
  assert.deepStrictEqual(getNodeRefs({ data: {} }), [])
  assert.deepStrictEqual(getNodeRefs(null), [])
})

test('removeRef 按 refId 精确删除，不影响同 file 的其它引用', () => {
  const n = node()
  const a = addRef(n, { file: 'doc.md', sectionId: null, sectionPath: [] })
  addRef(n, { file: 'doc.md', sectionId: 'secA', sectionPath: ['A'] })
  removeRef(n, a.refId)
  const left = getNodeRefs(n)
  assert.strictEqual(left.length, 1)
  assert.strictEqual(left[0].sectionId, 'secA')
})

// ── §32.4 Bug②：运行时节点实例（MindMapNode）也能读写引用 ──────────────
// 旧实现一律读 node.data，而实例没有 .data → 引用永远写不进 / 读不出。

test('nodeDataOf：实例走 getData()，裸节点走 node.data，两者皆无返回 null', () => {
  const inst = mindMapNode()
  assert.strictEqual(nodeDataOf(inst), inst.nodeData.data)
  const raw = node()
  assert.strictEqual(nodeDataOf(raw), raw.data)
  assert.strictEqual(nodeDataOf({}), null)
  assert.strictEqual(nodeDataOf(null), null)
})

test('运行时节点实例上确实没有 .data（回归根因前提）', () => {
  const inst = mindMapNode()
  assert.strictEqual(inst.data, undefined, 'MindMapNode 实例不得有 .data（旧假设即错在此）')
})

test('addRef 对运行时节点实例生效：写进 nodeData.data._mindlink.refs 并调用 setData', () => {
  const inst = mindMapNode()
  assert.deepStrictEqual(getNodeRefs(inst), [], '初始无引用')
  const r = addRef(inst, {
    file: 'a.md',
    sectionId: 's1',
    sectionPath: ['需求分析'],
    title: '需求分析',
    cachedContent: '# 需求分析\n正文'
  })
  assert.ok(r && r.file === 'a.md')
  // 落到实例真实数据层（存档时 copyNodeTree 读的就是 nodeData.data）
  assert.ok(inst.nodeData.data._mindlink && Array.isArray(inst.nodeData.data._mindlink.refs))
  assert.strictEqual(inst.nodeData.data._mindlink.refs[0].title, '需求分析')
  assert.strictEqual(inst.nodeData.data._mindlink.refs[0].cachedContent, '# 需求分析\n正文')
  // 通过官方 setData 写入（进历史 / 触发 data_change）
  assert.ok(inst._patches.length >= 1, '必须调用 node.setData')
  // 读回可见 —— 这就是"添加引用后能看到引用块"的关键
  assert.strictEqual(getNodeRefs(inst).length, 1)
  assert.strictEqual(getNodeRefs(inst)[0].refId, 'r0')
})

// ── 引用增删后必须触发节点重绘（否则"备注标识"不会即时出现/消失）─────────────
// simple-mind-map 的 SET_NODE_DATA 仅合并数据、不重绘；备注图标在 render 阶段
// 的 createNoteNode 决定（已改为 refs 也显示图标）。故 setNodeRefs 必须主动
// 调 node.reRender()。本组用例锁定该行为，防止回归。

// 带 reRender 的实例（复刻 MindMapNode）
function mindMapNodeWithRender() {
  const base = mindMapNode()
  base.reRender = function () { this._reRendered = (this._reRendered || 0) + 1 }
  return base
}

test('addRef 对运行时节点实例会触发 reRender（标识即时出现）', () => {
  const inst = mindMapNodeWithRender()
  addRef(inst, { file: 'a.md', sectionId: 's1', title: 'T', cachedContent: 'C' })
  assert.strictEqual(inst._reRendered, 1, 'addRef 后必须主动重绘一次')
})

test('removeRef 对运行时节点实例会触发 reRender（标识即时消失）', () => {
  const inst = mindMapNodeWithRender()
  const r = addRef(inst, { file: 'a.md', sectionId: 's1', title: 'T', cachedContent: 'C' })
  const afterAdd = inst._reRendered
  removeRef(inst, r.refId)
  assert.strictEqual(inst._reRendered, afterAdd + 1, 'removeRef 后必须再重绘一次')
})

test('裸节点（无 reRender）不抛且不被重绘', () => {
  const n = node()
  assert.doesNotThrow(() => addRef(n, { file: 'a.md', sectionId: 's1' }))
  assert.doesNotThrow(() => removeRef(n, 'r0'))
})

test('运行时实例：addRef 去重 + title 回填', () => {
  const inst = mindMapNode()
  addRef(inst, { file: 'a.md', sectionId: 's1' })
  addRef(inst, { file: 'a.md', sectionId: 's1', title: '回填标题' })
  assert.strictEqual(getNodeRefs(inst).length, 1)
  assert.strictEqual(getNodeRefs(inst)[0].title, '回填标题')
})

test('运行时实例：removeRef / updateRefSnapshot 生效', () => {
  const inst = mindMapNode()
  const a = addRef(inst, { file: 'a.md', sectionId: 's1' })
  assert.strictEqual(updateRefSnapshot(inst, a.refId, { baseHash: 'h1', baseRev: 2 }), true)
  assert.strictEqual(getNodeRefs(inst)[0].baseHash, 'h1')
  assert.strictEqual(removeRef(inst, a.refId), true)
  assert.deepStrictEqual(getNodeRefs(inst), [])
})

test('运行时实例：setNodeRefs 落盘时剥离 refId（不持久化）', () => {
  const inst = mindMapNode()
  setNodeRefs(inst, [{ file: 'a.md', sectionId: 's1', refId: 'keep' }])
  assert.strictEqual(inst.nodeData.data._mindlink.refs[0].refId, undefined)
  assert.strictEqual(getNodeRefs(inst)[0].refId, 'r0')
})

test('运行时实例：setNodeRefs 保留 _mindlink 其它字段', () => {
  const inst = mindMapNode()
  inst.nodeData.data._mindlink = { foo: 1 }
  setNodeRefs(inst, [{ file: 'a.md', sectionId: 's1' }])
  assert.strictEqual(inst.nodeData.data._mindlink.foo, 1)
})

test('setNodeRefs：既无 getData 又无 data → false（不抛）', () => {
  assert.strictEqual(setNodeRefs({}, []), false)
  assert.strictEqual(setNodeRefs({ getData: () => null }, []), false)
  assert.strictEqual(setNodeRefs(null, []), false)
})

test('getNodeRefs：无数据层的节点/实例返回 []', () => {
  assert.deepStrictEqual(getNodeRefs({}), [])
  assert.deepStrictEqual(getNodeRefs({ getData: () => null }), [])
})
