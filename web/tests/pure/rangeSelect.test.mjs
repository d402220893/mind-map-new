// 纯单测：文件树 Shift+左键连续多选的区间计算（从 WorkspacePanel.selectRange 抽离的纯函数）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeRangeSelection } from '../../src/utils/rangeSelect.js'

// 构造平铺文件列表：a/b 是 .smm 文件，c/d 是 .md 文件，dir 是目录（应被排除在区间之外）
const flat = [
  { name: 'a', path: 'a.smm', isDir: false },
  { name: 'dir', path: 'dir', isDir: true },
  { name: 'b', path: 'b.smm', isDir: false },
  { name: 'c', path: 'c.md', isDir: false },
  { name: 'd', path: 'd.md', isDir: false }
]

test('Shift 选中锚点→当前 之间的连续区间（含两端）', () => {
  const out = computeRangeSelection({ files: flat, anchor: 'a.smm', current: 'c.md', append: false })
  assert.deepStrictEqual(out, ['a.smm', 'b.smm', 'c.md'])
})

test('区间顺序无关：current 在锚点之前也正确', () => {
  const out = computeRangeSelection({ files: flat, anchor: 'c.md', current: 'a.smm', append: false })
  assert.deepStrictEqual(out, ['a.smm', 'b.smm', 'c.md'])
})

test('目录被排除在区间之外（不把目录本身算作选中文件）', () => {
  const out = computeRangeSelection({ files: flat, anchor: 'a.smm', current: 'd.md', append: false })
  // a.smm..d.md 之间的所有文件都应被选中，dir（目录）本身不得出现
  assert.deepStrictEqual(out, ['a.smm', 'b.smm', 'c.md', 'd.md'])
  assert.ok(!out.includes('dir'), '目录本身不得被选中')
})

test('首次 Shift 点击（无锚点）退化为仅选当前文件', () => {
  const out = computeRangeSelection({ files: flat, anchor: '', current: 'b.smm', append: false })
  assert.deepStrictEqual(out, ['b.smm'])
})

test('当前文件不在列表时返回原选中态（不抛、不破坏）', () => {
  const out = computeRangeSelection({ files: flat, anchor: 'a.smm', current: 'missing.smm', append: false, selected: ['x.smm'] })
  assert.deepStrictEqual(out, ['x.smm'])
})

test('append=true 把区间并入现有多选（Set 去重，不重复）', () => {
  const out = computeRangeSelection({ files: flat, anchor: 'a.smm', current: 'b.smm', append: true, selected: ['d.md'] })
  assert.deepStrictEqual(out, ['d.md', 'a.smm', 'b.smm'])
  assert.strictEqual(new Set(out).size, out.length, '不应出现重复路径')
})

test('空列表 / 无 files 入参安全返回', () => {
  assert.deepStrictEqual(computeRangeSelection({ files: [], anchor: 'a', current: 'b' }), [])
  assert.deepStrictEqual(computeRangeSelection(null), [])
})
