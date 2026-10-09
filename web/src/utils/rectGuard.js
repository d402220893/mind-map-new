// 容器尺寸守卫（纯函数，可被 node --test 直接测试）
//
// 背景（v2.0.42 全屏报错修复）：simple-mind-map 的 resize() 内部
// getElRectInfo() 在容器宽或高 ≤0 时会 throw「容器元素el的宽高不能为0」，
// 且该异常沿 window error 冒泡会弹用户可见的「页面脚本错误」致命框。
// 全屏进入/退出、v-show 切换等过渡瞬间容器可能短暂处于 0 尺寸态，
// 因此所有经 window/document 事件触达 mindMap.resize() 的入口
// （Edit.vue#handleResize、Fullscreen.vue 全屏事件处理器）必须先过此守卫。
export const isRectUsable = rect =>
  !!rect && rect.width > 0 && rect.height > 0

export const isElVisible = el =>
  isRectUsable(el && typeof el.getBoundingClientRect === 'function'
    ? el.getBoundingClientRect()
    : null)
