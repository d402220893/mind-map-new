// Markdown 表格选区控制器（浏览器侧，依赖 DOM / ProseMirror）。
// 设计要点（对齐需求报告「方案 A」）：
//  - 复用 toastTablePatch 已安全的 setCellSelection 驱动「原生 CellSelection」高亮，
//    零新建高亮 DOM、不改 <table> 结构，视觉与 Toast UI 原生拖选一致；
//  - 选区只读 DOM + 写剪贴板，绝不改 onChange / 不进撤销栈 / 不持久化；
//  - 行头选择条（左侧 overlay）为唯一的额外 DOM，且不修改表格本身。
// 复制时从「我们自己的 DOM 矩阵」序列化为 TSV+HTML+MD，绕开原生 content() 崩溃路径。
import { normalizeRect, serializeTsv, serializeHtml, serializeMd } from '../utils/tableSelection.js'
import { getMatrix, cellCoordsFromEvent, applyNativeSelection } from '../utils/tableSelectionModel.js'

export function createTableSelection({ getEditor, host, onError }) {
  const state = { active: false, anchor: null, focus: null, rows: 0, cols: 0, tableEl: null }
  let selecting = false
  let rafPending = false
  let lastMove = null
  let gutter = null
  let gutterVisible = false
  let ctrlAStage = 0 // 0=未选表；1=已选表（下一次 Ctrl+A 升级为全文档）

  const editor = () => (getEditor ? getEditor() : null)
  const view = () => {
    const e = editor()
    return e && e.wwEditor && e.wwEditor.view
  }

  function refreshDims() {
    if (!state.tableEl) return
    const rows = state.tableEl.querySelectorAll('tr')
    state.rows = rows.length
    let maxc = 0
    rows.forEach(tr => {
      if (tr.children.length > maxc) maxc = tr.children.length
    })
    state.cols = maxc
  }

  function setRect(a, f) {
    state.anchor = a
    state.focus = f
    state.active = !!(a && f && state.tableEl)
  }

  function isCaretInTable() {
    const v = view()
    if (!v) return false
    const $from = v.state.selection && v.state.selection.$from
    if (!$from) return false
    for (let d = $from.depth; d > 0; d--) {
      const node = $from.node(d)
      if (node && node.type && /table/i.test(String(node.type.name))) return true
    }
    return false
  }

  function onMouseDown(e) {
    if (e.button !== 0) return
    const info = cellCoordsFromEvent(e)
    if (!info) {
      reset()
      return
    }
    // 单元格内已有文本选区 → 文本优先，不触发表格选区
    const sel = window.getSelection && window.getSelection()
    if (sel && !sel.isCollapsed && sel.anchorNode && info.tableEl.contains(sel.anchorNode)) return
    selecting = true
    state.tableEl = info.tableEl
    state.rows = info.rows
    state.cols = info.cols
    setRect({ r: info.r, c: info.c }, { r: info.r, c: info.c })
    applyNativeSelection(editor(), state.tableEl, state.anchor, state.focus)
  }

  function onMouseMove(e) {
    if (!selecting) return
    lastMove = e
    if (rafPending) return
    rafPending = true
    // 高亮更新用 rAF 节流，拖动帧率不卡
    requestAnimationFrame(() => {
      rafPending = false
      if (!selecting || !lastMove) return
      const info = cellCoordsFromEvent(lastMove)
      if (!info) return
      setRect(state.anchor, { r: info.r, c: info.c })
      applyNativeSelection(editor(), state.tableEl, state.anchor, state.focus)
    })
  }

  function onMouseUp() {
    selecting = false
  }

  function onClick(e) {
    // 列头点击：首行 <th> → 选整列
    const target = e.target
    if (!target || !target.closest) return
    const th = target.closest('th')
    if (!th) return
    const tableEl = th.closest('table')
    if (!tableEl) return
    const rows = Array.from(tableEl.querySelectorAll('tr'))
    if (rows.indexOf(th.parentNode) !== 0) return // 仅首行为列头
    const cells = Array.from(th.parentNode.children)
    const c = cells.indexOf(th)
    if (c < 0) return
    state.tableEl = tableEl
    selectColumn(c)
  }

  function selectColumn(c) {
    if (!state.tableEl) return
    refreshDims()
    setRect({ r: 0, c }, { r: state.rows - 1, c })
    applyNativeSelection(editor(), state.tableEl, state.anchor, state.focus)
    ctrlAStage = 1
  }

  function selectRow(r) {
    if (!state.tableEl) return
    refreshDims()
    setRect({ r, c: 0 }, { r, c: state.cols - 1 })
    applyNativeSelection(editor(), state.tableEl, state.anchor, state.focus)
    ctrlAStage = 1
    hideGutter()
  }

  function selectAllTable() {
    if (!state.tableEl) return
    refreshDims()
    setRect({ r: 0, c: 0 }, { r: state.rows - 1, c: state.cols - 1 })
    applyNativeSelection(editor(), state.tableEl, state.anchor, state.focus)
    ctrlAStage = 1
  }

  function extendSelection(dir) {
    if (!state.active || !state.tableEl) return false
    refreshDims()
    const f = { ...state.focus }
    if (dir === 'left') f.c = Math.max(0, f.c - 1)
    else if (dir === 'right') f.c = Math.min(state.cols - 1, f.c + 1)
    else if (dir === 'up') f.r = Math.max(0, f.r - 1)
    else if (dir === 'down') f.r = Math.min(state.rows - 1, f.r + 1)
    else return false
    setRect(state.anchor, f)
    applyNativeSelection(editor(), state.tableEl, state.anchor, state.focus)
    return true
  }

  function reset() {
    state.active = false
    state.anchor = null
    state.focus = null
    state.tableEl = null
    ctrlAStage = 0
  }

  function copySelection() {
    if (!state.active || !state.tableEl) return null
    refreshDims()
    const matrix = getMatrix(state.tableEl)
    const rect = normalizeRect(state.anchor, state.focus)
    return {
      tsv: serializeTsv(matrix, rect),
      html: serializeHtml(matrix, rect),
      md: serializeMd(matrix, rect)
    }
  }

  // 从当前光标位置解析所在 <table> DOM（键盘直接 Ctrl+A 时尚未有鼠标交互，
  // state.tableEl 可能为空，需从 ProseMirror 选区反查）。失败返回 null。
  function tableElFromCaret() {
    const v = view()
    if (!v || !v.state || !v.state.selection) return null
    const from = v.state.selection.from
    if (from == null || typeof v.domAtPos !== 'function') return null
    try {
      const r = v.domAtPos(from)
      const node = r && (r.node || r.dom)
      const el = node && node.nodeType === 1 ? node : (node && node.parentElement)
      return el && el.closest ? el.closest('table') : null
    } catch (e) {
      return null
    }
  }

  // Ctrl+A 两段式：首次（光标在表内）→ 选当前表格；再次 → 放行浏览器默认（全文档）
  function handleCtrlA(e) {
    if (!isCaretInTable()) {
      ctrlAStage = 0
      return false
    }
    if (ctrlAStage >= 1) {
      ctrlAStage = 0
      return false
    }
    // 键盘直接 Ctrl+A 时可能尚无鼠标交互，补全已知表格 DOM
    if (!state.tableEl) {
      const t = tableElFromCaret()
      if (t) state.tableEl = t
    }
    e.preventDefault()
    selectAllTable()
    ctrlAStage = 1
    return true
  }

  function onDblClick(e) {
    const info = cellCoordsFromEvent(e)
    if (info) reset() // 双击单元格 → 取消表格选区，进入编辑（文本选区由浏览器处理）
  }

  // ── 行头选择条（左侧 overlay）：仅 hover 表格时出现，点击选整行 ──
  function ensureGutter() {
    if (gutter) return
    gutter = document.createElement('div')
    gutter.className = 'mdTableRowGutter'
    gutter.addEventListener('click', e => {
      const seg = e.target && e.target.closest ? e.target.closest('[data-row]') : null
      if (!seg) return
      const r = parseInt(seg.getAttribute('data-row'), 10)
      if (!Number.isNaN(r)) selectRow(r)
    })
    document.body.appendChild(gutter)
  }
  function showGutterFor(tableEl) {
    if (!tableEl) {
      hideGutter()
      return
    }
    ensureGutter()
    const rect = tableEl.getBoundingClientRect()
    gutter.style.left = rect.left - 14 + 'px'
    gutter.style.top = rect.top + 'px'
    gutter.style.height = rect.height + 'px'
    gutter.innerHTML = ''
    const rows = tableEl.querySelectorAll('tr')
    rows.forEach((tr, i) => {
      const seg = document.createElement('div')
      seg.setAttribute('data-row', String(i))
      seg.className = 'mdTableRowGutterSeg'
      const rr = tr.getBoundingClientRect()
      seg.style.height = rr.bottom - rr.top + 'px'
      gutter.appendChild(seg)
    })
    gutter.style.display = 'block'
    gutterVisible = true
  }
  function hideGutter() {
    if (gutter) gutter.style.display = 'none'
    gutterVisible = false
  }
  function onTableEnter(e) {
    const t = e.target && e.target.closest ? e.target.closest('table') : null
    if (t) showGutterFor(t)
  }
  function onTableLeave(e) {
    const t = e.target && e.target.closest ? e.target.closest('table') : null
    if (t) hideGutter()
  }
  function onScroll() {
    if (gutterVisible && state.tableEl) showGutterFor(state.tableEl)
  }

  function bind() {
    if (!host) return
    host.addEventListener('mousedown', onMouseDown, true)
    host.addEventListener('mousemove', onMouseMove, true)
    window.addEventListener('mouseup', onMouseUp, true)
    host.addEventListener('click', onClick, true)
    host.addEventListener('dblclick', onDblClick, true)
    host.addEventListener('mouseover', onTableEnter, true)
    host.addEventListener('mouseout', onTableLeave, true)
    host.addEventListener('scroll', onScroll, true)
  }
  function unbind() {
    if (!host) return
    host.removeEventListener('mousedown', onMouseDown, true)
    host.removeEventListener('mousemove', onMouseMove, true)
    window.removeEventListener('mouseup', onMouseUp, true)
    host.removeEventListener('click', onClick, true)
    host.removeEventListener('dblclick', onDblClick, true)
    host.removeEventListener('mouseover', onTableEnter, true)
    host.removeEventListener('mouseout', onTableLeave, true)
    host.removeEventListener('scroll', onScroll, true)
    hideGutter()
    if (gutter && gutter.parentNode) gutter.parentNode.removeChild(gutter)
    gutter = null
  }

  return {
    state,
    bind,
    unbind,
    copySelection,
    selectColumn,
    selectRow,
    selectAllTable,
    extendSelection,
    reset,
    handleCtrlA
  }
}
