// Toast UI 表格选区崩溃修复单测（v2.0.71）
// 验证 safeGetCellIndex 在「合并单元格导致 rowInfo 稀疏（含 undefined 槽位）」时
// 不崩溃，且与原稠密逻辑等价；越界回退 [0,0]。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeGetCellIndex, patchTableOffsetMapProto } from '../../src/utils/toastTablePatch.js'

// 构造一个类似 TableOffsetMap 的对象：rowInfo 二维数组 + 行列总数
function makeMap(rowInfo, totalRowCount, totalColumnCount) {
  return { rowInfo, totalRowCount, totalColumnCount }
}

// 稠密表格（无合并单元格）：原实现与 safe 实现应完全一致
const dense = makeMap(
  [
    [{ offset: 1, nodeSize: 3 }, { offset: 5, nodeSize: 3 }],
    [{ offset: 9, nodeSize: 3 }, { offset: 13, nodeSize: 3 }]
  ],
  2,
  2
)

test('稠密 rowInfo：等价原逻辑', () => {
  // pos=7 应落在第二行第一列 [1,0]（5+1=6<7，9+1=10>7）
  assert.deepEqual(safeGetCellIndex(dense.rowInfo, 2, 2, 7), [1, 0])
  // pos=2 落在第一行第二列 [0,1]
  assert.deepEqual(safeGetCellIndex(dense.rowInfo, 2, 2, 2), [0, 1])
  // pos=0 落在第一行第一列 [0,0]
  assert.deepEqual(safeGetCellIndex(dense.rowInfo, 2, 2, 0), [0, 0])
})

// 稀疏 rowInfo：模拟 row1 col0 被 row0 col0 的 rowspan 覆盖 → undefined 槽位
const sparse = makeMap(
  [
    [{ offset: 1, nodeSize: 5 }, { offset: 7, nodeSize: 3 }],
    [undefined, { offset: 11, nodeSize: 3 }] // row1 col0 为 undefined
  ],
  2,
  2
)

test('稀疏 rowInfo：含 undefined 槽位不崩溃（原实现此处会抛 reading offset）', () => {
  // pos=9：row0 无命中（7+1=8<9），row1 col0 undefined 跳过，col1 offset11+1=12>9 → [1,1]
  assert.deepEqual(safeGetCellIndex(sparse.rowInfo, 2, 2, 9), [1, 1])
})

test('稀疏 rowInfo：pos 落在 undefined 槽之前仍正常返回前一行', () => {
  // pos=4：row0 col0 offset1+1=2<4，col1 offset7+1=8>4 → [0,1]
  assert.deepEqual(safeGetCellIndex(sparse.rowInfo, 2, 2, 4), [0, 1])
})

test('越界 pos 回退 [0,0]', () => {
  // pos 极大，无任何 cell.offset+1 > pos → [0,0]
  assert.deepEqual(safeGetCellIndex(sparse.rowInfo, 2, 2, 99999), [0, 0])
  assert.deepEqual(safeGetCellIndex(dense.rowInfo, 2, 2, 99999), [0, 0])
})

test('整行缺失（rowInfo[row] 为 undefined）不崩溃', () => {
  const broken = makeMap([[{ offset: 1, nodeSize: 3 }], undefined], 2, 1)
  assert.deepEqual(safeGetCellIndex(broken.rowInfo, 2, 1, 5), [0, 0])
})

// ── v2.0.73 加固：getCellInfo 稀疏安全（合并/跨列跨行单元格根因）────────────
// 构造带原型的「类 TableOffsetMap」对象，供 patchTableOffsetMapProto 打补丁后验证。
function makeOffsetMap(rowInfo, totalColumnCount) {
  const proto = {}
  const map = Object.create(proto)
  map.rowInfo = rowInfo
  map.totalRowCount = rowInfo.length
  map.totalColumnCount = totalColumnCount
  map.tableStartPos = 0
  map.tableStartOffset = 0
  map.tableRows = rowInfo.map(() => ({ nodeSize: 10 }))
  map.table = { nodeAt: () => ({ type: { name: 'tableCell' } }) }
  map.extendedRowspan = () => false
  return map
}

const denseMap = makeOffsetMap(
  [
    [{ offset: 1, nodeSize: 3 }, { offset: 5, nodeSize: 3 }],
    [{ offset: 9, nodeSize: 3 }, { offset: 13, nodeSize: 3 }]
  ],
  2
)

// 稀疏：row1 col0 被跨列覆盖 → rowInfo[1][0] 为 undefined 占位格
const sparseMap = makeOffsetMap(
  [
    [{ offset: 1, nodeSize: 5 }, { offset: 7, nodeSize: 3 }],
    [undefined, { offset: 11, nodeSize: 3 }]
  ],
  2
)

test('patchTableOffsetMapProto: 稠密 getCellInfo 等价原实现', () => {
  patchTableOffsetMapProto(denseMap)
  assert.deepEqual(denseMap.getCellInfo(0, 0), { offset: 1, nodeSize: 3 })
  assert.deepEqual(denseMap.getCellInfo(1, 1), { offset: 13, nodeSize: 3 })
})

test('patchTableOffsetMapProto: 稀疏 getCellInfo 不崩溃且回退本行最近已定义单元格（跨列占位格左侧即覆盖格）', () => {
  patchTableOffsetMapProto(sparseMap)
  // 原实现 rowInfo[1][0].offset → undefined.offset 崩溃；修复后回退到左侧覆盖格 {offset:11}
  assert.deepEqual(sparseMap.getCellInfo(1, 0), { offset: 11, nodeSize: 3 })
})

test('patchTableOffsetMapProto: 稀疏 getCellStartOffset/getCellEndOffset/posAt/getNodeAndPos 均不崩溃', () => {
  patchTableOffsetMapProto(sparseMap)
  assert.strictEqual(sparseMap.getCellStartOffset(1, 0), 11)
  assert.strictEqual(sparseMap.getCellEndOffset(1, 0), 14)
  assert.strictEqual(typeof sparseMap.posAt(1, 0), 'number')
  const np = sparseMap.getNodeAndPos(1, 0)
  assert.ok(np && typeof np.pos === 'number')
})

