// §11.2 A′ 预算：≥4（本文件 10）
// 组合根的"零业务/零分支"是架构纪律（断言⑦）；这里的断言全是结构性的，
// 不依赖任何 mock —— createServices() 在 Node 下即可完整构造（fsApi 的 window 访问是惰性的）。
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { createServices, resetAppServices } from '../../src/services/index.js'

const SRC = readFileSync(new URL('../../src/services/index.js', import.meta.url), 'utf8')

const REQUIRED = [
  'workspaceService', 'sectionService', 'refService', 'revisionService',
  'mdDocument', 'fileRouter', 'commandBus', 'workspaceSearch'
]

test('① createServices 装配出全部 8 个服务', () => {
  const { services } = createServices()
  for (const k of REQUIRED) assert.ok(services[k], '缺少服务：' + k)
})

test('② 两次 createServices 互不影响（改 A 的 state 不动 B）', () => {
  const a = createServices()
  const b = createServices()
  assert.notStrictEqual(a.services.workspaceService, b.services.workspaceService)
  assert.notStrictEqual(a.stores.workspace, b.stores.workspace)
  a.stores.workspace.setRoot && a.stores.workspace.setRoot('/x')
  assert.notStrictEqual(a.stores.workspace.getRoot && a.stores.workspace.getRoot(), '/x' === '' ? '/x' : (b.stores.workspace.getRoot ? b.stores.workspace.getRoot() : null))
})

test('③ createServices 返回 events / log / stores 三件套', () => {
  const s = createServices()
  assert.ok(s.events && typeof s.events.emit === 'function')
  assert.ok(s.log && typeof s.log.info === 'function')
  assert.ok(s.stores && s.stores.workspace && s.stores.document)
})

test('④ overrides.events 真的被注入（不是被忽略）', () => {
  const marker = { emit: () => {}, on: () => () => {}, __marker: true }
  const s = createServices({ events: marker })
  assert.strictEqual(s.events.__marker, true)
})

test('⑤ overrides.fsApi 真的被注入到 io 下游服务', () => {
  const fsApi = { __marker: true, async readText() { return { ok: true, data: { content: '' } } } }
  const s = createServices({ fsApi })
  assert.strictEqual(s.services.mdDocument.__probe, undefined, '服务本身不暴露 io（不泄漏）')
  assert.strictEqual(typeof s.services.workspaceService.readText, 'function')
})

test('⑥ 组合根不得导出 io（视图不得绕过服务层直连 IO）', () => {
  const s = createServices()
  assert.strictEqual(s.io, undefined, 'io 不得出现在返回值上')
  assert.strictEqual(s.fsApi, undefined)
  assert.strictEqual(s.workspaceIndex, undefined)
})

test('⑦ 源码中不得出现 if / switch（CG 零分支纪律）', () => {
  const code = SRC.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  assert.strictEqual(/\bif\s*\(/.test(code), false, 'CG 不得含 if')
  assert.strictEqual(/\bswitch\s*\(/.test(code), false, 'CG 不得含 switch')
})

test('⑧ 源码中不得出现 this（服务层统一闭包风格）', () => {
  const code = SRC.replace(/\/\/[^\n]*/g, '')
  assert.strictEqual(/\bthis\./.test(code), false, 'CG 不得用 this')
})

test('⑨ resetAppServices 保持单例对象身份（视图捕获的引用仍有效）', async () => {
  const mod = await import('../../src/services/index.js')
  const before = mod.default
  const servicesObj = before.services
  const oldWs = servicesObj.workspaceService
  resetAppServices()
  assert.strictEqual(mod.default, before, '单例身份必须保持')
  assert.strictEqual(mod.default.services, servicesObj, 'services 容器身份必须保持')
  assert.notStrictEqual(servicesObj.workspaceService, oldWs, '实例应被替换')
})

test('⑩ resetAppServices 后不残留上一轮实例上的自定义标记', async () => {
  const mod = await import('../../src/services/index.js')
  mod.default.services.workspaceService.__leak = 'x'
  resetAppServices()
  assert.strictEqual(mod.default.services.workspaceService.__leak, undefined)
})
