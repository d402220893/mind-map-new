<template>
  <div class="workspacePanel" :class="{ isDark: isDark, collapsed: collapsed, resizing: resizing }">
    <!-- 右缘拖拽手柄：拖宽/拖窄文件栏（宽度走 CSS 变量，蓝缝/画布/sheet 栏同步跟随） -->
    <div
      v-if="!collapsed"
      class="wsResizeHandle"
      title="拖拽调整文件栏宽度"
      @mousedown="startResize"
    ></div>
    <!-- 折叠蓝条：Teleport 到 body。画布 .editContainer 是 position:fixed 铺满窗口且 DOM 在
         面板之后，若 pill 留在面板内会被画布整体盖住（收起态只露几 px → "隐藏后找不到"） -->
    <Teleport to="body">
      <div
        class="wsPill"
        :class="{ collapsed: collapsed }"
        @click="toggleCollapsed"
        :title="collapsed ? '展开文件栏' : '收起文件栏'"
      >
        <span class="iconfont iconjiantouyou wsPillIcon"></span>
      </div>
    </Teleport>
    <div class="wsHeader">
      <span class="wsTitle" :title="root || ''">
        📁 {{ root ? baseOf(root) : '未打开工作区' }}
      </span>
      <span class="wsActions">
        <span class="wsBtn" title="刷新" @click="refresh">🔄</span>
        <span class="wsBtn" title="打开文件夹" @click="openFolder">📂</span>
        <span class="wsBtn" title="在资源管理器中显示" @click="revealRoot">↗</span>
      </span>
    </div>

    <div class="wsSearch">
      <input
        v-model="filter"
        class="wsInput"
        placeholder="过滤文件名…"
        @input="onFilter"
      />
      <!-- 统一搜索：一次回车同时搜 md 全文与所有 .smm 导图内容（节点/备注/引用），无需切换模式 -->
      <input
        v-model="query"
        class="wsInput"
        placeholder="搜索 md / 导图内容（回车）"
        @keyup.enter="runSearch"
      />
    </div>

    <!-- 索引降级提示（§8.7 错误态：内联可操作） -->
    <div v-if="indexStatus === 'readonly-index'" class="wsNotice" @click="rebuild">
      ⚠ 未建立索引，点此重建
    </div>
    <div v-if="indexStatus === 'rebuilt'" class="wsNotice ok">
      索引已重建
    </div>
    <div v-if="busy" class="wsNotice">索引重建中… {{ progress }}%</div>

    <!-- 空态（§8.7） -->
    <div v-if="!root" class="wsEmpty">
      <div class="wsEmptyTitle">打开文件夹开始</div>
      <div class="wsEmptyTip">.md 与 .smm 可互相引用</div>
      <button class="wsBigBtn" @click="openFolder">打开文件夹</button>
    </div>

    <div v-else class="wsBody customScrollbar">
      <!-- 统一搜索结果（md 全文 + smm 导图内容，同屏展示） -->
      <template v-if="hasSearchResult">
        <div class="wsGroupTitle">
          搜索结果（导图 {{ smmHitCount }} · 文档 {{ (searchResults || []).length }}）
          <span class="wsLink" @click="clearSearch">清除</span>
        </div>

        <!-- 导图（.smm）节点/备注/引用命中：可独立折叠分区（紫色系） -->
        <template v-if="smmResults && smmResults.length">
          <div class="wsGroupSub smm" @click="collapseSmm = !collapseSmm">
            <span class="wsCaret">{{ collapseSmm ? '▸' : '▾' }}</span>🧠 导图内容（{{ smmHitCount }}）
          </div>
          <template v-if="!collapseSmm">
            <!-- 同一文件的命中归并到同一文件名下（用户反馈：不要一个文件出现多次） -->
            <div
              v-for="group in smmResults"
              :key="'smmg' + group.key"
              class="wsHit"
            >
              <div class="wsHitFile">{{ group.fileName }}</div>
              <div
                v-for="(hit, hi) in group.hits"
                :key="'smm' + hi + hit.uid"
                class="wsSmmItem"
                @click="openNodeHit(hit)"
              >
                <div class="wsHitLine">
                  <template v-if="hit.sheetName">{{ hit.sheetName }} · </template>{{ hit.path }}
                </div>
                <div class="wsHitLine">{{ hit.preview }}</div>
              </div>
            </div>
          </template>
        </template>

        <!-- md 全文命中：可独立折叠分区（蓝色系）；文件名不带路径，文件间横线分隔 -->
        <template v-if="searchResults && searchResults.length">
          <div class="wsGroupSub md" @click="collapseMd = !collapseMd">
            <span class="wsCaret">{{ collapseMd ? '▸' : '▾' }}</span>📄 文档全文（{{ searchResults.length }}）
          </div>
          <template v-if="!collapseMd">
            <div
              v-for="hit in searchResults"
              :key="hit.rel"
              class="wsHit"
              @click="openHit(hit)"
            >
              <div class="wsHitFile">{{ baseNameOf(hit.rel) }}</div>
              <div
                v-for="(h, i) in hit.hits.slice(0, 3)"
                :key="i"
                class="wsHitLine"
              >L{{ h.line }}：{{ h.text }}</div>
            </div>
          </template>
        </template>

        <div
          v-if="!(smmResults && smmResults.length) && !(searchResults && searchResults.length)"
          class="wsEmptyTip"
        >未找到结果</div>
      </template>

      <!-- 文件树 -->
      <template v-else>
        <div
          v-for="f in flatFiles"
          :key="f.path"
          class="wsFile"
          :class="{ active: f.path === activePath }"
          :style="{ paddingLeft: 8 + f.depth * 14 + 'px' }"
          @click="onFileClick(f)"
          @contextmenu.prevent="onCtx($event, f)"
        >
          <span class="wsCaret">{{ f.isDir ? (isDirCollapsed(f.path) ? '▸' : '▾') : '' }}</span>
          <span class="wsIcon">{{ f.isDir ? (isDirCollapsed(f.path) ? '📁' : '📂') : iconOf(f.name) }}</span>
          <span class="wsName">{{ f.name }}</span>
          <span v-if="isDirtyTab(f.path)" class="wsDot" title="未保存">●</span>
        </div>
        <div v-if="!flatFiles.length" class="wsEmptyTip">
          {{ filter ? '未找到结果' : '空文件夹' }}
        </div>
      </template>
    </div>

    <!-- 右键菜单 -->
    <ul
      v-if="ctxMenu"
      class="wsCtxMenu"
      :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
      @click="ctxMenu = null"
    >
      <li @click="revealFile">在资源管理器中显示</li>
      <li @click="copyPath">复制文件路径</li>
      <li v-if="!ctxMenu.f.isDir" @click="newMdNear">在此新建 md 文件</li>
    </ul>
  </div>
</template>

<script>
import {
  pickAndOpenWorkspace,
  openPath,
  getServices,
  createMdFile
} from '@/utils/workspaceBridge'
import { getWorkbookList } from '@/api'
import { decodeSmm } from '@/services/smmCodec'
import { searchSmmContainer, stripHtml, truncate } from '@/utils/smmSearch'

export default {
  name: 'WorkspacePanel',
  props: {
    mindMap: {
      type: Object,
      default: null
    }
  },
  data() {
    return {
      root: '',
      tree: [],
      filesCache: [],
      filter: '',
      query: '',
      searchResults: null, // md 全文结果（[{rel, hits:[{line,text}]}]）
      smmResults: null, // 导图内容结果（按文件分组 [{key,file,fileName,live,hits:[{uid,path,preview,sheetName}]}]）
      indexStatus: 'ok',
      busy: false,
      progress: 0,
      collapsed: false,
      ctxMenu: null,
      activePath: '',
      collapsedDirs: [], // 已折叠目录（正斜杠归一化路径），按工作区 root 持久化到 localStorage
      collapseSmm: false, // 搜索结果「导图内容」分区折叠
      collapseMd: false, // 搜索结果「文档全文」分区折叠
      unsubs: [],
      rebuiltTimer: null,
      liveMindMap: null, // mindMap 实例（经 mindmap-inited 事件广播；prop 可能为 null）
      panelWidth: 240, // 文件栏宽度（拖拽右缘可调，localStorage 持久化）
      resizing: false // 拖拽中（禁用宽度 transition，避免拖影）
    }
  },
  computed: {
    isDark() {
      return this.$store.state.localConfig.isDark
    },
    baseOfRoot() {
      return this.root
    },
    hasSearchResult() {
      return this.searchResults !== null || this.smmResults !== null
    },
    // 导图命中总数（smmResults 已按文件分组，计数取各组 hits 之和）
    smmHitCount() {
      return (this.smmResults || []).reduce((n, g) => n + (g.hits ? g.hits.length : 0), 0)
    },
    flatFiles() {
      const kw = this.filter.trim().toLowerCase()
      const out = []
      const walk = (nodes, depth) => {
        for (const n of nodes || []) {
          const name = String(n.name || '')
          const hit = !kw || name.toLowerCase().includes(kw)
          if (hit || n.isDir) {
            out.push({ ...n, depth })
            // 目录折叠：无过滤词时跳过其子级；有过滤词时自动展开（保持命中可见）
            if (n.isDir && (kw || !this.isDirCollapsed(n.path))) walk(n.children, depth + 1)
          }
        }
      }
      walk(this.tree, 0)
      // 命中过滤时自动展开：命中文件保留，目录仅在有命中后代时保留
      if (!kw) return out
      const keep = new Set()
      out.forEach(f => keep.add(f.path))
      const parents = new Set()
      out.forEach(f => {
        const p = String(f.path || '').replace(/\\/g, '/')
        const idx = p.lastIndexOf('/')
        if (idx > 0) parents.add(p.slice(0, idx))
      })
      return out.filter(f => !f.isDir || parents.has(String(f.path).replace(/\\/g, '/')) || keep.has(f.path))
    }
  },
  created() {
    this.$bus.$on('workspace-opened', this.onWorkspaceOpened)
    this.$bus.$on('workbook-list-changed', this.syncActive)
    this.$bus.$on('workbook-switched', this.syncActive)
    // mindMap 实例就绪广播（Edit.vue 创建后 emit；prop 经 computed 读 $refs 会恒 null）
    this.$bus.$on('mindmap-inited', this.onMindmapInited)
    // 索引重建进度（§8.7）：L3 不 emit，由 workspaceService.progressRelay 上抛，
    // 经 workspaceBridge 转到 $bus；这里只消费。
    this.$bus.$on('index:rebuilding', this.onIndexProgress)
    // 恢复上次拖拽的面板宽度并发布 CSS 变量（蓝缝/画布/sheet 栏都消费）
    try {
      const saved = parseInt(localStorage.getItem('wsPanelWidth') || '', 10)
      if (saved >= 160 && saved <= 480) this.panelWidth = saved
    } catch (e) {}
    this.syncPanelVars()
    this.syncActive()
    const svc = getServices()
    if (svc && svc.workspaceService) {
      this.unsubs.push(
        svc.workspaceService.onFsAdd(() => this.refreshSilent())
      )
      this.unsubs.push(
        svc.workspaceService.onFsUnlink(() => this.refreshSilent())
      )
      this.unsubs.push(svc.workspaceService.onFsChange(() => this.refreshSilent()))
    }
  },
  beforeUnmount() {
    this.$bus.$off('workspace-opened', this.onWorkspaceOpened)
    this.$bus.$off('workbook-list-changed', this.syncActive)
    this.$bus.$off('workbook-switched', this.syncActive)
    this.$bus.$off('mindmap-inited', this.onMindmapInited)
    this.$bus.$off('index:rebuilding', this.onIndexProgress)
    if (this.rebuiltTimer) clearTimeout(this.rebuiltTimer)
    ;(this.unsubs || []).forEach(fn => {
      try {
        fn()
      } catch (e) {}
    })
  },
  methods: {
    onMindmapInited(mm) {
      this.liveMindMap = mm || null
    },
    // 可用的 mindMap 实例：优先 bus 广播的实时实例，prop 兜底
    activeMind() {
      return this.liveMindMap || this.mindMap || null
    },
    baseOf(p) {
      return String(p || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || p
    },
    iconOf(name) {
      if (/\.smm$/i.test(name)) return '🧠'
      if (/\.(md|markdown)$/i.test(name)) return '📄'
      if (/\.(png|jpe?g|gif|svg|webp)$/i.test(name)) return '🖼'
      return '📃'
    },
    onWorkspaceOpened(data) {
      if (!data) return
      this.root = data.root
      this.tree = data.tree || []
      this.indexStatus = data.indexStatus || 'ok'
      // 恢复该工作区的目录折叠状态
      try {
        const saved = JSON.parse(localStorage.getItem('wsCollapsedDirs:' + this.root) || '[]')
        this.collapsedDirs = Array.isArray(saved) ? saved : []
        // 记住上次打开的文件夹（启动时 main.js 据此自动恢复）
        localStorage.setItem('wsLastRoot', this.root)
      } catch (e) {
        this.collapsedDirs = []
      }
    },
    // 折叠开关：必须向父级广播，否则 fixed 定位的画布不会让位（Index.vue 用 wsCollapsed 做 offset）
    toggleCollapsed() {
      this.collapsed = !this.collapsed
      this.$emit('collapse', this.collapsed)
      this.syncPanelVars()
    },
    // 面板宽度真源 → CSS 变量（面板自身宽度 / 蓝缝与画布、sheet 栏的偏移都消费它）
    syncPanelVars() {
      const el = document.documentElement
      if (!el) return
      el.style.setProperty('--ws-panel-w', this.panelWidth + 'px')
      el.style.setProperty('--ws-panel-offset', this.collapsed ? '0px' : this.panelWidth + 'px')
    },
    // 拖拽右缘调宽（160–480px，持久化到 localStorage）
    startResize(e) {
      if (this.collapsed) return
      e.preventDefault()
      const startX = e.clientX
      const startW = this.panelWidth
      this.resizing = true
      const onMove = ev => {
        const w = Math.min(480, Math.max(160, startW + ev.clientX - startX))
        if (w !== this.panelWidth) {
          this.panelWidth = w
          this.syncPanelVars()
        }
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        this.resizing = false
        try {
          localStorage.setItem('wsPanelWidth', String(this.panelWidth))
        } catch (err) {}
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    onIndexProgress(p) {
      if (!p) return
      if (p.done) {
        this.busy = false
        this.progress = 100
        this.indexStatus = this.indexStatus === 'readonly-index' ? 'readonly-index' : 'ok'
        return
      }
      this.busy = true
      if (typeof p.percent === 'number') {
        this.progress = Math.max(0, Math.min(99, Math.round(p.percent)))
      } else if (p.total) {
        this.progress = Math.max(0, Math.min(99, Math.round((p.scanned / p.total) * 100)))
      }
    },
    async openFolder() {
      const r = await pickAndOpenWorkspace()
      if (!r.ok && r.error && r.error.code !== 'E_NOT_SUPPORTED') {
        this.$message.error('打开工作区失败：' + (r.error.message || r.error.code))
      }
      if (r.ok) this.onWorkspaceOpened(r.data)
    },
    async refresh() {
      if (!this.root) return
      const r = await getServices().workspaceService.refresh()
      if (r.ok) this.tree = r.data.tree || []
    },
    async refreshSilent() {
      if (!this.root) return
      const r = await getServices().workspaceService.refresh()
      if (r.ok) this.tree = r.data.tree || []
    },
    async rebuild() {
      this.busy = true
      this.progress = 0
      const r = await getServices().workspaceService.rebuildIndex({ full: true })
      this.busy = false
      this.indexStatus = r.ok ? 'rebuilt' : 'readonly-index'
      // 「已重建」提示 3s 后自动收起，避免长期占据面板
      if (this.rebuiltTimer) clearTimeout(this.rebuiltTimer)
      if (r.ok) {
        this.rebuiltTimer = setTimeout(() => {
          this.indexStatus = 'ok'
        }, 3000)
      }
    },
    revealRoot() {
      if (this.root) getServices().workspaceService.reveal(this.root)
    },
    onFilter() {
      this.searchResults = null
      this.smmResults = null
    },
    clearSearch() {
      this.searchResults = null
      this.smmResults = null
      this.query = ''
    },
    // 统一搜索：一次回车同时搜 md 全文 + 所有 .smm 导图内容（节点/备注/引用）
    async runSearch() {
      const q = this.query.trim()
      if (!q) {
        this.searchResults = null
        this.smmResults = null
        return
      }
      await Promise.all([this.runFullText(q), this.runSmmSearch(q)])
    },
    async runFullText(q) {
      const r = await getServices().workspaceSearch.fullText(q, { limit: 200 })
      this.searchResults = r.ok ? r.data.results || r.data : []
    },
    // 收集工作区内全部 .smm 文件（从树直取，不受文件名过滤影响）
    collectSmmFiles() {
      const out = []
      const walk = nodes => {
        for (const n of nodes || []) {
          if (n.isDir) walk(n.children)
          else if (/\.smm$/i.test(String(n.name || ''))) out.push(n)
        }
      }
      walk(this.tree)
      return out
    },
    // 路径同一性判定（Windows 大小写不敏感、斜杠归一）
    samePath(a, b) {
      const norm = p => String(p || '').replace(/\\/g, '/').toLowerCase()
      return norm(a) === norm(b)
    },
    async runSmmSearch(q) {
      const hits = []
      const svc = getServices()
      const files = this.collectSmmFiles()
      // 有 live 实例时当前激活导图走内存实时数据（含未保存改动），读盘分支跳过；
      // 无 live 实例（mindMap 尚未初始化完成）时退回读盘，避免"当前文件必搜不到"
      const liveAvailable = !!this.activeMind()
      for (const f of files) {
        if (liveAvailable && this.activePath && this.samePath(f.path, this.activePath)) continue
        try {
          const rd = await svc.workspaceService.readText(f.path)
          if (!rd || !rd.ok) continue
          const decoded = decodeSmm(rd.data.content)
          searchSmmContainer(decoded, q).forEach(h =>
            hits.push({ ...h, file: f.path, fileName: f.name })
          )
        } catch (e) {
          // 单个文件损坏/读取失败不影响整体搜索
        }
      }
      // 当前打开的导图：内存实时遍历（含未保存改动；无路径的新建文件也覆盖）
      const live = this.walkLiveNodes(q)
      if (live.length) {
        const name = this.activePath ? this.baseOf(this.activePath) : '当前编辑中'
        live.forEach(h =>
          hits.unshift({ ...h, file: this.activePath || '', fileName: name, live: true })
        )
      }
      this.smmResults = this.groupSmmHits(hits)
    },
    // 把扁平命中按文件归并成组（同一路径只出现一次文件名；live 组因 unshift 天然在最前）
    groupSmmHits(hits) {
      const groups = []
      const idx = new Map()
      for (const h of hits) {
        const key = h.live ? '__live__' : String(h.file || '').replace(/\\/g, '/').toLowerCase()
        let g = idx.get(key)
        if (!g) {
          g = { key, file: h.file || '', fileName: h.fileName, live: !!h.live, hits: [] }
          idx.set(key, g)
          groups.push(g)
        }
        g.hits.push(h)
      }
      return groups
    },
    // 遍历当前 mindMap 实例（MindMapNode 实例树，走 getData 访问器）
    walkLiveNodes(q) {
      const needle = String(q || '').trim().toLowerCase()
      const mm = this.activeMind()
      const root = mm && mm.renderer && mm.renderer.root
      if (!needle || !root) return []
      const results = []
      const walk = node => {
        const data = node.getData ? node.getData() : node.data || {}
        const text = stripHtml(data.text || '')
        const note = stripHtml(data.note || '')
        const refs = (data._mindlink && Array.isArray(data._mindlink.refs) ? data._mindlink.refs : [])
        const refText = refs.map(r => [r.title, r.cachedContent].filter(Boolean).join('\n')).join('\n')
        const hay = (text + '\n' + note + '\n' + refText).toLowerCase()
        if (hay.includes(needle)) {
          const path = node.getAncestorNodes
            ? node.getAncestorNodes().map(n => stripHtml(n.getData('text'))).concat([text]).join(' > ')
            : text
          const preview = note
            ? truncate(note)
            : refText
              ? truncate(refText)
              : truncate(text)
          results.push({
            uid: data.uid,
            path,
            preview,
            source: text
          })
        }
        const children = node.children || []
        children.forEach(walk)
      }
      walk(root)
      return results
    },
    openNodeHit(hit) {
      // 当前已打开文件的节点：直接画布内定位；其余先打开对应文件
      const isCurrent = hit.live || (hit.file && this.activePath && this.samePath(hit.file, this.activePath))
      const mm = this.activeMind()
      if (isCurrent && hit.uid && mm) {
        mm.execCommand('GO_TARGET_NODE', hit.uid)
        return
      }
      if (hit.file) this.openFile({ path: hit.file, name: hit.fileName })
    },
    openHit(hit) {
      const root = this.root
      const abs = hit.rel && /^[A-Za-z]:[\\/]|^\//.test(hit.rel)
        ? hit.rel
        : root.replace(/\\/g, '/').replace(/\/+$/, '') + '/' + hit.rel
      this.openFile({ path: abs, name: hit.rel })
    },
    onFileClick(f) {
      if (f.isDir) return this.toggleDir(f.path)
      this.openFile(f)
    },
    // 目录折叠/展开（路径统一为正斜杠，避免 Windows 反斜杠导致判定不一致）
    toggleDir(path) {
      const p = String(path).replace(/\\/g, '/')
      const i = this.collapsedDirs.indexOf(p)
      if (i >= 0) this.collapsedDirs.splice(i, 1)
      else this.collapsedDirs.push(p)
      try {
        localStorage.setItem('wsCollapsedDirs:' + this.root, JSON.stringify(this.collapsedDirs))
      } catch (e) {}
    },
    isDirCollapsed(path) {
      return this.collapsedDirs.includes(String(path).replace(/\\/g, '/'))
    },
    // 搜索结果只显示文件名（不带路径）
    baseNameOf(p) {
      return String(p || '').replace(/\\/g, '/').split('/').pop() || ''
    },
    async openFile(f) {
      const r = await openPath(f.path)
      if (!r.ok) {
        this.$message.error('打开失败：' + (r.error && (r.error.message || r.error.code)))
        return
      }
      this.activePath = f.path
      this.$bus.$emit('workspace-file-opened', f.path)
    },
    isDirtyTab(path) {
      const { workbooks } = getWorkbookList()
      const hit = workbooks.find(w => w.filePath === path)
      return !!(hit && hit.dirty)
    },
    syncActive() {
      const { workbooks, activeId } = getWorkbookList()
      const w = workbooks.find(x => x.id === activeId)
      this.activePath = w ? w.filePath : ''
    },
    onCtx(e, f) {
      this.ctxMenu = { x: e.clientX, y: e.clientY, f }
    },
    revealFile() {
      const f = this.ctxMenu && this.ctxMenu.f
      if (f) getServices().workspaceService.reveal(f.path)
    },
    copyPath() {
      const f = this.ctxMenu && this.ctxMenu.f
      if (!f) return
      try {
        navigator.clipboard.writeText(f.path)
        this.$message.success('已复制路径')
      } catch (e) {
        this.$message.info(f.path)
      }
    },
    async newMdNear() {
      const f = this.ctxMenu && this.ctxMenu.f
      if (!f) return
      const dir = String(f.path).replace(/\\/g, '/').replace(/\/[^/]*$/, '')
      const abs = dir + '/新建文档.md'
      const r = await createMdFile(abs, '# 新建文档\n\n')
      if (!r.ok) {
        this.$message.error('新建失败：' + (r.error && (r.error.message || r.error.code)))
        return
      }
      await this.refresh()
      await this.openFile({ path: abs, name: '新建文档.md' })
    }
  }
}
</script>

<style lang="less" scoped>
.workspacePanel {
  position: relative;
  display: flex;
  flex-direction: column;
  // 宽度真源是 --ws-panel-w（syncPanelVars 发布），拖拽右缘实时改
  width: var(--ws-panel-w, 240px);
  height: 100%;
  border-right: 1px solid var(--macos-border);
  // 与右侧 Sidebar 等工具栏同款观感：强玻璃拟态 + 外侧大圆角 + 展开投影
  background-color: var(--macos-bg-glass-strong);
  backdrop-filter: var(--macos-blur-strong);
  -webkit-backdrop-filter: var(--macos-blur-strong);
  border-top-right-radius: var(--macos-radius-xl);
  border-bottom-right-radius: var(--macos-radius-xl);
  box-shadow: 16px 0 44px rgba(0, 0, 0, 0.16);
  color: var(--macos-text);
  font-size: 13px;
  transition: width 0.2s ease;

  &.resizing {
    transition: none; // 拖拽中禁用过渡，避免拖影
  }

  // 右缘拖拽手柄（6px 热区，半嵌在面板边界上）
  .wsResizeHandle {
    position: absolute;
    top: 0;
    bottom: 0;
    right: -3px;
    width: 6px;
    cursor: col-resize;
    z-index: 3100;
    &:hover {
      background: rgba(64, 158, 255, 0.35);
    }
  }

  &.collapsed {
    width: 0;
    border-right: none;
    // 收起（宽 0）时必须去阴影，否则 44px 投影会从左缘渗到画布上
    //（与 Sidebar 隐藏态 right:-320px 阴影泄漏同款根因）
    box-shadow: none;
    overflow: visible;
    .wsHeader,
    .wsSearch,
    .wsBody,
    .wsEmpty {
      display: none;
    }
  }

  // 左侧蓝色竖条（与右侧 SidebarTrigger 的 toggleShowBtn 同款尺寸）：
  // 35px 宽 / 60px 高 / #409eff / 圆角 10px，白色小箭头指示方向。
  // ⚠️ 样式必须写在文件末尾的「非 scoped」样式块里：wsPill 通过 <Teleport to="body">
  //    挂到 body，祖先不再是 .workspacePanel，而 scoped 会编译成
  //    `.workspacePanel .wsPill[data-v-x]`（后代关系）→ 整条失配 → 蓝条完全无样式
  //    （2026-09-21 用户反馈「加一个蓝色的块，隐藏文件树栏」即此根因）。
  .wsHeader {
    height: 34px;
    flex: none;
    display: flex;
    align-items: center;
    padding: 0 6px 0 10px;
    background: var(--macos-bg-glass-strong);

    .wsTitle {
      flex: 1;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-weight: 600;
    }
    .wsActions {
      display: flex;
      gap: 2px;
    }
    .wsBtn {
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      &:hover {
        background-color: var(--macos-hover-strong);
      }
    }
  }

  .wsSearch {
    flex: none;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    .wsInput {
      height: 26px;
      padding: 0 8px;
      font-size: 12px;
      border: 1px solid var(--macos-border);
      border-radius: 4px;
      background: var(--macos-bg-glass-strong);
      color: var(--macos-text);
      outline: none;
      &:focus {
        border-color: var(--macos-accent);
      }
    }
  }

  .wsNotice {
    flex: none;
    margin: 0 6px 6px;
    padding: 4px 6px;
    font-size: 12px;
    border-radius: 4px;
    cursor: pointer;
    background: var(--mm-warn-bg, #fef3c7);
    color: var(--mm-warn-text, #92400e);
    &.ok {
      background: var(--mm-diff-add-bg, #dcfce7);
      color: var(--mm-diff-add-text, #166534);
      cursor: default;
    }
  }

  .wsEmpty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 16px;
    text-align: center;
    .wsEmptyTitle {
      font-weight: 600;
    }
    .wsEmptyTip {
      font-size: 12px;
      color: var(--macos-text-2);
    }
    .wsBigBtn {
      margin-top: 4px;
      padding: 6px 14px;
      border-radius: 6px;
      border: 1px solid var(--macos-border);
      background: var(--macos-accent);
      color: #fff;
      cursor: pointer;
    }
  }

  .wsBody {
    flex: 1;
    overflow: auto;
    padding-bottom: 8px;

    .wsGroupTitle {
      padding: 4px 8px;
      font-size: 12px;
      color: var(--macos-text-2);
      display: flex;
      justify-content: space-between;
      .wsLink {
        cursor: pointer;
        color: var(--macos-accent);
      }
    }
    .wsGroupSub {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 5px 8px;
      margin: 4px 6px 2px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      user-select: none;
      // 两个分区高对比配色：导图=紫、文档=蓝
      &.smm {
        color: #7c3aed;
        background: rgba(124, 58, 237, 0.12);
        &:hover { background: rgba(124, 58, 237, 0.2); }
      }
      &.md {
        color: #0969da;
        background: rgba(9, 105, 218, 0.10);
        &:hover { background: rgba(9, 105, 218, 0.18); }
      }
    }
    .wsHit {
      padding: 6px 10px;
      cursor: pointer;
      // 不同文件之间用横线分隔
      & + .wsHit {
        border-top: 1px solid var(--macos-divider);
      }
      &:hover {
        background-color: var(--macos-hover);
      }
      .wsHitFile {
        font-size: 12px;
        font-weight: 600;
        color: var(--macos-accent);
        line-height: 1.7;
        letter-spacing: 0.3px;
      }
      .wsHitLine {
        font-size: 11px;
        color: var(--macos-text-2);
        line-height: 1.8;
        letter-spacing: 0.3px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }
    // 导图分组内的单条命中（点击区域在条目上，而非整个文件块）
    .wsSmmItem {
      padding: 2px 8px 2px 14px;
      cursor: pointer;
      border-radius: 4px;
      &:hover {
        background-color: var(--macos-hover);
      }
    }
    .wsFile {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 26px;
      // macOS 风格条目：左右留白 + 圆角 hover/选中（与其他工具栏列表项一致）
      margin: 0 6px;
      padding-right: 6px;
      border-radius: 6px;
      cursor: pointer;
      overflow: hidden;
      &:hover {
        background-color: var(--macos-hover);
      }
      &.active {
        background-color: var(--macos-hover-strong);
      }
      .wsCaret {
        flex: none;
        width: 12px;
        font-size: 10px;
        color: var(--macos-text-secondary, #999);
        text-align: center;
        user-select: none;
      }
      .wsIcon {
        flex: none;
        font-size: 12px;
      }
      .wsName {
        flex: 1;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .wsDot {
        flex: none;
        color: var(--macos-warning, #e6a23c);
        font-size: 10px;
      }
    }
    .wsEmptyTip {
      padding: 8px;
      font-size: 12px;
      color: var(--macos-text-2);
    }
  }

  .wsCtxMenu {
    position: fixed;
    z-index: 3000;
    margin: 0;
    padding: 4px 0;
    list-style: none;
    min-width: 160px;
    border: 1px solid var(--macos-border);
    border-radius: 6px;
    background: var(--macos-bg-glass-strong);
    backdrop-filter: var(--macos-blur-strong);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    li {
      padding: 5px 12px;
      cursor: pointer;
      font-size: 12px;
      &:hover {
        background-color: var(--macos-hover-strong);
      }
    }
  }
}
</style>

<style lang="less">
// ⚠️ 非 scoped（全局）样式块：承载文件栏折叠蓝块 .wsPill。
// 它通过 <Teleport to="body"> 渲染在 body 下（为了不被 position:fixed 铺满窗口的
// 画布 .editContainer 盖住），祖先不再是 .workspacePanel —— 若写在 scoped 块里，
// Vue 会编译成后代选择器 `.workspacePanel .wsPill[data-v-x]`，与 Teleport 后的
// DOM 结构不匹配，规则整条失效 → 蓝块无宽高无背景，用户看不到任何隐藏入口
// （2026-09-21「加一个蓝色的块，隐藏文件树栏」的真根因）。
// ⚠️ 尺寸口径 = 右侧「实际可见」的蓝缝，不是右侧的 CSS 尺寸：
// 右侧 SidebarTrigger 的 .toggleShowBtn 虽是 35×60 的方块，但它与白色侧栏卡片
// 同为 z-index:0 且 DOM 在其前 → 被卡片盖住，常态只露出 6px 宽的缝，悬停才滑出 18px。
// 左侧 .wsPill 是 z-index:3000 的独立元素、无遮挡，若照抄 35×60 会整块露出来，
// 观感比右侧大得多（2026-09-21 用户反馈「太大了，和右边工具栏的一样就行」）。
// 故这里直接按可见尺寸复刻：常态 6px 细缝、悬停滑出到 18px。
.wsPill {
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  width: 6px; // 常态 = 右侧可见蓝缝宽度
  height: 60px;
  background: #409eff;
  cursor: pointer;
  z-index: 3000; // 必须高于 fixed 铺满的画布
  display: flex;
  align-items: center;
  justify-content: center;
  border-top-right-radius: 10px;
  border-bottom-right-radius: 10px;
  user-select: none;
  transition: width 0.12s ease, background 0.12s ease;

  // 展开态：蓝缝紧贴文件栏右缘（偏移真源 --ws-panel-offset，随拖拽/折叠同步）
  left: var(--ws-panel-offset, 240px);

  &:hover {
    width: 18px; // 悬停滑出（与右侧 hover 时露出的宽度一致）
    background: #66b1ff;
  }

  .wsPillIcon {
    color: #fff;
    font-size: 12px;
    opacity: 0; // 6px 细缝放不下 12px 图标，滑出后再显示
    transform: rotateZ(180deg); // 箭头朝左 = 点击收起文件栏
    transition: opacity 0.1s, transform 0.1s;
  }

  &:hover .wsPillIcon {
    opacity: 1;
  }

  // 收起态：文件栏宽 0，蓝缝贴屏幕左缘，箭头朝右 = 点击展开
  &.collapsed {
    left: 0;
    .wsPillIcon {
      transform: rotateZ(0deg);
    }
  }
}
</style>
