// L4 编排：工作区全文检索（§7.15）。工厂形式（v1.2-B8 修正），由组合根装配。
// 内存倒排缓存 Map<trigram, Set<rel>>；大文件（>2MB）只搜文件名；并发 6；按 fs:change 增量失效。
import { ok, fail, err } from './errors.js'
import { decodeSmm } from './smmCodec.js'
import { parseSections } from './sectionParser.js'
import { SUPPORTED, extOf } from './linkResolver.js'

const MAX_TEXT_BYTES = 2 * 1024 * 1024
const CONCURRENCY = 6
const IGNORE = ['node_modules', '.git', '.mindlink', '_trash', 'dist-electron', 'dist-electron2']

function kindOf(rel) { return SUPPORTED[extOf(rel)] || 'unknown' }

function flatten(nodes, prefix = '') {
  const out = []
  for (const n of (nodes || [])) {
    const name = n.name != null ? n.name : n.path
    const p = (prefix ? prefix + '/' : '') + name
    if (n.isDir) out.push(...flatten(n.children || [], p))
    else out.push({ rel: p, size: n.size || 0 })
  }
  return out
}

function collectNodes(root) {
  const out = []
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    out.push(n)
    if (Array.isArray(n.children)) n.children.forEach(walk)
  }
  walk(root)
  return out
}

function trigrams(text) {
  const s = String(text || '').toLowerCase()
  const out = new Set()
  for (let i = 0; i + 3 <= s.length; i++) out.add(s.slice(i, i + 3))
  return out
}

async function pool(items, n, worker) {
  const res = []
  let i = 0
  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) {
      const k = i++
      if (k >= items.length) return
      res[k] = await worker(items[k])
    }
  })
  await Promise.all(runners)
  return res
}

export const createWorkspaceSearch = (ctx = {}) => {
  const { io = {}, services = {} } = ctx
  const { fsApi } = io
  const { workspaceService } = services
  const cache = new Map()      // trigram -> Set<rel>
  const docTrigrams = new Map() // rel -> Set<trigram>（失效时用）
  let fileList = null
  let hitsCount = 0

  const root = () => (workspaceService && workspaceService.getRoot ? workspaceService.getRoot() : '') || ''

  async function files() {
    if (fileList) return fileList
    const r = await fsApi.readTree(root(), { ignore: IGNORE })
    if (!r.ok) { fileList = []; return fileList }
    fileList = flatten(r.data.tree || r.data)
    return fileList
  }

  function indexDoc(rel, grams) {
    docTrigrams.set(rel, grams)
    for (const g of grams) {
      if (!cache.has(g)) cache.set(g, new Set())
      cache.get(g).add(rel)
    }
  }

  function forget(rel) {
    const grams = docTrigrams.get(rel)
    if (grams) {
      for (const g of grams) {
        const set = cache.get(g)
        if (set) { set.delete(rel); if (!set.size) cache.delete(g) }
      }
    }
    docTrigrams.delete(rel)
  }

  // 首次全量建内存倒排缓存（.md / .smm，>2MB 跳过）
  async function ensureIndex() {
    const list = await files()
    const todo = list.filter(f => !docTrigrams.has(f.rel) && (f.rel.endsWith('.md') || f.rel.endsWith('.smm')) && (!f.size || f.size <= MAX_TEXT_BYTES))
    await pool(todo, CONCURRENCY, async (f) => {
      const abs = root() ? root() + '/' + f.rel : f.rel
      const r = await fsApi.readText(abs)
      if (!r.ok) return
      const text = r.data.content || ''
      if (f.rel.endsWith('.smm')) {
        let plain = ''
        try {
          const { sheets } = decodeSmm(text)
          for (const sh of sheets) {
            for (const nd of collectNodes(sh.data)) {
              const d = nd.data || {}
              plain += ' ' + (d.text || '')
              if (d.note) plain += ' ' + d.note
              const ml = d._mindlink
              if (ml && Array.isArray(ml.refs)) for (const rf of ml.refs) plain += ' ' + (rf.sectionPath || []).join('/')
            }
          }
        } catch { plain = text }
        indexDoc(f.rel, trigrams(plain))
      } else {
        indexDoc(f.rel, trigrams(text))
      }
    })
    return list
  }

  /** 文件名模糊匹配（复用 readTree 缓存） */
  async function byName(query) {
    const list = await files()
    const q = String(query || '').toLowerCase()
    if (!q) return ok({ results: [] })
    const results = list
      .filter(f => f.rel.toLowerCase().includes(q) || f.rel.split('/').pop().toLowerCase().includes(q))
      .slice(0, 200)
      .map(f => ({ rel: f.rel, name: f.rel.split('/').pop(), kind: kindOf(f.rel) }))
    return ok({ results })
  }

  /** 全文检索：md 正文 + smm 节点文字/备注 + 引用标题 */
  async function fullText(query, { include = ['md', 'smm'], limit = 200 } = {}) {
    // trim 后再判空：'   ' 是真值，若不 trim，搜索框敲几个空格回车会触发全工作区读盘
    const q = String(query == null ? '' : query).trim()
    if (!q) return ok({ results: [] })
    await ensureIndex()
    const lower = q.toLowerCase()
    const want = trigrams(q)
    let cands = [...docTrigrams.keys()].filter(rel => kindOf(rel) === 'markdown' || kindOf(rel) === 'mindmap')
    cands = cands.filter(rel => include.includes(kindOf(rel) === 'markdown' ? 'md' : 'smm'))
    if (want.size) {
      const pre = [...want].map(g => cache.get(g)).filter(Boolean)
      if (pre.length) {
        let inter = pre[0]
        for (const s of pre.slice(1)) inter = new Set([...inter].filter(x => s.has(x)))
        cands = cands.filter(rel => inter.has(rel))
      }
    }
    const out = []
    await pool(cands, CONCURRENCY, async (rel) => {
      if (out.length >= limit) return
      const abs = root() ? root() + '/' + rel : rel
      const r = await fsApi.readText(abs)
      if (!r.ok) return
      const text = r.data.content || ''
      const hits = []
      if (rel.endsWith('.md')) {
        let sections = []
        try { sections = parseSections(text, { file: rel }) } catch { sections = [] }
        const lines = text.split('\n')
        lines.forEach((ln, i) => {
          if (ln.toLowerCase().includes(lower)) {
            const isHeading = /^\s{0,3}#{1,6}\s/.test(ln)
            const sec = sections.find(s => s.startLine === i)
            hits.push({ line: i + 1, text: ln.trim().slice(0, 200), type: isHeading || sec ? 'section' : 'text' })
          }
        })
      } else {
        let sheets = []
        try { ({ sheets } = decodeSmm(text)) } catch { return }
        for (const sh of sheets) {
          for (const nd of collectNodes(sh.data)) {
            const d = nd.data || {}
            if (String(d.text || '').toLowerCase().includes(lower)) hits.push({ line: 0, text: String(d.text).slice(0, 200), type: 'text' })
            if (String(d.note || '').toLowerCase().includes(lower)) hits.push({ line: 0, text: String(d.note).slice(0, 200), type: 'note' })
            const ml = d._mindlink
            if (ml && Array.isArray(ml.refs)) {
              for (const rf of ml.refs) {
                const p = (rf.sectionPath || []).join('/')
                if (p.toLowerCase().includes(lower)) hits.push({ line: 0, text: p, type: 'section' })
              }
            }
          }
        }
      }
      if (hits.length) out.push({ rel, kind: kindOf(rel), hits: hits.slice(0, 50) })
    })
    hitsCount += out.length
    return ok({ results: out.slice(0, limit) })
  }

  /** 增量失效：收到 fs:change 时调用（由 L4 语义事件驱动，不是自己监听） */
  function invalidate(rel) {
    forget(rel)
    fileList = null
  }

  function stats() { return { files: docTrigrams.size, trigrams: cache.size, hits: hitsCount } }

  return { byName, fullText, invalidate, stats }
}
