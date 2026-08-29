// 安装器 exe 名单测（回归《详细设计_全量改造.md》模块9 高危项）
// 快捷方式指向的 exe 名必须与 package.json 的 productName 一致。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import meta from '../install-meta.js'

test('getAppExeName 拼接 .exe 后缀', () => {
  assert.equal(meta.getAppExeName('思绪思维导图'), '思绪思维导图.exe')
  assert.equal(meta.getAppExeName('MindMap'), 'MindMap.exe')
})

test('实际 productName 对应的 exe 名为「思绪思维导图.exe」', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const expected = pkg.build.productName + '.exe'
  assert.equal(meta.getAppExeName(pkg.build.productName), expected)
  // 关键回归：不得再是写死的 MindMap.exe
  assert.notEqual(meta.getAppExeName(pkg.build.productName), 'MindMap.exe')
})
