// Toast UI Editor 3.2.2 表格选区崩溃修复（v2.0.71 / 加固 v2.0.73）
// ---------------------------------------------------------------------------
// 崩溃链（来自 renderer 日志真实堆栈）：
//   handleMousemove → setCellSelection → new CellSelection →
//   getRectOffsets → getCellIndex → rowInfo[colIdx].offset →
//   Cannot read properties of undefined (reading 'offset')
// 另一处等价崩溃（合并/跨列跨行单元格）：
//   getSelectionRanges → map.getCellInfo(rowIdx,colIdx).offset → undefined.offset
//
// 根因：TableOffsetMap.rowInfo 对【合并单元格】是稀疏结构——跨列跨行占位的格子
// 在 rowInfo 里根本没有条目（createOffsetMap 用 while(rowInfo[colIdx]) colIdx++ 跳过）。
// 原 getCellIndex / getCellInfo / getCellStartOffset / getCellEndOffset / posAt /
// getNodeAndPos 都直接读 rowInfo[r][c].offset，占位格处 rowInfo[r][c] 为 undefined → 崩溃。
//
// 旧补丁的失效点（v2.0.71）：补丁只在 setCellSelection 包装器里 `if (this.map) patchTableOffsetMapProto(this.map)`
// 打 TableOffsetMap.prototype，但 TableSelection 实例【根本没有 this.map 字段】（见 Toast UI
// TableSelection 构造），故该分支永不执行，getCellInfo 始终是原生稀疏版 → 崩溃无法根治。
//
// 修复策略（v2.0.73 加固）：运行时 monkeypatch（不污染 node_modules，可复现）。
// 1) patchTableOffsetMapProto 把所有读 rowInfo[r][c].offset 的方法替换为稀疏安全版：
//    - getCellIndex：跳过 undefined 行/单元格（等价原逻辑）。
//    - getCellInfo：占位格回退到本行最近已定义单元格（colspan 占位格左侧即覆盖单元格，语义正确；
//       rowspan 占位格回退到任意同表单元格，保证不崩溃）。
//    - getCellStartOffset / getCellEndOffset / posAt / getNodeAndPos：统一经安全 getCellInfo 取值。
// 2) 拿到 TableOffsetMap.prototype 的方式：旧补丁依赖不存在的 this.map，现改为在
//    setCellSelection 包装器【成功路径】从真实 CellSelection 实例的 .offsetMap 取到其原型并打补丁
//    （CellSelection 构造末尾 `_this.offsetMap = map`，map 即 TableOffsetMap 实例）。
//    一旦打过一次（模块级 mapProtoPatched），所有视图的表格选区都受益。
// 3) 保留 兜底拦截：即便内部仍有未预料的异常也不冒泡到 window.error，避免整页崩溃。
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

// 稀疏安全 getCellInfo：占位格（rowInfo[r][c] 为 undefined）回退到本行最近已定义单元格，
// 杜绝 .offset 崩溃；整行无定义则回退首行首格或防御值。
function safeGetCellInfo(map, r, c) {
  const row = map.rowInfo && map.rowInfo[r]
  if (row && row[c]) return row[c]
  if (row) {
    for (let i = c - 1; i >= 0; i -= 1) {
      if (row[i]) return row[i]
    }
    for (let i = c + 1; i < (map.totalColumnCount || 0); i += 1) {
      if (row[i]) return row[i]
    }
  }
  const fb = map.rowInfo && map.rowInfo[0] && map.rowInfo[0][0]
  if (fb) return fb
  return { offset: (map.tableStartOffset || 0) + 1, nodeSize: 1 }
}

// 给单个 TableOffsetMap 实例的原型打补丁（幂等，靠原型标记去重）。
// 覆盖所有直接读 rowInfo[r][c].offset 的方法，统一走稀疏安全实现。
export function patchTableOffsetMapProto(map) {
  const proto = Object.getPrototypeOf(map)
  if (proto && proto.__cellPatched) return
  // 覆盖 getCellIndex：直接用安全等价实现，不再走原崩溃路径。
  proto.getCellIndex = function (cellPos) {
    return safeGetCellIndex(this.rowInfo, this.totalRowCount, this.totalColumnCount, cellPos)
  }
  // getCellInfo：占位格回退到本行最近已定义单元格（防 .offset 崩溃 + content() 路径）。
  proto.getCellInfo = function (r, c) {
    return safeGetCellInfo(this, r, c)
  }
  // getCellStartOffset / getCellEndOffset：统一经安全 getCellInfo。
  proto.getCellStartOffset = function (r, c) {
    const info = safeGetCellInfo(this, r, c)
    return this.extendedRowspan(r, c) ? this.posAt(r, c) : info.offset
  }
  proto.getCellEndOffset = function (r, c) {
    const info = safeGetCellInfo(this, r, c)
    return this.extendedRowspan(r, c) ? this.posAt(r, c) : info.offset + info.nodeSize
  }
  // posAt：原实现读 rowInfo[i][index].offset，占位格处会崩溃 → 改走安全 getCellInfo。
  proto.posAt = function (r, c) {
    for (let i = 0, rowStart = this.tableStartPos; ; i += 1) {
      const rowEnd = rowStart + this.tableRows[i].nodeSize
      if (i === r) {
        let index = c
        while (index < this.totalColumnCount && safeGetCellInfo(this, i, index).offset < rowStart) {
          index += 1
        }
        return index === this.totalColumnCount ? rowEnd : safeGetCellInfo(this, i, index).offset
      }
      rowStart = rowEnd
    }
  }
  // getNodeAndPos：原实现读 rowInfo[rowIdx][colIdx].offset → 改走安全 getCellInfo。
  proto.getNodeAndPos = function (r, c) {
    const info = safeGetCellInfo(this, r, c)
    return {
      node: this.table.nodeAt(info.offset - this.tableStartOffset),
      pos: info.offset
    }
  }
  if (proto) proto.__cellPatched = true
}

// 模块级：TableOffsetMap.prototype 只需打一次补丁（原型共享，全视图受益）。
let mapProtoPatched = false

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
    const ts = views.find(v => v && typeof v.setCellSelection === 'function' && v.view)
    if (ts) {
      const tsProto = Object.getPrototypeOf(ts)
      const origSC = tsProto.setCellSelection
      if (!ts.__toastPatched) {
        tsProto.setCellSelection = function (a, b) {
          try {
            const r = origSC.call(this, a, b)
            // 成功路径：从真实 CellSelection 实例拿到 TableOffsetMap 原型并打补丁
            // （this.map 在 TableSelection 上不存在，故改由此处捕获，根治稀疏崩溃）。
            if (!mapProtoPatched) {
              const sel = this.view && this.view.state && this.view.state.selection
              if (sel && sel.offsetMap) {
                patchTableOffsetMapProto(sel.offsetMap)
                mapProtoPatched = true
              }
            }
            return r
          } catch (e) {
            // 兜底：即便内部仍有异常也不冒泡到 window.error，避免整页崩溃。
            if (typeof console !== 'undefined') console.warn('[思绪] setCellSelection 兜底拦截', e)
          }
        }
        ts.__toastPatched = true
        if (typeof console !== 'undefined') console.warn('[思绪] table-selection patched')
      }
      // 仅在【首次】为某实例打补丁时记 HIT，避免 pluginViews 重建时反复刷日志。
      if (typeof console !== 'undefined') console.warn('[思绪] patchTS HIT via ' + label)
      return true
    }
  }
  if (typeof console !== 'undefined') console.warn('[思绪] patchTS MISS')
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
