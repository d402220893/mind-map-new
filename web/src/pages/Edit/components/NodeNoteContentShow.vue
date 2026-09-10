<template>
  <div
    class="noteContentViewer customScrollbar"
    ref="noteContentViewer"
    :style="{
      left: this.left + 'px',
      top: this.top + 'px',
      visibility: show ? 'visible' : 'hidden'
    }"
    @click.stop
    @mousedown.stop
    @mousemove.stop
    @mouseup.stop
    @wheel.stop
  >
    <div class="noteContentWrap customScrollbar" ref="noteContentWrap" @dblclick="onDblClick"></div>
    <!-- 双击图片缩放查看器：挂载到 body，避免被画布容器裁剪；z-index 高于所有弹窗 -->
    <div
      class="noteImgLightbox"
      ref="lightbox"
      v-show="lightboxVisible"
      @click.self="closeLightbox"
      @wheel.prevent="onWheel"
    >
      <img
        class="noteImgLightboxImg"
        :src="lightboxSrc"
        :style="imgStyle"
        @mousedown.stop.prevent="onDragStart"
        @mousemove.stop.prevent="onDragMove"
        @mouseup.stop.prevent="onDragEnd"
        @mouseleave="onDragEnd"
        @click.stop
        @dragstart.prevent
      />
      <div class="noteImgLightboxBar" @click.stop>
        <button type="button" @click="zoomIn">＋</button>
        <button type="button" @click="zoomOut">－</button>
        <button type="button" @click="zoomReset">重置</button>
        <button type="button" @click="closeLightbox">关闭</button>
      </div>
    </div>
  </div>
</template>

<script>
import Viewer from '@toast-ui/editor/dist/toastui-editor-viewer'
import '@toast-ui/editor/dist/toastui-editor-viewer.css'
import Prism from '@/utils/prismSetup'
import 'prismjs/themes/prism.css'

// 节点备注内容显示
export default {
  props: {
    mindMap: {
      type: Object,
      default() {
        return null
      }
    }
  },
  data() {
    return {
      editor: null,
      show: false,
      left: 0,
      top: 0,
      node: null,
      // F2：双击图片缩放查看器状态
      lightboxVisible: false,
      lightboxSrc: '',
      scale: 1,
      panX: 0,
      panY: 0,
      dragging: false,
      dragStartX: 0,
      dragStartY: 0
    }
  },
  computed: {
    imgStyle() {
      return {
        transform: `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`
      }
    }
  },
  created() {
    this.$bus.$on('showNoteContent', this.onShowNoteContent)
    this.$bus.$on('hideNoteContent', this.hideNoteContent)
    document.body.addEventListener('click', this.hideNoteContent)
    document.addEventListener('keydown', this.onKey)
    this.$bus.$on('node_active', this.onNodeActive)
    this.$bus.$on('scale', this.onScale)
    this.$bus.$on('translate', this.onScale)
    this.$bus.$on('svg_mousedown', this.hideNoteContent)
    this.$bus.$on('expand_btn_click', this.hideNoteContent)
  },
  mounted() {
    this.mindMap.el.appendChild(this.$refs.noteContentViewer)
    this.initEditor()
    // 把查看器挂到 body，脱离画布容器，避免被 overflow/stacking context 裁剪
    if (this.$refs.lightbox && this.$refs.lightbox.parentNode !== document.body) {
      document.body.appendChild(this.$refs.lightbox)
    }
  },
  beforeDestroy() {
    this.$bus.$off('showNoteContent', this.onShowNoteContent)
    this.$bus.$off('hideNoteContent', this.hideNoteContent)
    document.body.removeEventListener('click', this.hideNoteContent)
    document.removeEventListener('keydown', this.onKey)
    this.$bus.$off('node_active', this.onNodeActive)
    this.$bus.$off('scale', this.onScale)
    this.$bus.$off('translate', this.onScale)
    this.$bus.$off('svg_mousedown', this.hideNoteContent)
    this.$bus.$off('expand_btn_click', this.hideNoteContent)
    if (this.$refs.lightbox && this.$refs.lightbox.parentNode) {
      this.$refs.lightbox.parentNode.removeChild(this.$refs.lightbox)
    }
  },
  methods: {
    onNodeActive(...args) {
      const nodes = [...args[1]]
      if (nodes.length > 0) {
        if (nodes[0] !== this.node) {
          this.hideNoteContent()
        }
      } else {
        this.hideNoteContent()
      }
    },

    // 显示备注浮层
    onShowNoteContent(content, left, top, node) {
      this.node = node
      this.editor.setMarkdown(content)
      this.handleALink()
      this.highlightCode()
      this.updateNoteContentPosition(left, top)
      this.show = true
    },

    // 对渲染后的代码块做语法高亮（python/C#/c/C++/go/verilog 等）
    highlightCode() {
      this.$nextTick(() => {
        const wrap = this.$refs.noteContentWrap
        if (wrap && typeof Prism !== 'undefined') {
          Prism.highlightAllUnder(wrap)
        }
      })
    },

    // 超链接新窗口打开
    handleALink() {
      const list = this.$refs.noteContentViewer.querySelectorAll('a')
      Array.from(list).forEach(a => {
        a.setAttribute('target', '_blank')
      })
    },

    // 更新位置
    updateNoteContentPosition(left, top) {
      const { width, height } = this.$refs.noteContentViewer.getBoundingClientRect()
      const { right, bottom } = this.mindMap.elRect
      this.left = left + width > right ? right - width : left
      this.top = top + height > bottom ? bottom - height : top
    },

    // 画布缩放事件
    onScale() {
      if (!this.node || !this.show) return
      const { left, top } = this.node.getNoteContentPosition()
      this.updateNoteContentPosition(left, top)
    },

    // 隐藏备注浮层
    hideNoteContent() {
      this.show = false
    },

    // F2：双击备注内图片 → 打开缩放查看器
    onDblClick(e) {
      const t = e.target
      if (t && t.tagName === 'IMG') {
        this.openLightbox(t.getAttribute('src') || t.src)
      }
    },
    openLightbox(src) {
      if (!src) return
      this.lightboxSrc = src
      this.scale = 1
      this.panX = 0
      this.panY = 0
      this.lightboxVisible = true
    },
    closeLightbox() {
      this.lightboxVisible = false
      this.lightboxSrc = ''
    },
    zoomIn() {
      this.scale = Math.min(this.scale * 1.2, 8)
    },
    zoomOut() {
      this.scale = Math.max(this.scale / 1.2, 0.2)
    },
    zoomReset() {
      this.scale = 1
      this.panX = 0
      this.panY = 0
    },
    onWheel(e) {
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      this.scale = Math.min(Math.max(this.scale * delta, 0.2), 8)
    },
    onKey(e) {
      if (e.key === 'Escape') this.closeLightbox()
    },
    onDragStart(e) {
      this.dragging = true
      this.dragStartX = e.clientX - this.panX
      this.dragStartY = e.clientY - this.panY
    },
    onDragMove(e) {
      if (!this.dragging) return
      this.panX = e.clientX - this.dragStartX
      this.panY = e.clientY - this.dragStartY
    },
    onDragEnd() {
      this.dragging = false
    },

    // 初始化编辑器
    initEditor() {
      if (!this.editor) {
        this.editor = new Viewer({
          el: this.$refs.noteContentWrap
        })
      }
    }
  }
}
</script>

<style lang="less" scoped>
.noteContentViewer {
  position: fixed;
  background-color: #fff;
  padding: 10px;
  border-radius: 5px;
  box-shadow: 0 2px 16px 0 rgba(0, 0, 0, 0.06);
  border: 1px solid rgba(0, 0, 0, 0.06);
  z-index: 2;

  .noteContentWrap {
    max-width: 250px;
    max-height: 300px;
    overflow-y: auto;
  }
}
</style>

<!-- 备注代码块样式（viewer 动态生成的内容，需用非 scoped 全局样式命中） -->
<style>
.noteContentWrap pre {
  margin: 6px 0;
  padding: 8px 10px;
  border-radius: 4px;
  background: #f6f8fa;
  max-height: 260px;
  overflow: auto;
}
.noteContentWrap pre code {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre;
  background: transparent;
  text-shadow: none;
}
.noteContentWrap :not(pre) > code {
  background: rgba(135, 131, 120, 0.15);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

/* F2：双击图片缩放查看器（挂到 body，故用全局样式命中） */
.noteImgLightbox {
  position: fixed;
  left: 0;
  top: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.82);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  cursor: zoom-out;
}
.noteImgLightboxImg {
  max-width: 92vw;
  max-height: 88vh;
  object-fit: contain;
  background: #fff;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
  cursor: grab;
  transform-origin: center center;
  will-change: transform;
}
.noteImgLightboxImg:active {
  cursor: grabbing;
}
.noteImgLightboxBar {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  background: rgba(0, 0, 0, 0.55);
  padding: 8px 10px;
  border-radius: 8px;
}
.noteImgLightboxBar button {
  min-width: 40px;
  height: 32px;
  border: none;
  border-radius: 4px;
  background: #2d8cf0;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}
.noteImgLightboxBar button:hover {
  background: #1c6fd0;
}
</style>
