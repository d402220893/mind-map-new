<template>
  <div
    class="sidebarContainer"
    @click.stop
    :class="{ show: show, isDark: isDark }"
    :style="{ zIndex: zIndex }"
  >
    <span class="closeBtn el-icon-close" @click="close"></span>
    <div class="sidebarHeader" v-if="title">
      {{ title }}
    </div>
    <div class="sidebarContent customScrollbar" ref="sidebarContent">
      <slot></slot>
    </div>
  </div>
</template>

<script>
import { store } from '@/config'
import { mapState, mapMutations } from 'vuex'

// 侧边栏容器
export default {
  props: {
    title: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      show: false,
      zIndex: 0
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark
    })
  },
  watch: {
    show(val, oldVal) {
      if (val && !oldVal) {
        this.zIndex = store.sidebarZIndex++
      }
    }
  },
  created() {
    this.$bus.$on('closeSideBar', this.handleCloseSidebar)
  },
  beforeDestroy() {
    this.$bus.$off('closeSideBar', this.handleCloseSidebar)
  },
  methods: {
    ...mapMutations(['setActiveSidebar']),

    handleCloseSidebar() {
      this.close()
    },

    close() {
      this.show = false
      this.setActiveSidebar(null)
    },

    getEl() {
      return this.$refs.sidebarContent
    }
  }
}
</script>

<style lang="less" scoped>
.sidebarContainer {
  position: fixed;
  right: -320px;
  top: 110px;
  bottom: 0;
  width: 320px;
  background-color: var(--macos-bg-glass-strong);
  backdrop-filter: var(--macos-blur-strong);
  -webkit-backdrop-filter: var(--macos-blur-strong);
  border-left: 1px solid var(--macos-border);
  border-top-left-radius: var(--macos-radius-xl);
  border-bottom-left-radius: var(--macos-radius-xl);
  box-shadow: -16px 0 44px rgba(0, 0, 0, 0.16);
  display: flex;
  flex-direction: column;
  transition: right 0.32s cubic-bezier(0.32, 0.72, 0, 1);

  &.isDark {
    background-color: var(--macos-bg-glass-strong);
    border-left-color: var(--macos-border);

    .sidebarHeader {
      border-bottom-color: var(--macos-divider);
      color: var(--macos-text);
    }

    .closeBtn {
      color: var(--macos-text-2);
    }
  }

  &.show {
    right: 0;
  }

  .closeBtn {
    position: absolute;
    right: 16px;
    top: 14px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    cursor: pointer;
    color: var(--macos-text-2);
    transition: background-color 0.18s, color 0.18s;

    &:hover {
      background-color: var(--macos-hover-strong);
      color: var(--macos-danger);
    }
  }

  .sidebarHeader {
    width: 100%;
    height: 56px;
    padding-right: 44px;
    border-bottom: 1px solid var(--macos-divider);
    display: flex;
    justify-content: center;
    align-items: center;
    flex-grow: 0;
    flex-shrink: 0;
    font-weight: 600;
    font-size: 15px;
    color: var(--macos-text);
  }

  .sidebarContent {
    width: 100%;
    height: 100%;
    overflow: auto;
  }
}
</style>
