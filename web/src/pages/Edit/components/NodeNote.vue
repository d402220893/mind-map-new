<template>
  <el-dialog
    class="nodeNoteDialog"
    :title="$t('nodeNote.title')"
    :visible.sync="dialogVisible"
    :width="isMobile ? '90%' : '50%'"
    :top="isMobile ? '20px' : '15vh'"
  >
    <!-- <el-input
      type="textarea"
      :autosize="{ minRows: 3, maxRows: 5 }"
      placeholder="请输入内容"
      v-model="note"
    >
    </el-input> -->
    <div class="noteEditor" ref="noteEditor" @keyup.stop @keydown.stop></div>
    <!-- <div class="tip">换行请使用：Enter+Shift</div> -->
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
          initialEditType: 'markdown',
          previewStyle: 'vertical',
          // 代码块语法高亮：支持多种编程语言（prismjs 已按需加载语言包）
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
