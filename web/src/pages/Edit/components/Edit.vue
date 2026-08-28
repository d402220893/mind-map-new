<template>
  <div
    class="editContainer"
    @dragenter.stop.prevent="onDragenter"
    @dragleave.stop.prevent
    @dragover.stop.prevent
    @drop.stop.prevent="onContainerDrop"
  >
    <div
      class="mindMapContainer"
      id="mindMapContainer"
      ref="mindMapContainer"
    ></div>
    <Count :mindMap="mindMap" v-if="!isZenMode"></Count>
    <Navigator v-if="mindMap" :mindMap="mindMap"></Navigator>
    <NavigatorToolbar :mindMap="mindMap" v-if="!isZenMode"></NavigatorToolbar>
    <OutlineSidebar :mindMap="mindMap"></OutlineSidebar>
    <Style v-if="mindMap && !isZenMode" :mindMap="mindMap"></Style>
    <BaseStyle
      :data="mindMapData"
      :configData="mindMapConfig"
      :mindMap="mindMap"
    ></BaseStyle>
    <AssociativeLineStyle
      v-if="mindMap"
      :mindMap="mindMap"
    ></AssociativeLineStyle>
    <Theme v-if="mindMap" :data="mindMapData" :mindMap="mindMap"></Theme>
    <Structure :mindMap="mindMap"></Structure>
    <ShortcutKey></ShortcutKey>
    <Contextmenu v-if="mindMap" :mindMap="mindMap"></Contextmenu>
    <RichTextToolbar v-if="mindMap" :mindMap="mindMap"></RichTextToolbar>
    <NodeNoteContentShow
      v-if="mindMap"
      :mindMap="mindMap"
    ></NodeNoteContentShow>
    <NodeImgPreview v-if="mindMap" :mindMap="mindMap"></NodeImgPreview>
    <SidebarTrigger v-if="!isZenMode"></SidebarTrigger>
    <Search v-if="mindMap" :mindMap="mindMap"></Search>
    <NodeIconSidebar v-if="mindMap" :mindMap="mindMap"></NodeIconSidebar>
    <NodeIconToolbar v-if="mindMap" :mindMap="mindMap"></NodeIconToolbar>
    <OutlineEdit v-if="mindMap" :mindMap="mindMap"></OutlineEdit>
    <Scrollbar v-if="isShowScrollbar && mindMap" :mindMap="mindMap"></Scrollbar>
    <FormulaSidebar v-if="mindMap" :mindMap="mindMap"></FormulaSidebar>
    <NodeOuterFrame v-if="mindMap" :mindMap="mindMap"></NodeOuterFrame>
    <NodeTagStyle v-if="mindMap" :mindMap="mindMap"></NodeTagStyle>
    <Setting :configData="mindMapConfig" :mindMap="mindMap"></Setting>
    <NodeImgPlacementToolbar
      v-if="mindMap"
      :mindMap="mindMap"
    ></NodeImgPlacementToolbar>
    <NodeNoteSidebar v-if="mindMap" :mindMap="mindMap"></NodeNoteSidebar>
    <AiCreate v-if="mindMap && enableAi" :mindMap="mindMap"></AiCreate>
    <AiChat v-if="enableAi"></AiChat>
      <div
        class="dragMask"
        v-if="showDragMask"
        @dragleave.stop.prevent="onDragleave"
        @dragover.stop.prevent
        @drop.stop.prevent="onContainerDrop"
      >
        <div class="dragTip">{{ $t('edit.dragTip') }}</div>
      </div>
      <SheetTabs
        :sheets="sheets"
        :activeId="activeSheetId"
        @switch="switchSheet"
        @add="addSheet"
        @remove="removeSheet"
        @rename="renameSheet"
      ></SheetTabs>
  </div>
</template>

<script>
import MindMap from 'simple-mind-map'
import MiniMap from 'simple-mind-map/src/plugins/MiniMap.js'
import Watermark from 'simple-mind-map/src/plugins/Watermark.js'
import KeyboardNavigation from 'simple-mind-map/src/plugins/KeyboardNavigation.js'
import ExportPDF from 'simple-mind-map/src/plugins/ExportPDF.js'
import ExportXMind from 'simple-mind-map/src/plugins/ExportXMind.js'
import Export from 'simple-mind-map/src/plugins/Export.js'
import Drag from 'simple-mind-map/src/plugins/Drag.js'
import Select from 'simple-mind-map/src/plugins/Select.js'
import RichText from 'simple-mind-map/src/plugins/RichText.js'
import AssociativeLine from 'simple-mind-map/src/plugins/AssociativeLine.js'
import TouchEvent from 'simple-mind-map/src/plugins/TouchEvent.js'
import NodeImgAdjust from 'simple-mind-map/src/plugins/NodeImgAdjust.js'
import SearchPlugin from 'simple-mind-map/src/plugins/Search.js'
import Painter from 'simple-mind-map/src/plugins/Painter.js'
import ScrollbarPlugin from 'simple-mind-map/src/plugins/Scrollbar.js'
import Formula from 'simple-mind-map/src/plugins/Formula.js'
import RainbowLines from 'simple-mind-map/src/plugins/RainbowLines.js'
import Demonstrate from 'simple-mind-map/src/plugins/Demonstrate.js'
import OuterFrame from 'simple-mind-map/src/plugins/OuterFrame.js'
import MindMapLayoutPro from 'simple-mind-map/src/plugins/MindMapLayoutPro.js'
import NodeBase64ImageStorage from 'simple-mind-map/src/plugins/NodeBase64ImageStorage.js'
import Themes from 'simple-mind-map-plugin-themes'
// 协同编辑插件
import SheetTabs from './SheetTabs.vue'
import OutlineSidebar from './OutlineSidebar.vue'
import Style from './Style.vue'
import BaseStyle from './BaseStyle.vue'
import Theme from './Theme.vue'
import Structure from './Structure.vue'
import Count from './Count.vue'
import NavigatorToolbar from './NavigatorToolbar.vue'
import ShortcutKey from './ShortcutKey.vue'
import Contextmenu from './Contextmenu.vue'
import RichTextToolbar from './RichTextToolbar.vue'
import NodeNoteContentShow from './NodeNoteContentShow.vue'
import {
  getData,
  getConfig,
  storeData,
  getSheetList,
  setActiveSheetId,
  getActiveSheetData,
  addSheet as apiAddSheet,
  removeSheet as apiRemoveSheet,
  renameSheet as apiRenameSheet,
  getSheetsContainer,
  loadSheetsContainer,
  isSheetsFile,
  getCurrentFilePath,
  setCurrentFilePath,
  getWorkbookList,
  markDirty,
  isDirty,
  getActiveWorkbookId,
  applySaveAs
} from '@/api'
import Navigator from './Navigator.vue'
import NodeImgPreview from './NodeImgPreview.vue'
import SidebarTrigger from './SidebarTrigger.vue'
import { mapState } from 'vuex'
import icon from '@/config/icon'
import Vue from 'vue'
import Search from './Search.vue'
import NodeIconSidebar from './NodeIconSidebar.vue'
import NodeIconToolbar from './NodeIconToolbar.vue'
import OutlineEdit from './OutlineEdit.vue'
import { showLoading, hideLoading } from '@/utils/loading'
import handleClipboardText from '@/utils/handleClipboardText'
import { getParentWithClass } from '@/utils'
import Scrollbar from './Scrollbar.vue'
import exampleData from 'simple-mind-map/example/exampleData'
import FormulaSidebar from './FormulaSidebar.vue'
import NodeOuterFrame from './NodeOuterFrame.vue'
import NodeTagStyle from './NodeTagStyle.vue'
import Setting from './Setting.vue'
import AssociativeLineStyle from './AssociativeLineStyle.vue'
import NodeImgPlacementToolbar from './NodeImgPlacementToolbar.vue'
import NodeNoteSidebar from './NodeNoteSidebar.vue'
import AiCreate from './AiCreate.vue'
import AiChat from './AiChat.vue'

// 注册插件
MindMap.usePlugin(MiniMap)
  .usePlugin(Watermark)
  .usePlugin(Drag)
  .usePlugin(KeyboardNavigation)
  .usePlugin(ExportPDF)
  .usePlugin(ExportXMind)
  .usePlugin(Export)
  .usePlugin(Select)
  .usePlugin(AssociativeLine)
  .usePlugin(NodeImgAdjust)
  .usePlugin(TouchEvent)
  .usePlugin(SearchPlugin)
  .usePlugin(Painter)
  .usePlugin(Formula)
  .usePlugin(RainbowLines)
  .usePlugin(Demonstrate)
  .usePlugin(OuterFrame)
  .usePlugin(MindMapLayoutPro)
  .usePlugin(NodeBase64ImageStorage)
// .usePlugin(Cooperate) // 协同插件

// 注册主题
Themes.init(MindMap)
// 扩展主题列表
if (typeof MoreThemes !== 'undefined') {
  MoreThemes.init(MindMap)
}

export default {
  components: {
    OutlineSidebar,
    Style,
    BaseStyle,
    Theme,
    Structure,
    Count,
    NavigatorToolbar,
    ShortcutKey,
    Contextmenu,
    RichTextToolbar,
    NodeNoteContentShow,
    Navigator,
    NodeImgPreview,
    SidebarTrigger,
    Search,
    NodeIconSidebar,
    NodeIconToolbar,
    OutlineEdit,
    Scrollbar,
    FormulaSidebar,
    NodeOuterFrame,
    NodeTagStyle,
    Setting,
    AssociativeLineStyle,
    NodeImgPlacementToolbar,
    NodeNoteSidebar,
    AiCreate,
    AiChat,
    SheetTabs
  },
  data() {
    return {
      enableShowLoading: true,
      mindMap: null,
      mindMapData: null,
      mindMapConfig: {},
      prevImg: '',
      storeConfigTimer: null,
      showDragMask: false,
// 多工作表
        sheets: [],
        activeSheetId: '',
        // 当前打开/保存的文件路径（空表示尚未保存为文件）
        currentFilePath: '',
        // 加载文件/切换的短暂窗口：此期间产生的 data_change 不标记为未保存
        _isLoading: false,
        // 粘贴图片时自动缩放的最长边像素（原图 <= 该值时保持原图大小）
        imgPasteMaxEdge: 600
      }
    },
  computed: {
    ...mapState({
      isZenMode: state => state.localConfig.isZenMode,
      openNodeRichText: state => state.localConfig.openNodeRichText,
      isShowScrollbar: state => state.localConfig.isShowScrollbar,
      enableDragImport: state => state.localConfig.enableDragImport,
      useLeftKeySelectionRightKeyDrag: state =>
        state.localConfig.useLeftKeySelectionRightKeyDrag,
      extraTextOnExport: state => state.extraTextOnExport,
      isDragOutlineTreeNode: state => state.isDragOutlineTreeNode,
      enableAi: state => state.localConfig.enableAi
    }),
    isDarkMode() {
      return this.$store.state.localConfig.isDark
    },
    fileName() {
      if (!this.currentFilePath) return ''
      const parts = this.currentFilePath.split(/[\\/]/)
      return parts[parts.length - 1] || this.currentFilePath
    },
    fileDir() {
      if (!this.currentFilePath) return ''
      const parts = this.currentFilePath.split(/[\\/]/)
      parts.pop()
      return parts.join('/')
    }
  },
  watch: {
    openNodeRichText() {
      if (this.openNodeRichText) {
        this.addRichTextPlugin()
      } else {
        this.removeRichTextPlugin()
      }
    },
    isShowScrollbar() {
      if (this.isShowScrollbar) {
        this.addScrollbarPlugin()
      } else {
        this.removeScrollbarPlugin()
      }
    }
  },
  mounted() {
    showLoading()
    this.getData()
    this.init()
    this.$bus.$on('execCommand', this.execCommand)
    this.$bus.$on('paddingChange', this.onPaddingChange)
    this.$bus.$on('export', this.export)
    this.$bus.$on('setData', this.setData)
    this.$bus.$on('startTextEdit', this.handleStartTextEdit)
    this.$bus.$on('endTextEdit', this.handleEndTextEdit)
    this.$bus.$on('createAssociativeLine', this.handleCreateLineFromActiveNode)
    this.$bus.$on('startPainter', this.handleStartPainter)
    this.$bus.$on('node_tree_render_end', this.handleHideLoading)
    this.$bus.$on('showLoading', this.handleShowLoading)
    this.$bus.$on('localStorageExceeded', this.onLocalStorageExceeded)
    window.addEventListener('resize', this.handleResize)
    this.$bus.$on('showDownloadTip', this.showDownloadTip)
    // 多工作表
    this.$bus.$on('exportSheets', this.exportSheets)
    this.$bus.$on('importSheets', this.importSheets)
    this.refreshSheets()
    window.addEventListener('beforeunload', this.handleBeforeUnload)
    // 多工作表文件：恢复上次保存路径，并监听主进程菜单命令（保存/另存为/打开）
    this.currentFilePath = getCurrentFilePath()
    this.updateTitle()
    if (window.smmApi && window.smmApi.onMenuCommand) {
      window.smmApi.onMenuCommand(this.handleMenuCommand)
    }
    this.$bus.$on('requestSave', this.doSave)
    this.$bus.$on('requestSaveAs', this.doSaveAs)
    this.$bus.$on('requestOpen', this.openWorkbook)
    // 工具栏“新建文件”：弹出保存对话框写入并作为单一工作表加载，并记录真实路径
    this.$bus.$on('newWorkbook', this.newWorkbook)
    // FileTabs 上的“+”新建：与工具栏“新建”复用同一弹窗逻辑
    this.$bus.$on('newWorkbookFromTabs', this.newWorkbookFromTabs)
    // 顶部 FileTabs 切换文件：先保存当前 mind map，再载入新 workbook 的数据
    this.$bus.$on('before-workbook-switch', this.beforeWorkbookSwitch)
    this.$bus.$on('workbook-switched', this.onWorkbookSwitched)
    // 文件重命名后：同步更新当前路径与窗口标题
    this.$bus.$on('workbook-renamed', this.onWorkbookRenamed)
    // 全局监听剪贴板图片粘贴：仅当剪贴板包含 image 文件时拦截并预览插入，
    // 纯文本仍交给库默认 paste 行为处理
    window.addEventListener('paste', this.onPaste, true)
    // 全局快捷键：Ctrl+S 保存 / Ctrl+Shift+S 另存为 / Ctrl+O 打开 / F2 编辑当前节点
    // 原代码 onGlobalKeydown 声明了但未注册到 window keydown，导致快捷键全部无效
    window.addEventListener('keydown', this.onGlobalKeydown)
    this.webTip()
  },
  beforeDestroy() {
    this.$bus.$off('execCommand', this.execCommand)
    this.$bus.$off('paddingChange', this.onPaddingChange)
    this.$bus.$off('export', this.export)
    this.$bus.$off('setData', this.setData)
    this.$bus.$off('startTextEdit', this.handleStartTextEdit)
    this.$bus.$off('endTextEdit', this.handleEndTextEdit)
    this.$bus.$off('createAssociativeLine', this.handleCreateLineFromActiveNode)
    this.$bus.$off('startPainter', this.handleStartPainter)
    this.$bus.$off('node_tree_render_end', this.handleHideLoading)
    this.$bus.$off('showLoading', this.handleShowLoading)
    this.$bus.$off('localStorageExceeded', this.onLocalStorageExceeded)
    window.removeEventListener('resize', this.handleResize)
    this.$bus.$off('showDownloadTip', this.showDownloadTip)
    this.$bus.$off('exportSheets', this.exportSheets)
    this.$bus.$off('importSheets', this.importSheets)
    this.$bus.$off('requestSave', this.doSave)
    this.$bus.$off('requestSaveAs', this.doSaveAs)
    this.$bus.$off('requestOpen', this.openWorkbook)
    this.$bus.$off('newWorkbook', this.newWorkbook)
    this.$bus.$off('newWorkbookFromTabs', this.newWorkbookFromTabs)
    this.$bus.$off('before-workbook-switch', this.beforeWorkbookSwitch)
    this.$bus.$off('workbook-switched', this.onWorkbookSwitched)
    this.$bus.$off('workbook-renamed', this.onWorkbookRenamed)
    window.removeEventListener('beforeunload', this.handleBeforeUnload)
    window.removeEventListener('paste', this.onPaste, true)
    window.removeEventListener('keydown', this.onGlobalKeydown)
    if (this._bgObserver) {
      this._bgObserver.disconnect()
      this._bgObserver = null
    }
    this.mindMap.destroy()
  },
  methods: {
    onLocalStorageExceeded() {
      this.$notify({
        type: 'warning',
        title: this.$t('edit.tip'),
        message: this.$t('edit.localStorageExceededTip'),
        duration: 0
      })
    },

    handleStartTextEdit() {
      this.mindMap.renderer.startTextEdit()
    },

    handleEndTextEdit() {
      this.mindMap.renderer.endTextEdit()
    },

    handleCreateLineFromActiveNode() {
      this.mindMap.associativeLine.createLineFromActiveNode()
    },

    handleStartPainter() {
      this.mindMap.painter.startPainter()
    },

    handleResize() {
      this.mindMap.resize()
    },

    // 显示loading
    handleShowLoading() {
      this.enableShowLoading = true
      showLoading()
    },

    // 渲染结束后关闭loading
    handleHideLoading() {
      if (this.enableShowLoading) {
        this.enableShowLoading = false
        hideLoading()
      }
    },

    // 获取思维导图数据，实际应该调接口获取
    getData() {
      this.mindMapData = getData()
      this.mindMapConfig = getConfig() || {}
    },

    // 存储数据当数据有变时
    bindSaveEvent() {
      this.$bus.$on('data_change', data => {
        storeData({ root: data })
        // 用户编辑：标记当前文件为“未保存”（加载/切换期间不标记，避免误标）
        if (this._isLoading) return
        const id = getActiveWorkbookId()
        if (id && !isDirty(id)) {
          markDirty(id, true)
          this.$bus.$emit('workbook-list-changed')
        }
      })
      this.$bus.$on('view_data_change', data => {
        clearTimeout(this.storeConfigTimer)
        this.storeConfigTimer = setTimeout(() => {
          storeData({
            view: data
          })
        }, 300)
      })
    },

    // 手动保存
    manualSave() {
      storeData(this.mindMap.getData(true))
    },

    // ===== 剪贴板粘贴图片到激活节点 =====
    // 在捕获阶段监听 paste：仅当剪贴板包含 image 文件时拦截，
    // 自动读取原图尺寸并按 imgPasteMaxEdge 等比缩放后插入节点；
    // 纯文本粘贴仍走库默认行为，不影响日常文本输入。
    async onPaste(e) {
      if (!this.mindMap) return
      const cd =
        e.clipboardData ||
        (e.originalEvent && e.originalEvent.clipboardData) ||
        null
      if (!cd || !cd.items) return
      let imageItem = null
      for (let i = 0; i < cd.items.length; i++) {
        const it = cd.items[i]
        if (it.kind === 'file' && it.type && /^image\//i.test(it.type)) {
          imageItem = it
          break
        }
      }
      if (!imageItem) return // 非图片，走默认行为

      // 节点文本编辑态（含 RichText 编辑器）：不要抢粘贴
      const renderer = this.mindMap.renderer
      if (renderer && renderer.textEdit && renderer.textEdit.showTextEdit)
        return

      const nodes = (renderer && renderer.activeNodeList) || []
      if (nodes.length === 0) {
        if (this.$message)
          this.$message.warning('请先选中一个节点再粘贴图片')
        return
      }

      // 抢走浏览器默认行为，避免 base64 文本被粘贴到文本框
      e.preventDefault()
      try {
        const file = imageItem.getAsFile()
        if (!file) return
        const dataUrl = await this.readFileAsDataURL(file)
        const { w, h } = await this.getImageNaturalSize(dataUrl)
        const [tw, th] = this.fitImageSize(w, h, this.imgPasteMaxEdge)
        nodes.forEach(node => {
          node.setImage({
            url: dataUrl,
            title: '',
            width: tw,
            height: th,
            custom: true
          })
        })
        if (this.$message) {
          this.$message.success(
            nodes.length > 1
              ? `已为 ${nodes.length} 个节点粘贴图片`
              : '已粘贴图片到当前节点'
          )
        }
      } catch (err) {
        console.error('粘贴图片失败', err)
        if (this.$message) this.$message.error('粘贴图片失败，请查看控制台')
      }
    },

    // 读取 File/Blob 为 dataURL
    readFileAsDataURL(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
    },

    // 读取图片原始像素尺寸
    getImageNaturalSize(src) {
      return new Promise(resolve => {
        const img = new Image()
        img.onload = () =>
          resolve({
            w: img.naturalWidth || img.width || 0,
            h: img.naturalHeight || img.height || 0
          })
        img.onerror = () => resolve({ w: 0, h: 0 })
        img.src = src
      })
    },

    // 等比缩放：最长边 <= maxEdge；原图更小时保持原图
    fitImageSize(w, h, maxEdge) {
      if (!w || !h) return [maxEdge, maxEdge]
      const longEdge = Math.max(w, h)
      if (longEdge <= maxEdge) return [Math.round(w), Math.round(h)]
      const scale = maxEdge / longEdge
      return [Math.round(w * scale), Math.round(h * scale)]
    },

    // 全局拦截 Ctrl/Cmd+S / Ctrl+Shift+S / Ctrl+O / F2：
    // 原 onGlobalKeydown 仅声明但从未注册到 window keydown，导致 Ctrl+S 完全无效。
    // 这里在 mounted 注册、beforeDestroy 解绑。Ctrl+S 统一调 doSave()，
    // 而不再用"desktop 端交给主进程菜单"的早返回路径——主进程没有菜单
    // （Menu.setApplicationMenu(null)），那条路径永远不会触发。
    onGlobalKeydown(e) {
      const ctrl = e.ctrlKey || e.metaKey
      const shift = e.shiftKey
      const key = e.key

      // Ctrl+S / Cmd+S：保存
      if (ctrl && !shift && (key === 's' || key === 'S')) {
        e.preventDefault()
        if (e.stopPropagation) e.stopPropagation()
        this.doSave()
        return
      }

      // Ctrl+Shift+S / Cmd+Shift+S：另存为
      if (ctrl && shift && (key === 's' || key === 'S')) {
        e.preventDefault()
        if (e.stopPropagation) e.stopPropagation()
        this.doSaveAs()
        return
      }

      // Ctrl+O / Cmd+O：打开
      if (ctrl && !shift && (key === 'o' || key === 'O')) {
        e.preventDefault()
        if (e.stopPropagation) e.stopPropagation()
        this.openWorkbook()
        return
      }

      // F2：编辑当前激活节点文本（库内同名快捷键只在画布内有效，这里兜底）
      if (key === 'F2') {
        e.preventDefault()
        if (e.stopPropagation) e.stopPropagation()
        this.handleStartTextEdit()
        return
      }
    },

    // ===== 多工作表 =====
    // 刷新工作表列表与激活项
    refreshSheets() {
      const list = getSheetList()
      this.sheets = list.sheets
      this.activeSheetId = list.activeId
    },

    // 把一份完整数据载入当前思维导图实例
    loadSheetData(data) {
      this._isLoading = true
      if (data && data.root) {
        this.mindMap.setFullData(data)
      } else {
        this.mindMap.setData(data)
      }
      this.mindMap.view.reset()
      this.mindMapData = data
      // 每次载入后重应用全局画布背景，覆盖文件自带主题背景（修复“背景色串”）
      this.applyStoredCanvasBackground()
      // 加载期间产生的 data_change 不标记为未保存；稍后放开窗口以吸收异步事件
      setTimeout(() => {
        this._isLoading = false
      }, 80)
    },

    // 切换工作表：先保存当前，再载入目标
    switchSheet(id) {
      if (id === this.activeSheetId) return
      this.manualSave()
      setActiveSheetId(id)
      this.loadSheetData(getActiveSheetData())
      this.refreshSheets()
    },

    // 新建工作表
    addSheet() {
      this.manualSave()
      apiAddSheet()
      this.loadSheetData(getActiveSheetData())
      this.refreshSheets()
      this.$message.success('已新建工作表')
    },

    // 删除工作表
    removeSheet(id) {
      if (this.sheets.length <= 1) {
        this.$message.warning('至少需保留一个工作表')
        return
      }
      if (id === this.activeSheetId) {
        this.manualSave()
      }
      if (!apiRemoveSheet(id)) {
        this.$message.warning('至少需保留一个工作表')
        return
      }
      this.loadSheetData(getActiveSheetData())
      this.refreshSheets()
      this.$message.success('工作表已删除')
    },

    // 重命名工作表
    renameSheet({ id, name }) {
      apiRenameSheet(id, name)
      this.refreshSheets()
    },

    // 导出全部工作表为文件（多工作表容器）
    exportSheets(fileName) {
      this.saveWorkbookToFile((fileName || 'mind-map') + '.smm')
    },

    // 通过主进程保存对话框把当前多工作表容器写入文件，并记录路径
    async saveWorkbookToFile(defaultName) {
      // 重新同步为当前激活 workbook 的真实路径（多文件切换后可能滞后）
      this.currentFilePath = getCurrentFilePath()
      if (!window.smmApi || !window.smmApi.saveWorkbook) {
        // 网页端无文件对话框，退化为浏览器下载
        this.exportSheetsBlob(defaultName)
        return
      }
      try {
        this.manualSave()
        const container = getSheetsContainer()
        // 仅当 currentFilePath 是绝对路径时，才将其作为保存对话框默认位置；
        // 相对路径或空时退化为仅文件名，避免 Electron 把对话框定位到 exe 目录。
        const defaultPath = this.isAbsolutePath(this.currentFilePath)
          ? this.currentFilePath
          : defaultName
        const res = await window.smmApi.saveWorkbook(
          JSON.stringify(container),
          defaultPath
        )
        if (res && res.canceled) return
        if (res && res.error) {
          this.$message.error('保存失败：' + res.error)
          return
        }
        // 另存为语义：把当前激活 workbook 重定向到新路径，文件名随之更新，
        // 原文件（如有）完全不受影响；同时清除未保存标记。
        applySaveAs(res.filePath)
        this.currentFilePath = res.filePath
        this.updateTitle()
        // 通知 FileTabs 刷新标签名与未保存标记（修复“另存为后文件名不变”）
        this.$bus.$emit('workbook-list-changed')
        this.$message.success('已保存：' + this.fileName)
      } catch (err) {
        console.error(err)
        this.$message.error('保存失败，请查看控制台')
      }
    },

    // 网页端退化：直接下载 .smm 文件（无法记录真实路径）
    exportSheetsBlob(fileName) {
      const container = getSheetsContainer()
      const content = JSON.stringify(container)
      const blob = new Blob([content], {
        type: 'application/json;charset=utf-8'
      })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = (fileName || 'mind-map') + '.smm'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(a.href)
      this.$notify.info({
        title: this.$t('export.notifyTitle'),
        message: '已导出全部工作表'
      })
    },

    // 从文件导入（工具栏"导入"按钮）：创建为新的同名文件并打开，
    // 绝不覆盖当前正在编辑的活跃文件。
    // container 可为多工作表容器，或单图 mindmap 数据（root / content.root）。
    importSheets(container, name) {
      // 归一化：单图数据（非多工作表容器）包成单个 sheet
      let c = container
      if (!isSheetsFile(c)) {
        c = {
          app: 'smm-multisheet',
          version: 1,
          sheets: [
            { name: name || 'Sheet1', data: this.extractMindmapData(c) }
          ]
        }
      }
      this.openContainerAsNewWorkbook(c, name || '未命名', '')
    },

    // ===== 文件保存 / 打开（桌面端，显示真实路径与文件名）=====

    // 判断是否为绝对路径（Windows 盘符路径或 Unix 绝对路径）
    isAbsolutePath(p) {
      if (!p || typeof p !== 'string') return false
      return /^[a-zA-Z]:[\\/]/.test(p) || /^\//.test(p)
    },

    // 保存：若已有绝对文件路径则覆盖写入，否则等同于另存为
    async doSave() {
      // 多文件场景：每次保存都以“当前激活 workbook”记录的真实路径为准，
      // 避免 this.currentFilePath 与 workbook 状态不同步时把内容写到错误的文件。
      this.currentFilePath = getCurrentFilePath()
      if (
        this.isAbsolutePath(this.currentFilePath) &&
        window.smmApi &&
        window.smmApi.writeFile
      ) {
        try {
          this.manualSave()
          const container = getSheetsContainer()
          const res = await window.smmApi.writeFile(
            this.currentFilePath,
            JSON.stringify(container)
          )
          if (res && res.ok) {
            const id = getActiveWorkbookId()
            if (id) markDirty(id, false)
            this.$bus.$emit('workbook-list-changed')
            this.$message.success('已保存：' + this.fileName)
          } else {
            this.$message.error(
              '保存失败：' + (res && res.error ? res.error : '未知错误')
            )
          }
        } catch (err) {
          console.error(err)
          this.$message.error('保存失败，请查看控制台')
        }
        return
      }
      this.doSaveAs()
    },

    // 另存为：弹出保存对话框，返回真实路径
    doSaveAs() {
      let defaultName = this.fileName
      if (!defaultName) {
        // 未保存（空路径）文件：用当前 workbook 的名字作为默认文件名
        try {
          const list = getWorkbookList()
          const active = list.workbooks.find(w => w.id === list.activeId)
          defaultName = (active && active.name ? active.name : '思维导图') + '.smm'
        } catch (e) {
          defaultName = '思维导图.smm'
        }
      }
      this.saveWorkbookToFile(defaultName)
    },

    // 打开/导入的核心：把一份（已归一化为多工作表容器的）数据，
    // 注册为一个全新的 workbook 并打开，绝不触碰当前活跃文件。
    // filePath 为真实路径（打开对话框 / 拖拽真实文件）或 ''（导入-尚未落盘）。
    async openContainerAsNewWorkbook(container, name, filePath) {
      // 先把当前 mind map 的编辑落盘到当前活跃文件，避免切换后丢失
      this.manualSave()
      const newSheetState = this.buildSheetState(container)
      if (!newSheetState) {
        this.$message.error('工作表文件格式不正确')
        return false
      }
      const baseName = name || '未命名'
      const { addWorkbook } = await import('@/api')
      // skipOldWriteback：当前 module-level sheetState 是旧文件的数据，
      // 不应被回写覆盖；新数据以独立 sheetState 注册为新 workbook。
      addWorkbook({
        name: baseName,
        filePath: filePath || '',
        sheetState: newSheetState,
        skipOldWriteback: true
      })
      this.currentFilePath = filePath || null
      setCurrentFilePath(filePath || null)
      this.loadSheetData(getActiveSheetData())
      this.refreshSheets()
      this.updateTitle()
      this.$bus.$emit('workbook-list-changed')
      this.$message.success('已打开：' + this.fileName)
      return true
    },

    // 切换到指定 workbook（复用 Index.vue 的切换流程：先写回当前、再载入目标）
    async switchToWorkbook(id) {
      const { switchWorkbook: apiSwitch } = await import('@/api')
      this.$bus.$emit('before-workbook-switch', id)
      if (apiSwitch(id)) {
        this.$bus.$emit('workbook-switched', id)
      }
    },

    // 从原始文件内容（JSON 字符串）打开为新的 workbook（打开对话框 / 拖拽 .smm）
    async loadWorkbookFromRaw(raw, filePath) {
      const trimmed = (raw || '').trim()
      if (!trimmed) {
        this.$message.error('文件为空（0 字节），无法打开，请确认文件未损坏')
        return false
      }
      let data
      try {
        data = JSON.parse(trimmed)
      } catch (e) {
        this.$message.error('文件解析失败：内容不是合法的 JSON')
        return false
      }
      // 防重复打开：同一绝对路径的文件已在其它标签页打开过，则直接切到那个标签页，
      // 避免同一文件出现多个互相独立、数据会串的工作簿（“其他已打开文件出问题”）。
      if (filePath && this.isAbsolutePath(filePath)) {
        const list = getWorkbookList()
        const existed = list.workbooks.find(
          w =>
            this.isAbsolutePath(w.filePath) &&
            w.filePath.toLowerCase() === filePath.toLowerCase()
        )
        if (existed) {
          this.manualSave()
          this.switchToWorkbook(existed.id)
          return true
        }
      }
      // 归一化为多工作表容器（单图文件包成单个 Sheet1）
      const container = isSheetsFile(data)
        ? data
        : {
            app: 'smm-multisheet',
            version: 1,
            sheets: [{ name: 'Sheet1', data: this.extractMindmapData(data) }]
          }
      const baseName = (filePath || '未命名')
        .split(/[\\/]/)
        .pop()
        .replace(/\.smm$/i, '')
      return this.openContainerAsNewWorkbook(
        container,
        baseName,
        filePath || null
      )
    },

    // 由导入/打开的文件容器构建一份全新的 sheetState（不改动任何全局状态）
    buildSheetState(container) {
      if (
        !container ||
        !Array.isArray(container.sheets) ||
        container.sheets.length === 0
      ) {
        return null
      }
      const sheets = container.sheets.map((s, i) => ({
        id:
          s.id ||
          'sheet-' + Date.now() + '-' + Math.floor(Math.random() * 1e6) + '-' + i,
        name: s.name || 'Sheet' + (i + 1),
        data: s.data || JSON.parse(JSON.stringify(exampleData))
      }))
      const activeId =
        container.activeId && sheets.find(s => s.id === container.activeId)
          ? container.activeId
          : sheets[0].id
      return { activeId, sheets }
    },

    // 打开本地文件
    async openWorkbook() {
      if (!window.smmApi || !window.smmApi.openWorkbookDialog) {
        this.$message.warning('当前环境不支持打开本地文件')
        return
      }
      try {
        this.manualSave()
        const res = await window.smmApi.openWorkbookDialog()
        if (res && res.canceled) return
        if (res && res.error) {
          this.$message.error('打开失败：' + res.error)
          return
        }
        await this.loadWorkbookFromRaw(res.content, res.filePath)
      } catch (err) {
        console.error(err)
        this.$message.error('打开失败，请查看控制台')
      }
    },

    // 拖拽文件到画布：.smm 打开为新文件；其它类型走原拖入导入逻辑
    onContainerDrop(e) {
      const dt = e.dataTransfer
      const file = dt && dt.files && dt.files[0]
      if (!file) return
      const name = file.name || ''
      const ext = (name.split('.').pop() || '').toLowerCase()
      // Electron 桌面端：从操作系统拖入的文件可拿到真实绝对路径 file.path；
      // 浏览器环境 file.path 为 undefined（用绝对路径正则判定，避免把裸文件名当路径）。
      // 拿到真实路径后：① 文件名栏直接显示 test3（而非“未命名”）；
      // ② Ctrl+S 可直接覆盖原文件，无需再弹“另存为”选位置。
      const realPath =
        file.path && /^[a-zA-Z]:[\\/]/.test(file.path) ? file.path : ''
      if (ext === 'smm') {
        // 读取文件内容并打开为新 workbook（不覆盖当前正在编辑的文件）
        const reader = new FileReader()
        reader.onload = () => {
          this.manualSave()
          this.loadWorkbookFromRaw(reader.result, realPath)
        }
        reader.onerror = () => {
          this.$message.error('读取文件失败')
        }
        reader.readAsText(file)
        return
      }
      // 其它类型（图片/其它思维导图格式）：沿用原拖入导入逻辑
      if (this.enableDragImport) {
        this.$bus.$emit('importFile', file)
      }
    },

    // 新建本地文件（来自工具栏“新建文件”/“另存为”）：弹出保存对话框写入，并作为单一工作表加载，记录真实路径
    async newWorkbook(content) {
      if (!window.smmApi || !window.smmApi.saveWorkbook) {
        // 网页端无文件对话框：直接以单工作表加载，不落盘
        const container = {
          app: 'smm-multisheet',
          version: 1,
          sheets: [{ name: 'Sheet1', data: content }]
        }
        if (!loadSheetsContainer(container)) {
          this.$message.error('工作表文件格式不正确')
          return
        }
        this.currentFilePath = null
        setCurrentFilePath(null)
        this.loadSheetData(getActiveSheetData())
        this.refreshSheets()
        this.updateTitle()
        return
      }
      try {
        const defaultName =
          (this.$t && this.$t('toolbar.defaultFileName')) || '思维导图.smm'
        const container = {
          app: 'smm-multisheet',
          version: 1,
          sheets: [
            {
              id: 'sheet_' + Date.now(),
              name: 'Sheet1',
              data: content
            }
          ]
        }
        const res = await window.smmApi.saveWorkbook(
          JSON.stringify(container),
          defaultName
        )
        if (res && res.canceled) return
        if (res && res.error) {
          this.$message.error('创建失败：' + res.error)
          return
        }
        if (!loadSheetsContainer(container)) {
          this.$message.error('工作表文件格式不正确')
          return
        }
        this.currentFilePath = res.filePath
        setCurrentFilePath(res.filePath)
        this.loadSheetData(getActiveSheetData())
        this.refreshSheets()
        this.updateTitle()
        this.$message.success('已创建：' + this.fileName)
      } catch (err) {
        console.error(err)
        this.$message.error('创建失败，请查看控制台')
      }
    },

    // FileTabs 上的“+”新建文件：弹保存对话框、创建新 workbook 并切换为激活
    async newWorkbookFromTabs() {
      // 先把当前 mind map 数据落盘到当前 workbook（保持当前 workbook 完整）
      this.manualSave()
      // 新建一个全新的空白文件（使用默认模板），不要复制当前文件内容
      if (!window.smmApi || !window.smmApi.saveWorkbook) {
        // 网页端：直接新建一个内存 workbook 并切换
        const { addWorkbook } = await import('@/api')
        addWorkbook({ name: '未命名', filePath: '' })
        this.loadSheetData(getActiveSheetData())
        this.refreshSheets()
        this.currentFilePath = ''
        setCurrentFilePath('')
        this.updateTitle()
        this.$bus.$emit('workbook-list-changed')
        return
      }
      try {
        const defaultName =
          (this.$t && this.$t('toolbar.defaultFileName')) || '思维导图.smm'
        const container = {
          app: 'smm-multisheet',
          version: 1,
          sheets: [
            {
              id: 'sheet_' + Date.now(),
              name: 'Sheet1',
              data: JSON.parse(JSON.stringify(exampleData))
            }
          ]
        }
        const res = await window.smmApi.saveWorkbook(
          JSON.stringify(container),
          defaultName
        )
        if (res && res.canceled) return
        if (res && res.error) {
          this.$message.error('创建失败：' + res.error)
          return
        }
        // 在 API 层新建一个 workbook 并切换为激活
        const { addWorkbook } = await import('@/api')
        const baseName = (res.filePath || defaultName)
          .split(/[\\/]/)
          .pop()
          .replace(/\.smm$/i, '')
        addWorkbook({
          name: baseName || '未命名',
          filePath: res.filePath,
          sheetState: {
            activeId: container.sheets[0].id,
            sheets: container.sheets.map(s => ({
              id: s.id,
              name: s.name,
              data: s.data
            }))
          }
        })
        // 切换 mind map 到新 workbook
        this.loadSheetData(getActiveSheetData())
        this.refreshSheets()
        this.currentFilePath = res.filePath
        setCurrentFilePath(res.filePath)
        this.updateTitle()
        // 新建文件后立刻重应用全局画布背景，防止主题默认背景覆盖
        this.applyStoredCanvasBackground()
        this.$message.success('已创建：' + this.fileName)
        this.$bus.$emit('workbook-list-changed')
      } catch (err) {
        console.error(err)
        this.$message.error('创建失败，请查看控制台')
      }
    },

    // FileTabs 切换文件前：把当前 mind map 数据持久化到当前 workbook
    // 必须在 API 切换 sheetState 之前调用，否则会写到新 workbook
    beforeWorkbookSwitch() {
      if (this.mindMap) {
        this.manualSave()
      }
    },

    // FileTabs 切换文件：API 已把 sheetState 指向新 workbook，这里只需载入到 mind map 实例
    onWorkbookSwitched() {
      if (!this.mindMap) return
      this.loadSheetData(getActiveSheetData())
      this.refreshSheets()
      this.currentFilePath = getCurrentFilePath()
      this.updateTitle()
      // 切换文件时同步画布背景
      this.applyStoredCanvasBackground()
      // 切换文件时不弹 toast，保持 UI 静默切换
    },

    // 文件重命名后：同步更新当前路径与窗口标题（保存会继续写入新路径）
    onWorkbookRenamed({ newPath }) {
      this.currentFilePath = newPath || getCurrentFilePath()
      this.updateTitle()
    },

    // 应用全局画布背景到容器（初始化 / 切换文件 / 每次载入后调用）。
    // 背景为全局设置，存于 localConfig，不写入 .smm 文件，因此切换/打开不同文件不会串。
    // 使用 !important 防止 simple-mind-map 在渲染时通过 initTheme/setBackgroundStyle 覆盖。
    applyStoredCanvasBackground() {
      // 临时断开观察器，避免自己写样式又触发观察器造成死循环
      if (this._bgObserver) this._bgObserver.disconnect()
      const reconnect = () => {
        if (this._bgObserver && this.mindMap && this.mindMap.el) {
          this._bgObserver.observe(this.mindMap.el, {
            attributes: true,
            attributeFilter: ['style']
          })
        }
      }
      try {
        if (!this.mindMap || !this.mindMap.el) return
        const el = this.mindMap.el
        const localCfg =
          this.$store && this.$store.state && this.$store.state.localConfig
        const bg = localCfg && localCfg.canvasBackground
        const clearBg = () => {
          el.style.removeProperty('background-color')
          el.style.removeProperty('background-image')
          el.style.removeProperty('background-size')
          el.style.removeProperty('background-repeat')
          el.style.removeProperty('background-position')
        }
        if (!bg || bg.type === 'default') {
          clearBg()
          el.style.setProperty('background-color', '#ffffff', 'important')
          return
        }
        clearBg()
        if (bg.type === 'image') {
          el.style.setProperty('background-color', '#ffffff', 'important')
          el.style.setProperty(
            'background-image',
            `url(${bg.value})`,
            'important'
          )
          el.style.setProperty('background-size', 'cover', 'important')
          el.style.setProperty('background-repeat', 'no-repeat', 'important')
          el.style.setProperty('background-position', 'center', 'important')
        } else {
          el.style.setProperty('background-color', bg.value, 'important')
        }
      } finally {
        // 记录实际生效的背景值，供观察器比对（避免平移/缩放时误触发重应用）
        if (this.mindMap && this.mindMap.el) {
          this._appliedBg = this.mindMap.el.style.backgroundColor
          this._appliedImg = this.mindMap.el.style.backgroundImage
        }
        reconnect()
      }
    },

    // 监听画布容器 style 变化：simple-mind-map 在 setTheme/渲染时会重置背景，
    // 用 MutationObserver 兜底重应用全局背景，确保“修改/切换文件”后背景不丢。
    setupCanvasBackgroundObserver() {
      if (!this.mindMap || !this.mindMap.el) return
      this._bgObserver = new MutationObserver(() => {
        const el = this.mindMap.el
        const curBg = el.style.backgroundColor
        const curImg = el.style.backgroundImage
        // 与已生效的背景一致（如平移/缩放改变了 transform 但背景未变）则不处理
        if (curBg === this._appliedBg && curImg === this._appliedImg) return
        this.applyStoredCanvasBackground()
      })
      this._bgObserver.observe(this.mindMap.el, {
        attributes: true,
        attributeFilter: ['style']
      })
    },

    // 更新窗口标题并触发路径显示
    updateTitle() {
      const base = '思绪思维导图'
      const title = this.currentFilePath
        ? base + ' - ' + this.fileName
        : base + ' - 未保存'
      if (window.smmApi && window.smmApi.setTitle) {
        try {
          window.smmApi.setTitle(title)
        } catch (e) {}
      }
    },

    // 从各种标准 simple-mind-map 文件形状中提取思维导图数据
    extractMindmapData(data) {
      if (data && data.content && data.content.root) return data.content
      if (data && data.data && data.data.root) return data.data
      return data
    },

    // 主进程菜单命令：保存 / 另存为 / 打开（.emmx 入口已移至工具栏“导入”按钮）
    handleMenuCommand(cmd) {
      if (cmd === 'save') this.doSave()
      else if (cmd === 'saveAs') this.doSaveAs()
      else if (cmd === 'open') this.openWorkbook()
    },

    // 关闭/刷新前保存当前工作表
    handleBeforeUnload() {
      if (this.mindMap) {
        this.manualSave()
      }
    },

    // 初始化
    init() {
      let hasFileURL = this.hasFileURL()
      let { root, layout, theme, view } = this.mindMapData
      const config = this.mindMapConfig
      // 如果url中存在要打开的文件，那么思维导图数据、主题、布局都使用默认的
      if (hasFileURL) {
        root = {
          data: {
            text: this.$t('edit.root')
          },
          children: []
        }
        layout = exampleData.layout
        theme = exampleData.theme
        view = null
      }
      this.mindMap = new MindMap({
        el: this.$refs.mindMapContainer,
        data: root,
        fit: false,
        layout: layout,
        theme: theme.template,
        themeConfig: theme.config,
        viewData: view,
        nodeTextEditZIndex: 1000,
        nodeNoteTooltipZIndex: 1000,
        customNoteContentShow: {
          show: (content, left, top, node) => {
            this.$bus.$emit('showNoteContent', content, left, top, node)
          },
          hide: () => {
            this.$bus.$emit('hideNoteContent')
          }
        },
        openRealtimeRenderOnNodeTextEdit: true,
        enableAutoEnterTextEditWhenKeydown: true,
        demonstrateConfig: {
          openBlankMode: false
        },
        ...(config || {}),
        iconList: [...icon],
        useLeftKeySelectionRightKeyDrag: this.useLeftKeySelectionRightKeyDrag,
        customInnerElsAppendTo: null,
        customHandleClipboardText: handleClipboardText,
        defaultNodeImage: require('../../../assets/img/图片加载失败.svg'),
        initRootNodePosition: ['center', 'center'],
        handleIsSplitByWrapOnPasteCreateNewNode: () => {
          return this.$confirm(
            this.$t('edit.splitByWrap'),
            this.$t('edit.tip'),
            {
              confirmButtonText: this.$t('edit.yes'),
              cancelButtonText: this.$t('edit.no'),
              type: 'warning'
            }
          )
        },
        errorHandler: (code, err) => {
          console.error(err)
          switch (code) {
            case 'export_error':
              this.$message.error(this.$t('edit.exportError'))
              break
            default:
              break
          }
        },
        addContentToFooter: () => {
          const text = this.extraTextOnExport.trim()
          if (!text) return null
          const el = document.createElement('div')
          el.className = 'footer'
          el.innerHTML = text
          const cssText = `
            .footer {
              width: 100%;
              height: 30px;
              display: flex;
              justify-content: center;
              align-items: center;
              font-size: 12px;
              color: #979797;
            }
          `
          return {
            el,
            cssText,
            height: 30
          }
        },
        expandBtnNumHandler: num => {
          return num >= 100 ? '…' : num
        },
        beforeDeleteNodeImg: node => {
          return new Promise(resolve => {
            this.$confirm(
              this.$t('edit.deleteNodeImgTip'),
              this.$t('edit.tip'),
              {
                confirmButtonText: this.$t('edit.yes'),
                cancelButtonText: this.$t('edit.no'),
                type: 'warning'
              }
            )
              .then(() => {
                resolve(false)
              })
              .catch(() => {
                resolve(true)
              })
          })
        }
      })
      this.loadPlugins()
      // 转发事件
      ;[
        'node_active',
        'data_change',
        'view_data_change',
        'back_forward',
        'node_contextmenu',
        'node_click',
        'draw_click',
        'expand_btn_click',
        'svg_mousedown',
        'mouseup',
        'mode_change',
        'node_tree_render_end',
        'rich_text_selection_change',
        'transforming-dom-to-images',
        'generalization_node_contextmenu',
        'painter_start',
        'painter_end',
        'scrollbar_change',
        'scale',
        'translate',
        'node_attachmentClick',
        'node_attachmentContextmenu',
        'demonstrate_jump',
        'exit_demonstrate',
        'node_note_dblclick',
        'node_mousedown'
      ].forEach(event => {
        this.mindMap.on(event, (...args) => {
          this.$bus.$emit(event, ...args)
        })
      })
      this.bindSaveEvent()
      // 如果应用被接管，那么抛出事件传递思维导图实例
      if (window.takeOverApp) {
        this.$bus.$emit('app_inited', this.mindMap)
      }
      // 解析url中的文件
      if (hasFileURL) {
        this.$bus.$emit('handle_file_url')
      }
      // api/index.js文件使用
      // 当正在编辑本地文件时通过该方法获取最新数据
      Vue.prototype.getCurrentData = () => {
        const fullData = this.mindMap.getData(true)
        return { ...fullData }
      }
      // 协同测试
      this.cooperateTest()
      // 应用已保存的画布背景
      this.applyStoredCanvasBackground()
      // 启动背景观察器，兜底重应用（防止 simple-mind-map 在渲染/改主题时重置背景）
      this.setupCanvasBackgroundObserver()
    },

    // 加载相关插件
    loadPlugins() {
      if (this.openNodeRichText) this.addRichTextPlugin()
      if (this.isShowScrollbar) this.addScrollbarPlugin()
    },

    // url中是否存在要打开的文件
    hasFileURL() {
      const fileURL = this.$route.query.fileURL
      if (!fileURL) return false
      return /\.(smm|json|xmind|md|xlsx)$/.test(fileURL)
    },

    // 动态设置思维导图数据
    setData(data) {
      this.handleShowLoading()
      let rootNodeData = null
      if (data.root) {
        this.mindMap.setFullData(data)
        rootNodeData = data.root
      } else {
        this.mindMap.setData(data)
        rootNodeData = data
      }
      this.mindMap.view.reset()
      this.manualSave()
      // 如果导入的是富文本内容，那么自动开启富文本模式
      if (rootNodeData.data.richText && !this.openNodeRichText) {
        this.$bus.$emit('toggleOpenNodeRichText', true)
        this.$notify.info({
          title: this.$t('edit.tip'),
          message: this.$t('edit.autoOpenNodeRichTextTip')
        })
      }
    },

    // 重新渲染
    reRender() {
      this.mindMap.reRender()
    },

    // 执行命令
    execCommand(...args) {
      this.mindMap.execCommand(...args)
    },

    // 导出
    async export(...args) {
      const [type, isDownload, name, ...rest] = args
      const EXTRA_DATA = ['html', 'opml', 'mm', 'xlsx', 'docx', 'pptx']
      const EXTRA_MEDIA = ['wav', 'mp4']
      try {
        showLoading()
        if (EXTRA_DATA.includes(type)) {
          const { extraExport, downloadBlob } = await import('@/utils/exportExtra')
          const r = await extraExport(type, this.mindMap, name)
          if (isDownload && r && r.blob) {
            downloadBlob(r.blob, name + '.' + r.ext)
          }
        } else if (EXTRA_MEDIA.includes(type)) {
          const { exportWAV, exportMP4, downloadBlob } = await import('@/utils/exportMedia')
          const blob =
            type === 'wav'
              ? await exportWAV(this.mindMap, name)
              : await exportMP4(this.mindMap, name)
          if (isDownload && blob) {
            downloadBlob(blob, name + '.' + type)
          }
        } else {
          await this.mindMap.export(...args)
        }
        hideLoading()
      } catch (error) {
        console.error(error)
        hideLoading()
        const msg = error && error.message ? error.message : String(error)
        if (this.$notify) {
          this.$notify.error('导出失败：' + msg)
        }
      }
    },

    // 修改导出内边距
    onPaddingChange(data) {
      this.mindMap.updateConfig(data)
    },

    // 加载节点富文本编辑插件
    addRichTextPlugin() {
      if (!this.mindMap) return
      this.mindMap.addPlugin(RichText)
    },

    // 移除节点富文本编辑插件
    removeRichTextPlugin() {
      this.mindMap.removePlugin(RichText)
    },

    // 加载滚动条插件
    addScrollbarPlugin() {
      if (!this.mindMap) return
      this.mindMap.addPlugin(ScrollbarPlugin)
    },

    // 移除滚动条插件
    removeScrollbarPlugin() {
      this.mindMap.removePlugin(ScrollbarPlugin)
    },

    // 协同测试
    cooperateTest() {
      if (this.mindMap.cooperate && this.$route.query.userName) {
        this.mindMap.cooperate.setProvider(null, {
          roomName: 'demo-room',
          signalingList: ['ws://localhost:4444']
        })
        this.mindMap.cooperate.setUserInfo({
          id: Math.random(),
          name: this.$route.query.userName,
          color: ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C', '#909399'][
            Math.floor(Math.random() * 5)
          ],
          avatar:
            Math.random() > 0.5
              ? 'https://img0.baidu.com/it/u=4270674549,2416627993&fm=253&app=138&size=w931&n=0&f=JPEG&fmt=auto?sec=1696006800&t=4d32871d14a7224a4591d0c3c7a97311'
              : ''
        })
      }
    },

    // 拖拽文件到页面导入
    onDragenter() {
      if (!this.enableDragImport || this.isDragOutlineTreeNode) return
      this.showDragMask = true
    },

    onDragleave() {
      this.showDragMask = false
    },

    // 网页版试用提示（本地客户端模式下不显示）
    webTip() {
      if (window.__LOCAL_APP__) return
      const storageKey = 'webUseTip'
      const data = localStorage.getItem(storageKey)
      if (data) {
        return
      }
      this.showDownloadTip(
        '重要提示',
        '网页版仅供试用，请下载客户端获得完整体验~'
      )
      localStorage.setItem(storageKey, 1)
    },

    showDownloadTip(title, desc) {
      const h = this.$createElement
      this.$msgbox({
        title,
        message: h('div', null, [
          h(
            'p',
            {
              style: {
                marginBottom: '12px'
              }
            },
            desc
          ),
          h('div', null, [
            h(
              'a',
              {
                attrs: {
                  href:
                    'https://sxmind.cn/',
                  target: '_blank'
                },
                style: {
                  color: '#409eff',
                  marginRight: '12px'
                }
              },
              '详细了解：https://sxmind.cn/'
            )
          ])
        ]),
        showCancelButton: false,
        showConfirmButton: false
      })
    }
  }
}
</script>

<style lang="less" scoped>
.editContainer {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;

  .dragMask {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(255, 255, 255, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 3999;

    .dragTip {
      pointer-events: none;
      font-weight: bold;
    }
  }

  .mindMapContainer {
    position: absolute;
    left: 0px;
    top: 0;
    width: 100%;
    bottom: 40px;
    height: auto;
  }
}
</style>
