// orchestration 测试共享 fake：内存 fsApi / 不 emit 的事件总线。
// 仅注入 fake，不引入 mock 框架（符合 L4 编排测试约定 §11.2-B）。
import { ok, fail, err } from '../../src/services/errors.js'

export function makeFakeFsApi({ tree = [], failFinal = false, failRead = false, dirs = [] } = {}) {
  const files = new Map()
  const dirSet = new Set(dirs)
  const calls = []
  const api = {
    files, calls, dirSet, tree,
    async readText(p) {
      calls.push(['readText', p])
      if (failRead && p.endsWith('.md')) return fail(err('E_READ_FAILED', { absPath: p }))
      return files.has(p) ? ok({ content: files.get(p) }) : fail(err('E_READ_FAILED', { absPath: p }))
    },
    async writeText(p, c) {
      calls.push(['writeText', p, c])
      if (failFinal && !p.includes('.tmp-')) return fail(err('E_WRITE_FAILED', { absPath: p }))
      files.set(p, c)
      return ok({ absPath: p })
    },
    async writeBinary(p, b) { files.set(p, b); return ok({ absPath: p }) },
    async exists(p) { return ok({ exists: files.has(p) || dirSet.has(p) }) },
    async stat(p) {
      return ok({ isDir: dirSet.has(p), exists: files.has(p) || dirSet.has(p) })
    },
    // 目录创建通道（真实宿主为 smm:mkdirp）。记录进 calls 供断言"写索引前先建 .mindlink/"。
    async mkdirp(dirPath) { calls.push(['mkdirp', dirPath]); dirSet.add(dirPath); return ok({ absPath: dirPath }) },
    async readTree(root) {
      calls.push(['readTree', root])
      return ok({ tree: tree.map(f => ({ name: f, isDir: false })) })
    },
    async watch(p) { calls.push(['watch', p]); return ok({ handle: {} }) },
    async unwatch(p) { calls.push(['unwatch', p]); return ok({}) },
    async openExternal(p) { calls.push(['openExternal', p]); return ok({}) }
  }
  return api
}

/** 内存 workspaceIndex fake：三件套 + 可注入失败 */
export function makeFakeWorkspaceIndex(initial = {}) {
  // meta 传 null 表示"索引缺失"（用于测试首次建索引分支）
  const store = {
    'sections.json': initial.sections || { v: 1, files: {} },
    'refs.json': initial.refs || { v: 1, refs: [] }
  }
  if ('meta' in initial) { if (initial.meta !== null) store['meta.json'] = initial.meta }
  else store['meta.json'] = { v: 1 }
  const calls = { read: [], write: [], init: [], rebuild: [] }
  const idx = {
    store, calls,
    failWrite: !!initial.failWrite,
    failRebuild: !!initial.failRebuild,
    async read(name) {
      calls.read.push(name)
      return name in store ? ok(store[name]) : fail(err('E_INDEX_PARSE', { name }))
    },
    async write(name, data) {
      calls.write.push([name, data])
      if (idx.failWrite) return fail(err('E_INDEX_WRITE', { name }))
      store[name] = data
      return ok({ absPath: name })
    },
    async init(root, meta = {}) {
      calls.init.push([root, meta])
      if (idx.failWrite) return fail(err('E_INDEX_WRITE', { name: 'meta.json' }))
      store['meta.json'] = { v: 1, ...meta }
      store['sections.json'] = { v: 1, files: {} }
      store['refs.json'] = { v: 1, refs: [] }
      return ok({ root, schema: 1 })
    },
    async rebuild(opts = {}) {
      calls.rebuild.push(opts)
      if (idx.failRebuild) return fail(err('E_INDEX_WRITE', { root: opts.root }))
      return ok({ mode: 'full', scanned: 0, files: 0 })
    },
    async updateSection() { return ok({}) },
    async updateRefEntries() { return ok({ updated: 0 }) }
  }
  return idx
}

export function makeFakeEvents() {
  const emitted = []
  return {
    emitted,
    on: () => () => {},
    emit: (t, p) => { emitted.push({ t, p }) },
    off: () => {},
    clear: () => { emitted.length = 0 }
  }
}

export function makeFakeLog() {
  const entries = []
  const noop = () => {}
  return {
    entries,
    debug: (...a) => entries.push(['debug', ...a]),
    info: (...a) => entries.push(['info', ...a]),
    warn: (...a) => entries.push(['warn', ...a]),
    error: (...a) => entries.push(['error', ...a]),
    setLevel: noop,
    child: () => makeFakeLog()
  }
}
