// Markdown 表格选区 —— 浏览器侧模型层（依赖 DOM / ProseMirror，不可在 Node 单测）。
// 职责：从 Toast UI 渲染的 <table> 提取文本矩阵、把鼠标事件映射到单元格坐标、
// 把单元格坐标转成 ProseMirror 文档位置以驱动原生 CellSelection 高亮。
//
// 不修改 Toast UI 源码、不改 <table> DOM 结构；高亮全部走原生 CellSelection
// （经 toastTablePatch 已安全的 setCellSelection），选区不进撤销栈、不触发 onChange。
import { findTableSelection } from './toastTablePatch.js'

/** 从 <table> DOM 提取纯文本矩阵 string[][]（含表头 th）。 */
export function getMatrix(tableEl) {
  if (!tableEl || !tableEl.querySelectorAll) return []
  const out = []
  const rows = tableEl.querySelectorAll('tr')
  rows.forEach(tr => {
    const cells = tr.children
    const row = []
    for (let i = 0; i < cells.length; i++) row.push((cells[i].textContent || '').replace(/\s+/g, ' ').trim())
    out.push(row)
  })
  return out
}

/** 把鼠标事件映射到单元格坐标 {tableEl, r, c, rows, cols}；非表格区域返回 null。 */
export function cellCoordsFromEvent(e) {
  const target = e && e.target
  if (!target || !target.closest) return null
  const cell = target.closest('td, th')
  if (!cell) return null
  const tableEl = cell.closest('table')
  if (!tableEl) return null
  const rows = Array.from(tableEl.querySelectorAll('tr'))
  const r = rows.indexOf(cell.parentNode)
  if (r < 0) return null
  const cells = Array.from(cell.parentNode.children)
  const c = cells.indexOf(cell)
  if (c < 0) return null
  return { tableEl, r, c, rows: rows.length, cols: cells.length }
}

/** 单元格 (r,c) 在 ProseMirror 文档中的位置（cell 内容起点）。失败返回 null。 */
export function cellDocPos(view, tableEl, r, c) {
  if (!view || !tableEl) return null
  const rows = tableEl.querySelectorAll('tr')
  const row = rows[r]
  if (!row) return null
  const cell = row.children[c]
  if (!cell) return null
  try {
    return view.posAtDOM(cell, 0)
  } catch (e) {
    return null
  }
}

/**
 * 用原生 CellSelection 高亮矩形选区（视觉与 Toast UI 原生拖选一致）。
 * 失败时（无法定位实例 / 坐标越界）返回 false，调用方降级（不抛错、不崩溃）。
 * @returns {boolean} 是否成功驱动了原生选区
 */
export function applyNativeSelection(editor, tableEl, anchor, focus) {
  if (!editor || !tableEl || !anchor || !focus) return false
  const inst = findTableSelection(editor)
  const view = editor.wwEditor && editor.wwEditor.view
  if (!inst || !view) return false
  const aPos = cellDocPos(view, tableEl, anchor.r, anchor.c)
  const fPos = cellDocPos(view, tableEl, focus.r, focus.c)
  if (aPos == null || fPos == null) return false
  try {
    const $a = view.state.doc.resolve(aPos)
    const $f = view.state.doc.resolve(fPos)
    inst.setCellSelection($a, $f)
    return true
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[思绪] applyNativeSelection 失败', e)
    return false
  }
}
