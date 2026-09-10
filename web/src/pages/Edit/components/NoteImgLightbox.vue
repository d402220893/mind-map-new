<template>
  <div
    class="noteImgLightbox"
    v-show="visible"
    @click.self="close"
    @wheel.prevent="onWheel"
  >
    <img
      class="noteImgLightboxImg"
      :src="src"
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
      <button type="button" @click="reset">重置</button>
      <button type="button" @click="close">关闭</button>
    </div>
  </div>
</template>

<script>
// 备注图片双击缩放查看器（F2 重做版：独立组件，全局唯一一份）
// 挂在 Edit.vue 模板内，mounted 时 append 到 body，脱离画布容器与所有 stacking context。
// 自己全局监听 document.dblclick：当事件目标是 <img> 且最近容器命中
// .nodeNoteDialog / .noteContentViewer / .sidebarContainer 之一时打开。
// —— 这样编辑框、悬停浮层、侧栏三处都能用，不再依赖各组件自己挂监听。
export default {
  name: 'NoteImgLightbox',
  data() {
    return {
      visible: false,
      src: '',
      scale: 1,
      panX: 0,
      panY: 0,
      dragging: false,
      dragStartX: 0,
      dragStartY: 0,
      // 三个宿主的精确类名匹配（避免误触发到画布图片/工具栏图标）
      hostSelector:
        '.nodeNoteDialog, .noteContentViewer, .sidebarContainer'
    }
  },
  computed: {
    imgStyle() {
      return {
        transform: `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`
      }
    }
  },
  mounted() {
    // teleport 到 body，避免被父级 stacking context / overflow 裁剪
    if (this.$el && this.$el.parentNode !== document.body) {
      document.body.appendChild(this.$el)
    }
    // 全局监听：捕获阶段优先于 Toast UI 的图片双击默认行为
    this._onDocDblClick = (e) => this.onDocDblClick(e)
    this._onKey = (e) => this.onKey(e)
    document.addEventListener('dblclick', this._onDocDblClick, true)
    document.addEventListener('keydown', this._onKey)
  },
  beforeDestroy() {
    document.removeEventListener('dblclick', this._onDocDblClick, true)
    document.removeEventListener('keydown', this._onKey)
    if (this.$el && this.$el.parentNode) {
      this.$el.parentNode.removeChild(this.$el)
    }
  },
  methods: {
    onDocDblClick(e) {
      const t = e.target
      if (!t || t.tagName !== 'IMG') return
      // 只命中三个备注宿主内的图片（编辑框 / 浮层 / 侧栏）
      const host = t.closest && t.closest(this.hostSelector)
      if (!host) return
      // 拦截 Toast UI WYSIWYG 默认的图片双击编辑行为
      e.preventDefault()
      e.stopPropagation()
      this.open(t.getAttribute('src') || t.src || '')
    },
    open(src) {
      if (!src) return
      this.src = src
      this.scale = 1
      this.panX = 0
      this.panY = 0
      this.visible = true
    },
    close() {
      this.visible = false
      this.src = ''
    },
    zoomIn() {
      this.scale = Math.min(this.scale * 1.2, 8)
    },
    zoomOut() {
      this.scale = Math.max(this.scale / 1.2, 0.2)
    },
    reset() {
      this.scale = 1
      this.panX = 0
      this.panY = 0
    },
    onWheel(e) {
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      this.scale = Math.min(Math.max(this.scale * delta, 0.2), 8)
    },
    onKey(e) {
      if (e.key === 'Escape' && this.visible) this.close()
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
    }
  }
}
</script>

<style scoped>
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