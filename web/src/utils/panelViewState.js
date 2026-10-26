/**
 * 左侧文件栏主体视图状态（纯函数，便于 Node 单测）。
 *
 * 背景：md 编辑模式下，左侧文件栏新增「大纲」视图，与「文件树」二选一
 * （需求：大纲从右侧悬浮栏移到左栏，与文件树互斥显示；右栏只留「查找」）。
 *
 * 状态：'files' | 'outline'
 *   - files  ：文件树 / 统一搜索结果（原默认视图）
 *   - outline：当前 md 文档的标题大纲（仅 md 模式可用，见 outlineEnabled）
 *
 * 与搜索的关系：搜索命中列表只替换文件树区域；大纲视图下看不到命中，
 * 因此发起搜索时调用方应先 showFiles 切回（避免「搜了却看不到结果」）。
 */

export const PANEL_VIEW_STATES = ['files', 'outline']

/**
 * @param {string} state 当前视图
 * @param {{type:'showFiles'|'showOutline', outlineEnabled?:boolean}} action
 * @returns {string} 新视图
 */
export function reducePanelView(state, action) {
  if (!PANEL_VIEW_STATES.includes(state) || !action || !action.type) return state
  switch (action.type) {
    case 'showOutline':
      // 大纲仅 md 模式（outlineEnabled）下可达；导图模式原地不动
      return action.outlineEnabled ? 'outline' : state
    case 'showFiles':
      return 'files'
    default:
      return state
  }
}
