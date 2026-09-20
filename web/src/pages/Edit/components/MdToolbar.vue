<template>
  <div class="mdToolbar" :class="{ isDark: isDark, collapsed: collapsed }">
    <template v-if="!collapsed">
      <div class="tbGroup">
        <span class="tbBtn" title="撤销" @click="exec('undo')">↶</span>
        <span class="tbBtn" title="重做" @click="exec('redo')">↷</span>
      </div>
      <div class="tbGroup">
        <span class="tbBtn b" title="加粗" @click="exec('bold')"><b>B</b></span>
        <span class="tbBtn i" title="斜体" @click="exec('italic')"><i>I</i></span>
        <span class="tbBtn s" title="删除线" @click="exec('strike')"><s>S</s></span>
        <span class="tbBtn" title="行内代码" @click="exec('code')">`</span>
      </div>
      <div class="tbGroup">
        <span class="tbBtn" @click="exec('heading', { level: 1 })">H1</span>
        <span class="tbBtn" @click="exec('heading', { level: 2 })">H2</span>
        <span class="tbBtn" @click="exec('heading', { level: 3 })">H3</span>
      </div>
      <div class="tbGroup">
        <span class="tbBtn" title="引用" @click="exec('blockquote')">引用</span>
        <span class="tbBtn" title="无序列表" @click="exec('ul')">列表</span>
        <span class="tbBtn" title="任务列表" @click="exec('task')">任务</span>
        <span class="tbBtn" title="表格" @click="exec('table')">表格</span>
        <span class="tbBtn" title="代码块" @click="exec('codeBlock')">代码</span>
        <span class="tbBtn" title="分割线" @click="exec('hr')">分割线</span>
      </div>
      <div class="tbGroup">
        <span class="tbBtn" title="插入图片" @click="exec('addImage')">图片</span>
        <span class="tbBtn" title="插入链接" @click="exec('addLink')">链接</span>
        <span class="tbBtn" title="大纲" @click="toggleOutline">目录</span>
      </div>
      <div class="tbGroup right">
        <span class="tbBtn" title="保存 Ctrl+S" @click="save">保存</span>
        <span class="tbBtn" title="折叠工具栏 Ctrl+Shift+T" @click="collapsed = true">›</span>
      </div>
    </template>
    <span v-else class="tbBtn expand" title="展开工具栏" @click="collapsed = false">‹</span>
  </div>
</template>

<script>
export default {
  name: 'MdToolbar',
  data() {
    return {
      collapsed: false
    }
  },
  computed: {
    isDark() {
      return this.$store.state.localConfig.isDark
    }
  },
  created() {
    this.$bus.$on('md:toggle-toolbar', this.toggle)
  },
  beforeUnmount() {
    this.$bus.$off('md:toggle-toolbar', this.toggle)
  },
  methods: {
    toggle() {
      this.collapsed = !this.collapsed
    },
    exec(cmd, payload) {
      this.$bus.$emit('md:exec', payload ? { cmd, payload } : cmd)
    },
    save() {
      this.$bus.$emit('md:save')
    },
    toggleOutline() {
      this.$bus.$emit('toggle-md-outline')
    }
  }
}
</script>

<style lang="less" scoped>
.mdToolbar {
  flex: none;
  height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border-bottom: 1px solid var(--macos-divider);
  background-color: var(--macos-bg-glass);
  backdrop-filter: var(--macos-blur);
  -webkit-backdrop-filter: var(--macos-blur);
  color: var(--macos-text);
  font-size: 12px;
  overflow: hidden;

  &.collapsed {
    height: 30px;
  }

  .tbGroup {
    display: flex;
    align-items: center;
    gap: 2px;
    padding-right: 10px;
    border-right: 1px solid var(--macos-divider);
    &.right {
      margin-left: auto;
      border-right: none;
    }
  }
  .tbBtn {
    min-width: 24px;
    height: 24px;
    padding: 0 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    cursor: pointer;
    user-select: none;
    &:hover {
      background-color: var(--macos-hover-strong);
    }
  }
}
</style>
