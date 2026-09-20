<template>
  <div class="workspacePanel" :class="{ isDark: isDark, collapsed: collapsed }">
    <div class="wsHeader">
      <span class="wsTitle" :title="root || ''">
        📁 {{ root ? baseOf(root) : '未打开工作区' }}
      </span>
      <span class="wsActions">
        <span class="wsBtn" title="刷新" @click="refresh">🔄</span>
        <span class="wsBtn" title="打开文件夹" @click="openFolder">📂</span>
        <span class="wsBtn" title="在资源管理器中显示" @click="revealRoot">↗</span>
        <span class="wsBtn" title="收起 / 展开" @click="toggleCollapsed">{{
          collapsed ? '»' : '«'
        }}</span>
      </span>
    </div>

    <div class="wsSearch">
      <input
        v-model="filter"
        class="wsInput"
        placeholder="过滤文件名…"
        @input="onFilter"
      />
      <input
        v-model="query"
        class="wsInput"
        placeholder="全文搜索（回车）"
        @keyup.enter="runFullText"
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
      <!-- 搜索结果 -->
      <template v-if="searchResults">
        <div class="wsGroupTitle">
          搜索结果（{{ searchResults.length }}）
          <span class="wsLink" @click="searchResults = null">清除</span>
        </div>
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
        <div v-if="!searchResults.length" class="wsEmptyTip">未找到结果</div>
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

export default {
  name: 'WorkspacePanel',
  data() {
    return {
      root: '',
      tree: [],
      filesCache: [],
      filter: '',
      query: '',
      searchResults: null,
      indexStatus: 'ok',
      busy: false,
      progress: 0,
      collapsed: false,
      ctxMenu: null,
      activePath: '',
      unsubs: [],
      rebuiltTimer: null
    }
  },
  computed: {
    isDark() {
      return this.$store.state.localConfig.isDark
    },
    baseOfRoot() {
      return this.root
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
    this.$bus.$off('index:rebuilding', this.onIndexProgress)
    if (this.rebuiltTimer) clearTimeout(this.rebuiltTimer)
    ;(this.unsubs || []).forEach(fn => {
      try {
        fn()
      } catch (e) {}
    })
  },
  methods: {
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
    },
    async runFullText() {
      const q = this.query.trim()
      if (!q) {
        this.searchResults = null
        return
      }
      const r = await getServices().workspaceSearch.fullText(q, { limit: 200 })
      this.searchResults = r.ok ? r.data.results || r.data : []
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

  &.collapsed {
    width: 48px;
    .wsTitle,
    .wsSearch,
    .wsBody,
    .wsEmpty {
      display: none;
    }
  }

  .wsHeader {
    height: 34px;
    flex: none;
    display: flex;
    align-items: center;
    padding: 0 6px 0 10px;
    border-bottom: 1px solid var(--macos-divider);

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
    gap: 4px;
    .wsInput {
      height: 24px;
      padding: 0 6px;
      font-size: 12px;
      border: 1px solid var(--macos-border);
      border-radius: 4px;
      background: transparent;
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
