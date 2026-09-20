<template>
  <div class="mdEditor" :class="{ isDark: isDark }">
    <div class="mdEditorTop" v-if="readonly">
      <span class="mdRoTag">{{ encodingSuspect ? '疑似非 UTF-8 编码，已只读打开（保存将不写回原文件）' : '只读预览（&gt; 1MB 或非工作区文件）' }}</span>
      <el-button size="small" @click="forceEdit" v-if="!encodingSuspect">强制编辑</el-button>
    </div>
    <div class="mdEditorHost" ref="host"></div>
    <div v-if="loading" class="mdSkeleton">
      <div v-for="i in 10" :key="i" class="mdSkeletonRow"></div>
    </div>
  </div>
</template>

<script>
import Editor from '@toast-ui/editor'
import '@toast-ui/editor/dist/toastui-editor.css'
import codeSyntaxHighlight from '@toast-ui/editor-plugin-code-syntax-highlight'
import '@toast-ui/editor-plugin-code-syntax-highlight/dist/toastui-editor-plugin-code-syntax-highlight.css'
import 'prismjs/themes/prism.css'
import Prism from 'prismjs'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-markdown'
import { markRaw, createApp } from 'vue'
import { mdDoc, navigate, getServices, resolveAbsLink, openPath } from '@/utils/workspaceBridge'
import { clearHistoryBaseline } from '@/utils/mdHistory'
import MindMapPreview from './MindMapPreview.vue'

const BIG_FILE = 1024 * 1024

export default {
  name: 'MdEditor',
  props: {
    tabId: { type: String, required: true },
    filePath: { type: String, default: '' }
  },
  data() {
    return {
      editor: null,
      loading: false,
      readonly: false,
      forcedEdit: false,
      encodingSuspect: false,
      isDark: false,
      words: 0,
      line: 1,
      col: 1,
      // md 内嵌 .smm 的只读预览实例（§9.5）
      embedApps: []
    }
  },
  watch: {
    tabId() {
      this.mountContent()
    },
    filePath() {
      this.mountContent()
    }
  },
  created() {
    this.$bus.$on('md:exec', this.onExec)
    this.$bus.$on('md-scroll-to-anchor', this.scrollToAnchor)
    this.$bus.$on('md:scroll-to-anchor', this.scrollToAnchor)
    this.$bus.$on('md:save', this.saveNow)
    this.$bus.$on('md:insert', this.onInsert)
  },
  beforeUnmount() {
    this.$bus.$off('md:exec', this.onExec)
    this.$bus.$off('md-scroll-to-anchor', this.scrollToAnchor)
    this.$bus.$off('md:scroll-to-anchor', this.scrollToAnchor)
    this.$bus.$off('md:save', this.saveNow)
    this.$bus.$off('md:insert', this.onInsert)
    this.detachDomHandlers()
    this.unmountEmbeds()
    if (this._embedTimer) clearTimeout(this._embedTimer)
    if (this.editor) {
      try {
        this.editor.destroy()
      } catch (e) {}
      this.editor = null
    }
  },
  mounted() {
    this.isDark = this.$store.state.localConfig.isDark
    this.initEditor()
    this.mountContent()
  },
  methods: {
    initEditor() {
      if (this.editor) return
      // ⚠️ 必须 markRaw：Toast UI 内部是 ProseMirror，被 Vue3 深度代理会让
      // Node.eq()/sameMarkup() 返 false → view.dispatch() 抛 RangeError（备注面板踩过的坑）。
      this.editor = markRaw(
        new Editor({
          el: this.$refs.host,
          height: '100%',
          initialEditType: 'wysiwyg',
          hideModeSwitch: true,
          usageStatistics: false,
          plugins: [[codeSyntaxHighlight, { highlighter: Prism }]],
          events: {
            change: () => this.onChange(),
            caretChange: () => this.updateCaret()
          }
        })
      )
      this.attachDomHandlers()
    },

    async mountContent() {
      this.loading = true
      let doc = mdDoc.get(this.tabId)
      if (!doc && this.filePath) {
        const r = await mdDoc.load(this.tabId, this.filePath)
        doc = r.ok ? mdDoc.get(this.tabId) : null
      }
      const content = (doc && doc.content) || ''
      // §10-#12：疑似非 UTF-8 → 强制只读且不给"强制编辑"出口（写回会毁原文件）
      this.encodingSuspect = !!(doc && doc.encodingSuspect)
      this.readonly = this.encodingSuspect || (!this.forcedEdit && content.length > BIG_FILE)
      this.$nextTick(() => {
        if (this.editor) {
          // 去重：mounted + watch tabId/filePath 会多次触发 mountContent，
          // 重复 setMarkdown 会向 undo 栈叠加「整篇替换」记录（§32.4 Bug④）
          if (this.editor.getMarkdown() !== content) {
            this.editor.setMarkdown(content)
          }
          // 清空 undo 基线：让初始载入不可撤销，Ctrl+Z 不会一路回退到空编辑器（Bug④ 根因）
          this.resetMdHistory()
          // 载入后聚焦，使光标可见、可直接输入（Bug③）
          if (typeof this.editor.focus === 'function') this.editor.focus()
        }
        this.loading = false
        this.broadcastOutline(content)
        this.updateStats(content)
        this.scheduleEmbeds()
      })
    },

    // 清除 Toast UI WYSIWYG（ProseMirror）的 undo 历史基线，使「初始 setMarkdown」不可撤销。
    // 否则 Ctrl+Z 会回退到编辑器刚创建时的空状态 → 整篇被清空（§32.4 Bug④）。
    resetMdHistory() {
      try {
        const view = this.editor && this.editor.wwEditor && this.editor.wwEditor.view
        clearHistoryBaseline(view)
      } catch (e) {
        // 历史插件形态不符时静默放弃，不影响正文载入
      }
    },

    onChange() {
      if (!this.editor) return
      const text = this.editor.getMarkdown()
      mdDoc.setContent(this.tabId, text)
      mdDoc.scheduleSave(this.tabId, this.filePath, 1200)
      this.updateStats(text)
      this.debouncedOutline(text)
      this.scheduleEmbeds()
      this.$bus.$emit('md:dirty', { tabId: this.tabId, dirty: true })
    },

    // ── md 内嵌 .smm 只读预览（§9.5）──────────────────────────────────
    // Toast UI 会把 ![alt](map.smm) 渲染成"加载失败"的 <img>。这里把这类 img
    // 隐藏并在其后挂载一个独立的只读 MindMap 实例（不复用主画布实例，避免状态串）。
    scheduleEmbeds() {
      if (this._embedTimer) clearTimeout(this._embedTimer)
      this._embedTimer = setTimeout(() => this.mountEmbeds(), 250)
    },

    unmountEmbeds() {
      for (const item of this.embedApps) {
        try {
          item.app.unmount()
        } catch (e) {}
        if (item.holder && item.holder.parentNode) item.holder.parentNode.removeChild(item.holder)
      }
      this.embedApps = []
    },

    mountEmbeds() {
      const host = this.$refs.host
      if (!host) return
      // 内容重排后旧占位可能已消失：先整体重建，保证与正文一一对应（成本低，数量本就少）
      const imgs = Array.from(host.querySelectorAll('img[src]'))
        .filter(img => /\.smm($|[?#])/i.test(img.getAttribute('src') || ''))
      const sameCount = imgs.length === this.embedApps.length
        && imgs.every((img, i) => img.getAttribute('src') === this.embedApps[i].src)
      if (sameCount && imgs.length) return
      this.unmountEmbeds()
      for (const img of imgs) {
        const raw = img.getAttribute('src') || ''
        const abs = raw.startsWith('data:') ? '' : resolveAbsLink(this.filePath, raw)
        if (!abs) continue
        img.style.display = 'none'
        const holder = document.createElement('div')
        holder.className = 'mdSmmEmbed'
        if (img.parentNode) img.parentNode.insertBefore(holder, img.nextSibling)
        const app = createApp(MindMapPreview, {
          src: abs,
          height: '360px',
          onOpen: p => openPath(p || abs)
        })
        app.mount(holder)
        this.embedApps.push({ app, holder, src: raw })
      }
    },

    debouncedOutline(text) {
      if (this._outlineTimer) clearTimeout(this._outlineTimer)
      this._outlineTimer = setTimeout(() => this.broadcastOutline(text), 300)
    },

    broadcastOutline(text) {
      const sections = getServices().sectionService.parseText(text, { file: this.filePath })
      this.$bus.$emit('md-outline-changed', { tabId: this.tabId, sections })
    },

    updateStats(text) {
      this.words = String(text || '').replace(/\s+/g, '').length
    },

    updateCaret() {
      // 行:列 供状态栏；Toast UI 未直出行列，用选区偏移近似
      this.$bus.$emit('md:caret', { tabId: this.tabId, words: this.words })
    },

    saveNow() {
      if (!this.filePath) return
      return mdDoc.save(this.tabId, this.filePath).then(r => {
        if (!r.ok) {
          // ⚠️ 失败时**不能**清脏标记：否则界面显示"已保存"，用户关窗即丢改动。
          const code = r.error && r.error.code
          if (code === 'E_ENCODING_SUSPECT') {
            this.$message.error('该文件疑似非 UTF-8，已阻止写回以免损坏；请另存为新文件')
          } else {
            this.$message.error('保存失败：' + ((r.error && (r.error.message || code)) || '未知错误'))
          }
          return r
        }
        this.$bus.$emit('md:dirty', { tabId: this.tabId, dirty: false })
        this.$message.success('已保存')
        return r
      })
    },

    forceEdit() {
      this.forcedEdit = true
      this.readonly = false
    },

    // ── 工具栏命令（MdToolbar 通过 bus 下发）──
    onExec(cmd) {
      if (!this.editor) return
      try {
        this.editor.exec(cmd)
      } catch (e) {
        console.error('[MdEditor] exec 失败:', cmd, e)
      }
    },

    onInsert({ text }) {
      if (!this.editor) return
      try {
        this.editor.insertText ? this.editor.insertText(text) : this.editor.exec('insertText', text)
      } catch (e) {
        const cur = this.editor.getMarkdown() || ''
        this.editor.setMarkdown(cur + '\n' + text)
      }
      this.onChange()
    },

    // ── DOM 委托：链接点击拦截（§7.10.3-①）──
    attachDomHandlers() {
      const el = this.$refs.host
      if (!el) return
      this._onClick = e => {
        const a = e.target && e.target.closest ? e.target.closest('a[href]') : null
        if (!a) return
        // 只拦"非修饰键 + 左键"；Ctrl/Cmd+点击交给系统浏览器
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()
        navigate(a.getAttribute('href'), this.filePath)
      }
      this._onPaste = e => {
        const items = e.clipboardData && e.clipboardData.files
        if (!items || !items.length) return
        const f = items[0]
        if (!/^image\//.test(f.type)) return
        e.preventDefault()
        this.pasteImage(f)
      }
      this._onKey = e => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
          e.preventDefault()
          this.saveNow()
        }
      }
      el.addEventListener('click', this._onClick, true)
      el.addEventListener('paste', this._onPaste, true)
      el.addEventListener('keydown', this._onKey, true)
    },

    detachDomHandlers() {
      const el = this.$refs.host
      if (!el) return
      if (this._onClick) el.removeEventListener('click', this._onClick, true)
      if (this._onPaste) el.removeEventListener('paste', this._onPaste, true)
      if (this._onKey) el.removeEventListener('keydown', this._onKey, true)
    },

    // ── 粘贴图片（§7.10.5）：写盘到 md 同目录 assets/ 后插入相对路径 ──
    async pasteImage(file) {
      const reader = new FileReader()
      reader.onload = async () => {
        const dataUrl = String(reader.result || '')
        const base64 = dataUrl.split(',')[1] || ''
        const dir = String(this.filePath || '').replace(/\\/g, '/').replace(/\/[^/]*$/, '')
        const ext = (file.type || 'image/png').split('/')[1] || 'png'
        const name = 'paste-' + Date.now() + '.' + ext
        const rel = 'assets/' + name
        const abs = (dir || '.') + '/' + rel
        const svc = getServices().workspaceService
        const w = typeof svc.writeBinary === 'function'
          ? await svc.writeBinary(abs, base64, { encoding: 'base64' })
          : null
        // 写盘不可用（无工作区 / 环境不支持）→ 降级为 base64 内嵌，保证不丢内容
        this.onInsert({ text: w && w.ok ? '![](' + rel + ')' : '![](' + dataUrl + ')' })
      }
      reader.readAsDataURL(file)
    },

    // ── 锚点定位（§7.10.3-③）──
    async scrollToAnchor({ anchor }) {
      if (!anchor || !this.editor) return
      const r = await getServices().sectionService.resolveAnchor(this.filePath, anchor)
      if (!r.ok) return
      this.scrollToLine(r.data.line)
    },

    scrollToLine(line) {
      const el = this.$refs.host
      if (!el) return
      const nodes = el.querySelectorAll('.toastui-editor-ww-container *[data-nodeid], .toastui-editor-ww-container h1, .toastui-editor-ww-container h2, .toastui-editor-ww-container h3')
      const target = nodes && nodes[Math.max(0, Math.min(line, nodes.length - 1))]
      if (target && target.scrollIntoView) target.scrollIntoView({ block: 'start' })
    },

    getContent() {
      return this.editor ? this.editor.getMarkdown() : ''
    },
    focus() {
      if (this.editor) this.editor.focus()
    }
  }
}
</script>

<style lang="less" scoped>
.mdEditor {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;

  .mdEditorTop {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    font-size: 12px;
    color: var(--mm-warn-text, #92400e);
    background: var(--mm-warn-bg, #fef3c7);
  }

  .mdEditorHost {
    flex: 1;
    min-height: 0;
  }

  // 内嵌 .smm 只读预览（§9.5）：占位容器由 DOM 注入，不受 scoped 影响深色适配
  ::v-deep(.mdSmmEmbed) {
    margin: 8px 0;
    border: 1px solid var(--macos-border);
    border-radius: 8px;
    overflow: hidden;
    background: var(--macos-bg-glass);
  }

  .mdSkeleton {
    position: absolute;
    inset: 0;
    padding: 24px;
    background: var(--macos-bg);
    .mdSkeletonRow {
      height: 14px;
      margin-bottom: 12px;
      border-radius: 4px;
      background: var(--macos-hover-strong);
      &:nth-child(3n) {
        width: 60%;
      }
    }
  }
}
</style>

<style lang="less">
// Toast UI 内部结构不在组件模板内，必须全局作用域
.mdEditor .toastui-editor-defaultUI {
  border: none;
  background: transparent;
}
.mdEditor .toastui-editor-defaultUI-toolbar {
  background: transparent;
  border-bottom: 1px solid var(--macos-divider);
}
.mdEditor .toastui-editor-main,
.mdEditor .toastui-editor-ww-container .toastui-editor {
  background: transparent;
}
body:not(.isDark) .mdEditor .toastui-editor-ww-container .toastui-editor {
  color: var(--macos-text);
}
body.isDark .mdEditor .toastui-editor-defaultUI {
  background: rgba(255, 255, 255, 0.92);
}
</style>
