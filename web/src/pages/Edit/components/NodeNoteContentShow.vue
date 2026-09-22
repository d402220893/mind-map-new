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
    @mouseenter="onPreviewEnter"
    @mouseleave="onPreviewLeave"
  >
    <div class="noteContentWrap customScrollbar" ref="noteContentWrap"></div>
    <!--
      F2：图片双击缩放查看器已抽出为独立组件 NoteImgLightbox.vue，
      挂在 Edit.vue 内并 teleport 到 body；
      全局监听 document.dblclick 自动命中此容器内的 <img>。
    -->
  </div>
</template>

<script>
import Viewer from '@toast-ui/editor/dist/toastui-editor-viewer'
import '@toast-ui/editor/dist/toastui-editor-viewer.css'
import Prism from '@/utils/prismSetup'
import 'prismjs/themes/prism.css'
import { markRaw } from 'vue'

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
      // hover 保持用（⚠️ 不能用 _ 前缀：Vue3 不代理 data 里以 _/$ 开头的键）
      // 图标 mouseout 会立刻触发隐藏，导致鼠标移向浮层时浮层瞬隐；
      // 这里用定时器延迟隐藏，鼠标进入浮层即取消。
      hideTimer: null,
      hovering: false,
      lastLeft: null,
      lastTop: null
    }
  },
  created() {
    this.$bus.$on('showNoteContent', this.onShowNoteContent)
    // 库层备注图标 mouseout → hide()：改为延迟隐藏，给鼠标移向浮层留出时间
    this.$bus.$on('hideNoteContent', this.scheduleHide)
    // 以下为明确关闭场景：立即隐藏
    document.body.addEventListener('click', this.hideNow)
    this.$bus.$on('node_active', this.onNodeActive)
    this.$bus.$on('scale', this.onScale)
    this.$bus.$on('translate', this.onScale)
    this.$bus.$on('svg_mousedown', this.hideNow)
    this.$bus.$on('expand_btn_click', this.hideNow)
  },
  mounted() {
    this.mindMap.el.appendChild(this.$refs.noteContentViewer)
    this.initEditor()
  },
  beforeUnmount() {
    this.$bus.$off('showNoteContent', this.onShowNoteContent)
    this.$bus.$off('hideNoteContent', this.scheduleHide)
    document.body.removeEventListener('click', this.hideNow)
    this.$bus.$off('node_active', this.onNodeActive)
    this.$bus.$off('scale', this.onScale)
    this.$bus.$off('translate', this.onScale)
    this.$bus.$off('svg_mousedown', this.hideNow)
    this.$bus.$off('expand_btn_click', this.hideNow)
    this.clearHideTimer()
  },
  methods: {
    onNodeActive(...args) {
      const nodes = [...args[1]]
      if (nodes.length > 0) {
        if (nodes[0] !== this.node) {
          this.hideNow()
        }
      } else {
        this.hideNow()
      }
    },

    // 显示备注浮层
    onShowNoteContent(content, left, top, node) {
      this.clearHideTimer()
      this.node = node
      this.lastLeft = left
      this.lastTop = top
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
        // 自适应宽度下代码高亮会改变行宽/尺寸 → 重新校正位置，避免浮层溢出画布右/下边
        if (this.show && typeof this.lastLeft === 'number') {
          this.updateNoteContentPosition(this.lastLeft, this.lastTop)
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

    // 鼠标进入浮层：取消待执行的隐藏（浮层需可交互/可阅读，不能一移入就消失）
    onPreviewEnter() {
      this.hovering = true
      this.clearHideTimer()
    },

    // 鼠标离开浮层：延迟隐藏，允许再移回图标或浮层
    onPreviewLeave() {
      this.hovering = false
      this.scheduleHide()
    },

    // 延迟隐藏：库在备注图标 mouseout 时立即调用，若直接隐藏则鼠标从图标
    // 移向浮层的途中（mouseout 已触发、mouseenter 未到）浮层会瞬隐。
    // 260ms 宽限期足够跨过图标与浮层间的间隙。
    scheduleHide() {
      if (this.hovering) return
      this.clearHideTimer()
      this.hideTimer = setTimeout(() => {
        this.hideTimer = null
        this.hideNow()
      }, 260)
    },

    clearHideTimer() {
      if (this.hideTimer) {
        clearTimeout(this.hideTimer)
        this.hideTimer = null
      }
    },

    // 立即隐藏（点击空白、选中节点、缩放/平移、展开按钮等明确关闭场景）
    hideNow() {
      this.clearHideTimer()
      this.hovering = false
      this.show = false
    },

    // 初始化编辑器
    initEditor() {
      if (!this.editor) {
        // ⚠️ 必须 markRaw：Viewer 内部同样是 ProseMirror，被 Vue3 data() 代理后
        // setMarkdown() 会抛 `RangeError: Applying a mismatched transaction`
        //（Vue2 时代 data() 不做深度代理，所以升级到 Vue3 后才暴露）。
        this.editor = markRaw(
          new Viewer({
            el: this.$refs.noteContentWrap
          })
        )
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
  max-width: 520px;

  .noteContentWrap {
    // 2026-09-22 修复「预览栏太窄」：旧版固定 250px 宽，表格/长文本显示不全。
    // 改为自适应宽度——短内容按自然宽（不超 min-width），长内容在 max-width 处换行；
    // 宽内容（如宽表格 / 代码）仍可在内部横向滚动。
    width: max-content;
    min-width: 260px;
    max-width: 480px;
    max-height: 320px;
    overflow: auto;
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
</style>