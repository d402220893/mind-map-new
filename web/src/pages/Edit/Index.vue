<template>
  <div
    class="container"
    :class="{
      isDark: isDark,
      activeSidebar: activeSidebar,
      wsDocked: wsDocked,
      wsCollapsed: wsCollapsed,
      sbVisible: sbVisible
    }"
  >
    <template v-if="show">
      <FileTabs
        :workbooks="workbooks"
        :activeId="activeWorkbookId"
        @switch="switchWorkbook"
        @add="addWorkbook"
        @close="closeWorkbook"
        @rename="renameWorkbook"
      />
      <div class="mainRow">
        <WorkspacePanel
          v-if="!isZenMode && workspaceDocked"
          ref="wsPanel"
          :mindMap="activeMindMap"
          @collapse="wsCollapsed = $event"
        />
        <div class="mainCol">
          <!-- 上下文工具栏：按活动 Tab 的 kind 切换（§8.1） -->
          <MdToolbar v-if="!isZenMode && activeKind === 'markdown'"></MdToolbar>
          <Toolbar v-else-if="!isZenMode"></Toolbar>
          <div class="editorRow">
            <!-- 导图：v-show 保留实例（切回不重建画布） -->
            <div class="editWrap" v-show="activeKind !== 'markdown'">
              <Edit
                :activeWorkbookId="activeWorkbookId"
                @workbook-updated="refreshWorkbooks"
                ref="editComp"
              ></Edit>
            </div>
            <MdEditor
              v-if="activeKind === 'markdown'"
              :key="activeWorkbookId"
              :tabId="activeWorkbookId"
              :filePath="activePath"
              class="editWrap"
            />
          <!-- md 同款右侧菜单栏（图标栏+面板，自包含；含大纲/查找） -->
          <MdSidebar v-if="activeKind === 'markdown'"></MdSidebar>
        </div>
      </div>
    </div>
      <!-- F22：失效链接提示（link-missing 无监听方时，点失效链接是全静默） -->
      <MissingLinkDialog />
    </template>
  </div>
</template>

<script>
import Toolbar from './components/Toolbar.vue'
import Edit from './components/Edit.vue'
import FileTabs from './components/FileTabs.vue'
import WorkspacePanel from './components/WorkspacePanel.vue'
import MdEditor from './components/MdEditor.vue'
import MdToolbar from './components/MdToolbar.vue'
import MdSidebar from './components/MdSidebar.vue'
import MissingLinkDialog from './components/MissingLinkDialog.vue'
import { mapState, mapMutations } from 'vuex'
import { getLocalConfig } from '@/api'
import {
  getWorkbookList,
  addWorkbook as apiAddWorkbook,
  switchWorkbook as apiSwitchWorkbook,
  removeWorkbook as apiRemoveWorkbook,
  renameWorkbook as apiRenameWorkbook
} from '@/api'
import { shell } from '@/utils/workspaceBridge'

export default {
  components: {
    Toolbar,
    Edit,
    FileTabs,
    WorkspacePanel,
    MdEditor,
    MdToolbar,
    MdSidebar,
    MissingLinkDialog
  },
  data() {
    return {
      show: false,
      workbooks: [],
      activeWorkbookId: '',
      workspaceDocked: true,
      wsCollapsed: false
    }
  },
  computed: {
    ...mapState({
      isZenMode: state => state.localConfig.isZenMode,
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar
    }),
    activeWb() {
      return this.workbooks.find(w => w.id === this.activeWorkbookId) || null
    },
    // Tab 类型（§5.2/D6）：决定渲染导图编辑器还是 md 编辑器
    activeKind() {
      return this.activeWb && this.activeWb.kind === 'markdown' ? 'markdown' : 'mindmap'
    },
    activePath() {
      return this.activeWb ? this.activeWb.filePath || '' : ''
    },
    activeMindMap() {
      return this.$refs.editComp && this.$refs.editComp.mindMap
        ? this.$refs.editComp.mindMap
        : null
    },
    wsDocked() {
      return this.workspaceDocked
    },
    sbVisible() {
      return !this.isZenMode
    }
  },
  watch: {
    isDark() {
      this.setBodyDark()
    }
  },
  mounted() {
    // 兜底：Edit.vue 内部对 workbook 列表的修改通过 bus 通知，保证 FileTabs 一定刷新
    this.$bus.$on('workbook-list-changed', this.refreshWorkbooks)
    // 全局快捷键（§7.9 / §8.1）：F11 禅模式 · Ctrl+Shift+T 工具栏折叠 · Ctrl+Shift+B 状态栏
    window.addEventListener('keydown', this.onGlobalKey)
  },
  beforeUnmount() {
    this.$bus.$off('workbook-list-changed', this.refreshWorkbooks)
    window.removeEventListener('keydown', this.onGlobalKey)
  },
  async created() {
    // ⚠️ show 必须先置 true：模板整体挂在 `v-if="show"` 上，若它在后面某步抛异常前
    //    一直为 false，页面就是**永久白屏**且没有任何错误可见（最难查的一类故障）。
    //    这里先放行渲染，再做可能失败的初始化，失败也不影响界面出现。
    this.show = true
    let loading = null
    try {
      this.initLocalConfig()
      loading = this.$loading
        ? this.$loading({ lock: true, text: this.$t('other.loading') })
        : null
      this.refreshWorkbooks()
      this.setBodyDark()
    } catch (e) {
      // 初始化失败也要有痕迹：主进程会把这条写进 resources/renderer.log
      console.error('[思绪] Index 初始化失败 → ' + (e && (e.stack || e.message)))
    } finally {
      try {
        if (loading && loading.close) loading.close()
      } catch (e) {
        /* 关闭遮罩失败无需处理 */
      }
    }
  },
  methods: {
    ...mapMutations(['setLocalConfig']),

    onGlobalKey(e) {
      const meta = e.ctrlKey || e.metaKey
      // F11（含 Ctrl+Shift+F11）→ 禅模式/沉浸模式（全局同一份 localConfig.isZenMode）
      if (e.key === 'F11') {
        e.preventDefault()
        this.setLocalConfig({ ...this.$store.state.localConfig, isZenMode: !this.isZenMode })
        return
      }
      if (meta && e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault()
        this.$bus.$emit('md:toggle-toolbar')
        return
      }
      if (meta && e.shiftKey && (e.key === 'B' || e.key === 'b')) {
        e.preventDefault()
        this.$bus.$emit('status:toggle')
      }
    },

    // 初始化本地配置
    initLocalConfig() {
      let config = getLocalConfig()
      if (config) {
        this.setLocalConfig({
          ...this.$store.state.localConfig,
          ...config
        })
      }
    },

    setBodyDark() {
      this.isDark
        ? document.body.classList.add('isDark')
        : document.body.classList.remove('isDark')
    },

    refreshWorkbooks() {
      const list = getWorkbookList()
      this.workbooks = list.workbooks
      this.activeWorkbookId = list.activeId
    },

    switchWorkbook(id) {
      // 先通知 Edit.vue 把当前 mind map 数据持久化到当前 workbook（这一步必须在切换 API 之前）
      this.$bus.$emit('before-workbook-switch', id)
      // 再切换 API 状态（让模块级 sheetState 指向新 workbook）
      if (apiSwitchWorkbook(id)) {
        this.refreshWorkbooks()
        // 最后通知 Edit.vue 载入新 workbook 的 mind map 数据
        this.$bus.$emit('workbook-switched', id)
      }
    },

    addWorkbook() {
      // 新建文件：弹出保存对话框（让用户落到磁盘），失败则不切
      this.$bus.$emit('newWorkbookFromTabs')
    },

    closeWorkbook(id) {
      // 关闭前也先保存当前 mind map 到当前 workbook
      this.$bus.$emit('before-workbook-switch', id)
      const res = apiRemoveWorkbook(id)
      if (res) {
        this.refreshWorkbooks()
        // 若关闭的就是当前激活的，通知 Edit.vue 重新载入
        this.$bus.$emit('workbook-switched', res.newActiveId)
      }
    },

    async renameWorkbook({ id, name }) {
      name = (name || '').trim()
      if (!name) {
        this.refreshWorkbooks()
        return
      }
      const list = getWorkbookList()
      const w = list.workbooks.find(w => w.id === id)
      if (!w) {
        this.refreshWorkbooks()
        return
      }

      // 未落盘的文件：只改显示名
      if (!w.filePath) {
        apiRenameWorkbook(id, name)
        this.refreshWorkbooks()
        return
      }

      // 名称实际未变（忽略 .smm 后缀）时，只刷新显示
      const oldFileName = (w.filePath.split(/[\\/]/).pop() || '').replace(/\.smm$/i, '')
      const newBaseName = name.replace(/\.smm$/i, '')
      if (oldFileName === newBaseName) {
        apiRenameWorkbook(id, newBaseName)
        this.refreshWorkbooks()
        return
      }

      // 组装新路径：同目录下 <newBaseName>.smm
      const newFileName = newBaseName + '.smm'
      const lastSep = Math.max(w.filePath.lastIndexOf('\\'), w.filePath.lastIndexOf('/'))
      const dir = lastSep >= 0 ? w.filePath.slice(0, lastSep) : ''
      const sep = dir && w.filePath.includes('\\') ? '\\' : (dir ? '/' : '\\')
      const newPath = dir + (dir ? sep : '') + newFileName

      // 与已打开的其它文件冲突？
      const existed = list.workbooks.find(
        x => x.id !== id && x.filePath && x.filePath.toLowerCase() === newPath.toLowerCase()
      )
      if (existed) {
        this.$message.error('该名称与已打开文件冲突，请使用其它名称')
        this.refreshWorkbooks()
        return
      }

      // 桌面端：请求主进程重命名磁盘文件
      if (shell.has('renameFile')) {
        const res = await shell.renameFile(w.filePath, newPath)
        if (!res.ok) {
          if (res.exists) {
            this.$message.error('该目录下已存在同名文件，请使用其它名称')
          } else {
            this.$message.error('重命名失败：' + res.error)
          }
          this.refreshWorkbooks()
          return
        }
        const finalPath = res.newPath || newPath
        apiRenameWorkbook(id, newBaseName, finalPath)
        this.refreshWorkbooks()
        this.$bus.$emit('workbook-list-changed')
        // 若重命名的是当前激活文件，通知 Edit.vue 更新路径与标题
        if (id === this.activeWorkbookId) {
          this.$bus.$emit('workbook-renamed', { id, newPath: finalPath })
        }
        this.$message.success('已重命名为：' + newFileName)
        return
      }

      // 网页端：无法操作磁盘，仅改显示名
      apiRenameWorkbook(id, newBaseName)
      this.refreshWorkbooks()
    }
  }
}
</script>

<style lang="less">
// 暗色模式下的 Element UI 覆盖已统一收敛到 src/styles/macos.less，
// 此处不再硬编码，避免与全局设计系统冲突。
.container {
  display: flex;
  flex-direction: column;
  // ⚠️ 必须是"确定高度"。原写成 height:100%，但 html/body/#app 均无高度（见 App.vue，
  //    #app 只设了 color），百分比高度解析不到 → 整列的流式高度塌成"内容高"。
  //    后果：状态栏（.mainCol 末尾的 flex 子项）不落在视口底部，而是浮在画布中间
  //    （2026-09-20 用户反馈"中间多一行文字"）。改用 100vh 直接锚定视口，不依赖祖先高度。
  height: 100vh;

  .mainRow {
    flex: 1;
    min-height: 0;
    display: flex;
    // ⚠️ FileTabs 是 position:fixed（脱离文档流、不占位），而画布同样是 fixed 且**刻意**铺到顶
    //    （配合透明标签栏"让画布延伸到顶部"）。但流式内容（左侧工作区面板 / 工具栏 / 主列）
    //    会被顶到 y=0 → 钻到 34px 高的标签栏底下 → 左上角文件夹名与品牌名"思绪思维导图"重叠
    //    （2026-09-20 用户反馈"左上角显示重叠"）。这里给流式内容留出标签栏高度；
    //    画布是 fixed，不受此 padding 影响，仍铺到顶。
    padding-top: 34px;
  }
  .mainCol {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .editorRow {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .editWrap {
    flex: 1;
    min-width: 0;
    position: relative;
  }

  // ⚠️ Edit.vue 的 .editContainer 是 position:fixed; inset:0（既有实现，画布铺满窗口）。
  // 新增的停靠侧栏 / 状态栏在文档流里，画布不会自动让位 —— 必须显式偏移，
  // 否则画布会盖住侧栏（fixed 元素不参与父级 flex 布局）。
  // 偏移真源 --ws-panel-offset（WorkspacePanel 发布，随拖拽调宽/折叠同步）。
  &.wsDocked .editWrap .editContainer {
    left: var(--ws-panel-offset, 240px);
  }
  &.wsDocked.wsCollapsed .editWrap .editContainer {
    left: 0px;
  }
  &.sbVisible .editWrap .editContainer {
    bottom: 0px;
  }
}
</style>
