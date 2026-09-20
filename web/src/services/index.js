// CG 组合根：装配依赖，导出默认单例供视图 import。只装配、零业务、禁条件分支（R16）。
// 不得再导出 io 层（视图经 services 间接访问）；不得含 if/switch（断言⑦）。
// ⚠️ 装配顺序即依赖顺序：io/stores 必须先于 services 成型 —— 否则 service 解构到的 io 成员是 null。
// ⚠️ overrides 只用于测试注入 fake（fsApi / events / stores …）；生产调用不传。
import { createEventBus } from './events.js'
import { createLogger } from './logger.js'
import { createWorkspaceContext, createDocumentContext } from './context.js'
import { createWorkspaceStore } from './state/workspaceStore.js'
import { createDocumentStore } from './state/documentStore.js'
import { createFsApi } from './io/fsApi.js'
import { createSuppressionRegistry } from './io/suppressionRegistry.js'
import { createFsWatchClient } from './io/fsWatchClient.js'
import { createWorkspaceIndex } from './io/workspaceIndex.js'
import { createWorkspaceService } from './workspaceService.js'
import { createSectionService } from './sectionService.js'
import { createRefService } from './refService.js'
import { createRevisionService } from './revisionService.js'
import { createMdDocument } from './mdDocument.js'
import { createFileRouter } from './fileRouter.js'
import { createCommandBus } from './commandBus.js'
import { createWorkspaceSearch } from './workspaceSearch.js'

export function createServices(overrides = {}) {
  // ── L0 ──
  const events = overrides.events || createEventBus()
  const log = overrides.log || createLogger('app')

  // ── L3 IO（先成型，供下游解构）──
  const suppressionRegistry = overrides.suppressionRegistry || createSuppressionRegistry({ ttl: 1500 })
  const fsApi = overrides.fsApi || createFsApi({ suppressionRegistry })
  const workspaceIndex = overrides.workspaceIndex || createWorkspaceIndex({ fsApi })
  const fsWatchClient = overrides.fsWatchClient || createFsWatchClient({ fsApi, suppressionRegistry, events })
  const io = { fsApi, suppressionRegistry, fsWatchClient, workspaceIndex }

  // ── L2 状态 ──
  const workspace = overrides.workspaceStore || createWorkspaceStore()
  const document = overrides.documentStore || createDocumentStore()
  const stores = { workspace, document }

  // ── L4 编排（顺序：workspace → section → mdDocument → ref → router → revision → 其余）──
  const ctx = { io, events, log, stores }
  const workspaceService = createWorkspaceService({ ...ctx, confirm: overrides.confirm })
  const sectionService = createSectionService({ ...ctx, services: { workspaceService } })
  const mdDocument = createMdDocument({ ...ctx, services: {} })
  const refService = createRefService({ ...ctx, services: { sectionService, workspaceService } })
  const fileRouter = createFileRouter({
    ...ctx,
    services: { workspaceService, refService },
    tabs: overrides.tabs,
    importer: overrides.importer
  })
  const revisionService = createRevisionService({ ...ctx, services: { refService, sectionService, workspaceService } })
  const commandBus = createCommandBus(ctx)
  const workspaceSearch = createWorkspaceSearch({ ...ctx, services: { workspaceService } })

  const services = {
    workspaceService, sectionService, refService, revisionService,
    mdDocument, fileRouter, commandBus, workspaceSearch
  }
  return { events, log, stores, services, createWorkspaceContext, createDocumentContext }
}

const singleton = createServices()
export default singleton

/**
 * §10-#29 测试隔离：重建全部服务，并把结果**原地灌回**同一个单例。
 * ⚠️ 不能改成 `singleton = createServices()` —— 视图/bridge 在模块加载期就捕获了
 * `services` 对象引用，换对象会让它们继续指向旧的 services（测试串味的根源）。
 * 因此这里只换字段、不换对象身份。
 */
export function resetAppServices() {
  const next = createServices()
  Object.assign(singleton, { events: next.events, log: next.log, stores: next.stores })
  Object.assign(singleton.services, next.services)
  return singleton
}
