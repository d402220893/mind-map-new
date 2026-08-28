<template>
  <div
    class="container"
    :class="{ isDark: isDark, activeSidebar: activeSidebar }"
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
      <Toolbar v-if="!isZenMode"></Toolbar>
      <Edit
        :activeWorkbookId="activeWorkbookId"
        @workbook-updated="refreshWorkbooks"
        ref="editComp"
      ></Edit>
    </template>
  </div>
</template>

<script>
import Toolbar from './components/Toolbar.vue'
import Edit from './components/Edit.vue'
import FileTabs from './components/FileTabs.vue'
import { mapState, mapMutations } from 'vuex'
import { getLocalConfig } from '@/api'
import {
  getWorkbookList,
  addWorkbook as apiAddWorkbook,
  switchWorkbook as apiSwitchWorkbook,
  removeWorkbook as apiRemoveWorkbook,
  renameWorkbook as apiRenameWorkbook
} from '@/api'

export default {
  components: {
    Toolbar,
    Edit,
    FileTabs
  },
  data() {
    return {
      show: false,
      workbooks: [],
      activeWorkbookId: ''
    }
  },
  computed: {
    ...mapState({
      isZenMode: state => state.localConfig.isZenMode,
      isDark: state => state.localConfig.isDark,
      activeSidebar: state => state.activeSidebar
    })
  },
  watch: {
    isDark() {
      this.setBodyDark()
    }
  },
  mounted() {
    // 兜底：Edit.vue 内部对 workbook 列表的修改通过 bus 通知，保证 FileTabs 一定刷新
    this.$bus.$on('workbook-list-changed', this.refreshWorkbooks)
  },
  beforeDestroy() {
    this.$bus.$off('workbook-list-changed', this.refreshWorkbooks)
  },
  async created() {
    this.initLocalConfig()
    const loading = this.$loading({
      lock: true,
      text: this.$t('other.loading')
    })
    this.refreshWorkbooks()
    this.show = true
    loading.close()
    this.setBodyDark()
  },
  methods: {
    ...mapMutations(['setLocalConfig']),

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

    renameWorkbook({ id, name }) {
      apiRenameWorkbook(id, name)
      this.refreshWorkbooks()
    }
  }
}
</script>

<style lang="less">
// 暗色模式下的 Element UI 覆盖已统一收敛到 src/styles/macos.less，
// 此处不再硬编码，避免与全局设计系统冲突。
.container {
}
</style>
