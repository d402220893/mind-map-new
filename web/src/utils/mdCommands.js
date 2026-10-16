/**
 * MdEditor 工具栏命令映射层。
 *
 * 职责：把 MdToolbar 下发的「离散命令名字符串」解耦为 Toast UI Editor 的实际 exec 调用。
 * 这样 Toast UI 版本差异（命令名变动）只需在此一处适配，其余 UI 代码不感知。
 *
 * 命令名已对照本机 `web/node_modules/@toast-ui/editor@3.2.2` 源码逐项确认：
 *   - 标题命令是 `heading`（payload 需 `{ level }`），**不是** `setHeading`（`setHeading` 全源码零出现）。
 *   - `blockQuote` / `addTable` / `addImage` / `addLink` 均为 Toast UI 原生命令名，勿改。
 *
 * 统一为函数形式 `(editor) => void`，避免 v1 草稿中 string|function 混排导致的脆弱闭包
 * （若把 REGISTRY 提到模块顶层复用，闭包不再依赖调用点局部 `editor`）。
 */

/**
 * @param {string} name 离散命令名（如 'heading1' / 'bold'）
 * @param {import('@toast-ui/editor').Editor} editor Toast UI Editor 实例
 * @returns {((editor: import('@toast-ui/editor').Editor) => void) | null}
 */
export function resolveMdCommand(name, editor) {
  const REGISTRY = {
    // —— 标题：Toast UI 命令名即 heading，payload 需 { level }（已查 v3.2.2 源码确认）——
    heading1: e => e.exec('heading', { level: 1 }),
    heading2: e => e.exec('heading', { level: 2 }),
    heading3: e => e.exec('heading', { level: 3 }),

    // —— 其余均为 Toast UI 原生命令名（已查源码确认，勿改）——
    bold: e => e.exec('bold'),
    italic: e => e.exec('italic'),
    strike: e => e.exec('strike'),
    code: e => e.exec('code'),
    blockQuote: e => e.exec('blockQuote'),
    bulletList: e => e.exec('bulletList'),
    taskList: e => e.exec('taskList'),
    addTable: e => e.exec('addTable'),
    codeBlock: e => e.exec('codeBlock'),
    hr: e => e.exec('hr'),
    addImage: e => e.exec('addImage'),
    addLink: e => e.exec('addLink'),
    undo: e => e.exec('undo'),
    redo: e => e.exec('redo')
  }
  const fn = REGISTRY[name]
  return typeof fn === 'function' ? fn : null
}
