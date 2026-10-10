import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseHexColor,
  darkenColor,
  pickThemeMainColor,
  noteThemeBorderColor
} from '../../src/utils/noteThemeColor.js'

// ── parseHexColor ──
test('parseHexColor: 6 位 hex 正常解析', () => {
  assert.deepEqual(parseHexColor('#549688'), [0x54, 0x96, 0x88])
  assert.deepEqual(parseHexColor('#FFFFFF'), [255, 255, 255])
})

test('parseHexColor: 3 位 hex 自动扩展', () => {
  assert.deepEqual(parseHexColor('#fff'), [255, 255, 255])
  assert.deepEqual(parseHexColor('#0a0'), [0, 170, 0])
})

test('parseHexColor: 非法输入返回 null', () => {
  assert.equal(parseHexColor('transparent'), null)
  assert.equal(parseHexColor('rgb(1,2,3)'), null)
  assert.equal(parseHexColor('#12345'), null)
  assert.equal(parseHexColor(''), null)
  assert.equal(parseHexColor(null), null)
  assert.equal(parseHexColor(undefined), null)
  assert.equal(parseHexColor(123), null)
})

// ── darkenColor ──
test('darkenColor: 默认 15% 加深（#549688 → #478074）', () => {
  // 84*0.85=71.4→71=0x47; 150*0.85=127.5→128=0x80; 136*0.85=115.6→116=0x74
  assert.equal(darkenColor('#549688'), '#478074')
})

test('darkenColor: ratio 可调（加深 50%）', () => {
  // 255*0.5=127.5→128=0x80
  assert.equal(darkenColor('#ffffff', 0.5), '#808080')
})

test('darkenColor: 3 位 hex 先扩展再加深', () => {
  assert.equal(darkenColor('#fff'), '#d9d9d9') // 255*0.85=216.75→217=0xd9
})

test('darkenColor: 非法色值原样返回不 throw', () => {
  assert.equal(darkenColor('transparent'), 'transparent')
  assert.equal(darkenColor('rgb(10,20,30)'), 'rgb(10,20,30)')
  assert.equal(darkenColor(''), '')
  assert.equal(darkenColor(undefined), undefined)
})

test('darkenColor: 结果不会溢出（加深到黑）', () => {
  assert.equal(darkenColor('#000000', 0.5), '#000000')
  assert.equal(darkenColor('#100000', 1), '#000000')
})

// ── pickThemeMainColor ──
test('pickThemeMainColor: simple-mind-map default 主题形状取 root.fillColor', () => {
  // 与 node_modules/simple-mind-map/src/theme/default.js 真实形状对齐
  const theme = {
    backgroundColor: '#fafafa',
    lineColor: '#549688',
    rootLineColor: '#549688',
    root: { shape: 'rectangle', fillColor: '#549688', color: '#fff' }
  }
  assert.equal(pickThemeMainColor(theme), '#549688')
})

test('pickThemeMainColor: fillColor 缺失时回退 startColor → rootLineColor → lineColor', () => {
  assert.equal(
    pickThemeMainColor({ root: { startColor: '#ff0000' } }),
    '#ff0000'
  )
  assert.equal(
    pickThemeMainColor({ rootLineColor: '#00aa00', lineColor: '#0000ff' }),
    '#00aa00'
  )
  assert.equal(pickThemeMainColor({ lineColor: '#0000ff' }), '#0000ff')
})

test('pickThemeMainColor: 非 hex 主题值（none/transparent）跳过', () => {
  assert.equal(
    pickThemeMainColor({ root: { fillColor: 'transparent' }, lineColor: '#112233' }),
    '#112233'
  )
})

test('pickThemeMainColor: 空入参/空形状返回空串', () => {
  assert.equal(pickThemeMainColor(null), '')
  assert.equal(pickThemeMainColor(undefined), '')
  assert.equal(pickThemeMainColor({}), '')
  assert.equal(pickThemeMainColor({ root: {} }), '')
})

// ── noteThemeBorderColor ──
test('noteThemeBorderColor: 主题主色加深 15%', () => {
  const theme = { root: { fillColor: '#549688' } }
  assert.equal(noteThemeBorderColor(theme), '#478074')
})

test('noteThemeBorderColor: 拿不到主题色返回空串（CSS var 兜底）', () => {
  assert.equal(noteThemeBorderColor(null), '')
  assert.equal(noteThemeBorderColor({}), '')
})
