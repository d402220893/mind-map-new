// 引用文件解析候选链（纯函数，可被 node --test 直接测试）
//
// 背景（v2.0.45 引用失效修复）：外部 AI 按 code2mm.md §4.4 写 `refs[].file` 相对路径
// （基准=工作区根），但双击单文件打开 .smm 且无 .mindlink 时，工作区根兜底为
// .smm 所在目录 → 「.smm 在子目录、md 在上层」场景解析落空 → RefBlock 显示
// 「引用失效（章节内容为空）」（实测 code2mm-demo/testddd.smm 引用仓库根 md）。
//
// 回退策略：工作区根拼不出就**从 .smm 所在目录向上逐级找**（≤maxUp 级），
// 与 workspaceService#inferRootFor 的向上找 .mindlink 精神一致。
export const DEFAULT_MAX_UP = 8

/** 规范为正斜杠、去尾部斜杠 */
function norm(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '')
}

/** 取目录部分（无则 null） */
function dirOf(p) {
  const i = p.lastIndexOf('/')
  return i > 0 ? p.slice(0, i) : null
}

/**
 * 解析引用文件的候选绝对路径列表（按优先级降序，去重）。
 * @param {object} o
 * @param {string} o.file       引用里的相对/绝对 file 字段
 * @param {string} o.root       当前工作区根（可为空串）
 * @param {string} o.sourceAbs  当前打开的 .smm 绝对路径（可为空）
 * @param {number} [o.maxUp]    向上回退级数上限
 * @returns {string[]} 候选绝对路径（调用方逐个 exists 探测，第一个命中即真相）
 */
export function resolveRefFileCandidates({ file, root, sourceAbs, maxUp = DEFAULT_MAX_UP }) {
  const f = norm(file)
  if (!f) return []
  const out = []
  const push = p => { if (p && !out.includes(p)) out.push(p) }
  // ① 绝对路径：直接用
  if (/^[A-Za-z]:[\\/]/.test(f) || f.startsWith('/')) {
    push(f)
    return out
  }
  // ② 工作区根相对（现行契约）
  const r = norm(root)
  if (r) push(r + '/' + f)
  // ③ 回退：从 .smm 所在目录逐级向上拼 file
  const src = norm(sourceAbs)
  const startDir = src ? dirOf(src) : null
  let dir = startDir
  for (let i = 0; dir && i < maxUp; i++) {
    push(dir + '/' + f)
    const parent = dirOf(dir)
    if (!parent || parent === dir) break
    dir = parent
  }
  return out
}
