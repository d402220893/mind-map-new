// 保存闸门纯逻辑单测（node --test 运行）
// 锁定 P0a 闸门 A 语义：仅 'loaded' 放行保存；以及退出前写盘闸门 canExitSave
// （修复“反复打开软件导致文件丢失”的根因——首载重灌走绕过 loadSheetData 的路径，
//  loadPhase 默认 loaded，若无 dirty 闸门会无条件把落后磁盘的草稿冲掉真实文件）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSaveAllowed, canExitSave } from '../../src/utils/saveGuard.js'

// ---------- 闸门 A：加载态守卫 ----------
test('isSaveAllowed：仅 loaded 放行，其余四态一律拒绝', () => {
  assert.equal(isSaveAllowed('loaded'), true)
  assert.equal(isSaveAllowed('loading'), false)
  assert.equal(isSaveAllowed('failed'), false)
  assert.equal(isSaveAllowed('idle'), false)
  // 未知/空值也拒绝（normalize 默认虽置 loaded，但异常态绝不能放行）
  assert.equal(isSaveAllowed(''), false)
  assert.equal(isSaveAllowed(undefined), false)
  assert.equal(isSaveAllowed(null), false)
})

// ---------- 退出前写盘闸门（canExitSave）----------
test('canExitSave：loaded + dirty 才放行', () => {
  assert.equal(canExitSave('loaded', true), true)
})

test('canExitSave：非 loaded（首载/切换/损坏）一律拒绝写盘', () => {
  assert.equal(canExitSave('loading', true), false)
  assert.equal(canExitSave('failed', true), false)
  assert.equal(canExitSave('idle', true), false)
  assert.equal(canExitSave('', true), false)
})

test('canExitSave：loaded 但非 dirty（干净退出/重灌草稿）拒绝写盘——防冲掉真实文件', () => {
  // 首载重灌的草稿可能空/陈旧/因配额落后于磁盘；无用户编辑则磁盘已是权威，禁止覆盖。
  assert.equal(canExitSave('loaded', false), false)
  assert.equal(canExitSave('loaded', undefined), false)
  assert.equal(canExitSave('loaded', null), false)
})

test('canExitSave：组合矩阵', () => {
  const matrix = [
    ['loaded', true, true],
    ['loaded', false, false],
    ['loading', true, false],
    ['loading', false, false],
    ['failed', true, false],
    ['failed', false, false]
  ]
  for (const [phase, dirty, expect] of matrix) {
    assert.equal(canExitSave(phase, dirty), expect, `phase=${phase} dirty=${dirty}`)
  }
})
