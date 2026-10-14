// P0a 纯模块：保存闸门与数据完整性判定（design/覆盖文件防护方案_v5.md §2.2 / §4.1 / §5.1）。
// 不依赖 Vue / DOM / simple-mind-map，可在 Node 下单测。
//
// 设计要点（与 review 意见对齐）：
// - 闸门 A（isSaveAllowed）：仅当 loadPhase === 'loaded' 才允许把内存数据覆盖写盘。
//   loading/failed/idle 一律拒绝——这是“半加载/空数据冲掉当前文件”的止血核心。
// - countNodes：跨所有 sheet 求和（边界1：避免“单个合法空 sheet”误伤整个文件）。
// - contentHash：djb2 over JSON.stringify。调用方应传入已规范化（key 排序）的容器；
//   更深的 volatile 排除（边界2：折叠=volatile、位置=content、激活 sheet=volatile）
//   留待 P2；P0a 仅作种子基准，不强制行为。

// 闸门 A：加载态守卫
export function isSaveAllowed(loadPhase) {
  return loadPhase === 'loaded'
}

// 统计容器总节点数（跨所有 sheet 求和）。
// 空/非法容器返回 0（gate B 判定“总节点数 === 0”时使用）。
export function countNodes(container) {
  if (!container || !Array.isArray(container.sheets)) return 0
  let n = 0
  const walk = node => {
    if (!node || typeof node !== 'object') return
    n++
    const kids = node.children
    if (Array.isArray(kids)) kids.forEach(walk)
  }
  // 真实落盘形状：sheet.data = { root: <MindNode> }，思维导图根节点是 data.root。
  for (const sh of container.sheets) walk(sh && sh.data && sh.data.root)
  return n
}

// 内容稳定哈希（djb2）。输入应为“规范化投影”后的容器；
// 同一内容不同序列化顺序在本实现下可能不同哈希——P2 前调用方需保证 key 已排序。
export function contentHash(container) {
  const s = JSON.stringify(container)
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return 'h' + (h >>> 0).toString(16)
}
