// web/tests/unit/nodeImageKeys.test.mjs
//
// 回归 2026-09-15 用户报障：跨工作表复制节点时，子节点上的图片会「拷贝失败」，
// 粘贴后节点只显示"图片加载失败"占位图。
//
// 契约（修复必须满足）：
//   1. NodeBase64ImageStorage 插件把 base64 图片抽成 key 存于「每个工作表各自的 imgMap」；
//      库的复制只带节点 data（image 字段是 key），跨表粘贴后 key 悬空 → 破图。
//   2. 因此必须有「跨工作表共享的 key 注册表」，并把悬空 key 补进目标表 imgMap。
//   3. 补全必须是"按需"的：没有悬空 key 时绝不改动数据（否则会凭空产生 imgMap、
//      把刚载入的文件误标为已修改）。
//   4. 已存在同名 key 时不得覆盖（同 key 必然同图；覆盖只会让问题更难查）。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isImageKey,
  registerImageKey,
  harvestImageKeysFromTree,
  harvestImageKeysFromContainer,
  repairDanglingImageKeys,
  resolveTreeRoot,
  resolveNodeImageUrl,
  getImageKeyRegistry,
  resetImageKeyRegistry
} from '../../src/utils/nodeImageKeys.js'

const IMG_A = 'data:image/png;base64,AAAA'
const IMG_B = 'data:image/jpeg;base64,BBBB'

// 构造一棵最小渲染树：{ data, children }
const tree = (data = {}, children = []) => ({ data, children })

test('isImageKey: 只认插件生成的 smm_img_key_ 前缀', () => {
  assert.equal(isImageKey('smm_img_key_abc'), true)
  assert.equal(isImageKey('data:image/png;base64,AAAA'), false)
  assert.equal(isImageKey('https://a.com/x.png'), false)
  assert.equal(isImageKey('./assets/x.svg'), false)
  assert.equal(isImageKey(''), false)
  assert.equal(isImageKey(undefined), false)
  assert.equal(isImageKey(123), false)
})

test('resolveTreeRoot: 兼容裸树与 getData(true) 的 {root,...} 完整包', () => {
  const bare = tree({ text: 'a' })
  assert.equal(resolveTreeRoot(bare), bare)
  const full = { root: bare, layout: 'mindMap', theme: {}, view: {} }
  assert.equal(resolveTreeRoot(full), bare)
  assert.equal(resolveTreeRoot(null), null)
})

test('registerImageKey: 只登记 base64，不登记网络/相对地址', () => {
  resetImageKeyRegistry()
  assert.equal(registerImageKey('smm_img_key_1', IMG_A), true)
  assert.equal(registerImageKey('smm_img_key_2', 'https://a.com/x.png'), false)
  assert.equal(registerImageKey('not_a_key', IMG_A), false)
  assert.equal(registerImageKey('smm_img_key_3', ''), false)
  assert.equal(getImageKeyRegistry().size, 1)
})

test('registerImageKey: 重复 key 只记一次', () => {
  resetImageKeyRegistry()
  registerImageKey('smm_img_key_1', IMG_A)
  assert.equal(registerImageKey('smm_img_key_1', IMG_A), false)
  assert.equal(getImageKeyRegistry().size, 1)
})

test('harvestImageKeysFromTree: 收集本表 imgMap（含 {root} 包）', () => {
  resetImageKeyRegistry()
  const t = tree({ imgMap: { smm_img_key_a: IMG_A, smm_img_key_b: IMG_B } })
  assert.equal(harvestImageKeysFromTree(t), 2)
  const packed = { root: tree({ imgMap: { smm_img_key_c: IMG_A } }) }
  assert.equal(harvestImageKeysFromTree(packed), 1)
  assert.equal(getImageKeyRegistry().size, 3)
})

test('harvestImageKeysFromTree: 无 imgMap / 空值不报错', () => {
  resetImageKeyRegistry()
  assert.equal(harvestImageKeysFromTree(null), 0)
  assert.equal(harvestImageKeysFromTree(tree({ text: 'x' })), 0)
  assert.equal(harvestImageKeysFromTree({ data: {} }), 0)
})

test('harvestImageKeysFromContainer: 收集整个工作簿所有工作表', () => {
  resetImageKeyRegistry()
  const container = {
    app: 'smm-multisheet',
    sheets: [
      { id: 's1', data: tree({ imgMap: { smm_img_key_a: IMG_A } }) },
      { id: 's2', data: { root: tree({ imgMap: { smm_img_key_b: IMG_B } }) } },
      { id: 's3', data: tree({ text: 'no image' }) }
    ]
  }
  assert.equal(harvestImageKeysFromContainer(container), 2)
  assert.equal(harvestImageKeysFromContainer(null), 0)
  assert.equal(harvestImageKeysFromContainer({}), 0)
})

test('★核心回归：跨工作表复制节点 → 目标表 imgMap 缺失的图片 key 被补回', () => {
  resetImageKeyRegistry()
  // 工作表 A：图片被插件抽成 key
  const sheetA = tree({
    text: 'A 根',
    imgMap: { smm_img_key_photo: IMG_A }
  })
  sheetA.children.push(tree({ text: '有图子节点', image: 'smm_img_key_photo' }))
  harvestImageKeysFromTree(sheetA)

  // 工作表 B：从 A 复制粘贴过来的节点，image 仍是 A 的 key，但 B 的 imgMap 里没有
  const sheetB = tree({ text: 'B 根' })
  sheetB.children.push(tree({ text: '粘贴来的节点', image: 'smm_img_key_photo' }))

  // 修复前：图片地址退化成 key 本身 → 破图
  assert.equal(resolveNodeImageUrl(sheetB, 'smm_img_key_photo'), 'smm_img_key_photo')

  const repaired = repairDanglingImageKeys(sheetB)
  assert.equal(repaired, 1)
  assert.equal(sheetB.data.imgMap.smm_img_key_photo, IMG_A)
  // 修复后：与库内 nodeCreateContents 一致的查找结果变成真图
  assert.equal(resolveNodeImageUrl(sheetB, 'smm_img_key_photo'), IMG_A)
  // 节点自身数据不改（仍是 key），保证去重特性与文件体积不变
  assert.equal(sheetB.children[0].data.image, 'smm_img_key_photo')
})

test('修复是递归的：深层子节点上的图片同样被修复', () => {
  resetImageKeyRegistry()
  const sheetA = tree({ imgMap: { smm_img_key_deep: IMG_B } })
  harvestImageKeysFromTree(sheetA)

  const sheetB = tree({ text: 'B 根' })
  const l1 = tree({ text: 'L1' })
  const l2 = tree({ text: 'L2' })
  l2.children.push(tree({ text: 'L3 带图', image: 'smm_img_key_deep' }))
  l1.children.push(l2)
  sheetB.children.push(l1)

  assert.equal(repairDanglingImageKeys(sheetB), 1)
  assert.equal(sheetB.data.imgMap.smm_img_key_deep, IMG_B)
})

test('修复是幂等的：连跑两次结果一致，第二次不再改动', () => {
  resetImageKeyRegistry()
  const sheetA = tree({ imgMap: { smm_img_key_a: IMG_A } })
  harvestImageKeysFromTree(sheetA)
  const sheetB = tree({ text: 'B' })
  sheetB.children.push(tree({ image: 'smm_img_key_a' }))
  assert.equal(repairDanglingImageKeys(sheetB), 1)
  assert.equal(repairDanglingImageKeys(sheetB), 0)
})

test('按需修复：没有悬空 key 时完全不改动数据（不得凭空造 imgMap）', () => {
  resetImageKeyRegistry()
  // 注册表里有别的表的 key，但本表根本没引用它
  harvestImageKeysFromTree(tree({ imgMap: { smm_img_key_other: IMG_A } }))
  const sheetB = tree({ text: 'B 根' })
  sheetB.children.push(tree({ text: '纯文本节点', image: 'smm_img_key_unknown' }))

  assert.equal(repairDanglingImageKeys(sheetB), 0)
  // 关键：不引用就不该写入，避免把刚载入的文件改脏
  assert.equal(sheetB.data.imgMap, undefined)
})

test('注册表里查不到的 key 保持原样（不猜、不写入 undefined）', () => {
  resetImageKeyRegistry()
  const sheetB = tree({ text: 'B' })
  sheetB.children.push(tree({ image: 'smm_img_key_nobody' }))
  assert.equal(repairDanglingImageKeys(sheetB), 0)
  assert.equal(sheetB.data.imgMap, undefined)
})

test('已存在的 key 不被覆盖（同 key 必然同图）', () => {
  resetImageKeyRegistry()
  harvestImageKeysFromTree(tree({ imgMap: { smm_img_key_x: IMG_A } }))
  const sheetB = tree({ imgMap: { smm_img_key_x: IMG_B } })
  sheetB.children.push(tree({ image: 'smm_img_key_x' }))
  assert.equal(repairDanglingImageKeys(sheetB), 0)
  assert.equal(sheetB.data.imgMap.smm_img_key_x, IMG_B)
})

test('base64 / http / 相对路径图片不受影响', () => {
  resetImageKeyRegistry()
  harvestImageKeysFromTree(tree({ imgMap: { smm_img_key_k: IMG_A } }))
  const sheetB = tree({ text: 'B' })
  sheetB.children.push(tree({ image: IMG_B }))
  sheetB.children.push(tree({ image: 'https://a.com/x.png' }))
  sheetB.children.push(tree({ image: './assets/icon/1.svg' }))
  assert.equal(repairDanglingImageKeys(sheetB), 0)
  assert.equal(sheetB.data.imgMap, undefined)
})

test('健壮性：null / 空树 / 无 children 都不抛异常', () => {
  resetImageKeyRegistry()
  assert.equal(repairDanglingImageKeys(null), 0)
  assert.equal(repairDanglingImageKeys({}), 0)
  assert.equal(repairDanglingImageKeys(tree()), 0)
  const broken = { data: { image: 'smm_img_key_a' }, children: [null, undefined, {}] }
  assert.doesNotThrow(() => repairDanglingImageKeys(broken))
})

test('注册表为空时直接跳过（不做任何遍历）', () => {
  resetImageKeyRegistry()
  const sheet = tree({ text: 'B' })
  sheet.children.push(tree({ image: 'smm_img_key_a' }))
  assert.equal(repairDanglingImageKeys(sheet), 0)
  assert.equal(sheet.data.imgMap, undefined)
})
