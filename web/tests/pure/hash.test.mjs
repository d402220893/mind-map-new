import { test } from 'node:test'
import assert from 'node:assert'
import { sha1hex, normalizeForHash, reuseOrCreateId, contentHashOf } from '../../src/services/hash.js'

test('sha1 空串标准向量', () => {
  assert.strictEqual(sha1hex(''), 'da39a3ee5e6b4b0d3255bfef95601890afd80709')
})
test('sha1 "abc" 标准向量', () => {
  // 以 node:crypto 校准（FIPS 180-2 附录 A 实测值）
  assert.strictEqual(sha1hex('abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d')
})
test('sha1 56字节多块标准向量', () => {
  assert.strictEqual(
    sha1hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    '84983e441c3bd26ebaae4aa1f95129e5e54670f1'
  )
})
test('sha1 确定性（同输入同输出）', () => {
  assert.strictEqual(sha1hex('hello'), sha1hex('hello'))
})
test('sha1 不同输入不同输出', () => {
  assert.notStrictEqual(sha1hex('hello'), sha1hex('world'))
})
test('sha1 中文确定性', () => {
  assert.strictEqual(sha1hex('中文'), sha1hex('中文'))
})
test('normalizeForHash CRLF→LF', () => {
  assert.strictEqual(normalizeForHash('a\r\nb'), 'a\nb')
})
test('normalizeForHash 去行尾空白', () => {
  assert.strictEqual(normalizeForHash('a   \nb'), 'a\nb')
})
test('normalizeForHash 压缩连续空行', () => {
  assert.strictEqual(normalizeForHash('a\n\n\n\nb'), 'a\n\nb')
})
test('normalizeForHash 整体 trim（保留行内前导空白）', () => {
  // 归一化只去行尾空白/CRLF/连续空行/整体 trim；行内前导空白有意义（缩进代码/列表）不剥。
  assert.strictEqual(normalizeForHash('  a  \n  b  '), 'a\n  b')
})
test('normalizeForHash 尾空白不影响哈希稳定', () => {
  const a = normalizeForHash('x  ')
  const b = normalizeForHash('x')
  assert.strictEqual(sha1hex(a), sha1hex(b))
})
test('reuseOrCreateId 行区间重叠复用旧 id', () => {
  const used = new Set()
  const id0 = reuseOrCreateId({ file: 'f.md', path: ['A'], level: 1, startLine: 0, headingLineCount: 1, endLine: 3 }, null, used)
  const prev = { files: { 'f.md': { sections: { [id0]: { level: 1, startLine: 0, endLine: 3, path: ['A'] } } } } }
  const id1 = reuseOrCreateId({ file: 'f.md', path: ['A（改）'], level: 1, startLine: 0, headingLineCount: 1, endLine: 3 }, prev, new Set())
  assert.strictEqual(id1, id0)
})
test('reuseOrCreateId 无 prevIndex 生成稳定 base', () => {
  const a = reuseOrCreateId({ file: 'f.md', path: ['A'], level: 1, startLine: 0 }, null, new Set())
  const b = reuseOrCreateId({ file: 'f.md', path: ['A'], level: 1, startLine: 0 }, null, new Set())
  assert.strictEqual(a, b)
})
test('reuseOrCreateId 同级同名去重 -1', () => {
  const used = new Set()
  const a = reuseOrCreateId({ file: 'f.md', path: ['A'], level: 1, startLine: 0 }, null, used)
  const b = reuseOrCreateId({ file: 'f.md', path: ['A'], level: 1, startLine: 5 }, null, used)
  assert.notStrictEqual(a, b)
  assert.ok(b.endsWith('-1'))
})
test('reuseOrCreateId 不同 file 不同 id', () => {
  const a = reuseOrCreateId({ file: 'a.md', path: ['A'], level: 1, startLine: 0 }, null, new Set())
  const b = reuseOrCreateId({ file: 'b.md', path: ['A'], level: 1, startLine: 0 }, null, new Set())
  assert.notStrictEqual(a, b)
})
test('reuseOrCreateId 行区间不重叠不复用', () => {
  // 复用判据是"行区间重叠+同级"，不是 path。同标题不同位置 → 不重叠 → 不复用旧 id。
  // 复用同一 usedIds（与 sectionParser 单次解析一致），新 id 由 base 去重得 '-1'。
  const used = new Set()
  const id0 = reuseOrCreateId({ file: 'f.md', path: ['A'], level: 1, startLine: 0, headingLineCount: 1, endLine: 3 }, null, used)
  const prev = { files: { 'f.md': { sections: { [id0]: { level: 1, startLine: 0, endLine: 3, path: ['A'] } } } } }
  const id1 = reuseOrCreateId({ file: 'f.md', path: ['A'], level: 1, startLine: 10, headingLineCount: 1, endLine: 13 }, prev, used)
  assert.notStrictEqual(id1, id0)
  assert.ok(id1.endsWith('-1'))
})
test('reuseOrCreateId 空 usedIds 不抛', () => {
  const id = reuseOrCreateId({ file: 'f.md', path: ['A'], level: 1, startLine: 0 }, null, new Set())
  assert.ok(id)
})

// ── sha1：长度 / 边界 / 多块（P0 修过的 padLen 终止字节回归防线）──
test('sha1 输出恒为 40 位小写 hex', () => {
  assert.match(sha1hex('x'), /^[0-9a-f]{40}$/)
})
test('sha1 空串 ≠ 空格', () => {
  assert.notStrictEqual(sha1hex(''), sha1hex(' '))
})
test('sha1 单字节', () => assert.match(sha1hex('a'), /^[0-9a-f]{40}$/))
test('sha1 55 字节（恰好填满单块前）', () => {
  assert.strictEqual(sha1hex('a'.repeat(55)).length, 40)
})
test('sha1 56 字节（跨块边界）', () => {
  assert.strictEqual(sha1hex('a'.repeat(56)).length, 40)
})
test('sha1 64 字节（恰一整块）', () => {
  assert.strictEqual(sha1hex('a'.repeat(64)).length, 40)
})
test('sha1 65 字节（越块）', () => {
  assert.strictEqual(sha1hex('a'.repeat(65)).length, 40)
})
test('sha1 119 字节（padLen 恰好需扩块的长度，回归 P0 bug）', () => {
  // bytes.length=119 → 119+1+8=128 → 恰为 64 的 2 倍；漏 +1 时会算成 1 块并把 0x80 写进长度字段
  const h = sha1hex('a'.repeat(119))
  assert.match(h, /^[0-9a-f]{40}$/)
  assert.notStrictEqual(h, sha1hex('a'.repeat(118)))
})
test('sha1 长文本（10KB）', () => {
  assert.strictEqual(sha1hex('x'.repeat(10240)).length, 40)
})
test('sha1 多字节 UTF-8（中文/emoji）', () => {
  assert.match(sha1hex('中文🎉'), /^[0-9a-f]{40}$/)
  assert.notStrictEqual(sha1hex('中'), sha1hex('文'))
})
test('sha1 与标准向量 "a"', () => {
  assert.strictEqual(sha1hex('a'), '86f7e437faa5a7fce15d1ddcb9eaeaea377667b8')
})
test('sha1 与标准向量 "The quick brown fox jumps over the lazy dog"', () => {
  assert.strictEqual(sha1hex('The quick brown fox jumps over the lazy dog'), '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12')
})
test('sha1 与标准向量 "The quick brown fox jumps over the lazy cog"', () => {
  assert.strictEqual(sha1hex('The quick brown fox jumps over the lazy cog'), 'de9f2c7fd25e1b3afad3e85a0bd17d9b100db4b3')
})
test('sha1 非字符串输入按字符串处理', () => {
  assert.strictEqual(sha1hex(123), sha1hex('123'))
})
test('sha1 null/undefined 不抛', () => {
  assert.strictEqual(sha1hex(null), sha1hex('null'))
  assert.strictEqual(sha1hex(undefined), sha1hex('undefined'))
})

// ── normalizeForHash ──
test('normalizeForHash 空串', () => { assert.strictEqual(normalizeForHash(''), '') })
test('normalizeForHash 仅空白', () => { assert.strictEqual(normalizeForHash('   \n  '), '') })
test('normalizeForHash 单行', () => { assert.strictEqual(normalizeForHash('  x  '), 'x') })
test('normalizeForHash 保留中间空行', () => { assert.strictEqual(normalizeForHash('a\n\nb'), 'a\n\nb') })
test('normalizeForHash 制表符行尾也被剥', () => {
  assert.strictEqual(normalizeForHash('a\t\nb'), 'a\nb')
})
test('normalizeForHash 幂等（二次归一化不变）', () => {
  const once = normalizeForHash('  a  \r\n\r\n\r\nb  ')
  assert.strictEqual(normalizeForHash(once), once)
})
test('normalizeForHash 非字符串不抛', () => {
  assert.strictEqual(normalizeForHash(null), 'null')
})
test('normalizeForHash CRLF 与 LF 哈希一致', () => {
  assert.strictEqual(sha1hex(normalizeForHash('a\r\nb')), sha1hex(normalizeForHash('a\nb')))
})

// ── reuseOrCreateId ──
test('reuseOrCreateId 不同 level 不复用', () => {
  const id0 = reuseOrCreateId({ file: 'f.md', path: ['A'], level: 1, startLine: 0 }, null, new Set())
  const prev = { files: { 'f.md': { sections: { [id0]: { level: 1, startLine: 0, endLine: 3 } } } } }
  const id1 = reuseOrCreateId({ file: 'f.md', path: ['A'], level: 2, startLine: 0 }, prev, new Set())
  assert.notStrictEqual(id1, id0)
})
test('reuseOrCreateId 相邻区间（startLine == endLine）不复用', () => {
  const id0 = reuseOrCreateId({ file: 'f.md', path: ['A'], level: 1, startLine: 0 }, null, new Set())
  const prev = { files: { 'f.md': { sections: { [id0]: { level: 1, startLine: 0, endLine: 3 } } } } }
  const id1 = reuseOrCreateId({ file: 'f.md', path: ['B'], level: 1, startLine: 3 }, prev, new Set())
  assert.notStrictEqual(id1, id0)
})
test('reuseOrCreateId 缺失 endLine 时用 headingLineCount 兜底', () => {
  const id0 = reuseOrCreateId({ file: 'f.md', path: ['A'], level: 1, startLine: 0 }, null, new Set())
  const prev = { files: { 'f.md': { sections: { [id0]: { level: 1, startLine: 0, headingLineCount: 2 } } } } }
  const id1 = reuseOrCreateId({ file: 'f.md', path: ['A2'], level: 1, startLine: 1 }, prev, new Set())
  assert.strictEqual(id1, id0)
})
test('reuseOrCreateId 已被占用的旧 id 跳过（不重复给）', () => {
  const used = new Set()
  const id0 = reuseOrCreateId({ file: 'f.md', path: ['A'], level: 1, startLine: 0 }, null, used)
  const prev = { files: { 'f.md': { sections: { [id0]: { level: 1, startLine: 0, endLine: 5 } } } } }
  used.add(id0) // 模拟本轮已用过
  const id1 = reuseOrCreateId({ file: 'f.md', path: ['B'], level: 1, startLine: 1 }, prev, used)
  assert.notStrictEqual(id1, id0)
})
test('reuseOrCreateId prevIndex 缺 files 不抛', () => {
  const id = reuseOrCreateId({ file: 'f.md', path: ['A'], level: 1, startLine: 0 }, { files: null }, new Set())
  assert.ok(id)
})
test('reuseOrCreateId prevIndex 缺该 file 不抛', () => {
  const id = reuseOrCreateId({ file: 'f.md', path: ['A'], level: 1, startLine: 0 }, { files: { 'g.md': {} } }, new Set())
  assert.ok(id)
})
test('reuseOrCreateId 同一 file+path+level 稳定', () => {
  const a = reuseOrCreateId({ file: 'f.md', path: ['A', 'B'], level: 2, startLine: 1 }, null, new Set())
  const b = reuseOrCreateId({ file: 'f.md', path: ['A', 'B'], level: 2, startLine: 1 }, null, new Set())
  assert.strictEqual(a, b)
})
test('reuseOrCreateId 不同 path 不同 id', () => {
  const a = reuseOrCreateId({ file: 'f.md', path: ['A'], level: 1, startLine: 0 }, null, new Set())
  const b = reuseOrCreateId({ file: 'f.md', path: ['B'], level: 1, startLine: 0 }, null, new Set())
  assert.notStrictEqual(a, b)
})
test('reuseOrCreateId 三级去重后缀递增', () => {
  const used = new Set()
  const a = reuseOrCreateId({ file: 'f.md', path: ['A'], level: 1, startLine: 0 }, null, used)
  const b = reuseOrCreateId({ file: 'f.md', path: ['A'], level: 1, startLine: 5 }, null, used)
  const c = reuseOrCreateId({ file: 'f.md', path: ['A'], level: 1, startLine: 9 }, null, used)
  assert.notStrictEqual(a, b)
  assert.ok(c.endsWith('-2'))
})
test('reuseOrCreateId id 前缀为 h', () => {
  assert.ok(reuseOrCreateId({ file: 'f.md', path: ['A'], level: 1, startLine: 0 }, null, new Set()).startsWith('h'))
})

// ── contentHashOf：章节 hash 与整文件 hash 的**唯一**算法来源 ──────────────
// 若两处各算一套，"整文件引用"（sectionId === null）的乐观锁会与章节锁永不相等。

test('contentHashOf 格式为 sha1: + 12 位十六进制', () => {
  const h = contentHashOf('# 标题\n\n正文')
  assert.match(h, /^sha1:[0-9a-f]{12}$/)
})

test('contentHashOf 确定性：同输入必同输出', () => {
  assert.strictEqual(contentHashOf('abc'), contentHashOf('abc'))
})

test('contentHashOf 对行尾 / 尾空白 / 连续空行归一化', () => {
  const base = contentHashOf('# A\n\nbody')
  assert.strictEqual(contentHashOf('# A\r\n\r\nbody'), base)
  assert.strictEqual(contentHashOf('# A   \n\nbody\t'), base)
  assert.strictEqual(contentHashOf('# A\n\n\n\nbody'), base)
})

test('contentHashOf 前后空白不影响（trim 语义）', () => {
  assert.strictEqual(contentHashOf('\n\n# A\n\nbody\n\n\n'), contentHashOf('# A\n\nbody'))
})

test('contentHashOf 内容不同则 hash 不同', () => {
  assert.notStrictEqual(contentHashOf('# A'), contentHashOf('# B'))
})

test('contentHashOf 空串 / null / undefined 均不抛且结果一致', () => {
  assert.doesNotThrow(() => contentHashOf(''))
  assert.strictEqual(contentHashOf(null), contentHashOf(''))
  assert.strictEqual(contentHashOf(undefined), contentHashOf(''))
  assert.match(contentHashOf(null), /^sha1:[0-9a-f]{12}$/)
})

test('contentHashOf 与 parseSections 的章节 contentHash 同算法（跨模块口径一致）', async () => {
  const { parseSections } = await import('../../src/services/sectionParser.js')
  const md = '# A\n\nbodyA\n\n# B\n\nbodyB\n'
  const secs = parseSections(md, { file: 'x.md' })
  for (const s of secs) {
    assert.strictEqual(s.contentHash, contentHashOf(s.content), `章节「${s.title}」hash 口径不一致`)
  }
  // 整文件 hash 与任一章节 hash 不应相等（除非文件本身只有一个无正文章节）
  assert.notStrictEqual(contentHashOf(md), secs[0].contentHash)
})
