// 画布背景 → 全 UI 框架配色 的派生与单一写点。
//
// 设计边界（对应 docs/主题背景联动方案.md §8 审核结论）：
// 1) macos.less 的 :root / body.isDark 仍是「default 背景」的兜底变量源（CSS 原生，非 JS 第二写源）。
// 2) 本模块只在「用户设置了具体 color / image 背景」时，把派生变量用 inline style 写到
//    document.documentElement，优先级高于 macos.less，故自定义背景恒覆盖 default 兜底；
//    default 态则清除 inline 覆盖，回退 macos.less 的 isDark 逻辑。
//    因此「背景派生」为唯一 JS 写点，isDark 仅作 default 态的明暗来源，不存在两个 JS 源互相覆盖。
// 3) 画布背景真源 = 全局 localConfig.canvasBackground（不写入 .smm，切换/打开不同文件不串）。
//    画布本身由本项目直接写到 mindMap.el（绕过库 themeConfig 的 mergeTheme 二次合并——
//    否则每次 render()→initTheme() 都会用 opt.themeConfig 覆盖回来，且改 opt.themeConfig 会泄漏进 .smm）；
//    导出时再临时把背景同步进 themeConfig（patchExportBackground），使导出与屏幕一致且不落盘。

const DERIVED_KEYS = [
  '--macos-bg-glass',
  '--macos-bg-glass-strong',
  '--macos-bg-glass-soft',
  '--macos-surface',
  '--macos-surface-2',
  '--macos-surface-3',
  '--macos-border',
  '--macos-border-strong',
  '--macos-divider',
  '--macos-text',
  '--macos-text-2',
  '--macos-text-3',
  '--macos-hover',
  '--macos-hover-strong'
]

function clamp(n) {
  return Math.max(0, Math.min(255, n))
}

export function hexToRgb(hex) {
  if (typeof hex !== 'string') return null
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (h.length !== 6) return null
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return null
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHex({ r, g, b }) {
  const c = v => clamp(Math.round(v)).toString(16).padStart(2, '0')
  return '#' + c(r) + c(g) + c(b)
}

// 在 hex 颜色上向 target 颜色按 t(0~1) 混合，用于把背景色推成协调的面板层次。
export function mix(hex, target, t) {
  const a = hexToRgb(hex)
  const b = hexToRgb(target)
  if (!a || !b) return null
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t
  })
}

export function rgba(hex, a) {
  const c = hexToRgb(hex)
  if (!c) return null
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`
}

// 相对亮度（ITU-R BT.601），0~255，用于文字颜色反算与明暗判定。
export function luminance(hex) {
  const c = hexToRgb(hex)
  if (!c) return 255
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
}

// 由背景主色派生一套 UI 框架变量（R2：协调色，保持层次 + 文字对比度反算）。
// 纯函数，无 DOM 依赖，易测。bg = { type:'default'|'color'|'image', value }
export function deriveUiTheme(bg) {
  // default：不产出派生变量，交由 macos.less 的 isDark 兜底
  if (!bg || bg.type === 'default') return null

  // image：不过度设计，默认退化为「浅色玻璃基线」，UI 保持浅色协调，画布由图片本身提供视觉主体。
  // （如需随图主色，可在此接 extractDominantColor(dataUrl) 后再走 color 分支；当前不引入 canvas 采样依赖）
  let base = '#f5f5f7'
  if (bg.type === 'color' && bg.value) {
    const rgb = hexToRgb(bg.value)
    if (rgb) base = bg.value
  }

  const L = luminance(base)
  const isDark = L < 128 // 暗背景 → 浅色文字与反向边框

  // 面板：在背景基线上向中性方向轻微偏移形成层次（亮背景略提亮、暗背景略压暗）
  const surface = mix(base, isDark ? '#000000' : '#ffffff', isDark ? 0.18 : 0.06) || (isDark ? '#26262a' : '#ffffff')
  const surface2 = mix(base, isDark ? '#000000' : '#ffffff', isDark ? 0.30 : 0.04) || (isDark ? '#2c2c30' : '#f5f5f7')
  const surface3 = mix(base, isDark ? '#000000' : '#ffffff', isDark ? 0.42 : 0.02) || (isDark ? '#34343a' : '#ecedef')

  // 文字：按亮度反算，保证与面板对比度 ≥ 4.5:1（WCAG AA）
  const text = isDark ? '#f5f5f7' : '#1d1d1f'
  const text2 = isDark ? '#aeaeb2' : '#6e6e73'
  const text3 = isDark ? '#8e8e93' : '#8e8e93'
  const border = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.10)'
  const borderStrong = isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.12)'
  const divider = isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.07)'
  const hover = isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.05)'
  const hoverStrong = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'
  const alpha = isDark ? 0.82 : 0.86 // 玻璃在暗背景上略降透明度以显层次

  return {
    '--macos-bg-glass': rgba(surface, 0.72) || (isDark ? 'rgba(38, 38, 42, 0.62)' : 'rgba(255, 255, 255, 0.72)'),
    '--macos-bg-glass-strong': rgba(surface, alpha) || (isDark ? 'rgba(30, 30, 34, 0.82)' : 'rgba(255, 255, 255, 0.86)'),
    '--macos-bg-glass-soft': rgba(surface, 0.55) || (isDark ? 'rgba(48, 48, 54, 0.5)' : 'rgba(255, 255, 255, 0.55)'),
    '--macos-surface': surface,
    '--macos-surface-2': surface2,
    '--macos-surface-3': surface3,
    '--macos-border': border,
    '--macos-border-strong': borderStrong,
    '--macos-divider': divider,
    '--macos-text': text,
    '--macos-text-2': text2,
    '--macos-text-3': text3,
    '--macos-hover': hover,
    '--macos-hover-strong': hoverStrong
  }
}

// 唯一 DOM 写点：把背景派生变量批量写入 root（默认 document.documentElement）。
// bg.type==='default' 时清除此前写入的内联覆盖，回退 macos.less 的 isDark 兜底。
// root 可注入（测试用 fake root），保证易测、不依赖 jsdom。
export function applyUiThemeFromBg(bg, root) {
  const el = root || (typeof document !== 'undefined' ? document.documentElement : null)
  if (!el || !el.style) return
  const vars = deriveUiTheme(bg)
  if (!vars) {
    DERIVED_KEYS.forEach(k => el.style.removeProperty(k))
    return
  }
  Object.keys(vars).forEach(k => {
    if (vars[k]) el.style.setProperty(k, vars[k])
  })
}

// 直接把背景画到容器（全局语义，绕过库 themeConfig 的 mergeTheme 覆盖与 .smm 落盘）。
// 配合 patchCanvasBackgroundDecouple()：initTheme（每次 render）会把「真实全局背景」写回容器，
// 本函数再做幂等兜底，使画布恒为全局背景、且不会泄漏进 .smm。
//
// 关键修复（v2.0.50）：幂等判定改为「inline 实际值快照比对」而非「目标签名比对」。
// 背景：库 render()→initTheme()→Style.setBackgroundStyle（主类 index.js:302/375，Style.js:44-51）
// 每次 render 都会把容器背景重置为主题默认色（#fafafa）+ backgroundImage:'none'。
// 若只比对「我想写的值」（签名），库在两次调用之间污染 el 后会错误跳过——这正是
// 「编辑节点后画布背景变成 #fafafa（视觉灰紫）」的根因（v2.0.49 签名缓存的缺陷），
// 也是 v2.0.48「编辑时背景高频闪」（#fafafa 帧↔真实背景帧跨帧交替）的同一根因。
// 现在：写后记录浏览器规范化形态快照 __bgApplied；下次调用先比对 el 当前 inline 值——
// 被污染（≠快照）则强制重写恢复；未污染（==快照）则跳过，杜绝图片背景重复解码闪烁。
export function applyCanvasBackgroundToEl(mindMap, bg) {
  const el = mindMap && mindMap.el
  if (!el || !el.style) return
  let target
  if (!bg || bg.type === 'default') {
    target = {
      backgroundColor: '',
      backgroundImage: 'none',
      backgroundSize: '',
      backgroundRepeat: '',
      backgroundPosition: ''
    }
  } else if (bg.type === 'image') {
    target = {
      backgroundColor: '#ffffff',
      backgroundImage: `url("${bg.value}")`,
      backgroundSize: 'cover',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center'
    }
  } else {
    target = {
      backgroundColor: bg.value || '#ffffff',
      backgroundImage: 'none',
      backgroundSize: '',
      backgroundRepeat: '',
      backgroundPosition: ''
    }
  }
  // 幂等判定（双条件，缺一不可）：
  // ① __bgSignature（目标签名）：目标背景没变才可能跳过——用户换色时必须重写；
  // ② __bgApplied（写入后实际形态快照）：el 当前 inline 值 == 快照（未被库污染）才可跳过——
  //    库 render()→initTheme→Style.setBackgroundStyle 在两次调用之间把 el 改为主题默认色，
  //    此时即使签名相同也必须强制重写恢复（v2.0.49 只查签名导致污染值驻留的缺陷）。
  const sig = bg && bg.type && bg.type !== 'default' ? `${bg.type}:${bg.value}` : 'default'
  const prev = el.__bgApplied
  if (
    el.__bgSignature === sig &&
    prev &&
    el.style.backgroundColor === prev.backgroundColor &&
    el.style.backgroundImage === prev.backgroundImage &&
    el.style.backgroundSize === prev.backgroundSize &&
    el.style.backgroundRepeat === prev.backgroundRepeat &&
    el.style.backgroundPosition === prev.backgroundPosition
  ) {
    return
  }
  el.__bgSignature = sig
  el.style.backgroundColor = target.backgroundColor
  el.style.backgroundImage = target.backgroundImage
  el.style.backgroundSize = target.backgroundSize
  el.style.backgroundRepeat = target.backgroundRepeat
  el.style.backgroundPosition = target.backgroundPosition
  // 记录写入后的实际形态（浏览器可能规范化颜色，如 '#fff'→'rgb(255, 255, 255)'），
  // 后续以此快照判定「el 是否被库改过」。
  el.__bgApplied = {
    backgroundColor: el.style.backgroundColor,
    backgroundImage: el.style.backgroundImage,
    backgroundSize: el.style.backgroundSize,
    backgroundRepeat: el.style.backgroundRepeat,
    backgroundPosition: el.style.backgroundPosition
  }
}

// 导出对齐：根据背景构造导出用的 themeConfig 覆盖（纯函数，易测）。
// 不落盘、不污染实例——仅由 patchExportBackground 在导出前后临时套用。
export function buildExportThemeOverride(bg) {
  if (!bg || bg.type === 'default') {
    return { backgroundColor: '#ffffff', backgroundImage: 'none' }
  }
  if (bg.type === 'image') {
    return {
      backgroundColor: '#ffffff',
      backgroundImage: bg.value,
      backgroundSize: 'cover',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center'
    }
  }
  return { backgroundColor: bg.value, backgroundImage: 'none' }
}

// 单一入口（高内聚）：画布渲染 + 全 UI 派生，不触碰库 themeConfig，避免持久化与落盘问题。
export function applyBackground(mindMap, bg) {
  applyCanvasBackgroundToEl(mindMap, bg)
  applyUiThemeFromBg(bg)
}

// 源头阻断：库 render()→initTheme() 会无条件把 opt.themeConfig 的背景写到 el，
// 与本项目全局画布背景抢同一 DOM 属性。包装 initTheme：每次主题初始化（即每次 render）完成后，
// 直接把「真实全局背景」写回容器（经 applyCanvasBackgroundToEl，已对 backgroundImage 做幂等保护），
// 不再先写 transient 再等 render-end 救——避免图片背景在渲染期出现中间态闪烁。
// 不动 opt.themeConfig，故无 .smm 泄漏。
export function patchCanvasBackgroundDecouple(mindMap, getLocalConfig) {
  if (!mindMap || mindMap.__bgDecoupled) return
  const _origInitTheme = mindMap.initTheme ? mindMap.initTheme.bind(mindMap) : null
  if (!_origInitTheme) return
  mindMap.initTheme = function (...args) {
    const r = _origInitTheme.apply(mindMap, args)
    const cfg = getLocalConfig && getLocalConfig()
    applyCanvasBackgroundToEl(mindMap, cfg && cfg.canvasBackground)
    return r
  }
  mindMap.__bgDecoupled = true
}

// 包装 mindMap.export：导出前临时把全局背景同步进 themeConfig，导出后还原，
// 使导出文件（PNG/JPG/PDF/SVG）与屏幕一致。核心纯逻辑见 buildExportThemeOverride（可单测），此处为薄桥。
export function patchExportBackground(mindMap, getLocalConfig) {
  if (!mindMap || typeof mindMap.export !== 'function' || mindMap.__exportBgDecoupled) return
  const _origExport = mindMap.export.bind(mindMap)
  mindMap.export = async function (...args) {
    const cfg = getLocalConfig && getLocalConfig()
    const bg = cfg && cfg.canvasBackground
    const tc = mindMap.themeConfig || {}
    const saved = {
      backgroundColor: tc.backgroundColor,
      backgroundImage: tc.backgroundImage,
      backgroundSize: tc.backgroundSize,
      backgroundRepeat: tc.backgroundRepeat,
      backgroundPosition: tc.backgroundPosition
    }
    Object.assign(tc, buildExportThemeOverride(bg))
    try {
      return await _origExport.apply(mindMap, args)
    } finally {
      Object.assign(tc, saved)
    }
  }
  mindMap.__exportBgDecoupled = true
}

export { DERIVED_KEYS }
