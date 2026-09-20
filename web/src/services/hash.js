// L1 纯函数：sha1hex / normalizeForHash / reuseOrCreateId。
// 零依赖：SHA-1 自包含实现（不引 node:crypto，浏览器/Node 双端可跑、单测零 mock）。
// 依赖：仅运行环境内置（TextEncoder 全局可用）。

export function sha1hex(input) {
  const bytes = new TextEncoder().encode(String(input))
  const H = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]
  const ml = bytes.length * 8
  // +1 留给 0x80 终止字节；若省略，length+8 恰为 64 倍数时 padLen 会偏小 64，
  // 导致 0x80 覆盖长度字段（多块消息算错）。单块短消息侥幸正确，故此前未暴露。
  const padLen = (bytes.length + 1 + 8 + 63) & ~63
  const buf = new Uint8Array(padLen)
  buf.set(bytes)
  buf[bytes.length] = 0x80
  const dv = new DataView(buf.buffer)
  dv.setUint32(padLen - 4, ml >>> 0, false)
  dv.setUint32(padLen - 8, Math.floor(ml / 0x100000000) >>> 0, false)
  const w = new Uint32Array(80)
  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false)
    for (let i = 16; i < 80; i++) {
      const v = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]
      w[i] = (v << 1) | (v >>> 31)
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4]
    for (let i = 0; i < 80; i++) {
      let f, k
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999 }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1 }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc }
      else { f = b ^ c ^ d; k = 0xca62c1d6 }
      const tmp = (((a << 5) | (a >>> 27)) + f + e + k + (w[i] >>> 0)) | 0
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = tmp
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0
  }
  return H.map(h => (h >>> 0).toString(16).padStart(8, '0')).join('')
}

// 归一化（行尾/尾空白/连续空行）—— 供 hash 与 diff 共用（§7.5.3）
export function normalizeForHash(s) {
  return String(s)
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 内容指纹（唯一算法来源）：章节 contentHash 与整文件 hash 必须同算法，
// 否则「整文件引用」（sectionId === null，v1.5 I4）的乐观锁与章节锁会各算一套 → 永不相等。
// 12 位 = 48bit，冲突概率对单文件量级足够；改短/改长会同时失效既有索引与 .smm 快照。
export function contentHashOf(text) {
  // null/undefined 视作空内容：normalizeForHash 走 String() 会得到字面量 "null"，
  // 让"文件不存在内容"与"空文件"hash 意外不同，故此处先收敛。
  return 'sha1:' + sha1hex(normalizeForHash(text == null ? '' : text)).slice(0, 12)
}

// 「层级 + 路径」的稳定键：用于判断"某个旧章节的路径在本次解析里是否仍然存在"。
export function levelPathKey(level, path) {
  return String(level) + '|' + (path || []).join('/')
}

// 稳定 ID 生成（§6.4）：**两级匹配**，目标是"只要章节还在，id 就不变"。
//
//   ① 同级 + 同 path 优先。
//      这是最常见的位移场景：在文档中间/开头插入或删除别的内容，正文本身没动。
//      改名以外的所有位移都由这一级兜住。
//   ② 同级 + 行区间重叠兜底（最大重叠优先）。
//      这是"只改名"的场景：path 变了、位置没变（§6.4 明确复用判据是"行区间重叠 + 同级"，
//      而不是 path，否则改个标题就把引用全断了）。
//      ⚠️ 但必须跳过"路径在本次解析里仍然存在"的候选（nextPaths）。否则：
//        在文档开头插入 `# 新章节`，它的行区间正好落在原第一章（如 `# 标题`）原来的区间里，
//        按文档顺序它先被处理 → **抢走原第一章的 id**；而真正的 `# 标题` 因 startLine 已移出旧区间
//        只能新建 id → 原第一章及其后所有章节的引用集体失联。这条真被踩到过。
//      没有 nextPaths 时（老调用方）退化为纯重叠匹配。
//   都不命中 → 按 file+path+level 生成稳定 id，用 usedIds 去重（同名标题各自稳定）。
export function reuseOrCreateId({ file, path, level, startLine, headingLineCount, endLine }, prevIndex, usedIds, nextPaths) {
  const fileIdx = prevIndex && prevIndex.files && prevIndex.files[file]
  if (fileIdx && fileIdx.sections) {
    const entries = Object.entries(fileIdx.sections)
    const mine = levelPathKey(level, path)

    // ① 同路径同级
    for (const [id, sec] of entries) {
      if (sec.level !== level) continue
      if (levelPathKey(sec.level, sec.path) !== mine) continue
      if (!usedIds.has(id)) { usedIds.add(id); return id }
    }

    // ② 行区间重叠（最大重叠优先）
    let best = null
    for (const [id, sec] of entries) {
      if (sec.level !== level) continue
      if (usedIds.has(id)) continue
      // 该 id 的路径在本次解析里还有主人 → 不能抢
      if (nextPaths && nextPaths.has(levelPathKey(sec.level, sec.path))) continue
      const sEnd = sec.endLine != null ? sec.endLine : (sec.startLine + (sec.headingLineCount || 1))
      if (!(startLine >= sec.startLine && startLine < sEnd)) continue
      const overlap = Math.min(endLine, sEnd) - Math.max(startLine, sec.startLine)
      if (!best || overlap > best.overlap) best = { id, overlap }
    }
    if (best) { usedIds.add(best.id); return best.id }
  }
  const base = 'h' + sha1hex(file + '#' + (path || []).join('/') + '#' + level).slice(0, 6)
  let id = base
  let n = 1
  while (usedIds.has(id)) id = base + '-' + (n++)
  usedIds.add(id)
  return id
}
