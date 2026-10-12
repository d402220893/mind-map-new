<template>
  <div
    class="sidebarTriggerContainer "
    @click.stop
    :class="{ hasActive: show && activeSidebar, show: show, isDark: isDark }"
    :style="{ opacity: sidebarOpacity != null ? sidebarOpacity : 1 }"
  >
    <div class="toggleShowBtn" :class="{ hide: !show }" @click="show = !show">
      <span class="iconfont iconjiantouyou"></span>
    </div>
    <div class="trigger customScrollbar">
      <div
        class="triggerItem"
        v-for="item in triggerList"
        :key="item.value"
        :class="{ active: activeSidebar === item.value }"
        @click="trigger(item)"
      >
        <div class="triggerIcon iconfont" :class="[item.icon]"></div>
        <div class="triggerName">{{ item.name }}</div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState, mapMutations } from 'vuex'
import { sidebarTriggerList } from '@/config'

// 侧边栏触发器
export default {
  data() {
    return {
      show: true,
      maxHeight: 0
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar,
      isReadonly: state => state.isReadonly,
      enableAi: state => state.localConfig.enableAi,
      sidebarOpacity: state => state.localConfig.sidebarOpacity
    }),

    triggerList() {
      let list = sidebarTriggerList[this.$i18n.locale] || sidebarTriggerList.zh
      if (this.isReadonly) {
        list = list.filter(item => {
          return ['outline', 'shortcutKey', 'ai'].includes(item.value)
        })
      }
      if (!this.enableAi) {
        list = list.filter(item => {
          return item.value !== 'ai'
        })
      }
      return list
    }
  },
  watch: {
    isReadonly(val) {
      if (val) {
        this.setActiveSidebar(null)
      }
    }
  },
  created() {
    window.addEventListener('resize', this.onResize)
    this.updateSize()
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.onResize)
  },
  methods: {
    ...mapMutations(['setActiveSidebar']),

    trigger(item) {
      this.setActiveSidebar(item.value)
    },

    onResize() {
      this.updateSize()
    },

    updateSize() {
      const topMargin = 110
      const bottomMargin = 80
      this.maxHeight = window.innerHeight - topMargin - bottomMargin
    }
  }
}
</script>

<style lang="less" scoped>
.sidebarTriggerContainer {
  position: fixed;
  top: 110px;
  // 不再设底边距：让容器高度由 trigger 卡片自然撑开，避免上下透明空白露出画布。
  // 原来用 fixed top+bottom 撑满中部，但 trigger 卡片只有 6*60=360px 高，
  // 上下各 75px 透明空白会露出画布背景，深色画布下显示为黑框。
  right: -60px;
  transition: all 0.3s;
  display: flex;
  flex-direction: column;
  // 容器高度 = trigger 高度，不需要居中 trigger（它是容器唯一子元素）
  justify-content: flex-start;

  &.isDark {
    .trigger {
      // v2.0.51：跟随画布背景派生玻璃色（原硬编码 #262a2e 不随主题变）
      background-color: var(--macos-bg-glass);

      .triggerItem {
        color: var(--macos-text-2);

        &:hover {
          background-color: var(--macos-hover);
        }
      }
    }
  }

  &.show {
    right: 0;
  }

  &.hasActive {
    right: 305px;
  }

  .toggleShowBtn {
    position: absolute;
    left: -6px;
    width: 35px;
    height: 60px;
    background: #409eff;
    top: 50%;
    transform: translateY(-50%);
    cursor: pointer;
    transition: left 0.1s linear;
    z-index: 0;
    border-top-left-radius: 10px;
    border-bottom-left-radius: 10px;
    display: flex;
    align-items: center;
    padding-left: 4px;

    &.hide {
      left: -8px;

      span {
        transform: rotateZ(180deg);
      }
    }

    &:hover {
      left: -18px;
    }

    span {
      color: #fff;
      transition: all 0.1s;
    }
  }

  .trigger {
    position: relative;
    width: 60px;
    // v2.0.51：硬编码 #fff/#eee 改为主题派生玻璃（画布背景色变化时跟随）
    border-color: var(--macos-border);
    background-color: var(--macos-bg-glass);
    backdrop-filter: var(--macos-blur);
    -webkit-backdrop-filter: var(--macos-blur);
    box-shadow: 0 2px 16px 0 rgba(0, 0, 0, 0.06);
    border-radius: 6px;
    // 容器不再 fixed bottom，max-height 改用 calc(100vh - 190px) 防溢出
    // 190px = top:110px + 底部 SheetTabs 80px；超长侧边栏内滚动
    max-height: calc(100vh - 190px);
    overflow-y: auto;
    overflow-x: hidden;

    .triggerItem {
      height: 60px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      cursor: pointer;
      color: var(--macos-text);
      user-select: none;
      white-space: nowrap;

      &:hover {
        background-color: var(--macos-hover);
      }

      &.active {
        color: var(--macos-accent, #409eff);
        font-weight: bold;
      }

      .triggerIcon {
        font-size: 18px;
        margin-bottom: 5px;
      }

      .triggerName {
        font-size: 13px;
      }
    }
  }
}
</style>
