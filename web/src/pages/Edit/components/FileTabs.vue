<template>
  <div class="fileTabs" :class="{ isDark: isDark }" @dblclick.self="onMaximize">
    <div class="fileBrand">思绪思维导图</div>
    <div class="fileTabsInner customScrollbar">
      <div
        v-for="w in workbooks"
        :key="w.id"
        class="fileTab"
        :class="{ active: w.id === activeId }"
        :title="w.name + (w.filePath ? '\n' + w.filePath : '')"
        @click="onSwitch(w)"
        @dblclick="onRename(w)"
        @contextmenu.prevent="onContextMenu(w, $event)"
      >
        <span class="fileIcon" :class="{ saved: !!w.filePath }">
          {{ w.filePath ? '📄' : '📝' }}
        </span>
        <input
          v-if="w.id === editingId"
          ref="renameInput"
          class="fileNameInput"
          v-model="editValue"
          @click.stop
          @keyup.enter="commitRename"
          @keyup.esc="cancelRename"
          @blur="commitRename"
        />
        <span v-else class="fileName">{{ w.name }}</span>
        <span
          class="fileClose"
          title="关闭文件"
          @click.stop="onRemove(w)"
          >×</span
        >
      </div>
      <div class="fileAdd" title="新建文件" @click="onAdd">＋</div>
    </div>
    <!-- 自定义标题栏窗口控制按钮（frameless 窗口用） -->
    <div class="windowControls">
      <div class="windowBtn minimize" title="最小化" @click="onMinimize">
        <svg viewBox="0 0 12 12"><rect x="0" y="5.5" width="12" height="1" fill="currentColor"/></svg>
      </div>
      <div class="windowBtn maximize" :title="isMaximized ? '还原' : '最大化'" @click="onMaximize">
        <svg v-if="!isMaximized" viewBox="0 0 12 12"><rect x="0.5" y="0.5" width="11" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1"/></svg>
        <svg v-else viewBox="0 0 12 12"><path d="M2.5 2.5h7v7h-7z" fill="none" stroke="currentColor" stroke-width="1"/><path d="M2.5 4.5h-1v-3h3v1" fill="none" stroke="currentColor" stroke-width="1"/></svg>
      </div>
      <div class="windowBtn close" title="关闭" @click="onClose">
        <svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'

// 顶部文件标签栏：在菜单栏位置显示所有打开的思维导图文件，
// 每个文件可独立保存/加载，但内部仍包含多个 sheet（由底部 SheetTabs 管理）。
export default {
  name: 'FileTabs',
  props: {
    workbooks: {
      type: Array,
      default: () => []
    },
    activeId: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      editingId: '',
      editValue: '',
      isMaximized: false
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark
    })
  },
  mounted() {
    this.updateWindowState()
    this._onResize = () => this.updateWindowState()
    window.addEventListener('resize', this._onResize)
  },
  beforeDestroy() {
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize)
    }
  },
  methods: {
    async updateWindowState() {
      try {
        if (window.smmApi && window.smmApi.windowControls && window.smmApi.windowControls.getState) {
          const state = await window.smmApi.windowControls.getState()
          this.isMaximized = !!state.maximized
        }
      } catch (e) {}
    },
    async onMinimize() {
      try {
        if (window.smmApi && window.smmApi.windowControls && window.smmApi.windowControls.minimize) {
          await window.smmApi.windowControls.minimize()
        }
      } catch (e) {}
    },
    async onMaximize() {
      try {
        if (window.smmApi && window.smmApi.windowControls && window.smmApi.windowControls.maximize) {
          await window.smmApi.windowControls.maximize()
          await this.updateWindowState()
        }
      } catch (e) {}
    },
    async onClose() {
      try {
        if (window.smmApi && window.smmApi.windowControls && window.smmApi.windowControls.close) {
          await window.smmApi.windowControls.close()
        }
      } catch (e) {}
    },
    onSwitch(w) {
      if (w.id === this.activeId) return
      this.$emit('switch', w.id)
    },
    onAdd() {
      this.$emit('add')
    },
    onRemove(w) {
      // 至少保留一个文件
      if (this.workbooks.length <= 1) {
        this.$message.warning('至少需保留一个文件')
        return
      }
      this.$confirm(
        `确定关闭文件「${w.name}」吗？未保存的内容将丢失。`,
        '关闭文件',
        {
          confirmButtonText: '关闭',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
        .then(() => {
          this.$emit('close', w.id)
        })
        .catch(() => {})
    },
    onRename(w) {
      this.editValue = w.name
      this.editingId = w.id
      this.$nextTick(() => {
        const el = this.$refs.renameInput
        if (el && typeof el.focus === 'function') {
          el.focus()
          if (typeof el.select === 'function') el.select()
        }
      })
    },
    commitRename() {
      if (!this.editingId) return
      const name = (this.editValue || '').trim()
      if (name) {
        this.$emit('rename', { id: this.editingId, name })
      }
      this.editingId = ''
      this.editValue = ''
    },
    cancelRename() {
      this.editingId = ''
      this.editValue = ''
    },
    onContextMenu(w, e) {
      const menu = document.createElement('div')
      menu.className = 'fileContextMenu'
      menu.style.position = 'fixed'
      menu.style.left = e.clientX + 'px'
      menu.style.top = e.clientY + 'px'
      menu.style.zIndex = 5000
      menu.style.background = this.isDark ? '#262a2e' : '#fff'
      menu.style.border =
        '1px solid ' + (this.isDark ? 'rgba(255,255,255,0.1)' : '#dcdfe6')
      menu.style.borderRadius = '6px'
      menu.style.boxShadow = '0 2px 12px rgba(0,0,0,0.15)'
      menu.style.padding = '4px 0'
      menu.style.fontSize = '13px'
      menu.style.color = this.isDark ? 'rgba(255,255,255,0.9)' : '#333'

      const addItem = (label, fn) => {
        const item = document.createElement('div')
        item.textContent = label
        item.style.padding = '8px 18px'
        item.style.cursor = 'pointer'
        item.onmouseenter = () => {
          item.style.background = this.isDark
            ? 'rgba(255,255,255,0.08)'
            : '#f5f7fa'
        }
        item.onmouseleave = () => {
          item.style.background = 'transparent'
        }
        item.onclick = () => {
          if (menu.parentNode) document.body.removeChild(menu)
          fn()
        }
        menu.appendChild(item)
      }

      addItem('重命名', () => this.onRename(w))
      if (this.workbooks.length > 1) {
        addItem('关闭', () => this.onRemove(w))
      }

      document.body.appendChild(menu)
      const close = () => {
        if (menu.parentNode) document.body.removeChild(menu)
        document.removeEventListener('click', close)
        document.removeEventListener('contextmenu', close)
      }
      setTimeout(() => {
        document.addEventListener('click', close)
        document.addEventListener('contextmenu', close)
      }, 0)
    }
  }
}
</script>

<style lang="less" scoped>
.fileTabs {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  height: 34px;
  background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(244,246,250,0.96));
  backdrop-filter: saturate(180%) blur(12px);
  -webkit-backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  z-index: 2001;
  display: flex;
  align-items: center;
  user-select: none;
  // 自定义标题栏：可拖动区域
  -webkit-app-region: drag;

  &.isDark {
    background: linear-gradient(180deg, rgba(36,40,44,0.92), rgba(28,32,36,0.96));
    border-bottom-color: rgba(255, 255, 255, 0.08);
  }

  .fileBrand {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    height: 100%;
    padding: 0 14px 0 12px;
    font-size: 13px;
    font-weight: 600;
    color: rgba(26, 26, 26, 0.9);
    letter-spacing: 0.5px;
    user-select: none;
    border-right: 1px solid rgba(0, 0, 0, 0.06);
    -webkit-app-region: drag;
  }

  .fileTabsInner {
    display: flex;
    align-items: center;
    height: 100%;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0 120px 0 8px;
    white-space: nowrap;
    -webkit-app-region: no-drag;

    &::-webkit-scrollbar {
      height: 0;
    }
  }

  .fileTab {
    display: inline-flex;
    align-items: center;
    height: 24px;
    max-width: 200px;
    -webkit-app-region: no-drag;
    padding: 0 8px 0 10px;
    margin-right: 4px;
    border-radius: 8px;
    cursor: pointer;
    color: rgba(60, 64, 70, 0.85);
    background: transparent;
    border: 1px solid transparent;
    font-size: 13px;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;

    &:hover {
      background: rgba(64, 158, 255, 0.10);
      color: #409eff;
    }

    &.active {
      color: #fff;
      background: linear-gradient(135deg, #4f8cff, #6aa6ff);
      font-weight: 500;
      box-shadow: 0 2px 6px rgba(64, 158, 255, 0.35);
    }

    .fileIcon {
      margin-right: 5px;
      font-size: 12px;
      line-height: 1;
    }

    .fileName {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .fileNameInput {
      box-sizing: border-box;
      width: 140px;
      height: 22px;
      line-height: 20px;
      padding: 0 4px;
      border: 1px solid #409eff;
      border-radius: 6px;
      outline: none;
      font-size: 13px;
      color: #303133;
      background: #fff;
    }

    .fileClose {
      margin-left: 6px;
      width: 16px;
      height: 16px;
      line-height: 14px;
      text-align: center;
      border-radius: 50%;
      font-size: 14px;
      color: rgba(0, 0, 0, 0.45);
      transition: background 0.15s ease, color 0.15s ease;

      &:hover {
        background: #f56c6c;
        color: #fff;
      }
    }
  }

  .fileAdd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 24px;
    width: 24px;
    margin-left: 4px;
    border-radius: 8px;
    cursor: pointer;
    color: rgba(60, 64, 70, 0.65);
    font-size: 16px;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease;
    -webkit-app-region: no-drag;

    &:hover {
      background: rgba(64, 158, 255, 0.12);
      color: #409eff;
    }
  }

  // 自定义标题栏窗口控制按钮
  .windowControls {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    -webkit-app-region: no-drag;
    z-index: 10;

    .windowBtn {
      width: 38px;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: rgba(60, 64, 70, 0.85);
      transition: background 0.15s ease, color 0.15s ease;

      svg {
        width: 12px;
        height: 12px;
      }

      &:hover {
        background: rgba(0, 0, 0, 0.06);
      }

      &.close:hover {
        background: #e81123;
        color: #fff;
      }
    }
  }

  &.isDark {
    .fileBrand {
      color: rgba(255, 255, 255, 0.9);
      border-right-color: rgba(255, 255, 255, 0.08);
    }

    .fileTab {
      color: rgba(255, 255, 255, 0.7);
      background: transparent;

      &:hover {
        background: rgba(64, 158, 255, 0.15);
        color: #409eff;
      }

      &.active {
        color: #fff;
        background: linear-gradient(135deg, #4f8cff, #6aa6ff);
        box-shadow: 0 2px 6px rgba(64, 158, 255, 0.5);
      }

      .fileClose {
        color: rgba(255, 255, 255, 0.6);

        &:hover {
          background: #f56c6c;
          color: #fff;
        }
      }

      .fileNameInput {
        color: rgba(255, 255, 255, 0.9);
        background: #1f2326;
        border-color: #409eff;
      }
    }

    .fileAdd {
      color: rgba(255, 255, 255, 0.6);

      &:hover {
        background: rgba(64, 158, 255, 0.18);
        color: #409eff;
      }
    }

    .windowControls {
      .windowBtn {
        color: rgba(255, 255, 255, 0.75);

        &:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        &.close:hover {
          background: #e81123;
          color: #fff;
        }
      }
    }
  }
}
</style>