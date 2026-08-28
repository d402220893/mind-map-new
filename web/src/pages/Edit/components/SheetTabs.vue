<template>
  <div class="sheetTabs" :class="{ isDark: isDark }" :style="{ opacity: fileTabsOpacity }">
    <div class="sheetTabsInner customScrollbar">
      <div
        v-for="s in sheets"
        :key="s.id"
        class="sheetTab"
        :class="{ active: s.id === activeId }"
        :title="s.name"
        @click="onSwitch(s)"
        @dblclick="onRename(s)"
        @contextmenu.prevent="onContextMenu(s, $event)"
      >
        <input
          v-if="s.id === editingId"
          ref="renameInput"
          class="sheetNameInput"
          v-model="editValue"
          @click.stop
          @keyup.enter="commitRename"
          @keyup.esc="cancelRename"
          @blur="commitRename"
        />
        <span v-else class="sheetName">{{ s.name }}</span>
        <span
          v-if="sheets.length > 1"
          class="sheetClose"
          title="删除工作表"
          @click.stop="onRemove(s)"
          >×</span
        >
      </div>
      <div class="sheetAdd" title="新建工作表" @click="onAdd">＋</div>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'

export default {
  name: 'SheetTabs',
  props: {
    sheets: {
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
      editValue: ''
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      fileTabsOpacity: state => state.localConfig.fileTabsOpacity
    })
  },
  methods: {
    onSwitch(s) {
      if (s.id === this.activeId) return
      this.$emit('switch', s.id)
    },
    onAdd() {
      this.$emit('add')
    },
    onRemove(s) {
      if (this.sheets.length <= 1) {
        this.$message.warning('至少需保留一个工作表')
        return
      }
      this.$confirm(
        `确定删除工作表「${s.name}」吗？该工作表的内容将被移除。`,
        '删除工作表',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
        .then(() => {
          this.$emit('remove', s.id)
        })
        .catch(() => {})
    },
    onRename(s) {
      // 原地编辑：进入编辑态并聚焦输入框，不再弹 $prompt
      this.editValue = s.name
      this.editingId = s.id
      this.$nextTick(() => {
        const el = this.$refs.renameInput
        if (el && typeof el.focus === 'function') {
          el.focus()
          if (typeof el.select === 'function') el.select()
        }
      })
    },
    commitRename() {
      // 已清空（如被 cancelRename 先行触发）则直接返回，避免重复提交
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
    onContextMenu(s, e) {
      // 右键菜单：重命名 / 删除
      const menu = document.createElement('div')
      menu.className = 'sheetContextMenu'
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
          item.style.background = this.isDark ? 'rgba(255,255,255,0.08)' : '#f5f7fa'
        }
        item.onmouseleave = () => {
          item.style.background = 'transparent'
        }
        item.onclick = () => {
          document.body.removeChild(menu)
          fn()
        }
        menu.appendChild(item)
      }

      addItem('重命名', () => this.onRename(s))
      if (this.sheets.length > 1) {
        addItem('删除', () => this.onRemove(s))
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
.sheetTabs {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 40px;
  // 透明背景，让画布延伸到底部，告别"黑框"；边框做视觉分隔
  background: transparent;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  z-index: 2000;
  display: flex;
  align-items: center;
  user-select: none;

  &.isDark {
    background: transparent;
    border-top-color: rgba(255, 255, 255, 0.08);
  }

  .sheetTabsInner {
    display: flex;
    align-items: center;
    height: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0 8px;
    white-space: nowrap;

    &::-webkit-scrollbar {
      height: 0;
    }
  }

  .sheetTab {
    display: inline-flex;
    align-items: center;
    height: 28px;
    max-width: 160px;
    padding: 0 10px 0 12px;
    margin-right: 4px;
    border-radius: 8px 8px 4px 4px;
    cursor: pointer;
    color: rgba(60, 64, 70, 0.75);
    background: transparent;
    border: 1px solid transparent;
    font-size: 13px;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease;

    &:hover {
      background: rgba(64, 158, 255, 0.10);
      color: #409eff;
    }

    &.active {
      color: #fff;
      background: linear-gradient(135deg, #4f8cff, #6aa6ff);
      font-weight: 500;
      box-shadow: 0 -2px 6px rgba(64, 158, 255, 0.30);
    }

    .sheetName {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sheetNameInput {
      box-sizing: border-box;
      width: 100%;
      height: 26px;
      line-height: 24px;
      padding: 0 4px;
      border: 1px solid #409eff;
      border-radius: 6px;
      outline: none;
      font-size: 13px;
      color: #303133;
      background: #fff;
    }

    .sheetClose {
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

  .sheetAdd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 28px;
    width: 28px;
    margin-left: 4px;
    border-radius: 8px;
    cursor: pointer;
    color: rgba(60, 64, 70, 0.65);
    font-size: 16px;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease;

    &:hover {
      background: rgba(64, 158, 255, 0.12);
      color: #409eff;
    }
  }

  &.isDark {
    .sheetTab {
      color: rgba(255, 255, 255, 0.7);

      &:hover {
        color: #409eff;
        background: rgba(64, 158, 255, 0.15);
      }

      &.active {
        color: #fff;
        background: linear-gradient(135deg, #4f8cff, #6aa6ff);
        box-shadow: 0 -2px 6px rgba(64, 158, 255, 0.5);
      }

      .sheetClose {
        color: rgba(255, 255, 255, 0.6);

        &:hover {
          background: #f56c6c;
          color: #fff;
        }
      }

      .sheetNameInput {
        color: rgba(255, 255, 255, 0.9);
        background: #1f2326;
        border-color: #409eff;
      }
    }

    .sheetAdd {
      color: rgba(255, 255, 255, 0.6);

      &:hover {
        background: rgba(64, 158, 255, 0.18);
        color: #409eff;
      }
    }
  }
}
</style>
