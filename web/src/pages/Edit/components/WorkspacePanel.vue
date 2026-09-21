<template>
  <div class="workspacePanel" :class="{ isDark: isDark, collapsed: collapsed }">
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
          搜索结果（导图 {{ (smmResults || []).length }} · 文档 {{ (searchResults || []).length }}）
          <span class="wsLink" @click="clearSearch">清除</span>
        </div>

        <!-- 导图（.smm）节点/备注/引用命中 -->
        <template v-if="smmResults && smmResults.length">
          <div class="wsGroupSub">🧠 导图内容</div>
          <div
            v-for="(hit, i) in smmResults"
            :key="'smm' + i + hit.uid"
            class="wsHit"
            @click="openNodeHit(hit)"
          >
            <div class="wsHitFile">
              {{ hit.fileName }}<template v-if="hit.sheetName"> · {{ hit.sheetName }}</template>
            </div>
            <div class="wsHitLine">{{ hit.path }}</div>
            <div class="wsHitLine">{{ hit.preview }}</div>
          </div>
        </template>

        <!-- md 全文命中 -->
        <template v-if="searchResults && searchResults.length">
          <div class="wsGroupSub">📄 文档全文</div>
          <div
            v-for="hit in searchResults"
            :key="hit.rel + hit.hits[0].line"
            class="wsHit"
            @click="openHit(hit)"
          >
            <div class="wsHitFile">{{ hit.rel }}</div>
            <div
              v-for="(h, i) in hit.hits.slice(0, 3)"
              :key="i"
              class="wsHitLine"
            >L{{ h.line }}：{{ h.text }}</div>
          </div>
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
          <span class="wsIcon">{{ f.isDir ? '📁' : iconOf(f.name) }}</span>
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
      smmResults: null, // 导图内容结果（[{file,fileName,sheetName,uid,path,preview,live}]）
      indexStatus: 'ok',
      busy: false,
      progress: 0,
      collapsed: false,
      ctxMenu: null,
      activePath: '',
      unsubs: [],
      rebuiltTimer: null,
      liveMindMap: null // mindMap 实例（经 mindmap-inited 事件广播；prop 可能为 null）
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
    flatFiles() {
      const kw = this.filter.trim().toLowerCase()
      const out = []
      const walk = (nodes, depth) => {
        for (const n of nodes || []) {
          const name = String(n.name || '')
          const hit = !kw || name.toLowerCase().includes(kw)
          if (hit || n.isDir) {
            out.push({ ...n, depth })
            if (n.isDir) walk(n.children, depth + 1)
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
    },
    // 折叠开关：必须向父级广播，否则 fixed 定位的画布不会让位（Index.vue 用 wsCollapsed 做 offset）
    toggleCollapsed() {
      this.collapsed = !this.collapsed
      this.$emit('collapse', this.collapsed)
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
      this.smmResults = hits
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
      if (f.isDir) return
      this.openFile(f)
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
  width: 240px;
  height: 100%;
  border-right: 1px solid var(--macos-border);
  background-color: var(--macos-bg-glass);
  backdrop-filter: var(--macos-blur);
  -webkit-backdrop-filter: var(--macos-blur);
  color: var(--macos-text);
  font-size: 13px;
  transition: width 0.2s ease;

  &.collapsed {
    width: 0;
    border-right: none;
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
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 600;
      color: var(--macos-text-2);
    }
    .wsHit {
      padding: 4px 8px;
      cursor: pointer;
      &:hover {
        background-color: var(--macos-hover);
      }
      .wsHitFile {
        font-size: 12px;
        color: var(--macos-accent);
      }
      .wsHitLine {
        font-size: 11px;
        color: var(--macos-text-2);
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
    }
    .wsFile {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 24px;
      padding-right: 6px;
      cursor: pointer;
      overflow: hidden;
      &:hover {
        background-color: var(--macos-hover);
      }
      &.active {
        background-color: var(--macos-hover-strong);
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
.wsPill {
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  width: 35px;
  height: 60px;
  background: #409eff;
  cursor: pointer;
  z-index: 3000; // 必须高于 fixed 铺满的画布
  display: flex;
  align-items: center;
  justify-content: center;
  border-top-right-radius: 10px;
  border-bottom-right-radius: 10px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
  user-select: none;
  transition: left 0.2s ease, background 0.15s ease;

  // 展开态：文件栏宽 240px，蓝块紧贴其右缘（不遮挡文件树文字）
  left: 240px;

  &:hover {
    background: #66b1ff;
  }

  .wsPillIcon {
    color: #fff;
    font-size: 12px;
    transform: rotateZ(180deg); // 箭头朝左 = 点击收起文件栏
    transition: transform 0.1s;
  }

  // 收起态：文件栏宽 0，蓝块贴屏幕左缘，箭头朝右 = 点击展开
  &.collapsed {
    left: 0;
    .wsPillIcon {
      transform: rotateZ(0deg);
    }
  }
}
</style>
