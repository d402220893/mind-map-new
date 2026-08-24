<template>
  <div class="sheetTabs" :class="{ isDark: isDark }">
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
        <span class="sheetName">{{ s.name }}</span>
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
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark
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
      this.$prompt('请输入工作表名称', '重命名工作表', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputValue: s.name,
        inputValidator: val => {
          if (!val || !val.trim()) {
            return '名称不能为空'
          }
          return true
        }
      })
        .then(({ value }) => {
          this.$emit('rename', { id: s.id, name: value.trim() })
        })
        .catch(() => {})
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
  height: 38px;
  background: #f7f8fa;
  border-top: 1px solid #e4e7ed;
  z-index: 2000;
  display: flex;
  align-items: center;
  user-select: none;

  &.isDark {
    background: #2b2f33;
    border-top-color: rgba(255, 255, 255, 0.1);
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
    height: 26px;
    max-width: 160px;
    padding: 0 8px 0 12px;
    margin-right: 4px;
    border-radius: 6px 6px 0 0;
    cursor: pointer;
    color: #606266;
    background: transparent;
    border: 1px solid transparent;
    border-bottom: none;
    font-size: 13px;
    flex-shrink: 0;

    &:hover {
      background: rgba(64, 158, 255, 0.08);
    }

    &.active {
      color: #409eff;
      background: #fff;
      border-color: #e4e7ed;
      font-weight: 600;
    }

    .sheetName {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sheetClose {
      margin-left: 6px;
      width: 16px;
      height: 16px;
      line-height: 14px;
      text-align: center;
      border-radius: 50%;
      font-size: 14px;
      color: #909399;

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
    height: 26px;
    width: 26px;
    margin-left: 4px;
    border-radius: 6px;
    cursor: pointer;
    color: #606266;
    font-size: 16px;
    flex-shrink: 0;

    &:hover {
      background: rgba(64, 158, 255, 0.12);
      color: #409eff;
    }
  }

  &.isDark {
    .sheetTab {
      color: rgba(255, 255, 255, 0.7);

      &.active {
        color: #409eff;
        background: #363b3f;
        border-color: rgba(255, 255, 255, 0.1);
      }

      .sheetClose {
        color: rgba(255, 255, 255, 0.6);
      }
    }

    .sheetAdd {
      color: rgba(255, 255, 255, 0.7);
    }
  }
}
</style>
