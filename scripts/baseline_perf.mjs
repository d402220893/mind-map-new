// P0 度量基建：新口径基线采集 + 聚合（方案《启动性能优化方案》§6.0-3 / §6.1）
// 流程：启动部署版 exe（STARTUP_LOG 逐轮独立）→ 等 30s → 优雅关闭 → 5s 后强杀兜底 → 下一轮
// 统计：第 1 轮 = cold（单列）；第 2..N 轮 = hot（主指标 = edit_ready_loaded hot 中位）。
// failed 轮（perf edit_ready_loaded ... failed）单列：不入中位/不入 p90，只报 failed 数（§6.1）。
// 产出：boot-timeline.json（P-UX §10.2 时间轴变量来源 + §16 附录回填数据）。
// 用法：node scripts/baseline_perf.mjs [轮数=20]
import { spawn, execSync } from 'node:child_process'
import { writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const EXE = 'D:/Program Files (x86)/思绪思维导图/mind-map/思绪思维导图.exe'
const BASE = 'E:/03_学习文件/mind-map-main'
const ROUNDS = Number(process.argv[2] || process.env.ROUNDS || 20)
const WAIT_OPEN_MS = 30000
const WAIT_CLOSE_MS = 5000

const log = m => console.log(`[baseline] ${new Date().toISOString()} ${m}`)

function killExe(force) {
  try {
    execSync(`taskkill ${force ? '/F' : ''} /IM "思绪思维导图.exe"`, { stdio: 'ignore' })
  } catch (e) {}
}

function parseRound(file) {
  if (!existsSync(file)) return null
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
  const m = {}
  let t0 = null
  for (const l of lines) {
    const parts = l.split(' ')
    if (parts[0] === 'process_start') { t0 = Number(parts[1]); continue }
    if (parts[0] === 'perf') {
      // perf <name> <delta> [extra]
      m['perf_' + parts[1]] = { delta: Number(parts[2]), extra: parts[3] || '' }
      continue
    }
    if (parts.length === 2 && !Number.isNaN(Number(parts[1]))) m[parts[0]] = Number(parts[1])
  }
  if (t0 == null) return null
  const erl = m.perf_edit_ready_loaded
  return {
    appReady: m.app_ready,
    loadurl: m.loadurl_called,
    dfl: m.did_finish_load,
    editReadyOld: m.edit_ready,
    firstRenderDone: m.perf_first_render_done ? m.perf_first_render_done.delta : null,
    editReadyLoaded: erl ? erl.delta : null,
    loadPhase: erl ? erl.extra : '',
    t_jsload: m.app_ready != null && m.did_finish_load != null ? m.did_finish_load - m.app_ready : null
  }
}

function pct(sorted, p) {
  if (!sorted.length) return null
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

async function main() {
  log(`start: ${ROUNDS} rounds, wait=${WAIT_OPEN_MS}ms`)
  killExe(true)
  await sleep(1500)
  const rounds = []
  for (let i = 1; i <= ROUNDS; i++) {
    const logFile = `${BASE}/startup_baseline_${i}.log`
    try { rmSync(logFile, { force: true }) } catch (e) {}
    const env = { ...process.env, STARTUP_LOG: logFile }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.NODE_OPTIONS
    const t0 = Date.now()
    spawn(EXE, [], { env, detached: true, stdio: 'ignore' }).unref()
    await sleep(WAIT_OPEN_MS)
    killExe(false) // 优雅关闭（触发 syncSaveOnExit 正常路径）
    await sleep(WAIT_CLOSE_MS)
    killExe(true) // 兜底强杀
    await sleep(1000)
    const r = parseRound(logFile)
    rounds.push({ round: i, wallMs: Date.now() - t0, ...(r || { parseError: true }) })
    log(`round ${i}/${ROUNDS}: ${r ? `edit_ready_loaded=${r.editReadyLoaded}(${r.loadPhase||'?'}) old=${r.editReadyOld} t_jsload=${r.t_jsload}` : 'PARSE FAIL'}`)
  }

  const ok = rounds.filter(r => !r.parseError)
  const failed = ok.filter(r => r.loadPhase === 'failed')
  const hot = ok.filter(r => r.round >= 2 && r.loadPhase !== 'failed')
  const cold = ok.filter(r => r.round === 1 && r.loadPhase !== 'failed')
  const statOf = (arr, key) => {
    const v = arr.map(r => r[key]).filter(x => Number.isFinite(x)).sort((a, b) => a - b)
    if (!v.length) return null
    return { n: v.length, p50: v[Math.floor(v.length / 2)], p90: pct(v, 0.9), min: v[0], max: v[v.length - 1] }
  }
  const out = {
    generatedAt: new Date().toISOString(),
    exe: EXE,
    roundsRequested: ROUNDS,
    roundsParsed: ok.length,
    failedRounds: failed.map(r => r.round),
    hot: {
      editReadyLoaded: statOf(hot, 'editReadyLoaded'),
      editReadyOld: statOf(hot, 'editReadyOld'),
      t_jsload: statOf(hot, 't_jsload')
    },
    cold: {
      editReadyLoaded: statOf(cold, 'editReadyLoaded'),
      editReadyOld: statOf(cold, 'editReadyOld')
    },
    perRound: rounds
  }
  writeFileSync(`${BASE}/boot-timeline.json`, JSON.stringify(out, null, 1))
  writeFileSync(`${BASE}/baseline_perf.log`, JSON.stringify(out, null, 1))
  log(`DONE. hot edit_ready_loaded p50=${out.hot.editReadyLoaded && out.hot.editReadyLoaded.p50} p90=${out.hot.editReadyLoaded && out.hot.editReadyLoaded.p90} failed=${out.failedRounds.length}`)
  console.log(JSON.stringify(out.hot, null, 1))
  process.exit(0)
}

main().catch(e => { console.error('[baseline] FATAL', e); process.exit(1) })
