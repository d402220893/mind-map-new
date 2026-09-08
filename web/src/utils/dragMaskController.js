// web/src/utils/dragMaskController.js
//
// 控制拖拽导入遮罩（dragMask）的开关状态。
//
// 解决问题：
//   v1.0.x 历史 bug —— 用户把 .smm / 图片等文件从系统资源管理器拖到画布后，
//   "在此释放以导入该文件" 遮罩不会消失，必须刷新页面才能消除。
//   根因：onContainerDrop 处理器从来没把 showDragMask 复位为 false。
//   而 .dragMask 自己的 dragleave 也只在用户继续拖出时才触发；如果用户
//   直接在遮罩上 drop（这是设计内的合法路径），dragleave 永远不会发生。
//
// 因此 reducer 的契约是：
//   - 'enter'  当且仅当 enableDragImport=true 且 isDragOutlineTreeNode=false 时打开
//   - 'leave'  关闭
//   - 'drop'   关闭（**关键回归点：drop 后无论成功/失败/扩展名是否支持，都必关闭**）
//   - 'reset'  强制置为 false（仅测试用）
//   - 其他 action 不修改状态（保守原则，避免上层拼写错时误关/误开）
//
// 抽成纯函数而非类实例，方便在 Node 上做 node --test 单测。

/**
 * @param {boolean} currentVisible  当前的 showDragMask 状态
 * @param {string} action           'enter' | 'leave' | 'drop' | 'reset' | 其他
 * @param {object} [opts]           仅 'enter' 时生效
 * @param {boolean} [opts.enableDragImport]      用户是否开启"允许拖入导入"
 * @param {boolean} [opts.isDragOutlineTreeNode] 当前是否在大纲树节点拖拽中
 * @returns {boolean} 计算后的下一个 showDragMask 状态
 */
export function reduceDragMask(currentVisible, action, opts = {}) {
  switch (action) {
    case 'enter': {
      // 前置条件检查：不允许导入 或 正在拖大纲树节点，则不开遮罩
      if (opts.enableDragImport === false) return currentVisible
      if (opts.isDragOutlineTreeNode === true) return currentVisible
      return true
    }
    case 'leave':
    case 'drop':
      // 离开或释放都关遮罩 —— 这是 drop 后遮罩消失的唯一可靠路径
      return false
    case 'reset':
      return false
    default:
      // 未知 action 维持原状，避免拼写错误时把遮罩误关/误开
      return currentVisible
  }
}
