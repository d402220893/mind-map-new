// L4 编排：命令执行/可用态/快捷键绑定 + 迁移表（§D8）；纯注册表在 L1 commandRegistry。
import { createRegistry } from './commandRegistry.js'
import { ok, fail, err } from './errors.js'

export const createCommandBus = (ctx = {}) => {
  const registry = createRegistry()
  const log = ctx.log || null
  function register(cmd) { return registry.register(cmd) }
  async function execute(id, payload) {
    const cmd = registry.get(id)
    if (!cmd) return fail(err('E_CMD_NOT_FOUND', { id }))
    if (cmd.enabled === false) return fail(err('E_CMD_DISABLED', { id }))
    // L4 不抛：命令内部异常转成 Result（§16.5）
    try {
      const r = typeof cmd.run === 'function' ? await cmd.run(payload) : null
      return r && r.ok === false ? r : ok({ id, data: r && r.data !== undefined ? r.data : r })
    } catch (e) {
      if (log && log.error) log.error('cmd.failed', { id, message: e && e.message })
      return fail(err('E_CMD_FAILED', { id, message: String((e && e.message) || e) }))
    }
  }
  function isEnabled(id) { return registry.isEnabled(id) }
  function list() { return registry.list() }
  function shortcutsTable() { return registry.shortcutsTable() }
  // 注册 v1.4 新增快捷键（§8.2 / G9）；快捷键总览面板由命令注册表自动导出
  register({ id: 'app.toggleZenMode', title: '禅模式', shortcuts: ['F11', 'Ctrl+Shift+F11'] })
  register({ id: 'app.toggleToolbar', title: '折叠工具栏', shortcuts: ['Ctrl+Shift+T'] })
  register({ id: 'app.toggleStatusBar', title: '折叠状态栏', shortcuts: ['Ctrl+Shift+B'] })
  return { register, execute, isEnabled, list, shortcutsTable }
}
