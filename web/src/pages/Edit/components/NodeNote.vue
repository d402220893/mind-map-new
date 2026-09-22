<template>
  <el-dialog
    class="nodeNoteDialog"
    v-model="dialogVisible"
    :width="isMobile ? '90%' : '50%'"
    :top="isMobile ? '20px' : '15vh'"
    :close-on-click-modal="false"
  >
    <!-- 标题行：标题 + 二选一模式切换（v1.6：写备注 / 引用章节，永不共存） -->
    <template #header>
      <div class="noteHeader">
        <span class="noteTitle">{{ $t('nodeNote.title') }}</span>
        <div class="modeSwitch" role="tablist">
          <button
            class="modeBtn"
            :class="{ active: mode === 'note' }"
            role="tab"
            :aria-selected="mode === 'note'"
            @click="switchMode('note')"
          >✏️ 写备注</button>
          <button
            class="modeBtn"
            :class="{ active: mode === 'ref' }"
            role="tab"
            :aria-selected="mode === 'ref'"
            @click="switchMode('ref')"
          >🔗 引用章节</button>
        </div>
      </div>
    </template>

    <!-- ═══ 模式一：写备注（Toast UI 编辑器，内容绑定 data.note）═══ -->
    <template v-if="mode === 'note'">
      <div class="noteToolbar">
        <div class="toolGroup">
          <select v-model="codeLang" class="codeLangSelect" title="代码块语言">
            <option v-for="l in codeLangs" :key="l" :value="l">{{ l }}</option>
          </select>
          <el-button size="small" type="primary" @click="insertCodeBlock"
            >插入代码块</el-button
          >
        </div>
      </div>

      <div class="noteBox">
        <div class="noteEditor" ref="noteEditor" @keyup.stop @keydown.stop></div>
      </div>
    </template>

    <!-- ═══ 模式二：引用章节（RefBlock 只读渲染，头部 ✏️ 进入编辑）═══ -->
    <template v-else>
      <div class="noteToolbar">
        <div class="toolGroup">
          <el-button size="small" @click="pickVisible = true"
            >🔗 引用文档章节</el-button
          >
          <el-button size="small" @click="refreshAll">🔄 刷新</el-button>
        </div>
      </div>

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
        <!-- 空态：尚未引用任何章节 -->
        <div v-if="!refs.length" class="refEmpty">
          <div class="refEmptyIcon">🔗</div>
          <div class="refEmptyText">尚未引用任何章节</div>
          <el-button size="small" type="primary" @click="pickVisible = true"
            >选择章节引用</el-button
          >
        </div>
      </div>
    </template>

    <!--
      F1：单栏实时渲染（wysiwyg 单栏，不再左右分栏）
      - Toast UI 自带顶部工具栏已经有 </> 按钮（插入代码块 + 语言选择对话框）
      - codeSyntaxHighlight 插件按语言实时上色代码块
      - 图片粘贴为 data URL 内嵌，渲染为真 <img>
      - 图片双击由全局 NoteImgLightbox 拦截打开缩放查看器
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
  resolveConflict,
  getMode,
  setMode
} from '@/utils/workspaceBridge'

// 节点备注内容设置
export default {
  name: 'NodeNote',
  components: { RefBlock, SectionPicker, ConflictDialog },
  data() {
    return {
      dialogVisible: false,
      // v1.6 互斥模式：'note'（写备注）| 'ref'（引用章节），弹窗内任意时刻只显示其一
      mode: 'note',
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
      // 弹窗打开期间目标节点变化（画布另选节点）：模式/引用/编辑器全部跟随新节点
      this.loadRefs()
      this.mode = this.targetNode ? getMode(this.targetNode) : 'note'
      if (this.dialogVisible) {
        if (this.mode === 'note') {
          this.$nextTick(() => this.initEditor())
        } else {
          this.destroyEditor()
        }
      }
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
    // 只加载 refs；mode 是弹窗局部状态（可能已切换未提交），由 handleShowNodeNote /
    // targetNode watch 负责重置——不能在这里覆盖，否则 switchMode 的局部切换会被打回。
    loadRefs() {
      const n = this.targetNode
      this.refs = n ? readRefs(n) || [] : []
    },

    // ── v1.6 模式切换（带二次确认，§v1.6 2.3）─────────────────
    async switchMode(m) {
      if (m === this.mode) return
      if (m === 'ref') {
        // 写备注 → 引用章节：备注非空须确认（清空 N 字）
        const md = this.editor ? this.editor.getMarkdown() || '' : this.note || ''
        const n = md.trim().length
        if (n > 0) {
          const yes = await this.$confirm(
            `切换会清空当前备注文字（${n} 字），是否继续？`,
            '切换为「引用章节」',
            { type: 'warning' }
          ).catch(() => false)
          if (!yes) return
        }
        this.note = md // 暂存（切回时不丢）
        this.destroyEditor()
        this.mode = 'ref'
        this.loadRefs()
      } else {
        // 引用章节 → 写备注：refs 非空须确认（源 md 文件不受影响）
        if (this.refs.length) {
          const yes = await this.$confirm(
            '切换会删除当前引用（源 md 文件不受影响），是否继续？',
            '切换为「写备注」',
            { type: 'warning' }
          ).catch(() => false)
          if (!yes) return
        }
        this.mode = 'note'
        this.$nextTick(() => this.initEditor())
      }
    },

    destroyEditor() {
      if (this.editor) {
        try { this.editor.destroy() } catch (e) { /* 元素已卸载等，忽略 */ }
        this.editor = null
      }
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
      // 并隐藏画布上的备注内容浮层（NodeNoteContentShow），避免同一屏出现
      // "编辑弹窗 + 画布浮层"两份重复视图（用户感知为"两个窗口"）。
      this.$bus.$emit('closeSideBar')
      this.$bus.$emit('hideNoteContent')
      if (node) {
        this.appointNode = node
        this.note = node.getData('note') || ''
      }
      // v1.6：按 _mindlink.mode 决定弹窗打开时的模式（旧数据走推断规则）
      this.mode = this.targetNode ? getMode(this.targetNode) : 'note'
      this.loadRefs()
      this.dialogVisible = true
      // 编辑器只在 note 模式渲染（v-if）；ref 模式下不创建
      if (this.mode === 'note') {
        this.$nextTick(() => {
          this.initEditor()
        })
      } else {
        this.destroyEditor()
      }
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
            // 高度跟随内容（不再固定 500px）：空/短备注时编辑器收紧，引用条紧随其后，
            // 避免"空编辑区一大块空白 + 引用条被顶到底部"的上下两个框观感。
            // 过长内容由下方 .toastui-editor-ww-container 的 max-height 内部滚动兜底。
            height: 'auto',
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

    // 关闭弹窗（无确认，供 confirm 提交后走）
    closeDialog() {
      this.dialogVisible = false
      if (this.appointNode) {
        this.appointNode = null
        this.updateNoteInfo()
      }
      // 关闭时编辑器留在内存（下次打开复用实例）；mode 复位由下次打开决定
    },

    // 取消：有未保存改动须确认（§v1.6 三「关闭」）。ref 模式的增删引用是实时生效的，
    // 无"未保存"概念；note 模式比对编辑器与打开时的内容。
    async cancel() {
      if (this.mode === 'note' && this.editor) {
        const md = this.editor.getMarkdown() || ''
        if (md !== (this.note || '')) {
          const yes = await this.$confirm(
            '备注内容已修改但尚未保存，放弃修改？',
            '放弃修改',
            { type: 'warning' }
          ).catch(() => false)
          if (!yes) return
        }
      }
      this.closeDialog()
    },

    // 确认：按当前模式提交（§v1.6 三「保存」）
    confirm() {
      const nodes = this.appointNode
        ? [this.appointNode]
        : this.activeNodes.slice()
      if (this.mode === 'note') {
        // mode='note'：写 data.note，refs 清空
        this.note = this.editor ? this.editor.getMarkdown() : this.note
        nodes.forEach(node => {
          node.setNote(this.note)
          setMode(node, 'note')
        })
      } else {
        // mode='ref'：引用块内的编辑由 RefBlock 自身 blur 即提交（commitEdit），
        // 此处只落互斥元数据：note 置 null、mode='ref'（refs 已实时写入）
        nodes.forEach(node => {
          setMode(node, 'ref')
        })
      }
      this.closeDialog()
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

  // ── v1.6 标题行：标题 + 二选一模式切换（写备注 / 引用章节）──
  .noteHeader {
    display: flex;
    align-items: center;
    gap: 16px;

    .noteTitle {
      font-size: 16px;
      font-weight: 600;
      color: var(--macos-text);
    }

    .modeSwitch {
      display: inline-flex;
      padding: 2px;
      border-radius: 8px;
      background: var(--macos-hover, rgba(0, 0, 0, 0.05));
      gap: 2px;

      .modeBtn {
        border: none;
        background: transparent;
        padding: 4px 14px;
        font-size: 12px;
        line-height: 18px;
        border-radius: 6px;
        color: var(--macos-text-2);
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.15s ease;

        &:hover {
          color: var(--macos-text);
        }

        &.active {
          background: var(--macos-bg-glass-strong, #fff);
          color: var(--macos-accent, #409eff);
          font-weight: 600;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
        }
      }
    }
  }

  // 顶部紧凑工具栏（note 模式：语言选择+插入代码块；ref 模式：引用文档章节+刷新）
  .noteToolbar {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    margin-bottom: 8px;

    .toolGroup {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .codeLangSelect {
      height: 26px;
      font-size: 12px;
      padding: 0 4px;
      border: 1px solid var(--macos-border);
      border-radius: 4px;
      background: transparent;
      color: var(--macos-text);
      outline: none;

      &:focus {
        border-color: var(--macos-accent);
      }
    }
  }

  // ref 模式：引用块列表容器（无外框，块自带左紫竖线+浅紫底）
  // 弹窗高度翻倍（2026-09-21 反馈「框再大一点，高度增加一倍」）：
  // 引用区最小高度 400px（原内容区仅约 170px），弹窗整体从约 285px → 约 580px。
  .refArea {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 0;
    min-height: 400px;

    // 引用卡片撑满引用区（读作一整块引用内容，而非浮在上方的小卡片）
    > .refBlock {
      flex: 1;
      min-height: 0;
    }
  }

  // ref 模式空态
  .refEmpty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 28px 0 20px;
    border-radius: var(--macos-radius-sm, 8px);
    background: var(--macos-hover, rgba(0, 0, 0, 0.03));

    .refEmptyIcon {
      font-size: 26px;
      opacity: 0.6;
    }
    .refEmptyText {
      font-size: 13px;
      color: var(--macos-text-2);
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

  // ============================================================
  // v1.6 二选一：noteBox 只在「写备注」模式包裹编辑器（引用块在
  // ref 模式独立平铺，不再与编辑器同框）。
  // ============================================================
  .noteBox {
    border: 1px solid var(--macos-border);
    border-radius: var(--macos-radius-sm);
    background: rgba(255, 255, 255, 0.45);
    overflow: hidden;

    // 编辑器融入外框：去掉自带边框与底色（层级更高，压过上方 .toastui-editor-defaultUI 规则）
    .toastui-editor-defaultUI {
      border: none;
      background: transparent;
    }
  }

  // 编辑器自适应高度（配合 initEditor height:'auto'）：
  // 空内容时给足编辑落点(min-height)，过长时编辑区内部滚动(max-height)。
  // 2026-09-21 弹窗高度翻倍：min-height 140px → 400px，与 ref 模式（引用区 400px）等高。
  //
  // ⚠️ 2026-09-22 修复「备注内容太长没有滚动条」：
  // Toast UI 自带 .toastui-editor-ww-container 是 `overflow:hidden; height:inherit`，
  // 我们此前只加了 max-height:56vh 却没给滚动 → 超出 56vh 的内容被外层
  // .noteBox{overflow:hidden} 直接裁掉，既看不到也滚不动（表格/长文被截断）。
  // 修法：①把 ww-container 变成真正的滚动容器(overflow-y:auto)；
  //       ②断开 height:inherit 链（父级 height:auto 时 inherit=auto → 内层不受约束，
  //         若继续 inherit 则内层同样被裁，永不产生滚动条）。
  .toastui-editor-ww-container {
    min-height: 400px;
    max-height: 56vh;
    overflow-y: auto;
    overflow-x: hidden;

    > .toastui-editor,
    .toastui-editor-contents {
      height: auto;
      overflow: visible;
    }
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

// 暗色模式：合并框同步保持浅色底（引用块透明区也落在浅底上，紫色引用文字可读）
body.isDark .nodeNoteDialog .noteBox {
  background: rgba(255, 255, 255, 0.92);
}
</style>