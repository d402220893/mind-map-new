<template>
  <el-dialog
    class="nodeNoteDialog"
    :title="$t('nodeNote.title')"
    v-model="dialogVisible"
    :width="isMobile ? '90%' : '50%'"
    :top="isMobile ? '20px' : '15vh'"
    :close-on-click-modal="false"
  >
    <!-- 引用块列表（§7.14 / §8.3）：固定在备注编辑器上方，自有备注在下方 -->
    <div class="refArea">
      <RefBlock
        v-for="r in refs"
        :key="r.refId || r.sectionId"
        :ref-obj="r"
        :node="targetNode"
        :node-link="nodeLink"
        @conflict="onConflict"
        @unref="onUnref"
        @reselect="onReselect"
      />
      <el-button size="small" @click="pickVisible = true">🔗 引用文档章节</el-button>
      <el-button size="small" @click="refreshAll">🔄 刷新全部引用</el-button>
    </div>
    <div class="noteCodeLangBar">
      <span class="label">代码块语言</span>
      <select v-model="codeLang" class="codeLangSelect">
        <option v-for="l in codeLangs" :key="l" :value="l">{{ l }}</option>
      </select>
      <el-button size="small" type="primary" @click="insertCodeBlock"
        >插入代码块</el-button
      >
    </div>
    <div class="noteEditor" ref="noteEditor" @keyup.stop @keydown.stop></div>
    <!--
      F1：单栏实时渲染（wysiwyg 单栏，不再左右分栏）
      - Toast UI 自带顶部工具栏已经有 </> 按钮（插入代码块 + 语言选择对话框）
      - codeSyntaxHighlight 插件按语言实时上色代码块
      - 图片粘贴为 data URL 内嵌，渲染为真 <img>
      - 图片双击由全局 NoteImgLightbox 拦截打开缩放查看器
      - 不再需要额外底部"插入代码块"工具栏（用户反馈 UI 难看 + exec 命令的 language 入参没生效）
    -->
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="cancel">{{ $t('dialog.cancel') }}</el-button>
        <el-button type="primary" @click="confirm">{{
          $t('dialog.confirm')
        }}</el-button>
      </span>
    </template>

    <!-- 章节选择器 + 冲突弹窗 -->
    <SectionPicker
      v-model="pickVisible"
      :prefer-path="pickPrefer"
      @pick="onPick"
    />
    <ConflictDialog
      v-model="conflictVisible"
      :title="conflictTitle"
      :mine="conflictMine"
      :current="conflictCurrent"
      :impact="conflictImpact"
      @resolve="onResolve"
    />
  </el-dialog>
</template>

<script>
import Editor from '@toast-ui/editor'
import '@toast-ui/editor/dist/toastui-editor.css' // Editor's Style
import codeSyntaxHighlight from '@toast-ui/editor-plugin-code-syntax-highlight'
import '@toast-ui/editor-plugin-code-syntax-highlight/dist/toastui-editor-plugin-code-syntax-highlight.css'
// Prism 语法着色主题（插件只解析 token，颜色需额外引入 Prism 主题 CSS，否则无高亮）
import 'prismjs/themes/prism.css'
import Prism from 'prismjs'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-csharp'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-markup-templating'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-xml-doc'
import { isMobile } from 'simple-mind-map/src/utils/index'
import { markRaw } from 'vue'
import RefBlock from './RefBlock.vue'
import SectionPicker from './SectionPicker.vue'
import ConflictDialog from './ConflictDialog.vue'
import {
  getRefs as readRefs,
  addRef,
  removeRef,
  refreshAllRefs,
  resolveConflict
} from '@/utils/workspaceBridge'

// 节点备注内容设置
export default {
  name: 'NodeNote',
  components: { RefBlock, SectionPicker, ConflictDialog },
  data() {
    return {
      dialogVisible: false,
      note: '',
      activeNodes: [],
      editor: null,
      isMobile: isMobile(),
      appointNode: null,
      codeLang: 'python',
      // ── 章节引用（§7.14）──
      refs: [],
      pickVisible: false,
      pickPrefer: null,
      conflictVisible: false,
      conflictCtx: null,
      conflictTitle: '',
      conflictMine: '',
      conflictCurrent: '',
      conflictImpact: 1,
      // 语言列表与已 import 的 prismjs 语言包保持一致（未 import 的语言不会上色）
      codeLangs: [
        'text',
        'python',
        'javascript',
        'typescript',
        'java',
        'csharp',
        'cpp',
        'c',
        'go',
        'rust',
        'bash',
        'sql',
        'json',
        'yaml',
        'css',
        'markup'
      ]
    }
  },
  computed: {
    targetNode() {
      return this.appointNode || (this.activeNodes && this.activeNodes[0]) || null
    },
    nodeLink() {
      const n = this.targetNode
      if (!n || !n.getData) return ''
      const d = n.getData()
      return (d && d.link) || ''
    }
  },
  watch: {
    dialogVisible(val, oldVal) {
      if (!val && oldVal) {
        this.$bus.$emit('endTextEdit')
      }
    },
    targetNode() {
      this.loadRefs()
    }
  },
  created() {
    this.$bus.$on('node_active', this.handleNodeActive)
    this.$bus.$on('showNodeNote', this.handleShowNodeNote)
  },
  beforeUnmount() {
    this.$bus.$off('node_active', this.handleNodeActive)
    this.$bus.$off('showNodeNote', this.handleShowNodeNote)
  },
  methods: {
    handleNodeActive(...args) {
      this.activeNodes = [...args[1]]
      this.updateNoteInfo()
    },

    updateNoteInfo() {
      if (this.activeNodes.length > 0) {
        let firstNode = this.activeNodes[0]
        this.note = firstNode.getData('note') || ''
      } else {
        this.note = ''
      }
      this.loadRefs()
    },

    // ── 章节引用 ──────────────────────────────────────────────
    loadRefs() {
      const n = this.targetNode
      this.refs = n ? readRefs(n) || [] : []
    },

    async onPick(spec) {
      const node = this.targetNode
      if (!node) {
        this.$message.warning('请先选中节点')
        return
      }
      const refSpec = {
        file: spec.file,
        sectionId: spec.sectionId,
        sectionPath: spec.sectionPath || [],
        title: spec.title || '',
        baseHash: spec.baseHash,
        cachedContent: spec.content || ''
      }
      // mode='link' 只写 node.link；'ref' 只写 _mindlink.refs；'both' 两者都写
      if (spec.mode !== 'ref') {
        const anchor = spec.sectionPath && spec.sectionPath.length
          ? '#' + spec.sectionPath[spec.sectionPath.length - 1]
          : ''
        node.setData({ link: spec.file + anchor })
      }
      if (spec.mode !== 'link') addRef(node, refSpec)
      this.loadRefs()
      this.$message.success('已引用章节')
    },

    async onUnref(refId) {
      const node = this.targetNode
      if (node) removeRef(node, refId)
      this.loadRefs()
    },

    onReselect(refObj) {
      this.pickPrefer = refObj && refObj.sectionPath ? refObj.sectionPath : null
      this.pickVisible = true
    },

    async refreshAll() {
      const r = await refreshAllRefs()
      if (!r.ok) {
        this.$message.error('刷新失败：' + (r.error && (r.error.message || r.error.code)))
        return
      }
      this.$message.success('已刷新当前导图的引用快照')
      this.loadRefs()
    },

    // 冲突：由 commitEdit 返回值判定（§7.14 A8），此处只负责弹窗与分发
    onConflict(payload) {
      this.conflictCtx = payload.refCtx
      this.conflictTitle = (payload.ref && payload.ref.title) || ''
      this.conflictMine = payload.newContent || ''
      this.conflictCurrent =
        payload.current && payload.current.content ? payload.current.content : ''
      this.conflictImpact = payload.impact || 1
      this.conflictVisible = true
    },

    async onResolve({ choice, merged }) {
      const ctx = this.conflictCtx
      if (!ctx) return
      const r = await resolveConflict(
        ctx,
        { choice, mine: choice === 'manual-merge' ? merged : this.conflictMine, current: { content: this.conflictCurrent } },
        {}
      )
      if (!r.ok) {
        this.$message.error('解决冲突失败：' + (r.error && (r.error.message || r.error.code)))
        return
      }
      if (!(r.data && r.data.canceled)) {
        this.$message.success('已解决冲突并写盘')
        this.loadRefs()
      }
    },

    handleShowNodeNote(node) {
      this.$bus.$emit('startTextEdit')
      // 关键修复：打开"修改备注"对话框时立即关闭所有右侧侧栏（包括"备注"侧栏），
      // 避免用户在同一个屏幕上看到"备注侧栏 + 修改备注对话框"两份重复视图。
      // 复现路径见 template-bindings.test.mjs [sidebar 重复弹出] 案例。
      this.$bus.$emit('closeSideBar')
      if (node) {
        this.appointNode = node
        this.note = node.getData('note') || ''
      }
      this.dialogVisible = true
      this.$nextTick(() => {
        this.initEditor()
      })
    },

    initEditor() {
      if (!this.editor) {
        // ⚠️ 必须 markRaw：Toast UI Editor 内部是 ProseMirror（EditorState / Node / Plugin）。
        // Vue3 的 data() 会把赋进来的类实例深度包成 reactive Proxy（Vue2 不会），
        // 一旦任何一处读到的 Node 是「代理」而另一处是「原始对象」，ProseMirror 的
        // Node.eq() / sameMarkup() 就会返回 false，于是 view.dispatch() 抛
        // `RangeError: Applying a mismatched transaction`（首次点「备注」必现，
        // 之后 setMarkdown / insertCodeBlock 全废）。markRaw 让实例保持原始引用。
        this.editor = markRaw(
          new Editor({
            el: this.$refs.noteEditor,
            height: '500px',
            // F1：单栏实时渲染（不再左右分栏）。写 markdown 当场渲染成单栏，
            // 代码块由 codeSyntaxHighlight 插件按语言实时上色；图片粘贴为 data URL 内嵌，渲染为真 <img>。
            initialEditType: 'wysiwyg',
            hideModeSwitch: true,
            plugins: [[codeSyntaxHighlight, { highlighter: Prism }]]
          })
        )
      }
      this.editor.setMarkdown(this.note)
    },

    // 在光标处插入带语言的代码块（语言决定上色）
    // 关键：WYSIWYG 下**不能**用 exec('codeBlock', { language })——该命令没有 language 入参，
    // 传入会被静默吞掉，插入的是无语言的普通代码块（旧版 bug）。
    // 正确做法：直接建 ProseMirror codeBlock 节点并把 language 写进 attrs。
    insertCodeBlock() {
      if (!this.editor) return
      const lang = this.codeLang || 'text'
      try {
        const ww = this.editor.wwEditor
        const view = ww && ww.view
        if (this.editor.isWysiwygMode() && view) {
          const { state } = view
          const node = state.schema.nodes.codeBlock.create({ language: lang })
          view.dispatch(state.tr.replaceSelectionWith(node))
          view.focus()
          return
        }
        // markdown 模式兜底：光标处插入围栏
        if (this.editor.mdEditor && typeof this.editor.mdEditor.replaceSelection === 'function') {
          this.editor.mdEditor.replaceSelection('```' + lang + '\n\n```')
        } else {
          const cur = this.editor.getMarkdown() || ''
          this.editor.setMarkdown((cur ? cur + '\n\n' : '') + '```' + lang + '\n\n```')
        }
      } catch (e) {
        // 最后兜底：仍插入代码块（无语言），用户可点代码块上的语言标签改。
        // ⚠️ 必须打日志：这条兜底插入的是「无语言」代码块（不会有语法着色），
        // 2026-09-20 用户报的「插入代码未着色」就是被它掩盖的
        //（真正原因是 editor 被 Vue3 代理，见 initEditor 里的 markRaw 说明）。
        console.error('[NodeNote] 插入代码块失败，已降级为无语言代码块:', e)
        this.editor.exec('codeBlock')
      }
    },

    cancel() {
      this.dialogVisible = false
      if (this.appointNode) {
        this.appointNode = null
        this.updateNoteInfo()
      }
    },

    confirm() {
      this.note = this.editor.getMarkdown()
      if (this.appointNode) {
        this.appointNode.setNote(this.note)
      } else {
        this.activeNodes.forEach(node => {
          node.setNote(this.note)
        })
      }

      this.cancel()
    }
  }
}
</script>

<style lang="less" scoped>
.nodeNoteDialog {
  .tip {
    margin-top: 5px;
    color: #dcdfe6;
  }

  // 代码块语言选择：紧贴编辑器上方的一行紧凑工具条（旧版放在底部且带长提示，用户反馈难看）
  .noteCodeLangBar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;

    .label {
      font-size: 12px;
      color: #606266;
      flex: none;
    }

    .codeLangSelect {
      height: 26px;
      font-size: 12px;
      padding: 0 4px;
      border: 1px solid #dcdfe6;
      border-radius: 3px;
      background: #fff;
      color: #606266;
      outline: none;

      &:focus {
        border-color: #409eff;
      }
    }
  }
}
</style>

<style lang="less">
// ============================================================
// 备注弹窗紧凑化 + 贴合玻璃（透明）主题
// 旧版问题：弹窗 body 22/24px 大内边距 + Toast UI 自带不透明白底厚框，
// 叠出"白框套白框"的臃肿观感。这里收紧内边距、编辑器改半透明细边面板。
// 注意：必须用全局块（非 scoped）——.nodeNoteDialog 落在 el-dialog 包装根上，
// 且 Toast UI 内部结构（.toastui-editor-*）不在本组件模板内。
// ============================================================
.nodeNoteDialog {
  // 弹窗内边距收紧（旧版 header 18/24、body 22/24、footer 14/24）
  .el-dialog__header {
    padding: 12px 16px;
  }
  .el-dialog__body {
    padding: 10px 12px 12px;
  }
  .el-dialog__footer {
    padding: 10px 12px 12px;
  }

  // 语言条融入玻璃底：去白底实心块感
  .noteCodeLangBar .codeLangSelect {
    background: transparent;
    border-color: var(--macos-border-strong);
    color: var(--macos-text);
  }

  // Toast UI 编辑器容器：不透明白框 → 半透明玻璃 + 细边
  .toastui-editor-defaultUI {
    border: 1px solid var(--macos-border);
    border-radius: var(--macos-radius-sm);
    background: rgba(255, 255, 255, 0.45);
    box-shadow: none;
  }
  // 顶部工具栏：去白底与双层分隔线观感
  .toastui-editor-defaultUI-toolbar {
    background: transparent;
    border-bottom: 1px solid var(--macos-divider);
    box-shadow: none;
  }
  // 内容区逐层放透明，让弹窗玻璃底透出来
  .toastui-editor-main,
  .toastui-editor-main .toastui-editor-main-container,
  .toastui-editor-main .toastui-editor-mode-switch,
  .toastui-editor-ww-container,
  .toastui-editor-ww-container .toastui-editor-page,
  .toastui-editor-ww-container .toastui-editor-page-container {
    background: transparent;
  }
}

// 正文文字色随主题（仅浅色模式覆盖；暗色模式内容面保持浅色，
// 用 Toast UI 默认深色文字，避免"白底白字"）
body:not(.isDark) .nodeNoteDialog {
  .toastui-editor-ww-container .toastui-editor,
  .toastui-editor-ww-container .toastui-editor p,
  .toastui-editor-ww-container .toastui-editor div {
    color: var(--macos-text);
  }
}

// 暗色模式：Toast UI 图标 sprite 是深色，内容面保持浅色才可读
// （仅把框变薄，不把内容面翻成深色，避免图标不可见）
body.isDark .nodeNoteDialog .toastui-editor-defaultUI {
  background: rgba(255, 255, 255, 0.92);
}
</style>