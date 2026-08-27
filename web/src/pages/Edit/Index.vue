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
.container {
}

body {
  &.isDark {
    /* el-button */
    .el-button {
      background-color: #363b3f;
      color: hsla(0, 0%, 100%, 0.9);
      border-color: hsla(0, 0%, 100%, 0.1);
    }

    /* el-input */
    .el-input__inner {
      background-color: #363b3f;
      border-color: hsla(0, 0%, 100%, 0.1);
      color: hsla(0, 0%, 100%, 0.9);
    }

    .el-input.is-disabled .el-input__inner {
      background-color: #363b3f;
      border-color: hsla(0, 0%, 100%, 0.1);
      color: hsla(0, 0%, 100%, 0.3);
    }

    .el-input-group__append,
    .el-input-group__prepend {
      background-color: #363b3f;
      border-color: hsla(0, 0%, 100%, 0.1);
    }

    .el-input-group__append button.el-button {
      color: hsla(0, 0%, 100%, 0.9);
    }

    /* el-select */
    .el-select-dropdown {
      background-color: #36393d;
      border-color: hsla(0, 0%, 100%, 0.1);

      .el-select-dropdown__item {
        color: hsla(0, 0%, 100%, 0.6);
      }

      .el-select-dropdown__item.selected {
        color: #409eff;
      }

      .el-select-dropdown__item.hover,
      .el-select-dropdown__item:hover {
        background-color: hsla(0, 0%, 100%, 0.05);
      }
    }

    .el-select .el-input.is-disabled .el-input__inner:hover {
      border-color: hsla(0, 0%, 100%, 0.1);
    }

    /* el-popper*/
    .el-popper {
      background-color: #36393d;
      border-color: hsla(0, 0%, 100%, 0.1);
    }

    .el-popper[x-placement^='bottom'] .popper__arrow {
      background-color: #36393d;
    }

    .el-popper[x-placement^='bottom'] .popper__arrow::after {
      border-bottom-color: #36393d;
    }

    .el-popper[x-placement^='top'] .popper__arrow {
      background-color: #36393d;
    }

    .el-popper[x-placement^='top'] .popper__arrow::after {
      border-top-color: #36393d;
    }

    /* el-tabs */
    .el-tabs__item {
      color: hsla(0, 0%, 100%, 0.6);

      &:hover,
      &.is-active {
        color: #409eff;
      }
    }

    .el-tabs__nav-wrap::after {
      background-color: hsla(0, 0%, 100%, 0.6);
    }

    /* el-slider */
    .el-slider__runway {
      background-color: hsla(0, 0%, 100%, 0.6);
    }

    /* el-radio-group */
    .el-radio-group {
      .el-radio-button__inner {
        background-color: #36393d;
        color: hsla(0, 0%, 100%, 0.6);
      }

      .el-radio-button__orig-radio:checked + .el-radio-button__inner {
        color: #fff;
        background-color: #409eff;
      }
    }

    /* el-dialog */
    .el-dialog {
      background-color: #262a2e;

      .el-dialog__header {
        border-bottom: 1px solid hsla(0, 0%, 100%, 0.1);
      }

      .el-dialog__title {
        color: hsla(0, 0%, 100%, 0.9);
      }

      .el-dialog__body {
        background-color: #262a2e;
      }

      .el-dialog__footer {
        border-top: 1px solid hsla(0, 0%, 100%, 0.1);
      }
    }

    /* el-upload */
    .el-upload__tip {
      color: #999;
    }

    /* 富文本编辑器 */
    .toastui-editor-main-container {
      background-color: #fff;
    }
  }
}
</style>
