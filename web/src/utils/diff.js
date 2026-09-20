// 逐行 diff（LCS 动态规划）+ 三路合并初值。纯函数、零依赖、可在 Node 下单测。
// 输出供 ConflictDialog 渲染：type ∈ 'same' | 'add' | 'del' | 'mod'。

/**
 * @returns { mine: [{type,text}], current: [{type,text}], merged: string }
 */
export function diffLines(mineText, currentText) {
  const a = splitLines(mineText)
  const b = splitLines(currentText)
  const table = lcsTable(a, b)
  const ops = backtrack(a, b, table)

  const mine = []
  const current = []
  const merged = []

  for (const op of ops) {
    if (op.kind === 'same') {
      mine.push({ type: 'same', text: a[op.i] })
      current.push({ type: 'same', text: b[op.j] })
      merged.push(a[op.i])
      continue
    }
    if (op.kind === 'del') {
      mine.push({ type: 'del', text: a[op.i] })
      merged.push(a[op.i]) // 左优先：删/改先采用"你的修改"
      continue
    }
    if (op.kind === 'add') {
      current.push({ type: 'add', text: b[op.j] })
      merged.push(b[op.j])
      continue
    }
    // mod：一侧删除 + 一侧新增配对 → 标为"修改行"
    mine.push({ type: 'mod', text: op.a })
    current.push({ type: 'mod', text: op.b })
    merged.push(op.a)
  }
  return { mine, current, merged: merged.join('\n') }
}

export function splitLines(text) {
  if (text == null || text === '') return []
  return String(text).replace(/\r\n/g, '\n').split('\n')
}

/** 把 del/add 相邻对折叠为 mod（同一行被改动而非纯增删） */
function pairModifications(ops) {
  const out = []
  let k = 0
  while (k < ops.length) {
    const op = ops[k]
    if (op.kind === 'del') {
      const dels = []
      let j = k
      while (j < ops.length && ops[j].kind === 'del') {
        dels.push(ops[j])
        j++
      }
      const adds = []
      while (j < ops.length && ops[j].kind === 'add') {
        adds.push(ops[j])
        j++
      }
      const n = Math.min(dels.length, adds.length)
      for (let x = 0; x < n; x++) {
        out.push({ kind: 'mod', a: dels[x].text, b: adds[x].text, i: dels[x].i, j: adds[x].j })
      }
      for (let x = n; x < dels.length; x++) out.push(dels[x])
      for (let x = n; x < adds.length; x++) out.push(adds[x])
      k = j
      continue
    }
    out.push(op)
    k++
  }
  return out
}

function lcsTable(a, b) {
  // table[i][j] = a[i..] 与 b[j..] 的最长公共子序列长度
  const n = a.length
  const m = b.length
  const table = new Array(n + 1)
  for (let i = 0; i <= n; i++) table[i] = new Uint32Array(m + 1)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  return table
}

function backtrack(a, b, table) {
  const ops = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'same', i, j, text: a[i] })
      i++
      j++
      continue
    }
    if (table[i + 1][j] >= table[i][j + 1]) {
      ops.push({ kind: 'del', i, text: a[i] })
      i++
      continue
    }
    ops.push({ kind: 'add', j, text: b[j] })
    j++
  }
  while (i < a.length) {
    ops.push({ kind: 'del', i, text: a[i] })
    i++
  }
  while (j < b.length) {
    ops.push({ kind: 'add', j, text: b[j] })
    j++
  }
  return pairModifications(ops)
}
