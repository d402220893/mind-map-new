// safeWriteFile 单测（P0b，design §6.1）：覆盖「备份→tmp/rename→回读→回滚」四态。
// 用真实临时目录 + 注入 fs/path/now 做确定性验证；失败/回滚用例用 fakeFs 注入抛错或伪造回读。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const sw = await import('../safeWriteFile.js')
const { safeWriteFile, safeWriteFileSync, countNodes, tsLabel, _writeCore } = sw

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'safewrite-'))
}

// 一份合法的 smm 容器（cross-sheet 节点树），便于 node-count 校验。
function smmContent(nodesPerSheet) {
  const sheet = { id: 's1', data: { root: { data: {}, children: [] } } }
  let counter = 0
  const add = (parent, depth) => {
    if (depth <= 0) return
    for (let i = 0; i < nodesPerSheet; i++) {
      const node = { data: { t: 'n' + counter++ }, children: [] }
      parent.children.push(node)
      add(node, depth - 1)
    }
  }
  add(sheet.data.root, 1)
  return JSON.stringify({ app: 'smm-multisheet', version: 1, activeId: 's1', sheets: [sheet] })
}

// 用真实 fs + 覆写后的读回，构造“回读内容被篡改”的 fakeFs（其余方法走真实原型）
function fakeFsWithReadback(readbackText) {
  const f = Object.create(fs)
  f.readFileSync = () => readbackText
  return f
}

test('countNodes 跨 sheet 求和', () => {
  const container = {
    app: 'smm-multisheet',
    sheets: [
      { data: { root: { children: [{}, {}] } } }, // root+2 = 3
      { data: { root: { children: [{}] } } }      // root+1 = 2
    ]
  }
  assert.equal(countNodes(container), 5)
  assert.equal(countNodes({}), 0)
  assert.equal(countNodes(null), 0)
})

test('tsLabel 含毫秒、格式 YYYYMMDD_HHMMSSmmm', () => {
  const ms = new Date(2026, 9, 14, 8, 5, 3, 427).getTime()
  const label = tsLabel(ms)
  assert.match(label, /^\d{8}_\d{9}$/)
  assert.equal(label, '20261014_080503427')
})

test('已存在文件：原子写成功 + 生成 .bak + 内容生效', async () => {
  const dir = tmpDir()
  const fp = path.join(dir, 'a.smm')
  fs.writeFileSync(fp, smmContent(2), 'utf8') // 预置旧内容
  const newContent = smmContent(3)
  const r = await safeWriteFile(null, { filePath: fp, content: newContent })
  assert.equal(r.ok, true)
  assert.ok(r.bakPath, '应生成 .bak 回滚点')
  assert.ok(/\.bak\.\d{8}_\d{9}$/.test(r.bakPath))
  assert.equal(fs.readFileSync(fp, 'utf8'), newContent, '文件内容应为新内容')
  assert.equal(fs.readFileSync(r.bakPath, 'utf8'), smmContent(2), '.bak 应为旧内容')
  assert.equal(r.nodeCount, countNodes(JSON.parse(newContent)))
})

test('首次保存（目标不存在）：跳过备份、bakPath 为 null', async () => {
  const dir = tmpDir()
  const fp = path.join(dir, 'new.smm')
  const newContent = smmContent(1)
  const r = await safeWriteFile(null, { filePath: fp, content: newContent })
  assert.equal(r.ok, true)
  assert.equal(r.bakPath, null, '无旧文件不应产生 .bak')
  assert.equal(fs.readFileSync(fp, 'utf8'), newContent)
})

test('非 smm 文本回读不一致 → 失败 + 回滚到旧文件', async () => {
  const dir = tmpDir()
  const fp = path.join(dir, 'a.md')
  fs.writeFileSync(fp, 'OLD', 'utf8')
  // 注入：写盘实际成功，但回读被篡改为不一致内容 → 触发回滚
  const fakeFs = fakeFsWithReadback('TAMPERED')
  const r = await safeWriteFile({ fs: fakeFs }, { filePath: fp, content: 'NEW' })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'E_RESTORE_MISMATCH')
  assert.equal(r.rolledBack, true)
  assert.equal(fs.readFileSync(fp, 'utf8'), 'OLD', '回滚后应为旧内容')
})

test('smm 回读 JSON 解析失败 → 失败 + 回滚', async () => {
  const dir = tmpDir()
  const fp = path.join(dir, 'a.smm')
  fs.writeFileSync(fp, smmContent(1), 'utf8')
  const fakeFs = fakeFsWithReadback('not-json{')
  const r = await safeWriteFile({ fs: fakeFs }, { filePath: fp, content: smmContent(2) })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'E_RESTORE_PARSE')
  assert.equal(r.rolledBack, true)
  assert.equal(fs.readFileSync(fp, 'utf8'), smmContent(1), '回滚到旧内容')
})

test('smm 回读节点数不匹配 → 失败 + 回滚（挡住“内容乱但长度对”）', async () => {
  const dir = tmpDir()
  const fp = path.join(dir, 'a.smm')
  fs.writeFileSync(fp, smmContent(2), 'utf8')
  // 回读返回一份合法 smm，但节点数比写入前少 1 → 校验失败
  const good = JSON.parse(smmContent(2))
  const fewer = JSON.parse(smmContent(1))
  fewer.app = 'smm-multisheet'
  const fakeFs = fakeFsWithReadback(JSON.stringify(fewer))
  const r = await safeWriteFile({ fs: fakeFs }, { filePath: fp, content: smmContent(2) })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'E_RESTORE_NODECOUNT')
  assert.equal(r.rolledBack, true)
})

test('回读缺少 magic → 失败 + 回滚', async () => {
  const dir = tmpDir()
  const fp = path.join(dir, 'a.smm')
  fs.writeFileSync(fp, smmContent(1), 'utf8')
  const fakeFs = fakeFsWithReadback(JSON.stringify({ app: 'other', sheets: [] }))
  const r = await safeWriteFile({ fs: fakeFs }, { filePath: fp, content: smmContent(1) })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'E_RESTORE_MAGIC')
})

test('tmp 写盘抛错 → E_WRITE + 原文件完好（rolledBack=true）', async () => {
  const dir = tmpDir()
  const fp = path.join(dir, 'a.smm')
  fs.writeFileSync(fp, smmContent(1), 'utf8')
  const fakeFs = Object.create(fs)
  fakeFs.writeFileSync = () => { throw new Error('disk full (simulated)') }
  const r = await safeWriteFile({ fs: fakeFs }, { filePath: fp, content: smmContent(2) })
  assert.equal(r.ok, false)
  assert.equal(r.code, 'E_WRITE')
  assert.equal(r.rolledBack, true)
  assert.equal(fs.readFileSync(fp, 'utf8'), smmContent(1), '原文件未被破坏')
})

test('FIFO 裁剪：保留最近 5 份 .bak', async () => {
  const dir = tmpDir()
  const fp = path.join(dir, 'a.smm')
  let clock = 1_700_000_000_000
  for (let i = 0; i < 7; i++) {
    if (i === 0) fs.writeFileSync(fp, smmContent(1), 'utf8') // 预置旧内容（第 1 次才有“已存在”可备份）
    const r = await safeWriteFile({ now: () => clock + i * 1000 }, { filePath: fp, content: smmContent(1 + (i % 2)) })
    assert.equal(r.ok, true)
  }
  const baks = fs.readdirSync(dir).filter(n => n.startsWith('a.smm.bak.'))
  assert.equal(baks.length, 5, '最多保留 5 份')
})

test('safeWriteFileSync 同步返回结果对象（非 Promise）', () => {
  const dir = tmpDir()
  const fp = path.join(dir, 'a.md')
  fs.writeFileSync(fp, 'OLD', 'utf8')
  const r = safeWriteFileSync(null, { filePath: fp, content: 'NEW' })
  assert.equal(typeof r, 'object')
  assert.equal(r.ok, true)
  assert.equal(fs.readFileSync(fp, 'utf8'), 'NEW')
})

test('safeWriteFile 返回 Promise（异步通道可 await）', async () => {
  const dir = tmpDir()
  const fp = path.join(dir, 'a.md')
  fs.writeFileSync(fp, 'OLD', 'utf8')
  const p = safeWriteFile(null, { filePath: fp, content: 'NEW' })
  assert.ok(p instanceof Promise)
  const r = await p
  assert.equal(r.ok, true)
})

test('损坏文件回滚后旧文件字节完好（硬伤D：覆盖瞬间不凭空消失）', async () => {
  const dir = tmpDir()
  const fp = path.join(dir, 'a.smm')
  const original = smmContent(4)
  fs.writeFileSync(fp, original, 'utf8')
  // 模拟“写盘成功但回读校验失败”→ 必须能从 .bak 还原出与 original 逐字节相同的文件
  const fakeFs = fakeFsWithReadback('GARBAGE')
  const r = await safeWriteFile({ fs: fakeFs }, { filePath: fp, content: smmContent(5) })
  assert.equal(r.ok, false)
  assert.equal(fs.readFileSync(fp, 'utf8'), original, '回滚还原后与原文件逐字节一致')
})
