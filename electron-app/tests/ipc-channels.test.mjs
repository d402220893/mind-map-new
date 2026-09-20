// 守门：详设 §7.2 的 13 个 IPC 通道必须"主进程有 handler + preload 有暴露 + fsApi 有调用点"三处齐备。
// 用源码文本断言（不依赖 asar 构建产物），避免构建漂移导致误报。
import { test } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mainSrc = fs.readFileSync(path.join(root, 'main.js'), 'utf8')
const preloadSrc = fs.readFileSync(path.join(root, 'preload.js'), 'utf8')
const fsApiSrc = fs.readFileSync(path.join(root, '..', 'web', 'src', 'services', 'io', 'fsApi.js'), 'utf8')

const CHANNELS = [
  'smm:pick-directory', 'smm:read-tree', 'smm:stat-many', 'smm:read-text',
  'smm:write-text', 'smm:write-binary', 'smm:mkdirp', 'smm:move', 'smm:trash',
  'smm:watch', 'smm:unwatch', 'smm:open-external', 'smm:reveal-in-folder'
]

for (const ch of CHANNELS) {
  test(`${ch}：main.js 有 ipcMain.handle`, () => {
    assert.ok(mainSrc.includes(`ipcMain.handle('${ch}'`), `main.js 缺少 ${ch} 的 handler`)
  })
  test(`${ch}：preload.js 已暴露`, () => {
    assert.ok(preloadSrc.includes(`'${ch}'`), `preload.js 未转发 ${ch}`)
  })
}

test('通道总数 = 13（§7.2 表）', () => {
  assert.strictEqual(CHANNELS.length, 13)
})

test('fs:event 推送使用 smm:fs-event 且合并窗口 400ms', () => {
  assert.ok(mainSrc.includes("'smm:fs-event'"), '主进程未推送 smm:fs-event')
  assert.ok(/setTimeout\(flush,\s*400\)/.test(mainSrc), '缺少 400ms 合并窗口')
})

test('watch 替换前先 close 旧 watcher（同时只保留一个 root）', () => {
  assert.ok(/if\s*\(fsWatcher\)\s*\{\s*try\s*\{\s*fsWatcher\.close\(\)/.test(mainSrc))
})

test('trash 走 shell.trashItem，禁止 fs.rm', () => {
  assert.ok(mainSrc.includes('shell.trashItem'), '未使用 shell.trashItem')
  assert.ok(!/fs\.rmSync|fs\.rm\(/.test(mainSrc), '禁止 fs.rm（必须进回收站）')
})

test('trash 一次最多 20 条', () => {
  assert.ok(/TRASH_BATCH\s*=\s*20/.test(mainSrc))
  assert.ok(/slice\(0,\s*TRASH_BATCH\)/.test(mainSrc))
})

test('open-external 白名单：只放行 http/https/mailto/file，其余拒绝', () => {
  assert.ok(/https\?:|mailto:/.test(mainSrc), '缺少 http/mailto 白名单')
  assert.ok(mainSrc.includes('E_PATH_ESCAPE'), '缺少越界拦截码')
  assert.ok(mainSrc.includes('E_BAD_URL'), '缺少非法 scheme 拦截码')
})

test('read-text 有 8MB 上限且超限返回 E_TOO_LARGE', () => {
  assert.ok(/MAX_TEXT_BYTES\s*=\s*8\s*\*\s*1024\s*\*\s*1024/.test(mainSrc))
  assert.ok(mainSrc.includes("code: 'E_TOO_LARGE'"))
})

test('write-binary 有 10MB 上限', () => {
  assert.ok(/MAX_BINARY_BYTES\s*=\s*10\s*\*\s*1024\s*\*\s*1024/.test(mainSrc))
})

test('read-tree 默认忽略 node_modules/.git/.mindlink', () => {
  assert.ok(/DEFAULT_IGNORE\s*=\s*\[[^\]]*node_modules[^\]]*\.git[^\]]*\.mindlink/.test(mainSrc))
})

test('write-text 的 expectMtimeMs 不匹配只告警（written:true 表示盘已写）', () => {
  assert.ok(mainSrc.includes('E_MTIME_CHANGED'))
  assert.ok(/code:\s*'E_MTIME_CHANGED'[\s\S]{0,80}written:\s*true/.test(mainSrc))
})

test('fsApi 已改接新通道（readText/writeText/statMany）', () => {
  assert.ok(fsApiSrc.includes('a.readText'), 'fsApi 未使用 smm:read-text')
  assert.ok(fsApiSrc.includes('a.writeText'), 'fsApi 未使用 smm:write-text')
  assert.ok(fsApiSrc.includes('a.statMany'), 'fsApi 未使用 smm:stat-many')
})

test('fsApi 保留旧通道回退（老包体可启动）', () => {
  assert.ok(fsApiSrc.includes('a.readFile'), '缺少旧 readFile 回退')
  assert.ok(fsApiSrc.includes('a.writeFile'), '缺少旧 writeFile 回退')
})

test('回声抑制登记点仍在 fsApi.writeText/writeBinary 内（唯一登记点）', () => {
  const wt = fsApiSrc.slice(fsApiSrc.indexOf('async function writeText'), fsApiSrc.indexOf('async function writeBinary'))
  assert.ok(wt.includes('reg.register'), 'writeText 未登记抑制')
  const wb = fsApiSrc.slice(fsApiSrc.indexOf('async function writeBinary'), fsApiSrc.indexOf('async function exists'))
  assert.ok(wb.includes('reg.register'), 'writeBinary 未登记抑制')
})

test('preload 暴露 onFsEvent 供渲染进程订阅', () => {
  assert.ok(preloadSrc.includes('onFsEvent'))
  assert.ok(preloadSrc.includes("ipcRenderer.on('smm:fs-event'"))
})
