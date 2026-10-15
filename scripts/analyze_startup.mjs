import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

const BASE = 'E:/03_学习文件/mind-map-main'
const roots = [process.env.APPDATA, process.env.LOCALAPPDATA].filter(Boolean)

function findRendererLog() {
  const cands = []
  for (const r of roots) {
    try {
      for (const d of readdirSync(r)) {
        const p = join(r, d, 'renderer.log')
        if (existsSync(p)) cands.push(p)
      }
    } catch {}
  }
  return cands[0] || null
}

const files = readdirSync(BASE).filter(f => /^startup_main_\d+\.log$/.test(f)).sort()

function parseMain(f) {
  const lines = readFileSync(join(BASE, f), 'utf8').split('\n').filter(Boolean)
  let t0 = null
  const marks = []
  for (const l of lines) {
    const [label, val] = l.split(' ')
    if (label === 'process_start') t0 = Number(val)
    else marks.push({ label, ms: Number(val) })
  }
  return { t0, marks }
}

function get(ms, label) {
  const m = ms.find(x => x.label === label)
  return m ? m.ms : null
}

// 主进程时间线
const rounds = []
for (const f of files) {
  const { t0, marks } = parseMain(f)
  if (t0 == null) continue
  rounds.push({ f, t0, marks })
  console.log(`\n===== ${f} (process_start=${t0}) =====`)
  for (const m of marks) console.log(`  ${String(m.ms).padStart(8)}ms  ${m.label}`)
  const appReady = get(marks, 'app_ready')
  const dfl = get(marks, 'did_finish_load')
  const rts = get(marks, 'ready_to_show')
  const editReady = get(marks, 'edit_ready')
  if (appReady != null && dfl != null)
    console.log(`  >> 主进程启动→渲染进程加载JS bundle+解析: ${dfl - appReady}ms`)
  if (dfl != null && editReady != null)
    console.log(`  >> 渲染端init+画布构造+插件: ${editReady - dfl}ms`)
  if (editReady != null && appReady != null)
    console.log(`  >> 总启动(process_start→画布构造完): ${editReady - appReady + (appReady - 0)}ms? (见下)`)
}

// 渲染端 [PERF]（来自 renderer.log，主进程 console-message 落盘）
const rlPath = findRendererLog()
console.log('\n### renderer.log 路径:', rlPath || '(未找到)')
if (rlPath) {
  const rl = readFileSync(rlPath, 'utf8')
  const events = []
  for (const l of rl.split('\n')) {
    const idx = l.indexOf('[PERF]')
    if (idx < 0) continue
    const tail = l.slice(idx + 6).trim().split(' ')
    const name = tail[0]
    const ts = Number(tail[1])
    const extra = tail.slice(2).join(' ')
    if (!isNaN(ts)) events.push({ name, ts, extra })
  }
  for (const r of rounds) {
    const inWin = events.filter(e => e.ts >= r.t0 && e.ts <= r.t0 + 60000)
    if (!inWin.length) continue
    console.log(`\n----- ${r.f} 渲染端 [PERF] (窗口内 ${inWin.length} 条) -----`)
    for (const e of inWin.sort((a, b) => a.ts - b.ts))
      console.log(`  ${String(e.ts - r.t0).padStart(8)}ms  ${e.name} ${e.extra}`)
  }
}
