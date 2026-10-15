// CDP 启动全程观测 v3（零依赖，纯观测，不改应用代码）
// 核心：Page.addScriptToEvaluateOnNewDocument 在导航 document start 注入观测器，
//       从第 0ms 记录 longtask + script 标签插入时机 + 导航事件，彻底消除 attach 时机偏差。
import { spawn } from 'node:child_process'
import { writeFileSync, appendFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const EXE = 'D:/Program Files (x86)/思绪思维导图/mind-map/思绪思维导图.exe'
const PORT = 9225
const OUT = process.argv[2] || 'C:/Users/d36847/AppData/Local/Temp/cdp_v3.json'
const LOG = 'E:/03_学习文件/mind-map-main/startup_cdp.log'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
delete env.NODE_OPTIONS
env.STARTUP_LOG = LOG
const t0Spawn = Date.now()
const proc = spawn(EXE, [`--remote-debugging-port=${PORT}`], { env, detached: true, stdio: 'ignore' })
const el = m => `[+${String(Date.now() - t0Spawn).padStart(6)}ms] ` + m
console.log(el('exe spawned pid=' + proc.pid))

// 尽早 attach（target 从 BrowserWindow 创建起就存在，此时导航可能还没开始）
let target = null
for (let i = 0; i < 200; i++) {
  await sleep(100)
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
    const pages = (await res.json()).filter(t => t.type === 'page')
    if (pages.length) { target = pages[0]; break }
  } catch {}
}
if (!target) { console.error('NO TARGET'); process.exit(1) }
console.log(el('attached target url=' + target.url))

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
console.log(el('ws open'))

let msgId = 0
const pending = new Map()
const navEvents = []
ws.onmessage = ev => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
  if (m.method === 'Page.frameNavigated') {
    const f = m.params.frame
    if (!f.parentId) navEvents.push({ at: Date.now() - t0Spawn, url: f.url.slice(-60), fragment: f.fragment || '' })
  }
}
function send(method, params = {}) {
  const id = ++msgId
  return new Promise(res => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params })) })
}

await send('Page.enable')
await send('Runtime.enable')
const INJECT = `;window.__marks=[['doc_start',0]];
try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__marks.push(['longtask',Math.round(e.startTime),Math.round(e.duration)])}).observe({type:'longtask',buffered:true})}catch(e){window.__marks.push(['lt_err',String(e).slice(0,80)])}
try{new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.tagName==='SCRIPT'&&n.src)window.__marks.push(['script_add',Math.round(performance.now()),(n.src||'').split('/').pop()])}).observe(document.documentElement||document,{childList:true,subtree:true})}catch(e){window.__marks.push(['mo_err',String(e).slice(0,80)])}`
await send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT })
console.log(el('injector registered'))

await sleep(16000)

const marks = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__marks||[])', returnByValue: true })
const nav = await send('Runtime.evaluate', { expression: 'JSON.stringify(performance.getEntriesByType("navigation"))', returnByValue: true })
const ready = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true })

let marksParsed = []
try { marksParsed = JSON.parse(marks.result?.result?.value || '[]') } catch {}
let navParsed = []
try { navParsed = JSON.parse(nav.result?.result?.value || '[]') } catch {}

writeFileSync(OUT, JSON.stringify({ marks: marksParsed, navigation: navParsed, readyState: ready.result?.result?.value, frameNavigated: navEvents, spawnToAttach: Date.now() - t0Spawn }, null, 1))
console.log(el('saved ' + OUT))
console.log('frameNavigated:', JSON.stringify(navEvents))

spawn('taskkill', ['/IM', '思绪思维导图.exe'], { shell: true, stdio: 'ignore' })
await sleep(3000)
spawn('taskkill', ['/F', '/IM', '思绪思维导图.exe'], { shell: true, stdio: 'ignore' })
process.exit(0)
