// §11.3 事件契约守卫（零运行，只读源码）。
// 两条硬约束：
//   1) services/** 里 emit 的事件名必须先在 events.js 声明（否则视图订阅不到 → 静默丢事件）；
//   2) 广播载荷**不得含 source/origin**（§7.8：回声抑制靠 suppressionRegistry，
//      载荷携带来源会让消费端拿"谁写的"做分支，等于把抑制逻辑又拉回业务层）。
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SERVICES = new URL('../../src/services/', import.meta.url)

function walk(dir) {
  const out = []
  const base = dir instanceof URL ? fileURLToPath(dir) : dir
  if (!existsSync(base)) return out
  for (const name of readdirSync(base)) {
    const p = resolve(base, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.js$/.test(name)) out.push(p)
  }
  return out
}

// 从 events.js 抽出 { EVT_KEY: 'event:value' } 映射
function declaredEvents() {
  const src = readFileSync(new URL('events.js', SERVICES), 'utf8')
  const map = new Map()
  const re = /^\s*([A-Z][A-Z0-9_]*)\s*:\s*'([^']+)'/gm
  let m
  while ((m = re.exec(src))) map.set(m[1], m[2])
  return map
}

test('① events.js 至少声明了 20 个事件（声明表未被误删）', () => {
  assert.ok(declaredEvents().size >= 20, '事件声明表疑似被删减，实际 ' + declaredEvents().size)
})

test('② services/** 里 emit(EVT.X) 的 X 必须全部已在 events.js 声明', () => {
  const decl = declaredEvents()
  const unknown = []
  for (const f of walk(SERVICES)) {
    const src = readFileSync(f, 'utf8')
    const re = /emit\(\s*EVT\.([A-Z][A-Z0-9_]*)/g
    let m
    while ((m = re.exec(src))) {
      if (!decl.has(m[1])) unknown.push(`${f.split(/[\\/]services[\\/]/)[1]}: EVT.${m[1]}`)
    }
  }
  assert.deepStrictEqual(unknown, [], '存在未声明的事件常量：' + unknown.join(', '))
})

test('③ services/** 不得用字符串字面量 emit 事件（必须走 EVT 常量）', () => {
  const offenders = []
  for (const f of walk(SERVICES)) {
    const src = readFileSync(f, 'utf8')
    // emit('xxx:yyy' 或 events.emit('xxx:yyy'
    if (/\bemit\(\s*'[a-z][a-z0-9]*(:[a-z][a-z0-9]*)+'/.test(src)) {
      offenders.push(f.split(/[\\/]services[\\/]/)[1])
    }
  }
  assert.deepStrictEqual(offenders, [], '应改用 EVT 常量：' + offenders.join(', '))
})

test('④ 广播载荷不得含 source / origin 字段（回声抑制不在业务层分支）', () => {
  const offenders = []
  for (const f of walk(SERVICES)) {
    const src = readFileSync(f, 'utf8')
    const re = /emit\([^;]*?\b(source|origin)\s*:/gs
    if (re.test(src)) offenders.push(f.split(/[\\/]services[\\/]/)[1])
  }
  assert.deepStrictEqual(offenders, [], '载荷禁带来源字段：' + offenders.join(', '))
})

test('⑤ forView（发给视图）的事件必须双向登记：events.js 与 workspaceBridge EVENT_MAP', () => {
  const bridge = readFileSync(new URL('../../src/utils/workspaceBridge.js', import.meta.url), 'utf8')
  // 视图只能听 $bus，服务层事件必须经 EVENT_MAP 转发；抽查几个关键事件
  for (const key of ['DOC_DIRTY', 'DOC_SAVED', 'INDEX_REBUILDING', 'LINK_MISSING']) {
    assert.ok(bridge.includes(`EVT.${key}`), `workspaceBridge 未转发 EVT.${key} → 视图收不到`)
  }
})
