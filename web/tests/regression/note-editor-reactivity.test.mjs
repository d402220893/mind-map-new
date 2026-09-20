// 回归：Toast UI 实例必须 markRaw，否则 Vue3 的 data() 会把实例深度代理成 Proxy，
// ProseMirror 的 Node.eq()/sameMarkup() 在「代理 vs 原始」混用时返回 false，
// 于是 view.dispatch() 抛 `RangeError: Applying a mismatched transaction`。
//
// 现场表现（2026-09-20 用户报障，v2.0.0）：
//   1) 第一次点工具栏「备注」立刻弹「页面脚本错误」：
//      Uncaught (in promise) RangeError: Applying a mismatched transaction（393.js）
//      —— 抛在 initEditor() 的 this.editor.setMarkdown(this.note)
//   2) 「插入代码块」按钮插入的代码块没有语法着色
//      —— 因为上面的异常让 insertCodeBlock 走了 catch 兜底 exec('codeBlock')（无 language）
//
// 根因定位手段（可复现，见 .tmp-probe/toastui-repro.js）：
//   jsdom 里跑「data(){editor:null} + new Editor + setMarkdown」，
//   plain → 必现 RangeError；markRaw → 0 异常，且 codeBlock.language=python、.token 有 4 个。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = new URL('../../src/', import.meta.url)

function read(p) {
  return readFileSync(new URL(p, import.meta.url), 'utf8')
}

const CASES = [
  ['NodeNote.vue', 'Editor'],
  ['NodeNoteContentShow.vue', 'Viewer'],
  ['NodeNoteSidebar.vue', 'Viewer']
]

for (const [file, ctor] of CASES) {
  test(`[备注编辑器代理] ${file} 的 ${ctor} 实例用 markRaw 包住`, () => {
    const src = read(new URL(`pages/Edit/components/${file}`, SRC))
    assert.match(
      src,
      /import\s*\{[^}]*\bmarkRaw\b[^}]*\}\s*from\s*'vue'/,
      `${file} 必须从 vue 引入 markRaw`
    )
    assert.match(
      src,
      new RegExp(`markRaw\\(\\s*\\n?\\s*new ${ctor}\\(`),
      `${file} 的 new ${ctor}(...) 必须被 markRaw() 包住（否则 Vue3 代理会破坏 ProseMirror 事务）`
    )
    // 反面断言：不允许出现裸 new Editor(/new Viewer( 直接赋给 this.editor
    assert.doesNotMatch(
      src,
      new RegExp(`this\\.editor\\s*=\\s*new ${ctor}\\(`),
      `${file} 不允许 this.editor = new ${ctor}(...)（会被 Vue3 代理）`
    )
  })
}

test('[插入代码块] 必须把 language 写进 ProseMirror codeBlock 节点', () => {
  const src = read(new URL('pages/Edit/components/NodeNote.vue', SRC))
  const m = src.match(/insertCodeBlock\(\)\s*\{([\s\S]*?)\n\s{4}\}/)
  assert.ok(m, '找不到 NodeNote.vue 的 insertCodeBlock 方法体')
  const body = m[1]
  assert.match(
    body,
    /schema\.nodes\.codeBlock\.create\(\{\s*language:\s*lang\s*\}\)/,
    'insertCodeBlock 必须直接把 language 写进 codeBlock 节点 attrs'
  )
  // WYSIWYG 下 exec('codeBlock', { language }) 会被吞掉（旧 bug），不能再退回这种写法
  assert.doesNotMatch(
    body,
    /exec\(\s*'codeBlock'\s*,\s*\{/,
    "不能再用 exec('codeBlock', { language })（WYSIWYG 下 language 入参被静默吞掉）"
  )
  // 兜底分支会插入无语言代码块（不着色），必须留下日志，避免再次掩盖真实异常
  assert.match(
    body,
    /console\.error\(/,
    'catch 兜底（exec 无语言代码块）必须打日志，否则异常被静默吞掉、表现为「代码未着色」'
  )
})

test('[插入代码块] 语言下拉与 Prism 已注册语言保持对应', () => {
  const src = read(new URL('pages/Edit/components/NodeNote.vue', SRC))
  for (const lang of ['python', 'javascript', 'go', 'markup', 'text']) {
    assert.match(
      src,
      new RegExp(`'${lang}'`),
      `codeLangs 里应有 '${lang}'（且需 import 对应的 prismjs 语言包）`
    )
  }
  assert.match(src, /prismjs\/themes\/prism\.css/, '必须引入 Prism 主题 CSS，否则 token 无色')
})
