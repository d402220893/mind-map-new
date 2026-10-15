import { createHash } from 'node:crypto'
import { readFileSync, statSync, appendFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const EXE = 'D:/Program Files (x86)/思绪思维导图/mind-map/思绪思维导图.exe'
const FILES = [
  'E:/05_project/06_内存测试/01_doc/new.smm',
  'E:/05_project/06_内存测试/01_doc/内存测试.md',
  'E:/05_project/06_内存测试/01_doc/内存测试.smm'
]
const LOG = 'E:/03_学习文件/mind-map-main/open_close_test.log'
const MAX = 100
const WAIT_OPEN_MS = 30000
const WAIT_CLOSE_MS = 5000
// 断点续跑：START_ROUND>1 时从指定轮次继续，且不清空已有日志
const START_ROUND = Math.max(1, Number(process.env.START_ROUND || 1) | 0)

function sha(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex')
}
function snap() {
  return FILES.map(p => {
    const st = statSync(p)
    return { path: p, sha: sha(p), size: st.size, mtime: st.mtime.toISOString() }
  })
}
function same(a, b) {
  return a.length === b.length && a.every((x, i) => x.sha === b[i].sha)
}
function summary(list) {
  return list.map(x => `${x.size}:${x.sha.slice(0, 8)}`).join(' | ')
}
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`
  console.log(line)
  appendFileSync(LOG, line + '\n')
}

async function killApp() {
  // 先优雅关闭，触发 beforeunload / syncSaveOnExit
  try {
    spawn('taskkill', ['/IM', '思绪思维导图.exe'], { shell: true, stdio: 'ignore' })
  } catch {}
  await sleep(WAIT_CLOSE_MS)
  // 兜底强制杀
  try {
    spawn('taskkill', ['/F', '/IM', '思绪思维导图.exe'], { shell: true, stdio: 'ignore' })
  } catch {}
  await sleep(2000)
}

async function oneRound(n) {
  const before = snap()
  log(`round=${n} START  ${summary(before)}`)

  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.NODE_OPTIONS
  // 启动性能埋点：主进程把 process_start + 各 bootMark 写到独立文件，每轮一个
  env.STARTUP_LOG = `E:/03_学习文件/mind-map-main/startup_main_${n}.log`
  const proc = spawn(EXE, [], { env, detached: true, stdio: 'ignore' })

  await sleep(WAIT_OPEN_MS)
  const during = snap()
  if (!same(before, during)) {
    log(`round=${n} FAIL during-open`)
    log(`  BEFORE  ${JSON.stringify(before)}`)
    log(`  DURING  ${JSON.stringify(during)}`)
    await killApp()
    return false
  }

  await killApp()
  const after = snap()
  if (!same(before, after)) {
    log(`round=${n} FAIL after-close`)
    log(`  BEFORE  ${JSON.stringify(before)}`)
    log(`  AFTER   ${JSON.stringify(after)}`)
    return false
  }

  log(`round=${n} OK`)
  return true
}

;(async () => {
  if (START_ROUND > 1) {
    appendFileSync(LOG, `# RESUME from round ${START_ROUND} at ${new Date().toISOString()}\n`)
  } else {
    writeFileSync(LOG, `# open_close_test start ${new Date().toISOString()}\n# target: ${FILES.join(', ')}\n`, { flag: 'w' })
  }
  const base = snap()
  log(`BASELINE ${JSON.stringify(base)}`)
  for (let i = START_ROUND; i <= MAX; i++) {
    const ok = await oneRound(i)
    if (!ok) {
      log(`STOP at round ${i}`)
      process.exit(1)
    }
  }
  log(`ALL ${MAX} ROUNDS OK`)
})()
