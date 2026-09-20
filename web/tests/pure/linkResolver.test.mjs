import { test } from 'node:test'
import assert from 'node:assert'
import {
  isExternal, normalizeHref, resolveLink, resolveEmbed,
  joinPath, relPath, extOf, dirOf, safeDecode, SUPPORTED
} from '../../src/services/linkResolver.js'

const ROOT = 'D:/ws'

// ── isExternal ──
test('isExternal https', () => { assert.strictEqual(isExternal('https://x.com'), true) })
test('isExternal mailto', () => { assert.strictEqual(isExternal('mailto:a@b.com'), true) })
test('isExternal 锚点非外部', () => { assert.strictEqual(isExternal('#sec'), false) })
test('isExternal 相对文件非外部', () => { assert.strictEqual(isExternal('docs/a.md'), false) })

// ── normalizeHref / safeDecode ──
test('normalizeHref 去空白', () => { assert.strictEqual(normalizeHref('  x  '), 'x') })
test('safeDecode 坏编码不抛', () => { assert.strictEqual(safeDecode('%E4%'), '%E4%') })

// ── 纯工具 ──
test('joinPath 归正 ..', () => { assert.strictEqual(joinPath('a/b', '../c.md'), 'a/c.md') })
test('joinPath 归正 .', () => { assert.strictEqual(joinPath('a', './b.md'), 'a/b.md') })
test('relPath 越界返回 null', () => { assert.strictEqual(relPath(ROOT, 'E:/other/a.md'), null) })
test('relPath 在根内返回相对', () => { assert.strictEqual(relPath(ROOT, ROOT + '/a.md'), 'a.md') })
test('extOf 取小写后缀', () => { assert.strictEqual(extOf('a/B.SMM'), '.smm') })
test('dirOf 取目录', () => { assert.strictEqual(dirOf('a/b/c.md'), 'a/b') })

// ── resolveLink：边界规则（§7.4.1 表）──
test('① ./a.smm 相对 fromPath 目录解析', () => {
  const r = resolveLink('docs/note.md', './a.smm', { root: ROOT })
  assert.strictEqual(r.abs, 'docs/a.smm')
  assert.strictEqual(r.kind, 'mindmap')
})

test('② ../x/y.md 向上解析', () => {
  const r = resolveLink('docs/note.md', '../x/y.md', { root: ROOT })
  assert.strictEqual(r.abs, 'x/y.md')
  assert.strictEqual(r.kind, 'markdown')
})

test('③ /docs/a.md 相对工作区根（而非盘根）', () => {
  const r = resolveLink('a.md', '/docs/a.md', { root: ROOT })
  assert.strictEqual(r.abs, ROOT + '/docs/a.md')
  assert.strictEqual(r.rel, 'docs/a.md')
})

test('④ docs/a.md#锚点 拆 anchor', () => {
  const r = resolveLink('note.md', 'docs/a.md#需求分析', { root: ROOT })
  assert.strictEqual(r.abs, ROOT + '/docs/a.md')
  assert.strictEqual(r.rel, 'docs/a.md')
  assert.strictEqual(r.anchor, '需求分析')
})

test('⑤ https:// → external', () => {
  const r = resolveLink('a.md', 'https://x.com/p', { root: ROOT })
  assert.strictEqual(r.kind, 'external')
  assert.strictEqual(r.isExternal, true)
})

test('⑥ #本地锚点 → same-doc 滚动', () => {
  const r = resolveLink('docs/note.md', '#sec', { root: ROOT })
  // kind 必须与 SUPPORTED 同口径（'markdown'）：与其它 md 链接同名，靠 sameDoc 区分语义。
  // 曾经写成 'md'，导致 resolveEmbed 的映射表查不到 → 文内锚点被误判为 broken。
  assert.strictEqual(r.kind, 'markdown')
  assert.strictEqual(r.sameDoc, true)
  assert.strictEqual(r.anchor, 'sec')
})

test('⑦ 空串 → ignore', () => { assert.strictEqual(resolveLink('a.md', '', { root: ROOT }).kind, 'ignore') })
test('⑧ 单 # → ignore', () => { assert.strictEqual(resolveLink('a.md', '#', { root: ROOT }).kind, 'ignore') })

test('⑨ 盘符绝对路径 → absoluteInput 标记（提示改相对路径）', () => {
  const r = resolveLink('a.md', 'D:/other/x.md', { root: ROOT })
  assert.strictEqual(r.absoluteInput, true)
  assert.strictEqual(r.abs, 'D:/other/x.md')
})

test('⑩ URL 编码 %20 解码后解析', () => {
  const r = resolveLink('a.md', 'docs/my%20note.md', { root: ROOT })
  assert.strictEqual(r.abs, ROOT + '/docs/my note.md')
})

test('⑪ 未知后缀 → unsupported', () => {
  const r = resolveLink('a.md', 'x.zzz', { root: ROOT })
  assert.strictEqual(r.unsupported, true)
  assert.strictEqual(r.kind, 'unknown')
})

test('⑫ .km → mindmap-import', () => {
  assert.strictEqual(resolveLink('a.md', 'old.km', { root: ROOT }).kind, 'mindmap-import')
})

test('⑬ .png → image', () => {
  assert.strictEqual(resolveLink('a.md', 'img/p.png', { root: ROOT }).kind, 'image')
})

test('⑭ rel 字段在根内时给出', () => {
  const r = resolveLink('a.md', 'docs/b.md', { root: ROOT })
  assert.strictEqual(r.rel, 'docs/b.md')
})

test('⑮ SUPPORTED 覆盖设计表', () => {
  assert.strictEqual(SUPPORTED['.md'], 'markdown')
  assert.strictEqual(SUPPORTED['.smm'], 'mindmap')
  assert.strictEqual(SUPPORTED['.xmind'], 'mindmap-import')
})

// ── resolveEmbed ──
test('resolveEmbed md → md', () => {
  assert.strictEqual(resolveEmbed('a.md', 'note.md', { root: ROOT }).kind, 'md')
})
test('resolveEmbed smm → mindmap', () => {
  assert.strictEqual(resolveEmbed('m.smm', 'note.md', { root: ROOT }).kind, 'mindmap')
})
test('resolveEmbed km → mindmap', () => {
  assert.strictEqual(resolveEmbed('o.km', 'note.md', { root: ROOT }).kind, 'mindmap')
})
test('resolveEmbed 外部 → external', () => {
  assert.strictEqual(resolveEmbed('https://x.com', 'note.md', { root: ROOT }).kind, 'external')
})
test('resolveEmbed 未知 → broken', () => {
  assert.strictEqual(resolveEmbed('x.zzz', 'note.md', { root: ROOT }).kind, 'broken')
})
test('resolveEmbed 空 → broken', () => {
  assert.strictEqual(resolveEmbed('', 'note.md', { root: ROOT }).kind, 'broken')
})

// ── 越界与同名语义（本轮补：`../../` 逃逸此前无任何信号）──
test('越界：相对 fromPath 的 ../../ 必须打 outsideRoot', () => {
  const r = resolveLink('docs/a.md', '../../etc/passwd', { root: ROOT })
  assert.strictEqual(r.outsideRoot, true)
  assert.strictEqual(r.rel, null, '越界的 rel 必须为 null（否则"看起来在根内"）')
})

test('越界：绝对 fromPath 的 ../../ 同样打 outsideRoot', () => {
  const r = resolveLink(ROOT + '/docs/a.md', '../../etc/passwd', { root: ROOT })
  assert.strictEqual(r.outsideRoot, true)
  assert.strictEqual(r.rel, null)
})

test('不越界：根内上一层的 ../ 不得误报', () => {
  const r = resolveLink('docs/a.md', '../b.md', { root: ROOT })
  assert.notStrictEqual(r.outsideRoot, true)
  assert.strictEqual(r.rel, 'b.md')
})

test('不越界：./b.md 与 b.md 解析结果完全一致', () => {
  const a = resolveLink('docs/a.md', './b.md', { root: ROOT })
  const b = resolveLink('docs/a.md', 'b.md', { root: ROOT })
  assert.deepStrictEqual({ abs: a.abs, rel: a.rel, kind: a.kind }, { abs: b.abs, rel: b.rel, kind: b.kind })
})

test('不越界：根相对 /top.md 落在 root 下且不误报', () => {
  const r = resolveLink('docs/a.md', '/top.md', { root: ROOT })
  assert.strictEqual(r.abs, ROOT + '/top.md')
  assert.notStrictEqual(r.outsideRoot, true)
})

test('不越界：根自身（../a.md）不算逃逸', () => {
  const r = resolveLink('docs/a.md', '../a.md', { root: ROOT })
  assert.notStrictEqual(r.outsideRoot, true)
})

test('盘符绝对路径不判越界（用户显式给出，另有 absoluteInput 标记）', () => {
  const r = resolveLink('docs/a.md', 'C:/x/y.md', { root: ROOT })
  assert.strictEqual(r.absoluteInput, true)
  assert.notStrictEqual(r.outsideRoot, true)
})

test('无 root 时不判越界（单文件模式没有"界"可言）', () => {
  const r = resolveLink('docs/a.md', '../../x.md', {})
  assert.notStrictEqual(r.outsideRoot, true)
})

test('sameDoc 的 kind 与 SUPPORTED 同口径（resolveEmbed 不再误判 broken）', () => {
  assert.strictEqual(resolveLink('a.md', '#x', { root: ROOT }).kind, SUPPORTED['.md'])
  assert.strictEqual(resolveEmbed('#x', 'a.md', { root: ROOT }).kind, 'md')
  assert.strictEqual(resolveEmbed('#x', 'a.md', { root: ROOT }).anchor, 'x')
})

test('tel:/mailto: 均归为 external', () => {
  for (const h of ['tel:12345', 'mailto:a@b.c', 'ftp://x/y', 'HTTP://UPPER.example']) {
    assert.strictEqual(resolveLink('a.md', h, { root: ROOT }).kind, 'external', h)
  }
})

test('CJK 锚点按 UTF-8 解码，未编码原文原样保留', () => {
  assert.strictEqual(resolveLink('a.md', 'b.md#需求分析', { root: ROOT }).anchor, '需求分析')
  assert.strictEqual(resolveLink('a.md', 'b.md#%E9%9C%80%E6%B1%82', { root: ROOT }).anchor, '需求')
})

test('smm 的 #sheet 片段被解析为 anchor 且不影响路径与 kind', () => {
  const r = resolveLink('a.md', 'docs/m.smm#sheet-2', { root: ROOT })
  assert.strictEqual(r.kind, 'mindmap')
  assert.strictEqual(r.anchor, 'sheet-2')
  assert.strictEqual(r.abs, ROOT + '/docs/m.smm')
})

test('空白链接被 ignore（不误判缺失）', () => {
  assert.strictEqual(resolveLink('a.md', '   ', { root: ROOT }).kind, 'ignore')
})

test('非支持扩展名 → unsupported 且 kind=unknown', () => {
  const r = resolveLink('a.md', 'docs/x.pdf', { root: ROOT })
  assert.strictEqual(r.kind, 'unknown')
  assert.strictEqual(r.unsupported, true)
})

test('无扩展名同样 unsupported（不当作 md）', () => {
  assert.strictEqual(resolveLink('a.md', 'docs/README', { root: ROOT }).unsupported, true)
})
