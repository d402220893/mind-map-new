// web/tests/unit/bgTheme.test.mjs
//
// 契约：bgTheme.js 是「画布背景 → 全 UI 框架配色」的派生与单一写点。
// - deriveUiTheme：纯函数，由背景主色派生 macos 变量（R2 协调色 + 文字对比度反算）。
// - applyUiThemeFromBg：唯一 DOM 写点，自定义背景写 :root 内联变量、default 清除回退 macos.less。
// - applyCanvasBackgroundToEl：画布背景直接写到 mindMap.el（绕过库 themeConfig 二次合并，避免被主题覆盖/泄漏 .smm）。
// - buildExportThemeOverride / patchExportBackground：导出对齐（纯逻辑可测，薄桥包装 export）。
// - patchCanvasBackgroundDecouple：源头阻断库 initTheme 对容器的背景写入。
//
// 取代原 canvasBg.test.mjs（旧逻辑为手动 !important 写 el，已随「背景回归主题」撤销）。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveUiTheme,
  applyUiThemeFromBg,
  applyCanvasBackgroundToEl,
  buildExportThemeOverride,
  applyBackground,
  patchExportBackground,
  patchCanvasBackgroundDecouple,
  hexToRgb,
  luminance,
  DERIVED_KEYS
} from '../../src/utils/bgTheme.js'

// 最小化 fake root：实现 style.setProperty / removeProperty（不依赖 jsdom）。
function fakeRoot() {
  const props = {}
  return {
    _props: props,
    style: {
      setProperty(k, v) {
        props[k] = v
      },
      removeProperty(k) {
        delete props[k]
      }
    }
  }
}

// 最小化 fake el：style 用普通对象即可断言。
function fakeEl() {
  return { style: {} }
}

test('deriveUiTheme(default) 返回 null（交由 macos.less 兜底）', () => {
  assert.equal(deriveUiTheme(null), null)
  assert.equal(deriveUiTheme({ type: 'default' }), null)
  assert.equal(deriveUiTheme({ type: 'default', value: '#123' }), null)
})

test('deriveUiTheme(color 亮背景) 产出浅色协调变量 + 深色文字', () => {
  const v = deriveUiTheme({ type: 'color', value: '#ffffff' })
  assert.ok(v)
  assert.equal(v['--macos-text'], '#1d1d1f')
  assert.equal(v['--macos-text-2'], '#6e6e73')
  assert.ok(v['--macos-surface'].startsWith('#'))
  assert.ok(v['--macos-bg-glass'].startsWith('rgba('))
})

test('deriveUiTheme(color 暗背景) 产出深色协调变量 + 浅色文字', () => {
  const v = deriveUiTheme({ type: 'color', value: '#1a1a2e' })
  assert.ok(v)
  assert.equal(v['--macos-text'], '#f5f5f7')
  assert.equal(v['--macos-text-2'], '#aeaeb2')
  assert.ok(v['--macos-border'].startsWith('rgba(255, 255, 255'))
})

test('deriveUiTheme(image) 退化为浅色基线（不过度设计，不引入 canvas 采样）', () => {
  const v = deriveUiTheme({ type: 'image', value: 'data:image/png;base64,AAA' })
  assert.ok(v)
  assert.equal(v['--macos-text'], '#1d1d1f')
  assert.ok(v['--macos-surface'].startsWith('#'))
})

test('deriveUiTheme 返回的键集合与 DERIVED_KEYS 完全一致', () => {
  const v = deriveUiTheme({ type: 'color', value: '#336699' })
  assert.deepEqual(Object.keys(v).sort(), [...DERIVED_KEYS].sort())
})

test('applyUiThemeFromBg(color 暗) 把派生变量写入 root', () => {
  const root = fakeRoot()
  applyUiThemeFromBg({ type: 'color', value: '#1a1a2e' }, root)
  assert.equal(root._props['--macos-text'], '#f5f5f7')
  assert.ok(root._props['--macos-surface'])
})

test('applyUiThemeFromBg(default) 清除此前写入的派生覆盖，回退 macos.less', () => {
  const root = fakeRoot()
  applyUiThemeFromBg({ type: 'color', value: '#1a1a2e' }, root)
  assert.equal(root._props['--macos-text'], '#f5f5f7')
  applyUiThemeFromBg({ type: 'default' }, root)
  assert.equal(root._props['--macos-text'], undefined)
  assert.equal(root._props['--macos-surface'], undefined)
})

test('applyCanvasBackgroundToEl(color) 直接写 el 背景，不碰 image 字段', () => {
  const mm = { el: fakeEl() }
  applyCanvasBackgroundToEl(mm, { type: 'color', value: '#abcdef' })
  assert.equal(mm.el.style.backgroundColor, '#abcdef')
  assert.equal(mm.el.style.backgroundImage, 'none')
})

test('applyCanvasBackgroundToEl(image) 写 backgroundImage + cover 居中', () => {
  const mm = { el: fakeEl() }
  applyCanvasBackgroundToEl(mm, { type: 'image', value: 'data:img' })
  assert.equal(mm.el.style.backgroundColor, '#ffffff')
  assert.equal(mm.el.style.backgroundImage, 'url("data:img")')
  assert.equal(mm.el.style.backgroundSize, 'cover')
  assert.equal(mm.el.style.backgroundRepeat, 'no-repeat')
  assert.equal(mm.el.style.backgroundPosition, 'center')
})

test('applyCanvasBackgroundToEl(default) 清空内联背景，回退库/主题', () => {
  const mm = { el: { style: { backgroundColor: '#abc', backgroundImage: 'url(x)' } } }
  applyCanvasBackgroundToEl(mm, { type: 'default' })
  assert.equal(mm.el.style.backgroundColor, '')
  assert.equal(mm.el.style.backgroundImage, 'none')
})

test('applyCanvasBackgroundToEl 缺 el 安全 no-op', () => {
  assert.doesNotThrow(() => applyCanvasBackgroundToEl(null, { type: 'color', value: '#000' }))
  assert.doesNotThrow(() => applyCanvasBackgroundToEl({}, { type: 'color', value: '#000' }))
})

test('buildExportThemeOverride(color) 返回纯背景覆盖', () => {
  assert.deepEqual(buildExportThemeOverride({ type: 'color', value: '#abcdef' }), {
    backgroundColor: '#abcdef',
    backgroundImage: 'none'
  })
})

test('buildExportThemeOverride(image) 返回背景图 + cover', () => {
  assert.deepEqual(buildExportThemeOverride({ type: 'image', value: 'data:img' }), {
    backgroundColor: '#ffffff',
    backgroundImage: 'data:img',
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center'
  })
})

test('buildExportThemeOverride(default) 白底', () => {
  assert.deepEqual(buildExportThemeOverride({ type: 'default' }), {
    backgroundColor: '#ffffff',
    backgroundImage: 'none'
  })
})

test('patchExportBackground 导出前同步主题、导出后还原（不污染实例）', async () => {
  const tc = { backgroundColor: '#ffffff', backgroundImage: 'none' }
  const mm = {
    themeConfig: tc,
    export(opts) {
      // 导出期应看到同步后的背景
      this._seenBg = tc.backgroundColor
      this._seenImg = tc.backgroundImage
      return Promise.resolve('ok')
    }
  }
  patchExportBackground(mm, () => ({ canvasBackground: { type: 'color', value: '#abcdef' } }))
  const r = await mm.export({})
  assert.equal(r, 'ok')
  assert.equal(mm._seenBg, '#abcdef') // 导出期已同步
  assert.equal(tc.backgroundColor, '#ffffff') // 还原
  assert.equal(tc.backgroundImage, 'none')
})

test('patchCanvasBackgroundDecouple 在 initTheme 后清空 el 背景，交由项目独占绘制', () => {
  let initCount = 0
  const mm = {
    el: { style: {} },
    initTheme() {
      initCount++
      this.el.style.backgroundColor = '#xxxxxx' // 模拟库把主题背景写到 el
    }
  }
  patchCanvasBackgroundDecouple(mm)
  mm.initTheme()
  assert.equal(initCount, 1)
  assert.equal(mm.el.style.backgroundColor, 'transparent')
  assert.equal(mm.el.style.backgroundImage, 'none')
})

test('patchCanvasBackgroundDecouple 幂等（仅包装一次）', () => {
  let initCount = 0
  const mm = {
    el: { style: {} },
    initTheme() {
      initCount++
    }
  }
  patchCanvasBackgroundDecouple(mm)
  patchCanvasBackgroundDecouple(mm)
  mm.initTheme()
  assert.equal(initCount, 1) // 未被二次包装
})

test('applyBackground 画布 + UI 派生（不调用 initTheme，避免被主题覆盖）', () => {
  const mm = { el: fakeEl() }
  const root = fakeRoot()
  // 用注入 root 的方式验证 UI 派生；applyBackground 默认用 document，这里仅验证画布分支
  applyBackground(mm, { type: 'color', value: '#abcdef' })
  assert.equal(mm.el.style.backgroundColor, '#abcdef')
})

test('applyBackground 在缺 mindMap / el 时安全 no-op', () => {
  assert.doesNotThrow(() => applyBackground(null, { type: 'color', value: '#000' }))
  assert.doesNotThrow(() => applyBackground({}, { type: 'color', value: '#000' }))
})

test('hexToRgb / luminance 辅助正确', () => {
  assert.deepEqual(hexToRgb('#ffffff'), { r: 255, g: 255, b: 255 })
  assert.deepEqual(hexToRgb('#fff'), { r: 255, g: 255, b: 255 })
  assert.equal(hexToRgb('nothex'), null)
  assert.ok(luminance('#ffffff') > luminance('#000000'))
})
