// 纯单测：文件列表交互的纯函数（validateFileName / computeCopyName / computeConflictName / splitName / parentDir / baseNameOf）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  splitName,
  validateFileName,
  computeCopyName,
  computeConflictName,
  parentDir,
  baseNameOf
} from '../../src/utils/fileOps.js'

test('splitName 拆分基础名与扩展名', () => {
  assert.deepStrictEqual(splitName('报告.md'), { base: '报告', ext: '.md' })
  assert.deepStrictEqual(splitName('a.b.smm'), { base: 'a.b', ext: '.smm' })
  assert.deepStrictEqual(splitName('无扩展名'), { base: '无扩展名', ext: '' })
  // 点号在首位视为无扩展名（隐藏文件）
  assert.deepStrictEqual(splitName('.gitignore'), { base: '.gitignore', ext: '' })
})

test('validateFileName 拒绝空名', () => {
  assert.deepStrictEqual(validateFileName(''), { ok: false, code: 'EMPTY', message: '文件名不能为空' })
  assert.deepStrictEqual(validateFileName('   '), { ok: false, code: 'EMPTY', message: '文件名不能为空' })
})

test('validateFileName 拒绝非法字符', () => {
  for (const c of ['\\', '/', ':', '*', '?', '"', '<', '>', '|']) {
    const r = validateFileName('a' + c + 'b')
    assert.strictEqual(r.ok, false, `应拒绝含 ${c} 的文件名`)
    assert.strictEqual(r.code, 'ILLEGAL')
  }
})

test('validateFileName 合法名返回 ok', () => {
  assert.deepStrictEqual(validateFileName('正常文件 1.md'), { ok: true })
})

test('computeCopyName 生成副本名（n=1 / n>=2）', () => {
  assert.strictEqual(computeCopyName('报告.md', 1), '报告 - 副本.md')
  assert.strictEqual(computeCopyName('报告.md', 2), '报告 - 副本 (2).md')
  assert.strictEqual(computeCopyName('报告.md', 3), '报告 - 副本 (3).md')
  assert.strictEqual(computeCopyName('报告'), '报告 - 副本')
  assert.strictEqual(computeCopyName('报告 - 副本.md', 1), '报告 - 副本 - 副本.md')
})

test('computeConflictName 同名冲突加序号（n>=2）', () => {
  assert.strictEqual(computeConflictName('报告.md', 1), '报告.md')
  assert.strictEqual(computeConflictName('报告.md', 2), '报告 (2).md')
  assert.strictEqual(computeConflictName('报告.md', 3), '报告 (3).md')
  assert.strictEqual(computeConflictName('报告', 2), '报告 (2)')
})

test('parentDir / baseNameOf 路径提取', () => {
  assert.strictEqual(parentDir('D:/ws/01_doc/报告.md'), 'D:/ws/01_doc')
  assert.strictEqual(parentDir('D:/ws/01_doc'), 'D:/ws')
  assert.strictEqual(baseNameOf('D:/ws/01_doc/报告.md'), '报告.md')
  assert.strictEqual(baseNameOf('报告.md'), '报告.md')
})
