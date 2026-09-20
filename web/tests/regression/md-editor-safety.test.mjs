// §11.3 编辑器安全守卫（零运行，只读源码）。
// 背景：Vue3 深度代理第三方类实例会让 ProseMirror 的 Node.eq()/sameMarkup() 返 false，
// view.dispatch() 直接抛 RangeError（"mismatched transaction"）。这条坑在本项目已复发过，
// 故用源码断言把 markRaw 钉死在所有持有 Editor/Viewer 实例的视图上。
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync, existsSync } from 'node:fs'

const COMP = new URL('../../src/pages/Edit/components/', import.meta.url)
const read = (f) => readFileSync(new URL(f, COMP), 'utf8')

// 所有需要 markRaw 的视图：它们都在 data() 里持有 Toast UI 的 Editor/Viewer 实例
const EDITOR_VIEWS = [
  'NodeNote.vue',
  'NodeNoteContentShow.vue',
  'NodeNoteSidebar.vue',
  'MdEditor.vue'
]

test('① 持有 Toast UI 实例的视图必须 import markRaw', () => {
  for (const f of EDITOR_VIEWS) {
    if (!existsSync(new URL(f, COMP))) continue
    assert.ok(/\bmarkRaw\b/.test(read(f)), `${f} 必须 import markRaw（否则 ProseMirror 事务会抛）`)
  }
})

test('② `new Editor(...)` / `new Viewer(...)` 的结果必须经 markRaw 包装', () => {
  for (const f of EDITOR_VIEWS) {
    if (!existsSync(new URL(f, COMP))) continue
    const src = read(f)
    // 形如： this.editor = markRaw(new Editor({ ... }))  或  markRaw(new Editor(...))
    const direct = /=\s*new\s+(Editor|Viewer)\s*\(/.test(src)
    assert.strictEqual(direct, false, `${f} 不得把 new Editor/Viewer 直接赋给 data（必须 markRaw 包一层）`)
  }
})

test('③ MdEditor 的 editor 字段必须是 markRaw 赋值', () => {
  const src = read('MdEditor.vue')
  assert.ok(/markRaw\(/.test(src), 'MdEditor 必须用 markRaw')
  assert.ok(/this\.editor\s*=\s*markRaw\(/.test(src), 'editor 字段必须整体 markRaw')
})

test('④ Toast UI 实例销毁前必须清理（编辑器不得泄漏实例）', () => {
  const src = read('MdEditor.vue')
  assert.ok(/editor\.destroy\s*\(/.test(src), 'MdEditor 卸载时必须 editor.destroy()')
})

test('⑤ NodeNote.vue 的图片粘贴逻辑必须交给 Toast UI（不得自造 img 节点）', () => {
  const src = read('NodeNote.vue')
  // 粘贴图片走 dataURL 内嵌（§7.10.5 既有方案），不得出现手工 createElement('img') 插进编辑器
  assert.strictEqual(/createElement\(\s*['"]img['"]\s*\)/.test(src), false, '不得手工插 img 节点')
})

test('⑥ 视图不得在 data() 里持有带 addEventListener 的 DOM 引用（应为 ref）', () => {
  const src = read('MdEditor.vue')
  // ⚠️ 不能用 indexOf('computed') 当右界 —— 组件里可能压根没有 computed，
  // 那样 slice(start, -1) 会吞掉整个文件，把 methods 里的 querySelector 误判成 data() 内查询。
  const start = src.indexOf('data()')
  const end = src.indexOf('\n  },', start)
  const dataBlock = end > start ? src.slice(start, end) : src.slice(start)
  assert.strictEqual(/querySelector|getElementById/.test(dataBlock), false, 'data() 内不得做 DOM 查询')
})

test('⑦ 全局事件监听必须成对解绑（beforeUnmount 里 $off / removeEventListener）', () => {
  const src = read('MdEditor.vue')
  assert.ok(/\$off\s*\(/.test(src), 'MdEditor 必须 $off 解绑 bus 监听')
  assert.ok(/removeEventListener/.test(src), 'MdEditor 必须 removeEventListener 解绑 DOM 监听')
})

test('⑧ MindMapPreview 必须用独立只读实例（不复用主画布）', () => {
  const src = read('MindMapPreview.vue')
  assert.ok(/readonly:\s*true/.test(src), '内嵌预览必须 readonly:true')
  assert.ok(/removeAllListeners/.test(src), 'destroy 前需先解绑监听（simple-mind-map 要求）')
})
