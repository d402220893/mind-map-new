<template>
  <el-dialog
    class="nodeNoteDialog"
    :title="$t('nodeNote.title')"
    :visible.sync="dialogVisible"
    :width="isMobile ? '90%' : '50%'"
    :top="isMobile ? '20px' : '15vh'"
    :close-on-click-modal="false"
  >
    <div class="noteEditor" ref="noteEditor" @keyup.stop @keydown.stop></div>
    <!--
      F1：单栏实时渲染（wysiwyg 单栏，不再左右分栏）
      - Toast UI 自带顶部工具栏已经有 </> 按钮（插入代码块 + 语言选择对话框）
      - codeSyntaxHighlight 插件按语言实时上色代码块
      - 图片粘贴为 data URL 内嵌，渲染为真 <img>
      - 图片双击由全局 NoteImgLightbox 拦截打开缩放查看器
      - 不再需要额外底部"插入代码块"工具栏（用户反馈 UI 难看 + exec 命令的 language 入参没生效）
    -->
    <span slot="footer" class="dialog-footer">
      <el-button @click="cancel">{{ $t('dialog.cancel') }}</el-button>
      <el-button type="primary" @click="confirm">{{
        $t('dialog.confirm')
      }}</el-button>
    </span>
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

// 节点备注内容设置
export default {
  name: 'NodeNote',
  data() {
    return {
      dialogVisible: false,
      note: '',
      activeNodes: [],
      editor: null,
      isMobile: isMobile(),
      appointNode: null
    }
  },
  watch: {
    dialogVisible(val, oldVal) {
      if (!val && oldVal) {
        this.$bus.$emit('endTextEdit')
      }
    }
  },
  created() {
    this.$bus.$on('node_active', this.handleNodeActive)
    this.$bus.$on('showNodeNote', this.handleShowNodeNote)
  },
  beforeDestroy() {
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
        this.editor = new Editor({
          el: this.$refs.noteEditor,
          height: '500px',
          // F1：单栏实时渲染（不再左右分栏）。写 markdown 当场渲染成单栏，
          // 代码块由 codeSyntaxHighlight 插件按语言实时上色；图片粘贴为 data URL 内嵌，渲染为真 <img>。
          initialEditType: 'wysiwyg',
          hideModeSwitch: true,
          plugins: [[codeSyntaxHighlight, { highlighter: Prism }]]
        })
      }
      this.editor.setMarkdown(this.note)
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
}
</style>