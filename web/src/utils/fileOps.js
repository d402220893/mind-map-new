// 文件列表交互的纯函数（可 Node 单测，无 Vue / Electron 依赖）。
// 抽离重命名校验、副本命名、粘贴同名冲突处理，便于独立测试与复用。
//
// 设计：本文件只负责"生成候选名字符串"，不触碰文件系统。
// 是否存在同名由调用方（workspaceService.copy）用 fsApi.stat 循环探测，
// 这样纯函数保持无副作用、易测，且命名规则与系统资源管理器一致。

/**
 * 拆分文件名 → { base, ext }。
 * ext 含前导点（如 ".md"）；无扩展名返回空串。
 * 注意：点号在首位（如 ".gitignore"）视为无扩展名（整串当 base），
 * 与系统文件管理器一致。
 */
export function splitName(filename) {
  const s = String(filename == null ? '' : filename)
  const dot = s.lastIndexOf('.')
  if (dot <= 0) return { base: s, ext: '' }
  return { base: s.slice(0, dot), ext: s.slice(dot) }
}

/**
 * 校验文件名合法性（重命名 / 新建用）。
 * @returns {{ok:boolean, code?:string, message?:string, warn?:string}}
 *   - ok:false code:'EMPTY'    空名
 *   - ok:false code:'ILLEGAL'  含非法字符
 *   - ok:true                  合法（扩展名变更不在此拦截，由调用方决定是否警告）
 */
export function validateFileName(name) {
  const n = String(name == null ? '' : name).trim()
  if (!n) return { ok: false, code: 'EMPTY', message: '文件名不能为空' }
  // Windows / 通用非法字符
  if (/[\\/:*?"<>|]/.test(n)) {
    return { ok: false, code: 'ILLEGAL', message: '文件名不能包含 \\ / : * ? " < > | 字符' }
  }
  return { ok: true }
}

/**
 * 同目录"新建副本"候选名。
 *   n=1 → "base - 副本.ext"
 *   n>=2 → "base - 副本 (n).ext"
 * 例："报告.md" → "报告 - 副本.md" / "报告 - 副本 (2).md"
 */
export function computeCopyName(name, n = 1) {
  const { base, ext } = splitName(name)
  const k = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
  return k <= 1 ? `${base} - 副本${ext}` : `${base} - 副本 (${k})${ext}`
}

/**
 * 跨目录粘贴同名冲突候选名。
 *   n=1 → 原文件名（调用方先 stat，存在才进 n>=2）
 *   n>=2 → "base (n).ext"
 * 例："报告.md" 已存在 → "报告 (2).md" / "报告 (3).md"
 */
export function computeConflictName(name, n = 1) {
  const { base, ext } = splitName(name)
  // n=1（或非法值）→ 原文件名；n>=2 → "base (n).ext"
  if (!Number.isFinite(n) || n <= 1) return String(name == null ? '' : name)
  return `${base} (${Math.floor(n)})${ext}`
}

/**
 * 父目录提取（正斜杠归一），与现有 ctxDir / WorkspacePanel 约定一致。
 */
export function parentDir(path) {
  const s = String(path == null ? '' : path).replace(/\\/g, '/')
  const idx = s.lastIndexOf('/')
  return idx > 0 ? s.slice(0, idx) : s
}

/**
 * 取文件名（含扩展名），去目录部分。
 */
export function baseNameOf(path) {
  const s = String(path == null ? '' : path).replace(/\\/g, '/')
  const idx = s.lastIndexOf('/')
  return idx >= 0 ? s.slice(idx + 1) : s
}
