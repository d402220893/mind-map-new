// L1 纯函数：命令注册表（注册/查表/enabled/快捷键解析）。
// 纯逻辑；commandBus（L4）只负责编排执行。零依赖。
export function createRegistry() {
  const map = new Map()
  return {
    register(cmd) {
      // cmd: { id, title, shortcuts?: string[], enabled?: boolean, ... }
      map.set(cmd.id, { enabled: true, ...cmd })
      return cmd.id
    },
    get(id) { return map.get(id) || null },
    list() { return [...map.values()] },
    isEnabled(id) { const c = map.get(id); return !!(c && c.enabled !== false) },
    findByShortcut(key) { return [...map.values()].filter(c => (c.shortcuts || []).includes(key)) },
    // 供快捷键总览面板渲染（§8.2 / G9）：自动导出，不再手工维护表格
    shortcutsTable() {
      return [...map.values()].map(c => ({ id: c.id, title: c.title, shortcuts: c.shortcuts || [] }))
    }
  }
}
