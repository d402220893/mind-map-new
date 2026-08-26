// 导入 .emmx 文件（亿图脑图 MindMaster / MindManager 导出的思维导图）。
// .emmx 本质是一个 ZIP 压缩包，存在多套互不兼容的内部结构：
//   1) MindManager 标准版：document.xml 内含 <OneTopic><Topic>... 的 XML 树，可直接解析出完整层级。
//   2) 亿图脑图（MindMaster）/ 新版 MindManager 兼容版：话题内容序列化在 mmpage/page*.bin 的私有
//      二进制里。该二进制是「tag + varint」的对象流，每个话题对象包含：
//        · 对象自身 id      —— 对象头 `00 01 <varint id> 02 …`
//        · 文本            —— `06 01 01 <v1> 02 <v2> 04 01 02 <type> 04 <UTF-8 文本> 00 00 00 0a 7f`
//        · 父对象 id       —— 文本结束后的 tag 流中的 `08 <varint>`
//        · 子对象 id 列表   —— 同一 tag 流中的 `0e <count> <varint…>`（决定同级顺序）
//      因此可以直接依据「父指针 + 子列表」精确还原**任意深度**的层级，不再依赖类型字节猜层级。
import JSZip from 'jszip'

// ---------- 1. 标准 XML 解析（MindManager 标准版） ----------
function textOf(el) {
  const attr = el.getAttribute && el.getAttribute('Text')
  if (attr != null && attr !== '') return attr
  // 某些版本用 <Text> 子元素
  const t = el.getElementsByTagName ? el.getElementsByTagName('Text')[0] : null
  if (t && t.textContent) return t.textContent
  return ''
}

function noteOf(el) {
  const n = el.getElementsByTagName ? el.getElementsByTagName('Note')[0] : null
  return n && n.textContent ? n.textContent.trim() : ''
}

// 收集 el（话题节点）的直接子话题。
// 标准 MindManager XML 中，子话题可能是 el 的直接 <Topic> 子元素，
// 也可能被包在 <SubTopics> 容器里：OneTopic → Topic → SubTopics → Topic。
// 因此向下仅穿过 <SubTopics>（不穿过 <Topic>，否则会把孙辈误当子辈），
// 收集所有第一层 <Topic>。
function childTopics(el) {
  const result = []
  const visit = node => {
    const kids = node.children || []
    for (let i = 0; i < kids.length; i++) {
      const tag = (kids[i].tagName || '').toLowerCase()
      if (tag === 'topic') {
        result.push(kids[i])
      } else if (tag === 'subtopics') {
        visit(kids[i])
      }
    }
  }
  visit(el)
  return result
}

function buildTopic(el) {
  const text = (textOf(el) || '').trim()
  const node = { data: { text: text || ' ' } }
  const note = noteOf(el)
  if (note) node.data.note = note
  // 递归遍历所有直接子 <Topic>（含 <SubTopics> 内嵌套）
  const children = childTopics(el).map(buildTopic)
  if (children.length) node.children = children
  return node
}

function parseXmlTopics(xmlStr) {
  const doc = new DOMParser().parseFromString(xmlStr, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) return null
  const one = doc.getElementsByTagName('OneTopic')[0]
  const rootTopic = one || doc.getElementsByTagName('Topic')[0]
  if (!rootTopic) return null
  return buildTopic(rootTopic)
}

// ---------- 2. 私有二进制变体（亿图脑图 / MindManager 兼容版）----------
// 话题文本对象的结束串
const TOPIC_TERM = [0x00, 0x00, 0x00, 0x0a, 0x7f]
// 对象尾部结束串（父指针/子列表所在 tag 流之前）
const OBJ_TERM = [0x00, 0x00, 0x00, 0x0b, 0x7f]
const MAX_TEXT_BYTES = 4096 // 单个话题文本最大字节数（防跑飞）
const MAX_ID_LOOKBACK = 160 // 向前回溯查找对象 id 的最大字节数

// 读 varint（LEB128，小端 7bit）。返回 [值, 占用字节数]；失败返回 [null, 0]
function readVarint(b, p) {
  let r = 0
  let shift = 1
  let n = 0
  while (p + n < b.length && n < 5) {
    const c = b[p + n]
    r += (c & 0x7f) * shift
    n++
    if (!(c & 0x80)) return [r, n]
    shift *= 128
  }
  return [null, 0]
}

// 匹配话题文本对象（版本无关，全部按 varint 解析）：
//   06 01 | 01 <v1> | 02 <v2> | 04 01 | 02 <type> | 04 | <UTF-8 文本> 00 00 00 0a 7f
// 旧实现把 v1/v2/type 的字节写死成 9c/04、9d/04 等，只能匹配单一文件版本；
// 实测同一文件内 v1/v2 也会变化（如 a5 04 / a7 04），故必须按 varint 解析。
function matchTopicMark(b, i) {
  if (b[i] !== 0x06 || b[i + 1] !== 0x01) return null
  let p = i + 2
  if (b[p] !== 0x01) return null
  p++
  const [v1, l1] = readVarint(b, p)
  if (v1 == null) return null
  p += l1
  if (b[p] !== 0x02) return null
  p++
  const [v2, l2] = readVarint(b, p)
  if (v2 == null) return null
  p += l2
  if (b[p] !== 0x04 || b[p + 1] !== 0x01) return null
  p += 2
  if (b[p] !== 0x02) return null
  p++
  const [type, l3] = readVarint(b, p)
  if (type == null) return null
  p += l3
  if (b[p] !== 0x04) return null
  p++
  // 文本为 UTF-8，内部不含 0x00；第一个 0x00 处必须正好是结束串，否则判为误匹配
  const limit = Math.min(b.length - TOPIC_TERM.length, p + MAX_TEXT_BYTES)
  let e = p
  while (e <= limit && b[e] !== 0x00) e++
  if (e > limit) return null
  for (let k = 0; k < TOPIC_TERM.length; k++) {
    if (b[e + k] !== TOPIC_TERM[k]) return null
  }
  return { textStart: p, textEnd: e, type, end: e }
}

// 从话题 marker 向前回溯，找到所属对象的自身 id。
// 对象头形如：… 00 | 01 <varint id> | 02 <varint> …
function findOwnId(b, markIdx) {
  const lo = Math.max(0, markIdx - MAX_ID_LOOKBACK)
  for (let j = markIdx - 3; j >= lo; j--) {
    if (b[j] !== 0x00 || b[j + 1] !== 0x01) continue
    const [id, len] = readVarint(b, j + 2)
    if (id == null) continue
    if (b[j + 2 + len] !== 0x02) continue
    return id
  }
  return null
}

// 解析话题文本之后的 tag 流，取出父对象 id 与子对象 id 列表。
// 结构：<文本结束串> [<对象结束串>] 00* | 06 <v> 08 <parent> 09 <v> 0c <v> 0e <count> <ids…> …
function parseObjectTail(b, textEnd) {
  let p = textEnd + TOPIC_TERM.length
  let ok = true
  for (let k = 0; k < OBJ_TERM.length; k++) {
    if (b[p + k] !== OBJ_TERM[k]) {
      ok = false
      break
    }
  }
  if (ok) p += OBJ_TERM.length
  while (b[p] === 0x00) p++
  let parent = null
  const children = []
  let guard = 0
  while (p < b.length && guard++ < 64) {
    const tag = b[p]
    if (tag === 0x0e) {
      // 子对象列表：0e <count> <id…>
      const [cnt, cl] = readVarint(b, p + 1)
      if (cnt == null || cnt > 5000) break
      let q = p + 1 + cl
      for (let k = 0; k < cnt; k++) {
        const [v, vl] = readVarint(b, q)
        if (v == null) break
        children.push(v)
        q += vl
      }
      p = q
      continue
    }
    if (
      tag === 0x06 ||
      tag === 0x08 ||
      tag === 0x09 ||
      tag === 0x0c ||
      tag === 0x0f
    ) {
      const [v, vl] = readVarint(b, p + 1)
      if (v == null) break
      if (tag === 0x08) parent = v // 父对象 id
      p = p + 1 + vl
      continue
    }
    break
  }
  return { parent, children }
}

// 从 page*.bin 提取所有话题对象（含 id / parent / children / type / text）
function extractTopicObjects(bytes) {
  const dec = new TextDecoder('utf-8')
  const items = []
  const byId = new Map()
  for (let i = 0; i + 20 < bytes.length; i++) {
    if (bytes[i] !== 0x06) continue // 快速剪枝
    const m = matchTopicMark(bytes, i)
    if (!m) continue
    let text = ''
    try {
      text = dec.decode(bytes.subarray(m.textStart, m.textEnd))
    } catch (e) {
      text = ''
    }
    // 含替换字符说明不是合法 UTF-8 文本，判为误匹配
    if (text.indexOf('\ufffd') !== -1) continue
    if (text.length > 1000) continue
    const id = findOwnId(bytes, i)
    const tail = parseObjectTail(bytes, m.end)
    if (id != null && byId.has(id)) {
      // 同一对象的多段富文本 run，拼接
      const prev = byId.get(id)
      prev.text += text
    } else {
      const item = {
        id,
        parent: tail.parent,
        children: tail.children,
        type: m.type,
        text,
        kids: []
      }
      items.push(item)
      if (id != null) byId.set(id, item)
    }
    i = m.end + TOPIC_TERM.length - 1
  }
  return { items, byId }
}

// 依据父指针 + 子列表还原树（支持任意深度）
function buildTreeByLinks(items, byId) {
  let broken = 0
  const roots = []
  items.forEach(it => {
    const parent = it.parent != null ? byId.get(it.parent) : null
    if (parent && parent !== it) {
      parent.kids.push(it)
    } else {
      if (it.parent != null) broken++
      roots.push(it)
    }
  })
  // 防环：从各 root 出发做一次可达性检查，剔除未被访问到的（异常数据形成的环）
  const seen = new Set()
  const walk = list => {
    list.forEach(nd => {
      if (seen.has(nd)) return
      seen.add(nd)
      walk(nd.kids)
    })
  }
  walk(roots)
  if (seen.size !== items.length) {
    items.forEach(it => {
      if (!seen.has(it)) {
        it.kids = it.kids.filter(k => !seen.has(k))
        roots.push(it)
        walk([it])
      }
    })
  }
  // 按父对象的 children 列表顺序排列同级节点（更贴近原图显示顺序）
  items.forEach(it => {
    if (it.kids.length < 2 || !it.children.length) return
    const order = new Map()
    it.children.forEach((cid, idx) => order.set(cid, idx))
    it.kids.sort((a, b) => {
      const ka = order.has(a.id) ? order.get(a.id) : Number.MAX_SAFE_INTEGER
      const kb = order.has(b.id) ? order.get(b.id) : Number.MAX_SAFE_INTEGER
      return ka - kb
    })
  })
  return { roots, broken }
}

// 统计子树节点数，用于在多个顶层节点里挑主根
function countNodes(nd) {
  let n = 1
  nd.kids.forEach(k => {
    n += countNodes(k)
  })
  return n
}

// item 树 → simple-mind-map 数据结构
function toMindMapNode(it) {
  const node = { data: { text: (it.text || '').trim() || ' ' }, children: [] }
  node.children = it.kids.map(toMindMapNode)
  return node
}

// 兜底：旧的「先序 + 类型字节」启发式（仅当父指针完全不可用时使用）
function buildTreeByTypeHeuristic(items) {
  if (!items.length) return null
  const rank = {}
  let seq = 0
  const levels = items.map((nd, idx) => {
    if (!(nd.type in rank)) {
      rank[nd.type] = idx === 0 ? 0 : ++seq
    }
    return rank[nd.type]
  })
  let root = null
  const stack = []
  items.forEach((nd, idx) => {
    const node = { data: { text: (nd.text || '').trim() || ' ' }, children: [] }
    const lvl = levels[idx]
    if (lvl === 0 || root === null) {
      root = node
      stack.length = 0
      stack.push({ node, lvl })
    } else {
      while (stack.length && stack[stack.length - 1].lvl >= lvl) stack.pop()
      const parent = stack.length ? stack[stack.length - 1].node : root
      parent.children.push(node)
      stack.push({ node, lvl })
    }
  })
  return root
}

// 占位空白页判定：所有节点文本都是“主题/子主题”这类占位词，无实际内容
function isPlaceholderPage(items) {
  return (
    items.length > 0 &&
    items.every(nd =>
      /^(主题|子主题|中心主题|主主题|\s*)$/.test((nd.text || '').trim())
    )
  )
}

// 解析单个 page*.bin → { tree, depth, broken, count } 或 null
function parsePageBin(bytes) {
  const { items, byId } = extractTopicObjects(bytes)
  if (!items.length) return null
  if (isPlaceholderPage(items)) return null

  const hasLinks = items.some(it => it.id != null && it.parent != null)
  if (!hasLinks) {
    // 极端兜底：拿不到父指针时退回旧启发式
    const tree = buildTreeByTypeHeuristic(items)
    return tree ? { tree, depth: -1, broken: 0, count: items.length } : null
  }

  const { roots, broken } = buildTreeByLinks(items, byId)
  if (!roots.length) return null
  // 多个顶层节点（浮动主题 / 断链）时，取节点最多的作为主根，其余挂到主根下，避免丢内容
  let primary = roots[0]
  if (roots.length > 1) {
    let best = -1
    roots.forEach(r => {
      const c = countNodes(r)
      if (c > best) {
        best = c
        primary = r
      }
    })
    roots.forEach(r => {
      if (r !== primary) primary.kids.push(r)
    })
  }
  const tree = toMindMapNode(primary)
  const depthOf = nd =>
    nd.children.length
      ? 1 + nd.children.reduce((m, c) => Math.max(m, depthOf(c)), 0)
      : 1
  return { tree, depth: depthOf(tree), broken, count: items.length }
}

// ---------- 对外接口 ----------
// buffer: ArrayBuffer / Uint8Array
// fileName: 可选。提供时用于工作表命名
// 返回值：{ trees: [{ name, tree }], warning, fileName }
export async function parseEmmx(buffer, fileName) {
  let data = buffer
  if (
    data &&
    data.buffer &&
    data.byteLength != null &&
    !(data instanceof Uint8Array)
  ) {
    // ArrayBuffer
    data = new Uint8Array(buffer)
  }
  const zip = await JSZip.loadAsync(data)

  // ① MindManager 标准版：document.xml（<OneTopic><Topic> 层级）
  const docFile = zip.file('document.xml')
  if (docFile) {
    const xml = await docFile.async('string')
    if (/<OneTopic|<Topic/i.test(xml)) {
      const tree = parseXmlTopics(xml)
      if (tree && tree.data) {
        return {
          trees: [{ name: fileName || null, tree }],
          warning: null,
          fileName: fileName || null
        }
      }
    }
  }

  // ② 私有二进制变体（亿图脑图 / MindManager 兼容版）：遍历所有 mmpage/page*.bin
  const binFiles = zip.filter(
    p => /^mmpage\/page.*\.bin$/.test(p) || /^page.*\.bin$/.test(p)
  )
  // 排序：主页 page.bin 在前，其余 page-1/page-2… 按序号升序，保证工作表顺序符合直觉
  const pageIndexOf = name => {
    const m = /page(?:-(\d+))?\.bin$/.exec(name || '')
    if (!m) return Number.MAX_SAFE_INTEGER
    return m[1] == null ? 0 : parseInt(m[1], 10)
  }
  binFiles.sort((a, b) => pageIndexOf(a.name) - pageIndexOf(b.name))
  const trees = []
  let maxDepth = 0
  let brokenTotal = 0
  let usedHeuristic = false
  for (const f of binFiles) {
    const bytes = await f.async('uint8array')
    const r = parsePageBin(bytes)
    if (!r) continue
    if (r.depth === -1) usedHeuristic = true
    else maxDepth = Math.max(maxDepth, r.depth)
    brokenTotal += r.broken
    trees.push({ name: null, tree: r.tree })
  }
  if (trees.length) {
    const base =
      (fileName || '思维导图')
        .split(/[\\/]/)
        .pop()
        .replace(/\.emmx$/i, '') || '思维导图'
    trees.forEach((t, i) => {
      t.name = i === 0 ? base : `${base} (${i + 1})`
    })
    let warning = null
    if (usedHeuristic) {
      warning =
        '该 .emmx 内部缺少可用的父子指针，已按「先序 + 节点类型」近似重建层级，' +
        '较深的嵌套可能被归并。如需完全精确还原，可在原软件中导出 XMind(.xmind) 或 Markdown(.md) 后导入。'
    } else if (brokenTotal > 0) {
      warning = `已按 .emmx 内部父子指针还原层级（最深 ${maxDepth} 层）；有 ${brokenTotal} 个节点的父节点缺失，已挂到主分支下。`
    }
    return {
      trees,
      warning,
      fileName: fileName || null
    }
  }

  // 兜底：无法识别内部结构时，返回一个可导入的提示页，避免直接报错白屏
  const base =
    (fileName || '思维导图')
      .split(/[\\/]/)
      .pop()
      .replace(/\.emmx$/i, '') || '思维导图'
  return {
    trees: [
      {
        name: base,
        tree: {
          data: {
            text: '无法识别的 .emmx 文件结构',
            note:
              '该 .emmx 文件采用的内部格式暂不被本工具支持。建议从原软件导出 XMind(.xmind) 或 Markdown(.md) 后重新导入。'
          },
          children: []
        }
      }
    ],
    warning:
      '无法识别的 .emmx 文件结构：未能从压缩包中解析出 document.xml 或 mmpage/page*.bin。' +
      '建议从原软件导出 XMind(.xmind) 或 Markdown(.md) 后重新导入。',
    fileName: fileName || null
  }
}
