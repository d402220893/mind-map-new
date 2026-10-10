// ============================================================
// 备注弹窗主题色工具（v2.0.47）
// 需求：备注弹窗改透明玻璃底，四周 1px 边框跟随导图主题颜色变化，
// 且比主题主色「稍稍深一些」。
// 设计：纯函数、零副作用——从 simple-mind-map 主题配置提取最能代表
// 当前主题的主色（root 节点填充色），向黑色方向混合加深固定比例。
// 解析失败一律原样返回 / 返回空串，由 CSS 侧 var() 兜底，绝不 throw。
// ============================================================

// 解析 #rgb / #rrggbb 十六进制色 → [r,g,b]；非法返回 null
export function parseHexColor(color) {
  if (typeof color !== 'string') return null
  let s = color.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(s)) {
    s = s
      .split('')
      .map(ch => ch + ch)
      .join('')
  }
  if (!/^[0-9a-f]{6}$/i.test(s)) return null
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16)
  ]
}

// 颜色加深：ratio ∈ [0,1]，向黑色方向按比例混合（0.15 ≈ 「稍稍深一些」）
// 非十六进制输入（transparent / 渐变串 / rgb() 等）原样返回
export function darkenColor(color, ratio = 0.15) {
  const rgb = parseHexColor(color)
  if (!rgb) return color
  const f = 1 - ratio
  const ch = v =>
    Math.max(0, Math.min(255, Math.round(v * f)))
      .toString(16)
      .padStart(2, '0')
  return '#' + ch(rgb[0]) + ch(rgb[1]) + ch(rgb[2])
}

// 从主题配置提取「主题主色」：root 节点填充色最能代表当前主题
// （default 主题即 #549688）。依次回退 startColor / rootLineColor / lineColor。
// 只接受十六进制色（simple-mind-map 主题值可能为 'none'/'transparent'）
export function pickThemeMainColor(theme) {
  if (!theme || typeof theme !== 'object') return ''
  const root = theme.root || {}
  const cands = [root.fillColor, root.startColor, theme.rootLineColor, theme.lineColor]
  for (const c of cands) {
    if (typeof c === 'string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c.trim())) {
      return c.trim()
    }
  }
  return ''
}

// 备注弹窗边框色 = 主题主色加深 15%；拿不到主题色返回 ''，
// CSS 侧写 var(--note-theme-border, var(--macos-border-strong)) 兜底
export function noteThemeBorderColor(theme, ratio = 0.15) {
  const c = pickThemeMainColor(theme)
  return c ? darkenColor(c, ratio) : ''
}
