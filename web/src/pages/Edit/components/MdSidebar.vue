<template>
  <div>
    <!-- 右侧竖排图标栏：视觉同款 SidebarTrigger.vue（自包含，不污染 vuex activeSidebar） -->
    <div
      class="mdSidebarTrigger"
      @click.stop
      :class="{ show: state !== 'hidden', hasActive: ['outline', 'search'].includes(state), isDark: isDark }"
    >
      <div class="toggleShowBtn" :class="{ hide: state === 'hidden' }" @click="toggleShow">
        <span class="iconfont iconjiantouyou"></span>
      </div>
      <div class="trigger customScrollbar">
        <div
          class="triggerItem"
          v-for="item in items"
          :key="item.value"
          :class="{ active: state === item.value }"
          :title="item.name"
          @click="trigger(item)"
        >
          <div class="triggerIcon iconfont" :class="item.icon"></div>
          <div class="triggerName">{{ item.name }}</div>
        </div>
      </div>
    </div>

    <!-- 右侧滑入面板：视觉同款 Sidebar.vue -->
    <div
      class="mdSidePanel"
      @click.stop
      :class="{ show: ['outline', 'search'].includes(state), isDark: isDark }"
    >
      <span class="closeBtn el-icon-close" @click="close"></span>
      <div class="panelHeader" v-if="activeTitle">{{ activeTitle }}</div>
      <div class="panelContent customScrollbar">
        <!-- 大纲 -->
        <template v-if="state === 'outline'">
          <div v-if="!sections.length" class="panelEmpty">尚无标题</div>
          <div
            v-for="(s, i) in sections"
            :key="s.id || i"
            class="olItem"
            :class="{ active: i === activeIndex }"
            :style="{ paddingLeft: 10 + (s.level - 1) * 14 + 'px' }"
            :title="s.title"
            @click="jumpOutline(s)"
          >
            {{ s.title }}
          </div>
        </template>

        <!-- 查找 -->
        <template v-else-if="state === 'search'">
          <div class="searchBox">
            <span class="searchIcon iconfont iconsousuo"></span>
            <input
              v-model="query"
              class="searchInput"
              type="text"
              placeholder="查找正文…"
              @input="runSearch"
              @keyup.enter="jumpFirst"
            />
          </div>
          <div v-if="!query" class="panelEmpty">输入关键字查找正文</div>
          <div v-else-if="!results.length" class="panelEmpty">无匹配</div>
          <div
            v-for="(r, i) in results"
            :key="i"
            class="srItem"
            @click="jumpSearch(r)"
          >
            <span class="srLine">{{ r.line }}</span>
            <span class="srText">{{ r.snippet }}</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script>
import { getActiveWorkbookId } from '@/api'
import { mdDoc } from '@/utils/workspaceBridge'
import { reduceSidebarState } from '@/utils/mdSidebarState'

// md 编辑器右侧菜单栏：与思维导图右侧 SidebarTrigger+Sidebar 同款视觉。
// 自包含（用本地 state 三态机，不写 vuex activeSidebar），避免与导图全局侧栏状态串。
//
// 三态机：'hidden' | 'icons' | 'outline' | 'search'
// - hidden：图标栏整体隐藏（right:-60px），trigger 按钮不可达，因此不会从 hidden 直接进面板。
// - icons ：只显示图标栏。
// - outline / search：图标栏 + 对应面板展开。
export default {
  name: 'MdSidebar',
  data() {
    return {
      state: 'icons', // 默认图标栏可见、面板关闭
      sections: [],
      activeIndex: -1,
      query: '',
      results: []
    }
  },
  computed: {
    isDark() {
      return this.$store.state.localConfig.isDark
    },
    items() {
      return [
        { name: '大纲', value: 'outline', icon: 'iconfuhao-dagangshu' },
        { name: '查找', value: 'search', icon: 'iconsousuo' }
      ]
    },
    activeTitle() {
      if (this.state === 'outline') return '大纲'
      if (this.state === 'search') return '查找'
      return ''
    }
  },
  created() {
    this.$bus.$on('md-outline-changed', this.onOutline)
    // 工具栏"目录"按钮（MdToolbar）发出的开关：打开大纲面板
    this.$bus.$on('toggle-md-outline', this.openOutline)
    // 点击编辑器区域（focusin）自动收起面板（回到 icons，不隐藏图标栏）
    this.$bus.$on('md:sidebar-close-panel', this.close)
  },
  beforeUnmount() {
    this.$bus.$off('md-outline-changed', this.onOutline)
    this.$bus.$off('toggle-md-outline', this.openOutline)
    this.$bus.$off('md:sidebar-close-panel', this.close)
  },
  methods: {
    dispatch(action) {
      this.state = reduceSidebarState(this.state, action)
    },
    toggleShow() {
      this.dispatch({ type: 'toggleShow' })
    },
    trigger(item) {
      // hidden 状态下图标栏不可见、trigger 不可达，reducer 无需特判。
      // 再次点击当前项 = 收起（回到 icons）；否则打开该面板。
      this.dispatch({ type: 'trigger', item: item.value })
      // dispatch 为同步赋值，此处 this.state 已是新值
      if (this.state === 'search') this.runSearch()
    },
    openOutline() {
      this.dispatch({ type: 'openOutline' })
    },
    close() {
      // 仅收起面板（回到 icons），不隐藏图标栏，避免打断用户操作
      this.dispatch({ type: 'close' })
    },

    // ── 大纲 ──
    onOutline({ sections }) {
      this.sections = sections || []
      this.activeIndex = -1
    },
    jumpOutline(s) {
      this.activeIndex = this.sections.indexOf(s)
      this.$bus.$emit('md-scroll-to-anchor', {
        anchor: s.anchor,
        line: s.startLine
      })
    },

    // ── 查找 ──
    runSearch() {
      const q = (this.query || '').trim()
      this.results = []
      if (!q) return
      const id = getActiveWorkbookId()
      const doc = id ? mdDoc.get(id) : null
      const text = (doc && doc.content) || ''
      const lower = q.toLowerCase()
      const lines = text.split('\n')
      const out = []
      for (let i = 0; i < lines.length; i++) {
        const idx = lines[i].toLowerCase().indexOf(lower)
        if (idx < 0) continue
        const start = Math.max(0, idx - 12)
        const end = Math.min(lines[i].length, idx + q.length + 24)
        let snippet = lines[i].slice(start, end)
        if (start > 0) snippet = '…' + snippet
        if (end < lines[i].length) snippet = snippet + '…'
        out.push({ line: i + 1, snippet })
        if (out.length >= 200) break
      }
      this.results = out
    },
    jumpFirst() {
      if (this.results.length) this.jumpSearch(this.results[0])
    },
    jumpSearch(r) {
      this.$bus.$emit('md:scroll-to-line', { line: r.line })
    }
  }
}
</script>

<style lang="less" scoped>
// ── 图标栏（同款 SidebarTrigger.vue）──
.mdSidebarTrigger {
  position: fixed;
  top: 110px;
  right: -60px;
  transition: all 0.3s;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  // 必须高于 Toast UI WYSIWYG 容器（.toastui-editor-ww-container z-index:20），
  // 否则面板展开后会被编辑器内容盖住，出现"点了没用/关不掉"。
  z-index: 30;

  &.isDark {
    .trigger {
      // 跟随画布背景派生实色（原硬编码 #262a2e 不随主题变）
      background-color: var(--macos-bg);

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

  // 有面板展开时，图标栏让位到面板左侧（与导图 hasActive 一致）
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
    border-color: var(--macos-border);
    // 实色背景（用户要求不透明），跟随主题
    background-color: var(--macos-bg);
    box-shadow: 0 2px 16px 0 rgba(0, 0, 0, 0.06);
    border-radius: 6px;
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
        color: #409eff;
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

// ── 面板（同款 Sidebar.vue）──
.mdSidePanel {
  position: fixed;
  right: -320px;
  top: 110px;
  bottom: 0;
  width: 320px;
  // 实色背景（用户要求不透明），跟随主题；移除毛玻璃 backdrop-filter
  background-color: var(--macos-bg);
  border-left: 1px solid var(--macos-border);
  border-top-left-radius: var(--macos-radius-xl);
  border-bottom-left-radius: var(--macos-radius-xl);
  display: flex;
  flex-direction: column;
  transition: right 0.32s cubic-bezier(0.32, 0.72, 0, 1);
  // 面板在图标栏之上；同步高于 Toast UI 编辑器容器（z-index:20）。
  z-index: 31;

  &.isDark {
    background-color: var(--macos-bg);
    border-left-color: var(--macos-border);

    .panelHeader {
      border-bottom-color: var(--macos-divider);
      color: var(--macos-text);
    }

    .closeBtn {
      color: var(--macos-text-2);
    }

    .olItem,
    .srItem {
      color: var(--macos-text);
    }

    .searchInput {
      background-color: rgba(255, 255, 255, 0.06);
      color: var(--macos-text);
      border-color: var(--macos-border);
    }
  }

  &.show {
    right: 0;
    box-shadow: -16px 0 44px rgba(0, 0, 0, 0.16);
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

  .panelHeader {
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

  .panelContent {
    width: 100%;
    height: 100%;
    overflow: auto;
    padding: 4px 0;
  }

  .panelEmpty {
    padding: 16px;
    color: var(--macos-text-2);
    font-size: 12px;
  }

  .olItem {
    height: 28px;
    line-height: 28px;
    padding-right: 10px;
    cursor: pointer;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--macos-text);
    font-size: 12px;

    &:hover {
      background-color: var(--macos-hover);
    }

    &.active {
      background-color: var(--macos-hover-strong);
      color: var(--macos-accent);
    }
  }

  // 查找
  .searchBox {
    position: relative;
    padding: 10px 12px;

    .searchIcon {
      position: absolute;
      left: 22px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--macos-text-2);
      font-size: 14px;
    }

    .searchInput {
      width: 100%;
      height: 32px;
      padding: 0 10px 0 30px;
      border: 1px solid var(--macos-border);
      border-radius: 6px;
      background-color: var(--macos-bg);
      color: var(--macos-text);
      font-size: 13px;
      outline: none;

      &:focus {
        border-color: var(--macos-accent);
      }
    }
  }

  .srItem {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 6px 12px;
    cursor: pointer;
    color: var(--macos-text);
    font-size: 12px;

    &:hover {
      background-color: var(--macos-hover);
    }

    .srLine {
      flex: none;
      min-width: 30px;
      text-align: right;
      color: var(--macos-text-2);
      font-variant-numeric: tabular-nums;
    }

    .srText {
      flex: 1;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }
}
</style>
