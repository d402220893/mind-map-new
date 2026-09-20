// L1 纯函数：.smm 编解码（容器/单图）。simple-mind-map 的 .smm 本质是带 data 字段的 JSON。
// 零依赖、无副作用、可直测。
// .smm 两种形态：
//   ① 容器（多工作表）：{ type:'smms', data: { sheets:[{id,data}], activeId } }
//   ② 单图（直接导出的 root）：{ type:'mindmap', ... } 或裸 { data: {...} }
//
// 解析失败按设计「L1 只抛 appError」抛出（带 code，调用方 catch 后转 Result），
// 返回 null 会让"文件损坏"伪装成"空图"，表现为白屏而非报错。
import { appError } from './errors.js'

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
  // 容器：取 active 数据；单图：取 data（包装体）或自身（裸节点）
  if (obj.type === 'smms' && obj.data && Array.isArray(obj.data.sheets)) {
    const activeId = obj.data.activeId || (obj.data.sheets[0] && obj.data.sheets[0].id)
    const sheet = obj.data.sheets.find(s => s.id === activeId) || obj.data.sheets[0]
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
  if (obj.type === 'smms' && obj.data && Array.isArray(obj.data.sheets)) {
    const activeId = obj.data.activeId || (obj.data.sheets[0] && obj.data.sheets[0].id)
    return { sheets: obj.data.sheets, activeId }
  }
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
