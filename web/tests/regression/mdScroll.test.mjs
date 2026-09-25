import { test } from 'node:test'
import assert from 'node:assert'
// mdScroll 是 UMD/CJS（module.exports = mod），Node ESM 互操作给 default = module.exports，
// 用 default import + 解构最稳，避免 cjs-module-lexer 抓不到具名导出。
import mdScroll from '../../src/utils/mdScroll.js'

const { detectBlockStarts, resolveBlockIndex, plainTextOfLine, findBlockIndex, getTopLevelBlocks } = mdScroll

// ── detectBlockStarts：各类顶层块的起始行识别 ──
test('detectBlockStarts 识别标题/段落/列表/引用/表格/代码块起点', () => {
  const md = [
    '# 标题',
    '段落第一行',
    '段落第二行',
    '',
    '## 二级',
    '- 项1',
    '- 项2',
    '',
    '> 引用行',
    '> 续',
    '',
    '| a | b |',
    '| - | - |',
    '| 1 | 2 |',
    '',
    '```js',
    'const x = 1',
    '```',
    '',
    '普通结尾'
  ].join('\n')
  const starts = detectBlockStarts(md)
  const lines = md.split('\n')
  const at = (i) => lines[i]
  // 期望起点：0(#标题+段落合并一块) 4(##二级) 5(列表) 8(引用) 11(表格) 15(代码块) 19(结尾)
  assert.deepStrictEqual(starts, [0, 4, 5, 8, 11, 15, 19])
  assert.strictEqual(at(starts[0]), '# 标题')
  assert.strictEqual(at(starts[3]), '> 引用行')
  assert.strictEqual(at(starts[5]), '```js')
})

// ── resolveBlockIndex：行号 → 块序号映射 ──
test('resolveBlockIndex 把行号映射到其所属顶层块序号', () => {
  const md = '# T\np\n\n## A\n- x\n\n## B\n'
  assert.strictEqual(resolveBlockIndex(md, 0), 0) // # T（与段落合并为块 0）
  assert.strictEqual(resolveBlockIndex(md, 1), 0) // p 同属块 0
  assert.strictEqual(resolveBlockIndex(md, 3), 1) // ## A
  assert.strictEqual(resolveBlockIndex(md, 4), 2) // - x 属列表块 2
  assert.strictEqual(resolveBlockIndex(md, 5), 2) // 空行仍属前一块
  assert.strictEqual(resolveBlockIndex(md, 999), 3) // 越界 clamp 到最后一块
})

// ── plainTextOfLine：剥 markdown 标记 ──
test('plainTextOfLine 剥除标题/引用/列表/图片/强调标记', () => {
  assert.strictEqual(plainTextOfLine('## 4. 引用'), '引用') // 注意：'4.' 被列表正则顺带剥除，但 findBlockIndex 用 includes 双向匹配不受影响
  assert.strictEqual(plainTextOfLine('> 这是引用'), '这是引用')
  assert.strictEqual(plainTextOfLine('- 任务项'), '任务项')
  assert.strictEqual(plainTextOfLine('![图](x.png)'), '图')
  assert.strictEqual(plainTextOfLine('**粗** 与 `码`'), '粗 与 码')
})

// ── findBlockIndex 内容锚定（核心回归）──
// 旧 scrollToLine 用「渲染节点数组按 markdown 行号索引」，当 DOM 顶层块数 ≠ md 块起点数时漂移。
// 这里在 DOM 里插入一个 md 没有的装饰块 + 图片各自成块，制造块数漂移，验证仍按内容命中。
test('findBlockIndex 内容锚定：DOM 块数漂移时仍精准命中标题（修复旧行号索引漂移）', () => {
  const md = [
    '# T',
    'para',
    '',
    '## A',
    '- x',
    '- y',
    '',
    '> q',
    '',
    '## B',
    '![1](a)',
    '![2](b)',
    '![3](c)',
    'tail',
    '',
    '## C'
  ].join('\n')
  // DOM 顶层块：装饰块(无 md 对应) + 图片各自成块 → 块数多于 md 起点数
  const blocks = [
    { textContent: '装饰块' },
    { textContent: 'T' },
    { textContent: 'para' },
    { textContent: 'A' },
    { textContent: 'x y' },
    { textContent: 'q' },
    { textContent: 'B' },
    { textContent: '1' },
    { textContent: '2' },
    { textContent: '3' },
    { textContent: 'tail' },
    { textContent: 'C' }
  ]
  const lineA = md.split('\n').findIndex((l) => l.includes('## A'))
  const lineB = md.split('\n').findIndex((l) => l.includes('## B'))
  const lineC = md.split('\n').findIndex((l) => l.includes('## C'))
  assert.strictEqual(blocks[findBlockIndex(md, blocks, lineA)].textContent, 'A', '必须按内容命中 ## A')
  assert.strictEqual(blocks[findBlockIndex(md, blocks, lineB)].textContent, 'B', '必须按内容命中 ## B')
  assert.strictEqual(blocks[findBlockIndex(md, blocks, lineC)].textContent, 'C', '必须按内容命中 ## C')
})

// ── 回归锁：findBlockIndex 不能退化成「纯行号索引」──
test('findBlockIndex 不会退化成行号直取（旧 bug 形态）', () => {
  const md = '## A\n\n## B\n'
  // 故意让 DOM 块顺序与 md 行号错位：第 0 块是占位，标题在 1、2
  const blocks = [{ textContent: '占位' }, { textContent: 'A' }, { textContent: 'B' }]
  const lineA = 0
  const got = findBlockIndex(md, blocks, lineA)
  assert.strictEqual(blocks[got].textContent, 'A')
  assert.notStrictEqual(got, lineA, '若退化成 blocks[line] 会命中「占位」，证明修复有效')
})

// ── getTopLevelBlocks 容错 ──
test('getTopLevelBlocks 无 host / 无 ww 容器时返回空数组不抛', () => {
  assert.deepStrictEqual(getTopLevelBlocks(null), [])
  assert.deepStrictEqual(getTopLevelBlocks({ querySelector: () => null }), [])
})
