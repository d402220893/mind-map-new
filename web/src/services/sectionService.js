// L4 编排：读盘 → parse → 返回章节视图（纯函数在 L1）（§7.5.2）。
// 三条硬约束：① 只读（不写盘）② 不 updateSection（只回填内存缓存）③ fileHash 未变即短路。
import { ok, fail, err } from './errors.js'
import { parseSections } from './sectionParser.js'
import { contentHashOf } from './hash.js'
import { EVT } from './events.js'

export const createSectionService = (ctx = {}) => {
  const { io, services, log } = ctx
  const { fsApi, workspaceIndex } = io
  const { workspaceService } = services
  async function getSectionView(file, sectionId) {
    const idx = await workspaceIndex.read('sections.json', { root: workspaceService.getRoot() })
    const cached = idx.ok ? (idx.data.files && idx.data.files[file]) : null
    const read = await fsApi.readText(workspaceService.abs(file))
    if (!read.ok) return read
    const mdText = read.data.content
    const fileHash = contentHashOf(mdText)
    if (cached && cached.fileHash === fileHash && cached.sections && cached.sections[sectionId]) {
      return ok({ section: cached.sections[sectionId], sections: Object.values(cached.sections), mdText, fromCache: true })
    }
    const sections = parseSections(mdText, { file, prevIndex: cached ? { files: { [file]: cached } } : null })
    const section = sections.find(s => s.id === sectionId)
    if (!section) return fail(err('E_SECTION_MISSING', { path: file, sectionId }))
    if (workspaceService.cacheSections) workspaceService.cacheSections(file, { fileHash, sections })
    if (log && log.debug) log.debug('section.view', { file, sectionId, fromCache: false, count: sections.length })
    return ok({ section, sections, mdText, fromCache: false })
  }
  function parseText(mdText, { file = '' } = {}) { return parseSections(mdText, { file }) }
  // mdText + fileHash 必须一起返回：整文件引用（sectionId === null）的 baseHash 是**文件 hash**，
  // 且预览需要整文件正文；只回 sections 会让整文件引用拿不到基准值（恒被判"无基准 → 已同步"）。
  async function listSections(file) {
    const read = await fsApi.readText(workspaceService.abs(file))
    if (!read.ok) return read
    const mdText = read.data.content
    const sections = parseSections(mdText, { file })
    return ok({ sections, mdText, fileHash: contentHashOf(mdText), fromCache: false })
  }
  async function resolveAnchor(file, anchor) {
    const r = await listSections(file)
    if (!r.ok) return r
    const map = new Map(r.data.sections.map(s => [s.anchor, s]))
    const sec = map.get(anchor)
    return sec ? ok({ line: sec.startLine, sectionId: sec.id }) : fail(err('E_ANCHOR_NOT_FOUND', { file, anchor }))
  }
  return { getSectionView, parseText, listSections, resolveAnchor }
}
