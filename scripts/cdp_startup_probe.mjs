// CDP 启动耗时探测·简化版（零依赖，纯观测）
// 只采集 navigation + resource timing，不用 Profiler（疑似卡死源）
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const EXE = 'D:/Program Files (x86)/思绪思维导图/mind-map/思绪思维导图.exe'
const PORT = 9223
const OUT = process.argv[2] || 'C:/Users/d36847/AppData/Local/Temp/cdp_res.json'
const WAIT_AFTER_ATTACH_MS = 12000

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.NODE_OPTIONS
env.STARTUP_LOG = 'E:/03_学习文件/mind-map-main/startup_cdp.log'
const proc = spawn(EXE, [`--remote-debugging-port=${PORT}`], { env, detached: true, stdio: 'ignore' })
console.log('exe spawned pid=', proc.pid)

let target = null
for (let i = 0; i < 100; i++) {
  await sleep(200)
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
    const list = await res.json()
    const pages = list.filter(t => t.type === 'page')
    const idx = pages.find(t => /index\.html/.test(t.url))
    target = idx || pages[0] || null
    if (idx) break
  } catch {}
}
if (!target) { console.error('NO TARGET'); process.exit(1) }
console.log('target:', target.url)

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

let msgId = 0
const pending = new Map()
ws.onmessage = ev => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
function send(method, params = {}) {
  const id = ++msgId
  return new Promise(res => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params })) })
}

await send('Runtime.enable')
await send('Performance.enable')
// 注册 buffered longtask 观察器：可回溯抓到 attach 之前已发生的 >50ms 主线程长任务
await send('Runtime.evaluate', { expression: `window.__lt=[]; new PerformanceObserver(l=>{for(const e of l.getEntries()) window.__lt.push({s:Math.round(e.startTime),d:Math.round(e.duration)})}).observe({type:'longtask',buffered:true})`, returnByValue: true })
await sleep(WAIT_AFTER_ATTACH_MS)

const nav = await send('Runtime.evaluate', { expression: 'JSON.stringify(performance.getEntriesByType("navigation"))', returnByValue: true })
const res_ = await send('Runtime.evaluate', { expression: `JSON.stringify(performance.getEntriesByType("resource").map(e=>({n:e.name.split('/').pop(),dur:Math.round(e.duration),start:Math.round(e.startTime),respEnd:Math.round(e.responseEnd),size:e.encodedBodySize||e.transferSize})))`, returnByValue: true })
const paint = await send('Runtime.evaluate', { expression: `JSON.stringify(performance.getEntriesByType("paint").map(e=>({n:e.name,t:Math.round(e.startTime)})))`, returnByValue: true })
const ready = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true })
const lt = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__lt||[])', returnByValue: true })
const metrics = await send('Performance.getMetrics')
const nowMs = await send('Runtime.evaluate', { expression: 'JSON.stringify({now:Math.round(performance.now())})', returnByValue: true })

writeFileSync(OUT, JSON.stringify({
  navigation: JSON.parse(nav.result?.result?.value || '[]'),
  resources: JSON.parse(res_.result?.result?.value || '[]'),
  paint: JSON.parse(paint.result?.result?.value || '[]'),
  readyState: ready.result?.result?.value,
  longtasks: JSON.parse(lt.result?.result?.value || '[]'),
  metrics: metrics.result?.metrics?.filter(m => /Duration|Count/.test(m.name)),
  clock: JSON.parse(nowMs.result?.result?.value || '{}')
}, null, 1))
console.log('saved to', OUT)

spawn('taskkill', ['/IM', '思绪思维导图.exe'], { shell: true, stdio: 'ignore' })
await sleep(3000)
spawn('taskkill', ['/F', '/IM', '思绪思维导图.exe'], { shell: true, stdio: 'ignore' })
process.exit(0)
