// L1 纯函数：.smm 编解码（容器/单图）。simple-mind-map 的 .smm 本质是带 data 字段的 JSON。
// 零依赖、无副作用、可直测。
//
// ⚠️ 解码必须同时认三种落盘形态，否则"本应用自己保存的文件打不开/内容不对"：
//   ① 本应用实际保存：{ app:'smm-multisheet', version:1, activeId, sheets:[{id,name,data}] }
//      （见 api/index.js#getSheetsContainer —— 这是 .smm 的真实来源）
//   ② 快照写回/旧容器：{ type:'smms', data: { sheets:[{id,data}], activeId } }
//      （见本文件 encode —— refService.writeNodeSnapshot 回写 .smm 时用它）
//   ③ 单图（直接导出的 root）：{ type:'mindmap', data } / 裸节点 / 裸 { data }
// 历史 bug（§32.4 Bug①/③）：decode/decodeSmm 只认 ②③，不认 ①，于是打开本应用保存的
// .smm 时把它误当单图 → sheets 丢了、把整个容器对象当成一个节点 → 加载报错/内容错乱。
//
// 解析失败按设计「L1 只抛 appError」抛出（带 code，调用方 catch 后转 Result），
// 返回 null 会让"文件损坏"伪装成"空图"，表现为白屏而非报错。
import { appError } from './errors.js'

/** 是否为多工作表容器的两种形态之一（供调用方识别，不改变对象） */
export function isContainerObj(obj) {
  if (!obj || typeof obj !== 'object') return false
  if (obj.app === 'smm-multisheet' && Array.isArray(obj.sheets)) return true
  return !!(obj.type === 'smms' && obj.data && Array.isArray(obj.data.sheets))
}

/**
 * 归一化多工作表容器 → { sheets, activeId }（形状与 decodeSmm 一致）。
 * 兼容 `app:'smm-multisheet'`（本应用保存）与 `type:'smms'`（快照写回/旧文件）。
 * 非容器返回 null。
 */
export function containerSheets(obj) {
  if (!obj || typeof obj !== 'object') return null
  const sheets = obj.app === 'smm-multisheet' && Array.isArray(obj.sheets)
    ? obj.sheets
    : (obj.type === 'smms' && obj.data && Array.isArray(obj.data.sheets) ? obj.data.sheets : null)
  if (!sheets) return null
  const activeRaw = obj.app === 'smm-multisheet' ? obj.activeId : obj.data.activeId
  const activeId = activeRaw || (sheets[0] && sheets[0].id)
  return { sheets, activeId }
}

export function encode(root, { sheets, activeId } = {}) {
  if (sheets) {
    return JSON.stringify({ type: 'smms', data: { sheets, activeId: activeId || (sheets[0] && sheets[0].id) } }, null, 2)
  }
  return JSON.stringify({ type: 'mindmap', data: root }, null, 2)
}

// 判断"这个对象本身就是根节点"而不是容器/包装体。
// 区分依据必须是节点形状（有 children 数组），不能靠 `obj.data` 是否存在：
// 根节点自身就带 `data` 字段（存 text/image），而容器也带 `data` 字段（存 sheets）。
// 用 `obj.data || obj` 兜底会把裸根节点解成它的 text 持有者 → children 全丢、图变空。
function looksLikeNode(obj) {
  return obj && typeof obj === 'object' && Array.isArray(obj.children)
}

export function decode(text) {
  let obj
  try {
    obj = JSON.parse(String(text))
  } catch (e) {
    throw appError('E_SMM_INVALID_JSON', { message: e.message })
  }
  if (!obj || typeof obj !== 'object') throw appError('E_SMM_INVALID', {})
  // 容器：取 active 数据（两种容器形态都要认）；单图：取 data（包装体）或自身（裸节点）
  const cont = containerSheets(obj)
  if (cont) {
    const sheet = cont.sheets.find(s => s.id === cont.activeId) || cont.sheets[0]
    return sheet ? sheet.data : null
  }
  if (obj.type === 'mindmap' && obj.data) return obj.data
  if (looksLikeNode(obj)) return obj // 裸根节点：整体就是根，不能只取 .data
  if (obj.data) return obj.data
  return obj
}

/** 多 sheet 解码：返回全部 sheets（含 id）+ activeId（缺失兜底为第一个） */
export function decodeSmm(text) {
  let obj
  try {
    obj = JSON.parse(String(text))
  } catch (e) {
    throw appError('E_SMM_INVALID_JSON', { message: e.message })
  }
  if (!obj || typeof obj !== 'object') throw appError('E_SMM_INVALID', {})
  // 容器（本应用保存 / 快照写回）→ 原样返回 sheets + activeId
  const cont = containerSheets(obj)
  if (cont) return cont
  // 单图：包成单 sheet
  const id = 'root'
  const data = obj.type === 'mindmap' && obj.data
    ? obj.data
    : (looksLikeNode(obj) ? obj : (obj.data || obj))
  return { sheets: [{ id, data }], activeId: id }
}

/** 取 active 数据（activeId 缺失/无对应 sheet 时兜底首个；文本损坏则抛 appError） */
export function pickActiveData(text) {
  const { sheets, activeId } = decodeSmm(text)
  const sheet = sheets.find(s => s.id === activeId) || sheets[0]
  return sheet ? sheet.data : null
}

// 抽取图片：simple-mind-map 把图片 base64 存 data.image（键为 key），跨 sheet 搬运需同步 imgMap（见工作记忆"关键根因模式"）
export function extractImages(data) {
  const map = {}
  function walk(node) {
    if (!node || typeof node !== 'object') return
    // 真实 smm 节点的 image 在 node.data.image 下；也有调用方直接传 node.data 本身，故两处都判
    const img = node.image != null ? node.image : (node.data && node.data.image)
    if (img && typeof img === 'string') {
      // data.image 形如 'imageKey'（指向 imgMap）或直接 base64
      if (img.startsWith('data:') || img.startsWith('http')) {
        // 内联 base64 / 外链：无需 key 注册
      } else {
        map[img] = true // 收集 key
      }
    }
    if (Array.isArray(node.children)) node.children.forEach(walk)
  }
  walk(data)
  return Object.keys(map)
}
