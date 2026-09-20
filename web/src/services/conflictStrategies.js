// L1 纯函数：冲突四分支策略。
// ① `strategies`（§7.7）：revisionService.resolveConflict 调用，形状 (ctx) => ({text,rev,write}|{noop}|{canceled})
// ② `CONFLICT_CHOICES` / `describeChoice` / `applyChoice`：兼容旧调用与 UI 文案。
// 零依赖、无副作用、可直测。

// 【v1.3，§7.7】策略表：每个策略只做纯计算，写盘由 revisionService.writeAndBroadcast 统一负责。
export const strategies = {
  // 保留我的并覆盖
  'keep-mine': (ctx) => ({ text: ctx.mine, rev: (ctx.current.rev || 0) + 1, write: true }),
  // 用最新（丢弃本地）
  'use-latest': (ctx) => ({ text: ctx.current.content, noop: true }),
  // 手动合并：UI 已把结果作为 mine 传回
  'manual-merge': (ctx) => ({ text: ctx.mine, rev: (ctx.current.rev || 0) + 1, write: true }),
  // 取消：保留草稿
  'cancel': () => ({ canceled: true })
}

export const CONFLICT_CHOICES = ['mine', 'theirs', 'both', 'manual']

export function describeChoice(choice) {
  if (choice === 'mine' || choice === 'keep-mine') return '保留我的修改'
  if (choice === 'theirs' || choice === 'use-latest') return '采用当前内容'
  if (choice === 'both') return '合并（我的在上，当前在下）'
  if (choice === 'manual' || choice === 'manual-merge') return '手动合并'
  if (choice === 'cancel') return '取消（保留草稿）'
  return '未知'
}

// 返回合并后的文本；manual 不在此处理（交给手动合并 UI）
export function applyChoice(choice, { mine, theirs }) {
  if (choice === 'mine' || choice === 'keep-mine') return mine
  if (choice === 'theirs' || choice === 'use-latest') return theirs
  if (choice === 'both') return (mine + '\n\n' + theirs).replace(/\n{3,}/g, '\n\n')
  throw new Error('manual choice 需走手动合并 UI')
}

// 未知策略判定（供 resolveConflict 断言）
export function isKnownStrategy(choice) {
  return Object.prototype.hasOwnProperty.call(strategies, choice)
}
