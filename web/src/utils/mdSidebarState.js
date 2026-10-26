/**
 * Md 编辑器右侧栏状态机（纯函数，便于 Node 单测）。
 *
 * 状态：'hidden' | 'icons' | 'search'
 *   - hidden：图标栏整体隐藏（right:-60px），trigger 按钮不可达，因此不会从 hidden 直接进面板。
 *   - icons ：仅图标栏可见。
 *   - search：图标栏 + 查找面板展开。
 *
 * 历史：曾有 'outline' 态（大纲面板），后大纲移至左侧文件栏（WorkspacePanel
 * 「文件树/大纲」视图切换），右栏只留「查找」，故删除该态（2026-10-26）。
 *
 * 把状态转换抽到纯函数，MdSidebar.vue 只调用 reducer，逻辑可单测且不依赖 Vue 运行时。
 */

export const SIDEBAR_STATES = ['hidden', 'icons', 'search']

/**
 * @param {string} state 当前状态
 * @param {{type:'toggleShow'|'trigger'|'close', item?:string}} action
 * @returns {string} 新状态
 */
export function reduceSidebarState(state, action) {
  if (!SIDEBAR_STATES.includes(state) || !action || !action.type) return state
  switch (action.type) {
    case 'toggleShow':
      // 隐藏 ↔ 显示图标栏
      return state === 'hidden' ? 'icons' : 'hidden'
    case 'trigger':
      // hidden 不可达（图标栏隐藏），无需特判；再点当前项收起，否则打开该面板
      return state === action.item ? 'icons' : action.item
    case 'close':
      // 仅面板态收起（回到 icons），不隐藏图标栏
      return state === 'search' ? 'icons' : state
    default:
      return state
  }
}
