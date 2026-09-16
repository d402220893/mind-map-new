// 跨工作表「复制节点」后图片变破图（显示"图片加载失败"占位图）的修复支持。
//
// 根因（2026-09-15 定位）：
//   1. 注册了 NodeBase64ImageStorage 插件（见 Edit.vue 的 .usePlugin）。它在每次
//      beforeAddHistory 时把所有 base64 节点图片从节点数据里抽出来，集中存到
//      「根节点的 imgMap」里（key -> dataURL），节点 data.image 只留一个 key：
//      'smm_img_key_xxx'。渲染时由 nodeCreateContents 通过
//      renderTree.data.imgMap[image] || image 反查真实地址。
//   2. imgMap 挂在「单棵渲染树」上，而本应用是「一个 mindMap 实例 + 多个工作表」
//      （切表走 setData/setFullData），所以 imgMap 实际是「每个工作表各一份」。
//   3. 库的复制（copyNodeTree）只复制被选中节点的 data/children，从不带上根节点的
//      imgMap。跨工作表粘贴时，节点 data.image 里的 key 在目标表的 imgMap 里查不到，
//      于是图片地址退化成字符串 'smm_img_key_xxx' → 加载失败 → 显示占位图。
//      （同一工作表内粘贴不会出问题，因为 imgMap 就在当前表里。）
//
// 修复思路（不动第三方库、不动剪贴板格式）：
//   ① 维护一个模块级「图片 key 注册表」（key -> dataURL），把见过的每个工作表的
//      imgMap 都登记进来（表载入时、每次历史快照前）；
//   ② 历史快照（beforeAddHistory）前检查当前渲染树：若某节点引用的 key 不在本表
//      imgMap 里、但注册表里有，就把它补进本表 imgMap。数据补全后由调用方重渲染
//      一次，破图即被换成真图；补进去的条目会被后续保存带回文件，属于永久修复。
//
// 注册表只在内存中，按总字节数做上限淘汰（见 MAX_TOTAL_BYTES），避免大量图片常驻内存。

const IMAGE_KEY_RE = /^smm_img_key_/

// 注册表内存上限：约 96MB base64。超出后按登记顺序淘汰最旧的条目。
// 只有在「单个会话里浏览过 96MB 以上图片」的极端场景下，才可能出现查不到 key 的情况。
const MAX_TOTAL_BYTES = 96 * 1024 * 1024

// key -> dataURL
const registry = new Map()
let registryBytes = 0

// 是否为插件生成的图片 key（区别于 base64 / http / 相对路径等真实地址）
export const isImageKey = v => typeof v === 'string' && IMAGE_KEY_RE.test(v)

// 供测试与调试使用
export const getImageKeyRegistry = () => registry
export const getImageKeyRegistryBytes = () => registryBytes
export const resetImageKeyRegistry = () => {
  registry.clear()
  registryBytes = 0
}

// 登记一条 key -> dataURL。只接受 base64（真实图片数据），
// 不登记 http/相对路径，避免把"地址"当成图片内容跨表复制。
export const registerImageKey = (key, url) => {
  if (!isImageKey(key)) return false
  if (typeof url !== 'string' || !url || url.indexOf('data:') !== 0) return false
  if (registry.has(key)) return false
  registry.set(key, url)
  registryBytes += url.length
  // 超限淘汰最旧条目（Map 保持插入顺序）
  while (registryBytes > MAX_TOTAL_BYTES && registry.size > 1) {
    const oldest = registry.keys().next().value
    registryBytes -= (registry.get(oldest) || '').length
    registry.delete(oldest)
  }
  return true
}

// 工作表数据既可能是「裸树的根节点」（{data, children}），
// 也可能是 getData(true) 的完整包（{root, layout, theme, view}）。统一取到根节点。
export const resolveTreeRoot = payload => {
  if (!payload || typeof payload !== 'object') return null
  return payload.root || payload
}

// 采集一棵树根节点上的 imgMap
export const harvestImageKeysFromTree = tree => {
  const root = resolveTreeRoot(tree)
  const map = root && root.data && root.data.imgMap
  if (!map || typeof map !== 'object') return 0
  let count = 0
  Object.keys(map).forEach(key => {
    if (registerImageKey(key, map[key])) count++
  })
  return count
}

// 采集多工作表容器的全部工作表（只读 imgMap，很廉价）
export const harvestImageKeysFromContainer = container => {
  if (!container || !Array.isArray(container.sheets)) return 0
  let count = 0
  container.sheets.forEach(sheet => {
    if (sheet && sheet.data) count += harvestImageKeysFromTree(sheet.data)
  })
  return count
}

// 修复一棵树里「被引用但本表 imgMap 缺失」的图片 key，返回补回的条目数。
// 只有确实存在被引用的悬空 key 时才写入 imgMap（避免凭空造出空 imgMap 把数据改脏）。
export const repairDanglingImageKeys = tree => {
  const root = resolveTreeRoot(tree)
  if (!root || !root.data || registry.size === 0) return 0
  const imgMap = root.data.imgMap
  // 注册表通常只有几十~几百条，先过滤出本表缺的 key，避免没必要时遍历整棵树
  const missing = []
  registry.forEach((url, key) => {
    if (!imgMap || !imgMap[key]) missing.push(key)
  })
  if (missing.length === 0) return 0
  const missingSet = new Set(missing)
  const used = new Set()
  const walk = node => {
    if (!node || !node.data) return
    const img = node.data.image
    if (img && missingSet.has(img)) used.add(img)
    if (Array.isArray(node.children)) {
      node.children.forEach(child => walk(child))
    }
  }
  walk(root)
  if (used.size === 0) return 0
  const target = root.data.imgMap || (root.data.imgMap = {})
  used.forEach(key => {
    target[key] = registry.get(key)
  })
  return used.size
}

// 某个节点数据里引用的图片地址（等价于库内的 getImageUrl 逻辑），供上层/测试核对
export const resolveNodeImageUrl = (tree, image) => {
  const root = resolveTreeRoot(tree)
  const imgMap = (root && root.data && root.data.imgMap) || {}
  return imgMap[image] || image
}
