import { test } from 'node:test'
import assert from 'node:assert'
import { resolveRefFileCandidates } from '../../src/utils/refFileResolve.js'

// 契约背景（v2.0.45 引用失效修复）：
// code2mm 产 .smm 的 refs[].file 相对路径基准=工作区根，但双击单文件打开且
// 无 .mindlink 时，工作区根兜底为 .smm 所在目录 →「.smm 在子目录、md 在上层」
// 解析落空（实测 code2mm-demo/testddd.smm 引用仓库根 详细设计_全量改造.md）。
// 回退：从 .smm 所在目录向上逐级找。

test('绝对 file：直接用，不产生其他候选', () => {
  assert.deepStrictEqual(
    resolveRefFileCandidates({ file: 'D:/docs/a.md', root: 'E:/ws', sourceAbs: 'E:/ws/x.smm' }),
    ['D:/docs/a.md']
  )
  assert.deepStrictEqual(
    resolveRefFileCandidates({ file: '/var/a.md', root: 'E:/ws', sourceAbs: '' }),
    ['/var/a.md']
  )
})

test('工作区根命中：候选首位=根拼接，其次 .smm 目录向上链', () => {
  const cands = resolveRefFileCandidates({
    file: 'docs/a.md',
    root: 'E:/ws',
    sourceAbs: 'E:/ws/notes/smm/b.smm'
  })
  assert.strictEqual(cands[0], 'E:/ws/docs/a.md')
  // 回退链从 .smm 所在目录开始向上
  assert.ok(cands.includes('E:/ws/notes/smm/docs/a.md'))
  assert.ok(cands.includes('E:/ws/notes/docs/a.md'))
  assert.ok(cands.includes('E:/ws/docs/a.md')) // 向上会再次到达根拼接种（去重后只有一个）
  // 去重：根拼接值不应重复出现
  assert.strictEqual(cands.filter(c => c === 'E:/ws/docs/a.md').length, 1)
})

test('无工作区根（单文件打开、root 为空）：仅 .smm 目录向上链', () => {
  const cands = resolveRefFileCandidates({
    file: '详细设计.md',
    root: '',
    sourceAbs: 'E:/proj/code2mm-demo/testddd.smm'
  })
  assert.deepStrictEqual(cands, [
    'E:/proj/code2mm-demo/详细设计.md',
    'E:/proj/详细设计.md',
    'E:/详细设计.md'
  ])
})

test('反斜杠路径规范化 + 盘根终止', () => {
  const cands = resolveRefFileCandidates({
    file: 'a.md',
    root: 'E:\\ws',
    sourceAbs: 'E:\\ws\\b.smm'
  })
  assert.strictEqual(cands[0], 'E:/ws/a.md')
  assert.ok(cands.includes('E:/a.md')) // 盘根后终止，不产生 E:/ws 之外的越界重复
})

test('maxUp 限制向上级数', () => {
  const cands = resolveRefFileCandidates({
    file: 'a.md',
    root: '',
    sourceAbs: 'E:/l1/l2/l3/l4/l5/x.smm',
    maxUp: 2
  })
  assert.deepStrictEqual(cands, [
    'E:/l1/l2/l3/l4/l5/a.md',
    'E:/l1/l2/l3/l4/a.md'
  ])
})

test('空 file / 空 source：安全返回', () => {
  assert.deepStrictEqual(resolveRefFileCandidates({ file: '', root: 'E:/ws', sourceAbs: '' }), [])
  // 无根无 source：无法解析，返回空（调用方回退旧行为）
  assert.deepStrictEqual(resolveRefFileCandidates({ file: 'a.md', root: '', sourceAbs: '' }), [])
})
