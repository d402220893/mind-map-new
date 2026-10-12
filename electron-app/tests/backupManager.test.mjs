// backupManager 单测：覆盖分层快照、哈希去重、轮转清理、失败日志、退出前兜底。
// 用真实临时目录 + 注入 now 做确定性边界验证；失败日志用例注入会抛错的 fs。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const bk = await import('../backupManager.js')
const { createBackupManager } = bk

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bktest-'))
}

// 本地时间构造（与模块内 bucketStart 的本地日界逻辑一致）
function localMs(y, mo, d, h, mi, s) {
  return new Date(y, mo - 1, d, h, mi, s || 0, 0).getTime()
}

function sha1(s) {
  return crypto.createHash('sha1').update(Buffer.from(s, 'utf8')).digest('hex')
}

function keyOf(m, filePath) {
  return sha1(path.resolve(filePath))
}

test('首次写入不置修改标志、不触发快照', () => {
  const br = tmpRoot()
  const src = tmpRoot()
  const m = createBackupManager({ now: () => localMs(2026, 10, 12, 10, 5, 0) })
  m.init({ backupRoot: br })
  const fp = path.join(src, 'a.smm')
  const r = m.notifyWrite(fp, 'hello')
  assert.equal(r.changed, false)
  assert.equal(r.firstSeen, true)
  assert.equal(m._state().files[keyOf(m, fp)].flags.m30, false)
})

test('内容相同则跳过（不置修改标志）', () => {
  const br = tmpRoot()
  const src = tmpRoot()
  const m = createBackupManager({ now: () => localMs(2026, 10, 12, 10, 5, 0) })
  m.init({ backupRoot: br })
  const fp = path.join(src, 'a.smm')
  m.notifyWrite(fp, 'v1')
  const r = m.notifyWrite(fp, 'v1')
  assert.equal(r.changed, false)
  assert.equal(m._state().files[keyOf(m, fp)].flags.m30, false)
})

test('内容变化才置修改标志，且三层都置位', () => {
  const br = tmpRoot()
  const src = tmpRoot()
  const m = createBackupManager({ now: () => localMs(2026, 10, 12, 10, 5, 0) })
  m.init({ backupRoot: br })
  const fp = path.join(src, 'a.smm')
  m.notifyWrite(fp, 'v1')
  const r = m.notifyWrite(fp, 'v2')
  assert.equal(r.changed, true)
  const f = m._state().files[keyOf(m, fp)]
  assert.equal(f.flags.m30, true)
  assert.equal(f.flags.m6h, true)
  assert.equal(f.flags.mday, true)
})

test('tick 到点才生成快照；窗口内多次修改只留最后一份', () => {
  const br = tmpRoot()
  const src = tmpRoot()
  const m = createBackupManager({ now: () => localMs(2026, 10, 12, 10, 5, 0) })
  m.init({ backupRoot: br })
  const fp = path.join(src, 'a.smm')
  // 同一 10 分钟窗口内连续修改 3 次
  m.notifyWrite(fp, 'v1')
  m.notifyWrite(fp, 'v2')
  m.notifyWrite(fp, 'v3')
  // 立即 tick（同桶）→ 不生成
  m.tick(localMs(2026, 10, 12, 10, 6, 0))
  assert.equal(m._state().files[keyOf(m, fp)].tiers['30min'].length, 0)
  // 跨到下一个 10 分钟桶（10:10）→ 仅在 30min 层生成 1 份（v3 的最新内容）
  fs.writeFileSync(fp, 'v3')
  m.tick(localMs(2026, 10, 12, 10, 11, 0))
  const t = m._state().files[keyOf(m, fp)].tiers['30min']
  assert.equal(t.length, 1)
  assert.equal(t[0].hash, sha1('v3'))
  // 6h / day 层尚未到整点/跨日 → 不生成
  assert.equal(m._state().files[keyOf(m, fp)].tiers['6h'].length, 0)
  assert.equal(m._state().files[keyOf(m, fp)].tiers['day'].length, 0)
})

test('30min 层最多保留 3 份（轮转删最旧）', () => {
  const br = tmpRoot()
  const src = tmpRoot()
  let clock = localMs(2026, 10, 12, 10, 5, 0)
  const m = createBackupManager({ now: () => clock })
  m.init({ backupRoot: br })
  const fp = path.join(src, 'a.smm')
  for (let i = 0; i < 5; i++) {
    clock = localMs(2026, 10, 12, 10, 5 + i * 10, 0)
    m.notifyWrite(fp, 'v' + i)
    fs.writeFileSync(fp, 'v' + i)
    m.tick(clock)
  }
  const t = m._state().files[keyOf(m, fp)].tiers['30min']
  assert.equal(t.length, 3)
  const hashes = t.map(e => e.hash)
  for (const v of ['v2', 'v3', 'v4']) assert.ok(hashes.includes(sha1(v)))
})

test('6h 层每小时生成、最多 6 份', () => {
  const br = tmpRoot()
  const src = tmpRoot()
  let clock = localMs(2026, 10, 12, 10, 5, 0)
  const m = createBackupManager({ now: () => clock })
  m.init({ backupRoot: br })
  const fp = path.join(src, 'a.smm')
  for (let h = 0; h < 8; h++) {
    clock = localMs(2026, 10, 12, 10 + h, 5, 0)
    m.notifyWrite(fp, 'h' + h)
    fs.writeFileSync(fp, 'h' + h)
    m.tick(clock)
  }
  assert.equal(m._state().files[keyOf(m, fp)].tiers['6h'].length, 6)
})

test('day 层每日生成、最多 7 份；超过 7 天轮转清理', () => {
  const br = tmpRoot()
  const src = tmpRoot()
  let clock = localMs(2026, 10, 12, 10, 5, 0)
  const m = createBackupManager({ now: () => clock })
  m.init({ backupRoot: br })
  const fp = path.join(src, 'a.smm')
  for (let d = 0; d < 9; d++) {
    clock = localMs(2026, 10, 12 + d, 10, 5, 0)
    m.notifyWrite(fp, 'd' + d)
    fs.writeFileSync(fp, 'd' + d)
    m.tick(clock)
  }
  assert.equal(m._state().files[keyOf(m, fp)].tiers['day'].length, 7)
})

test('无修改的窗口不生成快照', () => {
  const br = tmpRoot()
  const src = tmpRoot()
  const m = createBackupManager({ now: () => localMs(2026, 10, 12, 10, 5, 0) })
  m.init({ backupRoot: br })
  const fp = path.join(src, 'a.smm')
  m.notifyWrite(fp, 'only-once')
  m.tick(localMs(2026, 10, 12, 10, 11, 0))
  m.tick(localMs(2026, 10, 12, 11, 0, 0))
  assert.equal(m._state().files[keyOf(m, fp)].tiers['30min'].length, 0)
  assert.equal(m._state().files[keyOf(m, fp)].tiers['6h'].length, 0)
})

test('同层相邻快照内容相同则去重跳过（不写重复文件）', () => {
  const br = tmpRoot()
  const src = tmpRoot()
  let clock = localMs(2026, 10, 12, 10, 5, 0)
  const m = createBackupManager({ now: () => clock })
  m.init({ backupRoot: br })
  const fp = path.join(src, 'a.smm')
  // 先制造一份快照：same -> x(置flag) -> same(回写) ，tick 生成 same
  m.notifyWrite(fp, 'same')
  m.notifyWrite(fp, 'x')
  m.notifyWrite(fp, 'same')
  fs.writeFileSync(fp, 'same')
  m.tick(localMs(2026, 10, 12, 10, 11, 0))
  const key = keyOf(m, fp)
  const n1 = m._state().files[key].tiers['30min'].length
  assert.equal(n1, 1)
  // 再改回相同内容：diff -> same（与最近快照相同）→ tick 应去重跳过
  m.notifyWrite(fp, 'diff')
  m.notifyWrite(fp, 'same')
  fs.writeFileSync(fp, 'same')
  m.tick(localMs(2026, 10, 12, 10, 21, 0))
  const n2 = m._state().files[key].tiers['30min'].length
  assert.equal(n2, n1)
})

test('退出前 flushPending 兜底快照', () => {
  const br = tmpRoot()
  const src = tmpRoot()
  const m = createBackupManager({ now: () => localMs(2026, 10, 12, 10, 5, 0) })
  m.init({ backupRoot: br })
  const fp = path.join(src, 'a.smm')
  m.notifyWrite(fp, 'pending') // 首次不置 flag
  m.notifyWrite(fp, 'pendingX') // 真正修改 → 置 flag
  fs.writeFileSync(fp, 'pendingX')
  const r = m.flushPending(localMs(2026, 10, 12, 10, 6, 0))
  assert.ok(r.flushed >= 1)
  assert.ok(m._state().files[keyOf(m, fp)].tiers['30min'].length >= 1)
})

test('备份失败不静默：写盘抛错时记录 lastError', () => {
  const br = tmpRoot()
  const src = tmpRoot()
  // 注入一个 writeFileSync 会抛错的 fs（其余方法走真实 fs 原型）
  const fakeFs = Object.create(fs)
  fakeFs.writeFileSync = () => { throw new Error('disk full (simulated)') }
  const m = createBackupManager({ fs: fakeFs, now: () => localMs(2026, 10, 12, 10, 5, 0) })
  m.init({ backupRoot: br }) // init 内 persistMeta 写 meta 会抛 → 应被捕获并记录
  assert.ok(m.getStatus().lastError, 'init 阶段写失败应被记录，不得静默')
  assert.match(m.getStatus().lastError.message, /disk full/)
  const fp = path.join(src, 'a.smm')
  m.notifyWrite(fp, 'boom') // 再次触发写失败 → 仍记录
  assert.ok(m.getStatus().lastError)
})

test('非备份扩展名 / 备份目录自身 被跳过', () => {
  const br = tmpRoot()
  const src = tmpRoot()
  const m = createBackupManager({ now: () => localMs(2026, 10, 12, 10, 5, 0) })
  m.init({ backupRoot: br })
  const r1 = m.notifyWrite(path.join(src, 'img.png'), 'x')
  assert.equal(r1.skipped, true) // 非备份扩展名
  const r2 = m.notifyWrite(path.join(br, 'sub', 'a.smm'), 'x')
  assert.equal(r2.skipped, true) // 写在备份根目录内 → 自我递归跳过
  assert.equal(Object.keys(m._state().files).length, 0)
})

test('listBackups / restoreSnapshot 非破坏式恢复', () => {
  const br = tmpRoot()
  const src = tmpRoot()
  let clock = localMs(2026, 10, 12, 10, 5, 0)
  const m = createBackupManager({ now: () => clock })
  m.init({ backupRoot: br })
  const fp = path.join(src, 'a.smm')
  fs.writeFileSync(fp, 'data-v1')
  m.notifyWrite(fp, 'data-v1') // 首次写入不置 flag
  m.notifyWrite(fp, 'data-v2') // 真正修改 → 置 flag
  fs.writeFileSync(fp, 'data-v2')
  m.tick(clock + 11 * 60000)
  const list = m.listBackups(fp)
  assert.equal(list.length, 1)
  const restored = m.restoreSnapshot(fp, list[0].file)
  assert.equal(restored.ok, true)
  assert.notEqual(restored.restoredPath, fp) // 不覆盖原文件
  assert.equal(fs.readFileSync(restored.restoredPath, 'utf8'), 'data-v2')
})

test('打开即快照：snapshotNow 即时抓“修改前”好版本（不依赖修改标志/不读盘）', () => {
  const br = tmpRoot()
  const src = tmpRoot()
  const m = createBackupManager({ now: () => localMs(2026, 10, 12, 10, 5, 0) })
  m.init({ backupRoot: br })
  const fp = path.join(src, 'a.smm')
  // 打开瞬间捕获好版本：文件可能即将被覆写，直接传已读内容，不依赖磁盘
  const r = m.snapshotNow(fp, 'GOOD-VERSION')
  assert.equal(r.ok, true)
  const list = m.listBackups(fp)
  const inst = list.find(e => e.tier === 'instant')
  assert.ok(inst, 'instant 层应有快照')
  const restored = m.restoreSnapshot(fp, inst.file)
  assert.equal(fs.readFileSync(restored.restoredPath, 'utf8'), 'GOOD-VERSION')
})

test('instant 层独立于 30min 上限(3)，且超过 7 天被全局清理', () => {
  const br = tmpRoot()
  const src = tmpRoot()
  const m = createBackupManager({ now: () => localMs(2026, 10, 12, 10, 5, 0) })
  m.init({ backupRoot: br })
  const fp = path.join(src, 'a.smm')
  for (let i = 0; i < 5; i++) m.snapshotNow(fp, 'v' + i)
  const key = Object.keys(m._state().files)[0]
  assert.equal(m._state().files[key].tiers['instant'].length, 5) // 不受 30min 的 3 份上限限制
  // 跨过 7 天 → tick 的全局轮转清理 instant
  m.tick(localMs(2026, 10, 20, 10, 5, 0))
  assert.equal(m._state().files[key].tiers['instant'].length, 0)
})
