// .emmx 解析单测（回归《详细设计_全量改造.md》模块4）
// 重点：bin 过滤正则漏嵌套目录（导入残缺）—— 抽成 isPageBinEntry 后单测。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isPageBinEntry, parseEmmx, parsePageBin } from '../../src/utils/parseEmmx.js'

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

// 构造一个最小合法 page*.bin 字节流（命中 matchTopicMark 的文本对象布局）：
// 06 01 | 01 <v1> | 02 <v2> | 04 01 | 02 <type> | 04 | <UTF-8 文本> 00 00 00 0a 7f
function buildPageBin(text) {
  const enc = new TextEncoder()
  const tb = enc.encode(text)
  const head = [0x06, 0x01, 0x01, 0x01, 0x02, 0x01, 0x04, 0x01, 0x02, 0x01, 0x04]
  const term = [0x00, 0x00, 0x00, 0x0a, 0x7f]
  const bytes = new Uint8Array(head.length + tb.length + term.length)
  bytes.set(head, 0)
  bytes.set(tb, head.length)
  bytes.set(term, head.length + tb.length)
  return bytes
}

test('parsePageBin：超长文本话题（>1000 字符）不应被静默丢弃', () => {
  const longText = 'A'.repeat(2500)
  const r = parsePageBin(buildPageBin(longText))
  assert.ok(r, '应解析出结果')
  assert.ok(r.tree && r.tree.data && typeof r.tree.data.text === 'string', '应产出含文本的节点')
  assert.ok(
    r.tree.data.text.length > 1000,
    `长文本话题不应被丢弃（实际长度 ${r.tree.data.text.length}）`
  )
})

test('parsePageBin：正常短文本话题仍正确提取（未因放宽上限而误判）', () => {
  const r = parsePageBin(buildPageBin('项目计划'))
  assert.ok(r, '应解析出结果')
  assert.equal(r.tree.data.text, '项目计划')
})
