import { test } from 'node:test'
import assert from 'node:assert'
import { createRefService } from '../../src/services/refService.js'

// 契约（v2.0.45 引用失效修复）：checkValidity 增加第三参 { sourceAbs }，
// 工作区根解析落空时从 sourceAbs 所在目录向上逐级回退探测引用文件，
// 结果携带 resolvedAbs 供视图（RefBlock openFile / commitEdit fileAbs）复用。

function makeDeps({ existingSet, texts }) {
  const exists = async abs => ({
    ok: true,
    data: { exists: existingSet.has(abs.replace(/\\/g, '/')) }
  })
  const readText = async abs => {
    const key = abs.replace(/\\/g, '/')
    if (!texts[key]) return { ok: false, error: { code: 'E_NOT_FOUND' } }
    return { ok: true, data: { content: texts[key] } }
  }
  const workspaceService = {
    getRoot: () => 'E:/ws',
    abs: p => (/^[A-Za-z]:[\\/]/.test(p) ? p : 'E:/ws/' + p)
  }
  const ctx = {
    io: {
      fsApi: { exists, readText },
      workspaceIndex: {
        read: async () => ({ ok: true, data: { refs: [] } }),
        rebuild: async () => ({ ok: true }),
        updateRefEntries: async () => ({ ok: true })
      }
    },
    services: {
      sectionService: {},
      workspaceService
    },
    log: { info() {}, warn() {} }
  }
  return createRefService(ctx)
}

// md：一个二级章节「用法」，正文 body-text
const MD = '# 标题\n\n前言\n\n## 用法\n\nbody-text\n'

test('工作区根命中：file-missing 不触发，resolvedAbs=根拼接', async () => {
  const svc = makeDeps({
    existingSet: new Set(['E:/ws/a.md']),
    texts: { 'E:/ws/a.md': MD }
  })
  const r = await svc.checkValidity('a.md', [{ sectionId: null, sectionPath: [] }])
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.data.results[0].status, 'ok')
  assert.strictEqual(r.data.results[0].resolvedAbs, 'E:/ws/a.md')
  // 整文件引用（无 baseHash）→ content = 整个文件
  assert.ok(r.data.results[0].current.content.includes('body-text'))
})

test('根落空时从 sourceAbs 向上回退命中（事故形状：.smm 在子目录、md 在上层）', async () => {
  const svc = makeDeps({
    existingSet: new Set(['E:/proj/详细设计.md']),
    texts: { 'E:/proj/详细设计.md': MD }
  })
  const r = await svc.checkValidity('详细设计.md', [{ sectionId: null, sectionPath: [] }], {
    sourceAbs: 'E:/proj/code2mm-demo/testddd.smm'
  })
  assert.strictEqual(r.ok, true)
  const hit = r.data.results[0]
  // 工作区根（E:/ws）没有该文件，回退链 E:/proj/code2mm-demo → E:/proj 命中
  assert.strictEqual(hit.status, 'ok')
  assert.strictEqual(hit.resolvedAbs, 'E:/proj/详细设计.md')
  assert.ok(hit.current.content.includes('body-text'))
})

test('全链 miss：保持 file-missing（向后兼容），resolvedAbs=首个候选', async () => {
  const svc = makeDeps({ existingSet: new Set(), texts: {} })
  const r = await svc.checkValidity('gone.md', [{ sectionId: null, sectionPath: [] }], {
    sourceAbs: 'E:/proj/x.smm'
  })
  assert.strictEqual(r.ok, true)
  const hit = r.data.results[0]
  assert.strictEqual(hit.status, 'file-missing')
  assert.strictEqual(hit.resolvedAbs, 'E:/ws/gone.md')
})

test('章节引用经回退命中后按章节定位（missing→stale/ok）', async () => {
  const svc = makeDeps({
    existingSet: new Set(['E:/proj/详细设计.md']),
    texts: { 'E:/proj/详细设计.md': MD }
  })
  // sectionPath 指向存在的章节但 baseHash 不匹配 → stale（说明章节定位走通了）
  const r = await svc.checkValidity(
    '详细设计.md',
    [{ sectionId: null, sectionPath: ['标题', '用法'], baseHash: 'deadbeef' }],
    { sourceAbs: 'E:/proj/code2mm-demo/testddd.smm' }
  )
  assert.strictEqual(r.data.results[0].status, 'stale')
  assert.strictEqual(r.data.results[0].resolvedAbs, 'E:/proj/详细设计.md')
  assert.strictEqual(r.data.results[0].current.title, '用法')
})
