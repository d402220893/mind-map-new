<template>
  <div
    class="editContainer"
    @dragenter.stop.prevent="onDragenter"
    @dragleave.stop.prevent
    @dragover.stop.prevent
    @drop.stop.prevent
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
        @drop.stop.prevent="onDrop"
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
  setCurrentFilePath
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
    // 全局监听剪贴板图片粘贴：仅当剪贴板包含 image 文件时拦截并预览插入，
    // 纯文本仍交给库默认 paste 行为处理
    window.addEventListener('paste', this.onPaste, true)
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
    window.removeEventListener('beforeunload', this.handleBeforeUnload)
    window.removeEventListener('paste', this.onPaste, true)
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

    // 全局拦截 Ctrl/Cmd+S：桌面端交给主进程菜单命令（Ctrl+S -> 'save'）处理，
    // 网页端则直接保存到 localStorage 并提示
    onGlobalKeydown(e) {
      const isSave =
        (e.ctrlKey || e.metaKey) &&
        (e.key === 's' || e.key === 'S')
      if (!isSave) return
      // 阻止浏览器“保存网页”和 Electron 默认菜单“保存”抢走组合键
      e.preventDefault()
      if (e.stopPropagation) e.stopPropagation()
      // 桌面端由主进程菜单命令接管，避免重复弹窗
      if (window.smmApi && window.smmApi.saveWorkbook) return
      try {
        this.manualSave()
        this.$message.success('已保存当前工作表')
      } catch (err) {
        console.error('手动保存失败', err)
        this.$message.error('保存失败，请查看控制台')
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
      if (data && data.root) {
        this.mindMap.setFullData(data)
      } else {
        this.mindMap.setData(data)
      }
      this.mindMap.view.reset()
      this.mindMapData = data
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
      if (!window.smmApi || !window.smmApi.saveWorkbook) {
        // 网页端无文件对话框，退化为浏览器下载
        this.exportSheetsBlob(defaultName)
        return
      }
      try {
        this.manualSave()
        const container = getSheetsContainer()
        const res = await window.smmApi.saveWorkbook(
          JSON.stringify(container),
          defaultName
        )
        if (res && res.canceled) return
        if (res && res.error) {
          this.$message.error('保存失败：' + res.error)
          return
        }
        this.currentFilePath = res.filePath
        setCurrentFilePath(res.filePath)
        this.updateTitle()
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

    // 从文件导入全部工作表
    importSheets(container) {
      if (!loadSheetsContainer(container)) {
        this.$message.error('工作表文件格式不正确')
        return
      }
      // 覆盖当前内容：清空旧文件路径、刷新标题
      this.currentFilePath = null
      setCurrentFilePath(null)
      this.loadSheetData(getActiveSheetData())
      this.refreshSheets()
      this.updateTitle()
    },

    // ===== 文件保存 / 打开（桌面端，显示真实路径与文件名）=====

    // 保存：若已有文件路径则覆盖写入，否则等同于另存为
    async doSave() {
      if (this.currentFilePath && window.smmApi && window.smmApi.writeFile) {
        try {
          this.manualSave()
          const container = getSheetsContainer()
          const res = await window.smmApi.writeFile(
            this.currentFilePath,
            JSON.stringify(container)
          )
          if (res && res.ok) {
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
      this.saveWorkbookToFile(this.fileName || '思维导图.smm')
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
        let data
        try {
          data = JSON.parse(res.content)
        } catch (e) {
          this.$message.error('文件解析失败')
          return
        }
        if (isSheetsFile(data)) {
          loadSheetsContainer(data)
        } else {
          // 旧版单张思维导图文件：作为单一工作表导入
          loadSheetsContainer({
            app: 'smm-multisheet',
            version: 1,
            sheets: [{ name: 'Sheet1', data }]
          })
        }
        this.currentFilePath = res.filePath
        setCurrentFilePath(res.filePath)
        this.loadSheetData(getActiveSheetData())
        this.refreshSheets()
        this.updateTitle()
        this.$message.success('已打开：' + this.fileName)
      } catch (err) {
        console.error(err)
        this.$message.error('打开失败，请查看控制台')
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
            // this.$bus.$emit('hideNoteContent')
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

    onDrop(e) {
      if (!this.enableDragImport) return
      this.showDragMask = false
      const dt = e.dataTransfer
      const file = dt.files && dt.files[0]
      if (!file) return
      this.$bus.$emit('importFile', file)
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
    top: 0px;
    width: 100%;
    bottom: 38px;
    height: auto;
  }
}
</style>
