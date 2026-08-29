// 自动保存纯逻辑单测（node --test 运行）
// 覆盖：目标判定 resolveAutosaveTarget + 防抖调度器 createAutosaveScheduler
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveAutosaveTarget, createAutosaveScheduler, isAbsolutePath } from '../../src/utils/autosave.js'

// ---------- 目标判定 ----------
test('resolveAutosaveTarget：Windows 绝对路径 => file', () => {
  assert.equal(resolveAutosaveTarget('E:/a.smm'), 'file')
  assert.equal(resolveAutosaveTarget('C:\\x\\y.smm'), 'file')
})

test('resolveAutosaveTarget：Unix 绝对路径 => file', () => {
  assert.equal(resolveAutosaveTarget('/home/user/a.smm'), 'file')
})

test('resolveAutosaveTarget：相对路径/空/非字符串 => draft', () => {
  assert.equal(resolveAutosaveTarget('a.smm'), 'draft')
  assert.equal(resolveAutosaveTarget(''), 'draft')
  assert.equal(resolveAutosaveTarget(null), 'draft')
  assert.equal(resolveAutosaveTarget(undefined), 'draft')
  assert.equal(resolveAutosaveTarget(123), 'draft')
})

test('isAbsolutePath：与判定一致', () => {
  assert.equal(isAbsolutePath('E:/a.smm'), true)
  assert.equal(isAbsolutePath('rel.smm'), false)
})

// ---------- 防抖调度器 ----------
test('调度器：连续 trigger 只在 delay 后执行一次', async () => {
  let count = 0
  const s = createAutosaveScheduler({ delay: 30, onSave: () => { count++ } })
  s.trigger()
  s.trigger() // 重置计时
  s.trigger()
  assert.equal(count, 0)
  await new Promise(r => setTimeout(r, 60))
  assert.equal(count, 1) // 仅一次
})

test('调度器：cancel 阻止待执行', async () => {
  let count = 0
  const s = createAutosaveScheduler({ delay: 30, onSave: () => { count++ } })
  s.trigger()
  assert.equal(s.isPending(), true)
  s.cancel()
  assert.equal(s.isPending(), false)
  await new Promise(r => setTimeout(r, 60))
  assert.equal(count, 0)
})

test('调度器：flush 立即执行并清空待执行', async () => {
  let count = 0
  const s = createAutosaveScheduler({ delay: 30000, onSave: () => { count++ } })
  s.trigger()
  assert.equal(s.flush(), true)
  assert.equal(count, 1)
  assert.equal(s.isPending(), false)
  // flush 后无遗留定时器
  await new Promise(r => setTimeout(r, 20))
  assert.equal(count, 1)
})

test('调度器：flush 无待执行时返回 false', () => {
  const s = createAutosaveScheduler({ delay: 30000, onSave: () => {} })
  assert.equal(s.flush(), false)
})

test('调度器：trigger 后 isPending 为真，触发后转假', async () => {
  const s = createAutosaveScheduler({ delay: 30, onSave: () => {} })
  s.trigger()
  assert.equal(s.isPending(), true)
  await new Promise(r => setTimeout(r, 50))
  assert.equal(s.isPending(), false)
})
