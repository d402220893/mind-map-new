// 回归：跨进程 / 跨模块**字段转发**契约的源码级守卫。
//
// 为什么需要：这三处 bug 的共同形态是「值在传递链上被静默吞掉」——
//   ① `@/api` 的 addWorkbook 包装层解构参数漏了 kind → .md 打开成导图；
//   ② main.js 的 smm:watch 透传原始 type 且不带 rel → 侧栏永不刷新；
//   ③ 桥按单个 payload.type 取值，而主进程发的是批量 events 数组 → 同上。
// 它们都不会有编译/lint 报错（JS 解构多余字段/取 undefined 都不报错），
// 只在运行时表现为「功能没反应」，因此必须用源码断言把它们钉住。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = new URL('../../src/', import.meta.url)
const read = p => readFileSync(new URL(p, SRC), 'utf8')
const readMain = () => readFileSync(new URL('../../../electron-app/main.js', import.meta.url), 'utf8')

test('[字段转发] @/api addWorkbook 必须解构并转发 kind（漏掉 ⇒ .md 打开成导图）', () => {
  const src = read('api/index.js')
  const m = src.match(/export const addWorkbook[\s\S]*?WB\.addWorkbook\(\{[^}]*\}\)/)
  assert.ok(m, '找不到 @/api 的 addWorkbook 包装定义')
  const seg = m[0]
  const destructure = seg.match(/\{([^}]*)\}\s*=\s*\{\}/)
  assert.ok(destructure, '找不到 addWorkbook 的解构参数')
  assert.ok(
    /(^|[\s,])kind([\s,]|$)/.test(destructure[1]),
    '解构参数里没有 kind —— 传下来的 kind 会被静默丢弃'
  )
  assert.ok(
    /\bkind\b/.test(seg.slice(seg.indexOf('WB.addWorkbook'))),
    'kind 未转发给 WB.addWorkbook'
  )
})

test('[字段转发] workbookState.addWorkbook 仍按 kind 落库（markdown 不得被降级成 mindmap）', () => {
  const src = read('api/workbookState.js')
  assert.ok(
    /kind\s*===\s*'markdown'\s*\?\s*'markdown'\s*:\s*'mindmap'/.test(src),
    'normalize/addWorkbook 的 kind 归一化规则被改动，请同步检查所有调用点'
  )
})

test('[fs 事件契约] main.js smm:watch 必须发语义化 type(add/change/unlink) 且带 rel', () => {
  const src = readMain()
  const seg = src.match(/ipcMain\.handle\('smm:watch'[\s\S]*?\n\}\)/)
  assert.ok(seg, '找不到 smm:watch handler')
  assert.ok(
    /kind\s*=\s*alive\s*\?\s*'add'\s*:\s*'unlink'/.test(seg[0]),
    "rename 必须按 stat 结果分类成 add/unlink（否则渲染端拿不到'新增'语义）"
  )
  assert.ok(/type:\s*kind/.test(seg[0]), '事件载荷的 type 应为语义化 kind')
  assert.ok(/\brel\b/.test(seg[0]), '事件载荷必须带 rel（相对 root）')
  assert.ok(/webContents\.send\('smm:fs-event',\s*\{\s*root,\s*events\s*\}\)/.test(seg[0]),
    '必须按 {root, events:[...]} 批量发送（形状与 startFsBridge 的约定一致）')
})

test('[fs 事件契约] 桥必须走 mapFsEvents 遍历批量 events（不得再按单个 payload.type 取值）', () => {
  const src = read('utils/workspaceBridge.js')
  assert.ok(/mapFsEvents\(payload\)/.test(src), 'startFsBridge 未使用 mapFsEvents 归一化批量载荷')
  assert.ok(
    !/MAP\[\s*payload\s*&&\s*payload\.type\s*\]/.test(src),
    '仍在按单个 payload.type 查表 —— 批量载荷下恒为 undefined，事件会静默丢失'
  )
  assert.ok(
    /services\.workspaceSearch\.invalidate\(/.test(src),
    '收到 fs 事件后必须让搜索缓存失效'
  )
})

test('[树过滤] workspaceService 打开/刷新都必须过滤工作区树', () => {
  const src = read('services/workspaceService.js')
  const hits = (src.match(/filterWorkspaceTree\(/g) || []).length
  assert.ok(hits >= 3, 'filterWorkspaceTree 应被定义 + open + refresh 三处使用，实际 ' + hits)
  assert.ok(/export function filterWorkspaceTree/.test(src), 'filterWorkspaceTree 必须可独立单测')
})

test('[树过滤] 索引重建不得把非文档当文档处理', () => {
  const src = read('services/io/workspaceIndex.js')
  assert.ok(/f\.endsWith\('\.md'\)/.test(src) && /f\.endsWith\('\.smm'\)/.test(src),
    'rebuild 只应处理 .md/.smm')
})
