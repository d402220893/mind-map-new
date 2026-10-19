// Toast UI Editor 3.2.2 表格选区崩溃修复（v2.0.71）
// ---------------------------------------------------------------------------
// 崩溃链（来自 renderer 日志真实堆栈）：
//   handleMousemove → setCellSelection → new CellSelection →
//   getRectOffsets → getCellIndex → rowInfo[colIdx].offset →
//   Cannot read properties of undefined (reading 'offset')
//
// 根因：TableOffsetMap.getCellIndex 遍历 this.rowInfo[rowIdx][colIdx]，
// 在合并单元格 / 稀疏 rowInfo 结构下某些 [row][col] 槽位是 undefined，
// 直接读 .offset 抛错，导致整个表格选区系统崩溃（后续 copy 也跟着坏）。
//
// 修复策略：运行时 monkeypatch（不污染 node_modules，可复现）。
// 通过 ProseMirror EditorView.pluginViews 拿到内部 TableSelection 实例，
// 1) 每次 setCellSelection 调用前确保当前 map 原型已打补丁；
// 2) getCellIndex 用判空安全版覆盖（等价于原逻辑，跳过 undefined 槽位）；
// 3) getCellInfo 判空返回防御值（防 content() 路径 .offset 崩溃）。
// ---------------------------------------------------------------------------

// 安全等价实现：与原 getCellIndex 逻辑一致，但跳过 undefined 行/单元格。
// 返回 [rowIdx, colIdx]，找不到时回退 [0, 0]（与原兜底一致）。
export function safeGetCellIndex(rowInfo, totalRowCount, totalColumnCount, pos) {
  const p = typeof pos === 'number' ? pos : (pos && pos.pos) || 0
  for (let r = 0; r < totalRowCount; r += 1) {
    const row = rowInfo && rowInfo[r]
    if (!row) continue
    for (let c = 0; c < totalColumnCount; c += 1) {
      const cell = row[c]
      if (!cell) continue
      if (cell.offset + 1 > p) return [r, c]
    }
  }
  return [0, 0]
}

// 给单个 TableOffsetMap 实例的原型打补丁（幂等，靠原型标记去重）。
export function patchTableOffsetMapProto(map) {
  const proto = Object.getPrototypeOf(map)
  if (proto && proto.__cellPatched) return
  // 覆盖 getCellIndex：直接用安全等价实现，不再走原崩溃路径。
  proto.getCellIndex = function (cellPos) {
    return safeGetCellIndex(this.rowInfo, this.totalRowCount, this.totalColumnCount, cellPos)
  }
  // getCellInfo 判空：合并单元格越界时返回防御值，避免 content() 路径 .offset 崩溃。
  const origGI = proto.getCellInfo
  proto.getCellInfo = function (r, c) {
    try {
      const v = origGI.call(this, r, c)
      if (v) return v
    } catch (e) {
      /* 稀疏 rowInfo 下原实现可能直接抛，忽略走防御值 */
    }
    return { offset: 0, nodeSize: 0 }
  }
  if (proto) proto.__cellPatched = true
}

// 拿到 Toast UI 内部的 TableSelection 实例并 patch 其 setCellSelection。
// 通过 ProseMirror EditorView.pluginViews（Toast UI 用 prosemirror-view，
// 每个 plugin 的 view 实例存于此数组）定位 TableSelection。幂等。
// 多路径探测：pluginViews / getEditorView() / 遍历 ww 属性，确保命中。
export function patchToastTableSelection(editor) {
  const ww = editor && editor.wwEditor
  if (!ww) {
    if (typeof console !== 'undefined') console.warn('[思绪] patchTS: 无 wwEditor')
    return false
  }
  const diag = []
  const candidates = []
  if (ww.view && ww.view.pluginViews) candidates.push(['pluginViews', ww.view.pluginViews])
  if (typeof ww.getEditorView === 'function') {
    try {
      const v = ww.getEditorView()
      if (v && v.pluginViews) candidates.push(['getEditorView', v.pluginViews])
    } catch (e) { /* ignore */ }
  }
  // 遍历 ww 自有属性找含 pluginViews 的对象（兜底）
  try {
    for (const k of Object.keys(ww)) {
      const o = ww[k]
      if (o && o.pluginViews && o.pluginViews.length) candidates.push(['ww.' + k, o.pluginViews])
    }
  } catch (e) { /* ignore */ }

  for (const [label, views] of candidates) {
    diag.push(label + '(n=' + views.length + ')')
    const ts = views.find(v => v && typeof v.setCellSelection === 'function' && v.view)
    if (ts) {
      const tsProto = Object.getPrototypeOf(ts)
      const origSC = tsProto.setCellSelection
      tsProto.setCellSelection = function (a, b) {
        // 治本：确保当前 map 原型已补丁（map 每次选区可能重建为新实例，共享原型）。
        if (this.map) patchTableOffsetMapProto(this.map)
        try {
          return origSC.call(this, a, b)
        } catch (e) {
          // 兜底：即便内部仍有异常也不冒泡到 window.error，避免整页崩溃。
          if (typeof console !== 'undefined') console.warn('[思绪] setCellSelection 兜底拦截', e)
        }
      }
      if (!ts.__toastPatched) {
        ts.__toastPatched = true
        if (typeof console !== 'undefined') console.warn('[思绪] table-selection patched')
      }
      if (typeof console !== 'undefined') console.warn('[思绪] patchTS HIT via ' + label)
      return true
    }
    diag.push(label + ':noTS')
  }
  if (typeof console !== 'undefined') console.warn('[思绪] patchTS MISS ' + diag.join(' | '))
  return false
}

// 定位已 patch 的内部 TableSelection 实例（供表格选区驱动原生 CellSelection 用）。
// 优先直接取带 __toastPatched 标记的实例，避免每次调用都重新 wrap setCellSelection
// （否则拖动时每帧都叠加一层 wrapper + 刷日志）。仅在尚未 patch 时触发一次 patch。
// 找不到时返回 null（调用方应降级，不抛错）。
export function findTableSelection(editor) {
  const ww = editor && editor.wwEditor
  if (!ww || !ww.view || !ww.view.pluginViews) return null
  const located = ww.view.pluginViews.find(v => v && v.__toastPatched && typeof v.setCellSelection === 'function')
  if (located) return located
  try {
    patchToastTableSelection(editor)
  } catch (e) {
    /* 失败不影响返回 null */
  }
  return ww.view.pluginViews.find(v => v && v.__toastPatched && typeof v.setCellSelection === 'function') || null
}
