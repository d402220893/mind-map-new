import { test } from 'node:test'
import assert from 'node:assert'
import { strategies, CONFLICT_CHOICES, describeChoice, applyChoice, isKnownStrategy } from '../../src/services/conflictStrategies.js'

const ctx = { mine: '我的正文', current: { content: '当前正文', rev: 4 } }

// ── strategies（§7.7 四分支）──
test('keep-mine：返回我的文本 + rev+1 + write', () => {
  const r = strategies['keep-mine'](ctx)
  assert.strictEqual(r.text, '我的正文')
  assert.strictEqual(r.rev, 5)
  assert.strictEqual(r.write, true)
})

test('use-latest：noop（丢弃本地，不写盘）', () => {
  const r = strategies['use-latest'](ctx)
  assert.strictEqual(r.noop, true)
  assert.strictEqual(r.text, '当前正文')
  assert.strictEqual(r.write, undefined)
})

test('manual-merge：用 UI 回传的 mine + rev+1', () => {
  const r = strategies['manual-merge']({ ...ctx, mine: '手工合并结果' })
  assert.strictEqual(r.text, '手工合并结果')
  assert.strictEqual(r.rev, 5)
  assert.strictEqual(r.write, true)
})

test('cancel：canceled，不写盘', () => {
  const r = strategies['cancel'](ctx)
  assert.strictEqual(r.canceled, true)
})

test('keep-mine 在 rev 缺失时兜底为 1', () => {
  const r = strategies['keep-mine']({ mine: 'x', current: { content: 'y' } })
  assert.strictEqual(r.rev, 1)
})

test('策略表只做纯计算：不修改入参', () => {
  const c = { mine: 'a', current: { content: 'b', rev: 1 } }
  const snapshot = JSON.stringify(c)
  strategies['keep-mine'](c)
  assert.strictEqual(JSON.stringify(c), snapshot)
})

test('四分支齐全', () => {
  assert.deepStrictEqual(Object.keys(strategies), ['keep-mine', 'use-latest', 'manual-merge', 'cancel'])
})

// ── isKnownStrategy ──
test('isKnownStrategy 识别四分支', () => {
  assert.strictEqual(isKnownStrategy('keep-mine'), true)
  assert.strictEqual(isKnownStrategy('use-latest'), true)
  assert.strictEqual(isKnownStrategy('manual-merge'), true)
  assert.strictEqual(isKnownStrategy('cancel'), true)
})
test('isKnownStrategy 拒绝未知', () => {
  assert.strictEqual(isKnownStrategy('mine'), false)
  assert.strictEqual(isKnownStrategy(''), false)
  assert.strictEqual(isKnownStrategy('toString'), false, '原型链上的键不算')
})

// ── CONFLICT_CHOICES ──
test('CONFLICT_CHOICES 兼容旧四项', () => {
  assert.deepStrictEqual(CONFLICT_CHOICES, ['mine', 'theirs', 'both', 'manual'])
})

// ── describeChoice ──
test('describeChoice mine', () => { assert.strictEqual(describeChoice('mine'), '保留我的修改') })
test('describeChoice keep-mine 同义', () => { assert.strictEqual(describeChoice('keep-mine'), '保留我的修改') })
test('describeChoice theirs', () => { assert.strictEqual(describeChoice('theirs'), '采用当前内容') })
test('describeChoice use-latest 同义', () => { assert.strictEqual(describeChoice('use-latest'), '采用当前内容') })
test('describeChoice both', () => { assert.strictEqual(describeChoice('both'), '合并（我的在上，当前在下）') })
test('describeChoice manual', () => { assert.strictEqual(describeChoice('manual'), '手动合并') })
test('describeChoice manual-merge 同义', () => { assert.strictEqual(describeChoice('manual-merge'), '手动合并') })
test('describeChoice cancel', () => { assert.strictEqual(describeChoice('cancel'), '取消（保留草稿）') })
test('describeChoice 未知 → 未知', () => { assert.strictEqual(describeChoice('zzz'), '未知') })

// ── applyChoice ──
test('applyChoice mine → mine', () => {
  assert.strictEqual(applyChoice('mine', { mine: 'A', theirs: 'B' }), 'A')
})
test('applyChoice theirs → theirs', () => {
  assert.strictEqual(applyChoice('theirs', { mine: 'A', theirs: 'B' }), 'B')
})
test('applyChoice both → 拼接且压平多余空行', () => {
  const r = applyChoice('both', { mine: 'A', theirs: 'B' })
  assert.strictEqual(r, 'A\n\nB')
})
test('applyChoice manual → 抛（须走手动合并 UI）', () => {
  assert.throws(() => applyChoice('manual', { mine: 'A', theirs: 'B' }), /manual/)
})
test('applyChoice 未知 → 抛', () => {
  assert.throws(() => applyChoice('zzz', { mine: 'A', theirs: 'B' }))
})
