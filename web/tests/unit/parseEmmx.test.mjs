// .emmx 解析单测（回归《详细设计_全量改造.md》模块4）
// 重点：bin 过滤正则漏嵌套目录（导入残缺）—— 抽成 isPageBinEntry 后单测。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPageBinEntry, parseEmmx } from '../../src/utils/parseEmmx.js'

test('isPageBinEntry：标准 mmpage/page.bin 匹配', () => {
  assert.equal(isPageBinEntry('mmpage/page.bin'), true)
  assert.equal(isPageBinEntry('mmpage/page-1.bin'), true)
})

test('isPageBinEntry：根目录 page.bin 匹配', () => {
  assert.equal(isPageBinEntry('page.bin'), true)
})

test('isPageBinEntry：嵌套目录（回归点）现已匹配', () => {
  // 旧正则 /^mmpage\/page.*\.bin$/ 与 /^page.*\.bin$/ 命中不到这些 → 导入残缺
  assert.equal(isPageBinEntry('Document/page.bin'), true)
  assert.equal(isPageBinEntry('content/page-2.bin'), true)
  assert.equal(isPageBinEntry('a/b/c/page.bin'), true)
})

test('isPageBinEntry：非 bin / 非 page 不匹配', () => {
  assert.equal(isPageBinEntry('document.xml'), false)
  assert.equal(isPageBinEntry('readme.txt'), false)
  assert.equal(isPageBinEntry('page.json'), false)
  assert.equal(isPageBinEntry('mmpage/notes.txt'), false)
  assert.equal(isPageBinEntry(null), false)
})

test('parseEmmx：损坏文件（非 zip 字节）应当 reject，不白屏', async () => {
  await assert.rejects(() => parseEmmx(Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff]), 'broken.emmx'))
})

test('parseEmmx：空/undefined 输入应安全 reject', async () => {
  await assert.rejects(() => parseEmmx(undefined, 'x.emmx'))
})
