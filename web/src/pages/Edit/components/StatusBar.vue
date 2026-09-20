<template>
  <div class="statusBar" :class="{ isDark: isDark }" v-if="!hidden">
    <!-- 左：可操作 -->
    <span class="sbItem sbPath" :title="path || ''" @click="locate">
      {{ path || '未打开文件' }}
    </span>
    <span
      class="sbItem"
      :class="{ dirty: dirty }"
      :title="dirty ? '点击立即保存' : '已保存'"
      @click="onSave"
    >
      {{ dirty ? '未保存 ●' : '已保存' }}
    </span>
    <span class="sbItem" title="点击滚动到引用块" @click="scrollRef">
      引用：{{ refLabel }}
    </span>
    <!-- 右：次要 -->
    <span class="sbRight">
      <span class="sbItem" title="字数" @click="showWords">{{ words }} 字</span>
      <span class="sbItem">{{ lineCol }}</span>
      <span class="sbItem" title="点击展开反链" @click="showBacklinks">
        反链：{{ backlinks }}
      </span>
      <span v-if="indexStatus !== 'ok'" class="sbItem warn" @click="rebuild">
        {{ indexStatus === 'readonly-index' ? '未建立索引·点此重建' : indexStatus }}
      </span>
      <span class="sbItem sbHide" title="隐藏状态栏" @click="hidden = true">▾</span>
    </span>
  </div>
</template>

<script>
import { getServices } from '@/utils/workspaceBridge'

export default {
  name: 'StatusBar',
  props: {
    tabId: { type: String, default: '' },
    filePath: { type: String, default: '' },
    kind: { type: String, default: 'mindmap' }
  },
  data() {
    return {
      hidden: false,
      dirty: false,
      words: 0,
      lineCol: '1:1',
      backlinks: 0,
      refLabel: '—',
      indexStatus: 'ok'
    }
  },
  computed: {
    isDark() {
      return this.$store.state.localConfig.isDark
    },
    path() {
      return this.filePath || ''
    }
  },
  watch: {
    filePath() {
      this.dirty = false
      this.words = 0
      this.backlinks = 0
    }
  },
  created() {
    this.$bus.$on('md:dirty', this.onDirty)
    this.$bus.$on('md:caret', this.onCaret)
    this.$bus.$on('workspace-opened', this.onWs)
    this.$bus.$on('doc:dirty', this.onDirty)
    this.$bus.$on('doc:saved', this.onSaved)
    this.$bus.$on('status:toggle', this.onToggle)
  },
  beforeUnmount() {
    this.$bus.$off('status:toggle', this.onToggle)
    this.$bus.$off('md:dirty', this.onDirty)
    this.$bus.$off('md:caret', this.onCaret)
    this.$bus.$off('workspace-opened', this.onWs)
    this.$bus.$off('doc:dirty', this.onDirty)
    this.$bus.$off('doc:saved', this.onSaved)
  },
  methods: {
    onToggle() {
      this.hidden = !this.hidden
    },
    onWs(d) {
      if (d) this.indexStatus = d.indexStatus || 'ok'
    },
    onDirty(p) {
      if (!p || (p.tabId && this.tabId && p.tabId !== this.tabId)) return
      this.dirty = true
      if (typeof p.words === 'number') this.words = p.words
    },
    onSaved() {
      this.dirty = false
    },
    onCaret(p) {
      if (p && typeof p.words === 'number') this.words = p.words
    },
    onSave() {
      if (!this.dirty) return
      this.$bus.$emit('md:save')
    },
    locate() {
      if (this.filePath) this.$bus.$emit('workspace-locate-file', this.filePath)
    },
    scrollRef() {
      this.$bus.$emit('status-scroll-ref')
    },
    showWords() {
      this.$message.info('字数：' + this.words)
    },
    showBacklinks() {
      this.$bus.$emit('toggle-backlink-panel')
    },
    async rebuild() {
      this.$bus.$emit('workspace-rebuild-index')
    }
  }
}
</script>

<style lang="less" scoped>
.statusBar {
  flex: none;
  height: 26px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 10px;
  font-size: 12px;
  border-top: 1px solid var(--macos-divider);
  background-color: var(--macos-bg-glass);
  backdrop-filter: var(--macos-blur);
  -webkit-backdrop-filter: var(--macos-blur);
  color: var(--macos-text);

  .sbItem {
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
    &:hover {
      color: var(--macos-accent);
    }
    &.dirty {
      color: var(--macos-warning, #e6a23c);
    }
    &.warn {
      color: var(--mm-warn-text, #92400e);
    }
  }
  .sbPath {
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sbRight {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 14px;
  }
}
</style>
