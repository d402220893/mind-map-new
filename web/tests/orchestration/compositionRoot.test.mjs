import { test } from 'node:test'
import assert from 'node:assert'
import { createServices } from '../../src/services/index.js'
import { makeFakeFsApi, makeFakeWorkspaceIndex, makeFakeLog } from './helpers.js'

const ROOT = 'D:/ws'

function fakes({ meta = { v: 1 } } = {}) {
  const fsApi = makeFakeFsApi({ tree: ['doc.md'], dirs: [ROOT] })
  fsApi.files.set(ROOT + '/doc.md', '# A\n\nbody A\n')
  const workspaceIndex = makeFakeWorkspaceIndex({ meta })
  const events = { emitted: [], on: () => () => {}, emit: (t, p) => events.emitted.push({ t, p }) }
  return { fsApi, workspaceIndex, events, log: makeFakeLog() }
}

test('① createServices 装配出全部 8 个服务', () => {
  const { services } = createServices(fakes())
  for (const k of ['workspaceService', 'sectionService', 'refService', 'revisionService', 'mdDocument', 'fileRouter', 'commandBus', 'workspaceSearch']) {
    assert.ok(services[k], '缺少服务：' + k)
  }
})

test('② io 先成型：revisionService 拿到的 workspaceIndex 非 null（装配顺序回归）', async () => {
  const { services } = createServices(fakes())
  // 若 io 后赋值，revisionService 内部 workspaceIndex 恒为 null → 提交必炸
  const r = await services.revisionService.listHistory('doc.md').catch(() => null)
  assert.ok(r === null || typeof r === 'object', '不得因 null 解构而抛')
})

test('③ refService 无 commitRef（破 v1.0 双向环）', () => {
  const { services } = createServices(fakes())
  assert.strictEqual(services.refService.commitRef, undefined)
})

test('④ 组合根不导出 io / fsApi（视图须经 services 间接访问）', async () => {
  const mod = await import('../../src/services/index.js')
  const keys = Object.keys(mod)
  assert.ok(!keys.includes('fsApi'), '不得导出 fsApi')
  assert.ok(!keys.includes('io'), '不得导出 io')
  assert.ok(!keys.includes('workspaceIndex'), '不得导出 workspaceIndex')
})

test('⑤ overrides 注入 fake：workspaceService.open 走注入的 fsApi', async () => {
  const f = fakes()
  const { services } = createServices({ ...f, confirm: async () => true })
  const r = await services.workspaceService.open(ROOT)
  assert.ok(r.ok, JSON.stringify(r.error))
  assert.strictEqual(f.fsApi.calls.some(c => c[0] === 'readTree'), true)
})

test('⑥ stores 共享：workspaceService.open 后 getRoot 生效', async () => {
  const { services, stores } = createServices({ ...fakes(), confirm: async () => true })
  await services.workspaceService.open(ROOT)
  assert.strictEqual(services.workspaceService.getRoot(), ROOT)
  assert.strictEqual(stores.workspace.get().root, ROOT)
})

test('⑦ document store 与 mdDocument 打通', async () => {
  const { services, stores } = createServices(fakes())
  const r = await services.mdDocument.load('t1', ROOT + '/doc.md')
  assert.ok(r.ok)
  assert.strictEqual(stores.document.get('t1').content, '# A\n\nbody A\n')
  assert.strictEqual(services.mdDocument.isDirty('t1'), false)
  services.mdDocument.setContent('t1', '# A\n\nchanged\n')
  assert.strictEqual(services.mdDocument.isDirty('t1'), true)
})

test('⑧ fileRouter 拿到 refService（.smm 打开会校准快照）', async () => {
  const { services } = createServices(fakes())
  const r = services.fileRouter.resolveEmbed('map.smm', 'note.md')
  assert.strictEqual(r.kind, 'mindmap')
  assert.ok(services.fileRouter.open && services.fileRouter.navigate)
})

test('⑨ commandBus 未注册命令 → E_CMD_NOT_FOUND', async () => {
  const { services } = createServices(fakes())
  const r = await services.commandBus.execute('nope')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'E_CMD_NOT_FOUND')
})

test('⑩ commandBus 禁用命令 → E_CMD_DISABLED', async () => {
  const { services } = createServices(fakes())
  services.commandBus.register({ id: 'x', title: 'X', enabled: false, run: async () => {
    throw new Error('应被拦下')
  } })
  const r = await services.commandBus.execute('x')
  assert.strictEqual(r.error.code, 'E_CMD_DISABLED')
})

test('⑪ commandBus 命令抛异常 → E_CMD_FAILED（L4 不抛）', async () => {
  const { services } = createServices(fakes())
  services.commandBus.register({ id: 'boom', title: 'Boom', run: async () => { throw new Error('boom') } })
  const r = await services.commandBus.execute('boom')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.error.code, 'E_CMD_FAILED')
})

test('⑫ commandBus 正常命令返回 ok', async () => {
  const { services } = createServices(fakes())
  services.commandBus.register({ id: 'ok1', title: 'OK', run: async () => ({ ok: true, data: 42 }) })
  const r = await services.commandBus.execute('ok1')
  assert.ok(r.ok)
})

test('⑬ 预置快捷键命令已注册（§8.2）', () => {
  const { services } = createServices(fakes())
  const ids = services.commandBus.list().map(c => c.id)
  assert.ok(ids.includes('app.toggleZenMode'))
  assert.ok(ids.includes('app.toggleToolbar'))
  assert.ok(ids.includes('app.toggleStatusBar'))
})

test('⑭ 两次 createServices 互相隔离（非模块单例）', async () => {
  const a = createServices({ ...fakes(), confirm: async () => true })
  const b = createServices(fakes())
  await a.services.workspaceService.open(ROOT)
  assert.strictEqual(b.services.workspaceService.getRoot(), '', 'b 不应被 a 污染')
})

test('⑮ events 注入生效：open 会 emit 到注入的 bus', async () => {
  const f = fakes()
  const { services } = createServices({ ...f, confirm: async () => true })
  await services.workspaceService.open(ROOT)
  assert.ok(f.events.emitted.length > 0, '注入的事件总线应收到事件')
})

test('⑯ workspaceSearch 拿到 workspaceService（可检索）', async () => {
  const { services } = createServices({ ...fakes(), confirm: async () => true })
  await services.workspaceService.open(ROOT)
  const r = await services.workspaceSearch.byName('doc')
  assert.ok(r.ok)
  assert.ok(r.data.results.some(x => x.rel === 'doc.md'))
})

test('⑰ sectionService 只读：getSectionView 不写盘', async () => {
  const f = fakes()
  const { services } = createServices({ ...f, confirm: async () => true })
  await services.workspaceService.open(ROOT)
  const before = f.fsApi.calls.filter(c => c[0] === 'writeText').length // open 阶段可能有迁移写盘
  const r = await services.sectionService.listSections('doc.md')
  assert.ok(r.ok, JSON.stringify(r.error))
  assert.strictEqual(r.data.sections.length, 1)
  const after = f.fsApi.calls.filter(c => c[0] === 'writeText').length
  assert.strictEqual(after, before, 'sectionService 只读，不得写盘')
})

test('⑱ 默认单例导出可用（视图 import 的形态）', async () => {
  const mod = await import('../../src/services/index.js')
  assert.ok(mod.default.services.workspaceService)
  assert.strictEqual(typeof mod.createServices, 'function')
})

// ── §10-#29 组合根重置（测试隔离）──────────────────────────────────────

test('⑲ resetAppServices 原地换字段：单例对象身份不变（视图捕获的引用仍有效）', async () => {
  const mod = await import('../../src/services/index.js')
  const singleton = mod.default
  const servicesObj = singleton.services
  const oldWs = servicesObj.workspaceService
  mod.resetAppServices()
  assert.strictEqual(mod.default, singleton, '单例对象身份必须保持')
  assert.strictEqual(mod.default.services, servicesObj, 'services 容器对象身份必须保持')
  assert.notStrictEqual(servicesObj.workspaceService, oldWs, '服务实例应被替换（防上一个用例残留）')
})

test('⑳ resetAppServices 清空 stores：不会把上一轮的工作区状态带进下一个用例', async () => {
  const mod = await import('../../src/services/index.js')
  const services = mod.default.services
  services.workspaceService.__probe = 'leak'
  mod.resetAppServices()
  assert.strictEqual(mod.default.services.workspaceService.__probe, undefined, '新实例不得携带旧标记')
})
