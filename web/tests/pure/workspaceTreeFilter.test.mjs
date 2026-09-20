import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterWorkspaceTree, isWorkspaceDoc } from '../../src/services/workspaceService.js'

const f = name => ({ name, isDir: false })
const d = (name, children) => ({ name, isDir: true, children })

test('保留 .md/.markdown/.smm，丢弃图片与其它扩展名', () => {
  const tree = [f('a.md'), f('b.markdown'), f('c.smm'), f('x.png'), f('y.gif'), f('z.json'), f('noext')]
  assert.deepStrictEqual(filterWorkspaceTree(tree).map(n => n.name), ['a.md', 'b.markdown', 'c.smm'])
})

test('只含图片的目录被剪掉（不留空壳文件夹）', () => {
  // 用户截图里的 img/ 就是这种：全是不相关图片 → 整目录应从树里消失
  const tree = [f('readme.md'), d('img', [f('1.png'), f('drag-img.gif'), f('general.png')])]
  const out = filterWorkspaceTree(tree)
  assert.deepStrictEqual(out.map(n => n.name), ['readme.md'])
})

test('含文档的子目录保留，且层级关系不变', () => {
  const tree = [d('docs', [f('intro.md'), f('logo.svg'), d('deep', [f('n.smm')])])]
  const out = filterWorkspaceTree(tree)
  assert.strictEqual(out.length, 1)
  assert.strictEqual(out[0].name, 'docs')
  assert.deepStrictEqual(out[0].children.map(n => n.name), ['intro.md', 'deep'])
  assert.deepStrictEqual(out[0].children[1].children.map(n => n.name), ['n.smm'])
})

test('纯函数：不修改入参', () => {
  const tree = [d('img', [f('1.png')]), f('a.md')]
  const snapshot = JSON.stringify(tree)
  filterWorkspaceTree(tree)
  assert.strictEqual(JSON.stringify(tree), snapshot, '入参树必须原样保留（store 里可能还有别的消费者）')
})

test('容错：null / 非数组 / 坏节点一律跳过，不抛', () => {
  assert.deepStrictEqual(filterWorkspaceTree(null), [])
  assert.deepStrictEqual(filterWorkspaceTree(undefined), [])
  assert.deepStrictEqual(filterWorkspaceTree('nope'), [])
  assert.deepStrictEqual(filterWorkspaceTree([null, 1, 'x', {}, f('a.md')]).map(n => n.name), ['a.md'])
})

test('isWorkspaceDoc 大小写不敏感，且不误判子串', () => {
  assert.ok(isWorkspaceDoc('A.MD'))
  assert.ok(isWorkspaceDoc('note.Smm'))
  assert.ok(isWorkspaceDoc('x.markdown'))
  assert.ok(!isWorkspaceDoc('a.md.bak'), '.bak 结尾不算文档')
  assert.ok(!isWorkspaceDoc('mdfile'))
  assert.ok(!isWorkspaceDoc(''))
})
