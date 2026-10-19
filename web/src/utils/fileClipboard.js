// 文件列表内部剪贴板（模块级单例）。
// 与系统剪贴板相互独立：复制/剪切的是工作区内的文件（路径集合 + 操作类型），
// 粘贴时按内部剪贴板落地到目标目录。组件卸载不清空（跨组件/跨菜单态保留）。
//
// 注意：仅存路径与操作类型，不持有文件内容；实时性以粘贴时刻的文件系统为准。
let _clip = { op: null, paths: [] }

/** 设置内部剪贴板。op: 'copy' | 'cut'；paths: 绝对路径数组 */
export function setClipboard(op, paths) {
  _clip = {
    op: op === 'cut' ? 'cut' : 'copy',
    paths: Array.isArray(paths) ? paths.slice() : []
  }
  return getClipboard()
}

/** 读取内部剪贴板（返回副本，调用方无法意外改到单例） */
export function getClipboard() {
  return { op: _clip.op, paths: _clip.paths.slice() }
}

/** 清空内部剪贴板（粘贴完成 / 取消后调用，避免重复粘贴） */
export function clearClipboard() {
  _clip = { op: null, paths: [] }
}

/** 是否有可粘贴内容 */
export function hasClipboard() {
  return (_clip.op === 'copy' || _clip.op === 'cut') && _clip.paths.length > 0
}
