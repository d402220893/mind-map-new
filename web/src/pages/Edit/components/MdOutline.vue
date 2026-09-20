<template>
  <div class="mdOutline" :class="{ isDark: isDark }">
    <div class="olHeader">大纲</div>
    <div class="olBody customScrollbar">
      <div v-if="!sections.length" class="olEmpty">尚无标题</div>
      <div
        v-for="(s, i) in sections"
        :key="s.id || i"
        class="olItem"
        :class="{ active: i === activeIndex }"
        :style="{ paddingLeft: 8 + (s.level - 1) * 14 + 'px' }"
        :title="s.title"
        @click="jump(s)"
      >
        {{ s.title }}
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'MdOutline',
  data() {
    return {
      sections: [],
      activeIndex: -1
    }
  },
  computed: {
    isDark() {
      return this.$store.state.localConfig.isDark
    }
  },
  created() {
    this.$bus.$on('md-outline-changed', this.onOutline)
  },
  beforeUnmount() {
    this.$bus.$off('md-outline-changed', this.onOutline)
  },
  methods: {
    onOutline({ sections }) {
      this.sections = sections || []
    },
    jump(s) {
      this.activeIndex = this.sections.indexOf(s)
      this.$bus.$emit('md-scroll-to-anchor', { anchor: s.anchor, line: s.startLine })
    }
  }
}
</script>

<style lang="less" scoped>
.mdOutline {
  display: flex;
  flex-direction: column;
  width: 220px;
  height: 100%;
  border-left: 1px solid var(--macos-border);
  background-color: var(--macos-bg-glass);
  backdrop-filter: var(--macos-blur);
  -webkit-backdrop-filter: var(--macos-blur);
  color: var(--macos-text);
  font-size: 12px;

  .olHeader {
    flex: none;
    height: 30px;
    display: flex;
    align-items: center;
    padding: 0 10px;
    font-weight: 600;
    border-bottom: 1px solid var(--macos-divider);
  }
  .olBody {
    flex: 1;
    overflow: auto;
    padding: 4px 0;
  }
  .olItem {
    height: 24px;
    line-height: 24px;
    padding-right: 8px;
    cursor: pointer;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    &:hover {
      background-color: var(--macos-hover);
    }
    &.active {
      background-color: var(--macos-hover-strong);
      color: var(--macos-accent);
    }
  }
  .olEmpty {
    padding: 10px;
    color: var(--macos-text-2);
  }
}
</style>
