<template>
  <div class="refBlock" :class="['status-' + status]">
    <div class="rbHead">
      <span class="rbTitle">
        🔗 引用自 {{ refObj.file }}
        <template v-if="pathLabel"> · {{ pathLabel }}</template>
      </span>
      <span class="rbBadge" :class="status">{{ statusLabel }}</span>
      <span
        class="rbCount"
        v-if="backlinks > 1"
        title="点击展开反链浮层"
        @click="showPopover = !showPopover"
        >被 {{ backlinks }} 处引用</span
      >
      <!-- v1.6：头部 ✏️ 直达编辑（只读渲染，点此进入编辑态） -->
      <span class="rbEditBtn" :class="{ on: editing }" @click="toggleEdit">{{
        editing ? '✓ 完成' : '✏️'
      }}</span>
    </div>

    <!-- 反链浮层（§7.14 H2） -->
    <div v-if="showPopover" class="rbPopover">
      <div v-if="!backlinkList.length" class="rbPopEmpty">尚无其他引用</div>
      <div v-for="b in backlinkList" :key="b.nodeId" class="rbPopItem" @click="jumpBacklink(b)">
        <span class="rbPopPath">{{ b.source || b.file }}</span>
        <span class="rbPopText">{{ b.text || '(无文字)' }}</span>
      </div>
    </div>

    <!-- 编辑态才显示警示（只读浏览时不占视觉） -->
    <div v-if="editing" class="rbWarn">⚠️ 下方引用块为「章节引用」，编辑它 = 直接修改 md 源文件</div>

    <!-- 连带影响提示：首次进入编辑态且被多处引用（§7.14 F4） -->
    <div v-if="editing && backlinks > 1 && !impactShown" class="rbImpact">
      ⚠️ 此章节被 {{ backlinks }} 处引用，你的修改将同步到全部
    </div>

    <div class="rbBody">
      <textarea
        v-if="editing"
        v-model="draft"
        class="rbTextarea"
        @blur="commit"
        @input="scheduleCommit"
      ></textarea>
      <template v-else>
        <!-- 默认折叠为 3 行预览，避免引用块在视觉上像"第二个输入框" -->
        <pre class="rbContent" :class="{ rbCollapsed: !expanded }">{{ displayContent }}</pre>
        <span class="rbExpand" @click="expanded = !expanded">
          {{ expanded ? '▴ 收起' : '▾ 展开全部' }}
        </span>
      </template>
    </div>

    <!-- 底部轻量操作行（文字链接） -->
    <div class="rbTools">
      <span class="rbBtn" @click="openFile">↗ 打开源文件</span>
      <span class="rbBtn" @click="refresh">🔄 刷新</span>
      <span class="rbBtn danger" @click="unref">🔗 解除引用</span>
      <span v-if="nodeLink" class="rbBtn" @click="jumpLink">↗ 跳转到 link</span>
      <span v-if="status === 'missing'" class="rbBtn" @click="reselect">重新选择章节</span>
      <span v-if="status === 'missing'" class="rbBtn" @click="toNote">转为备注内容</span>
    </div>

    <div class="rbFoot" v-if="editing">
      <span class="rbState">{{ committing ? '提交中…' : '未提交' }}</span>
    </div>
    <div v-if="rebound" class="rbRebound">章节引用已自动重绑到新位置</div>
  </div>
</template>

<script>
import {
  commitEdit,
  findBacklinks,
  checkValidity,
  refreshRef,
  removeRef,
  openPath,
  navigate
} from '@/utils/workspaceBridge'

const STATUS_LABEL = {
  ok: '已同步',
  stale: '别处已改',
  missing: '引用失效',
  'file-missing': '引用失效',
  ambiguous: '引用失效',
  loading: '加载中…'
}

export default {
  name: 'RefBlock',
  props: {
    refObj: { type: Object, required: true },
    node: { type: Object, default: null },
    nodeLink: { type: String, default: '' }
  },
  emits: ['conflict', 'unref', 'reselect'],
  data() {
    return {
      status: 'loading',
      editing: false,
      expanded: false,
      draft: '',
      content: '',
      committing: false,
      backlinks: 0,
      backlinkList: [],
      showPopover: false,
      impactShown: false,
      rebound: false,
      _timer: null
    }
  },
  computed: {
    pathLabel() {
      const p = this.refObj && this.refObj.sectionPath
      return Array.isArray(p) && p.length ? p.join(' / ') : ''
    },
    statusLabel() {
      return STATUS_LABEL[this.status] || this.status
    },
    displayContent() {
      return this.content || (this.refObj && this.refObj.cachedContent) || '（章节内容为空）'
    }
  },
  async created() {
    await this.check()
    await this.loadBacklinks()
  },
  beforeUnmount() {
    if (this._timer) clearTimeout(this._timer)
  },
  methods: {
    async check() {
      const r = await checkValidity(this.refObj.file, [this.refObj])
      if (!r.ok) {
        this.status = 'missing'
        return
      }
      const hit = (r.data.results || [])[0]
      this.status = hit ? hit.status : 'missing'
      if (hit && hit.current) this.content = hit.current.content || ''
      else this.content = this.refObj.cachedContent || ''
    },
    async loadBacklinks() {
      const r = await findBacklinks(this.refObj.file, this.refObj.sectionId)
      if (!r.ok) return
      const list = r.data.backlinks || r.data || []
      this.backlinkList = Array.isArray(list) ? list : []
      this.backlinks = this.backlinkList.length
    },
    toggleEdit() {
      if (this.editing) {
        this.commit()
        return
      }
      this.draft = this.content || this.refObj.cachedContent || ''
      this.editing = true
      this.impactShown = false
    },
    scheduleCommit() {
      if (this._timer) clearTimeout(this._timer)
      this._timer = setTimeout(() => this.commit(), 500)
    },
    async commit() {
      if (!this.editing || this.committing) return
      if (this._timer) {
        clearTimeout(this._timer)
        this._timer = null
      }
      if (this.draft === this.content) {
        this.editing = false
        return
      }
      this.committing = true
      const refCtx = {
        file: this.refObj.file,
        sectionId: this.refObj.sectionId,
        sectionPath: this.refObj.sectionPath || [],
        baseHash: this.refObj.baseHash,
        baseRev: this.refObj.baseRev,
        refId: this.refObj.refId,
        node: this.node,
        title: this.refObj.title
      }
      const res = await commitEdit(refCtx, this.draft)
      this.committing = false
      if (res.ok) {
        this.content = this.draft
        this.editing = false
        this.rebound = !!(res.data && res.data.rebound)
        this.status = 'ok'
        await this.loadBacklinks()
        return
      }
      const code = res.error && res.error.code ? String(res.error.code) : ''
      if (code.startsWith('E_CONFLICT_')) {
        // 【A8】冲突由返回值判定，不走事件；commitEdit 内部不 emit 冲突
        this.$emit('conflict', {
          ref: this.refObj,
          refCtx,
          newContent: this.draft,
          kind: res.error.kind,
          current: res.error.current,
          impact: this.backlinks
        })
        return
      }
      this.$message.error('提交失败：' + ((res.error && (res.error.message || res.error.code)) || '未知错误'))
    },
    async refresh() {
      const r = await refreshRef(this.refObj)
      if (r.ok) await this.check()
    },
    openFile() {
      openPath(this.refObj.file)
    },
    jumpLink() {
      if (this.nodeLink) navigate(this.nodeLink, this.refObj.file)
    },
    jumpBacklink(b) {
      if (b.source) openPath(b.source)
    },
    unref() {
      this.$emit('unref', this.refObj.refId)
    },
    reselect() {
      this.$emit('reselect', this.refObj)
    },
    /** 转为备注内容（§7.14 I2）：保留原标题、追加而非覆盖、只删这一个 ref */
    async toNote() {
      const oldTitle = (this.refObj.sectionPath || []).slice(-1)[0] || this.refObj.title || '引用章节'
      const cached = this.refObj.cachedContent || this.content || ''
      const merged = [this.node.getData('note') || '', '\n\n---\n\n', '# ' + oldTitle, '\n\n', cached].join('\n')
      const okd = await this.$confirm(
        '将追加 ' + merged.length + ' 字符到备注并删除此引用，不可撤销。是否继续？',
        '转为备注内容',
        { type: 'warning' }
      ).catch(() => false)
      if (!okd) return
      this.node.setData({ note: merged })
      removeRef(this.node, this.refObj.refId)
      this.$emit('unref', this.refObj.refId)
    }
  }
}
</script>

<style lang="less" scoped>
// v1.6 视觉弱化（§v1.6 2.4）：去掉四边边框（"像输入框"的主因），
// 改为左侧 4px 紫色竖线 + 浅紫背景，读作「引用」而非「第二个输入框」。
// 2026-09-21：卡片改纵向 flex —— 弹窗高度翻倍后卡片撑满引用区，
// 操作行贴卡片底部（不再浮在中间）。
.refBlock {
  display: flex;
  flex-direction: column;
  border: none;
  border-left: 4px solid rgba(124, 58, 237, 0.55);
  border-radius: 6px;
  background: rgba(124, 58, 237, 0.06);
  color: var(--macos-text);
  padding: 8px 10px;
  margin: 0;
  position: relative;

  // 失效引用：左竖线变红警示
  &.status-missing,
  &.status-file-missing,
  &.status-ambiguous {
    border-left-color: var(--macos-danger, #f56c6c);
    background: rgba(245, 108, 108, 0.07);
  }

  .rbWarn {
    font-size: 11px;
    color: var(--macos-text-2);
    margin-bottom: 4px;
    background: transparent;
    padding: 0;
  }

  .rbHead {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    .rbTitle {
      flex: 1;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      color: var(--macos-accent);
      font-weight: 600;
    }
    .rbBadge {
      padding: 1px 6px;
      border-radius: 8px;
      font-size: 11px;
      background: rgba(124, 58, 237, 0.1);
      &.stale,
      &.missing,
      &.file-missing,
      &.ambiguous {
        background: rgba(245, 108, 108, 0.16);
        color: var(--macos-danger, #f56c6c);
      }
    }
    .rbCount {
      cursor: pointer;
      text-decoration: underline dotted;
      font-size: 11px;
      color: var(--macos-text-2);
    }
    // v1.6：头部 ✏️ 编辑按钮（圆形热点，编辑态高亮）
    .rbEditBtn {
      cursor: pointer;
      font-size: 13px;
      line-height: 1;
      padding: 3px 6px;
      border-radius: 5px;
      color: var(--macos-text-2);
      user-select: none;
      &:hover {
        background: rgba(124, 58, 237, 0.12);
        color: var(--macos-accent);
      }
      &.on {
        background: rgba(124, 58, 237, 0.16);
        color: var(--macos-accent);
      }
    }
  }

  .rbPopover {
    position: absolute;
    right: 8px;
    top: 56px;
    z-index: 20;
    width: 260px;
    max-height: 200px;
    overflow: auto;
    padding: 6px;
    border: 1px solid var(--macos-border);
    border-radius: 6px;
    background: var(--macos-bg-glass-strong);
    backdrop-filter: var(--macos-blur-strong);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    .rbPopItem {
      padding: 4px 6px;
      cursor: pointer;
      border-radius: 4px;
      &:hover {
        background: var(--macos-hover-strong);
      }
    }
    .rbPopPath {
      display: block;
      font-size: 11px;
      color: var(--macos-text-2);
    }
    .rbPopText {
      font-size: 12px;
    }
    .rbPopEmpty {
      padding: 6px;
      font-size: 12px;
      color: var(--macos-text-2);
    }
  }

  // 工具栏改为无边框的轻量文字链接，与编辑区观感一致（不再像独立按钮组）
  // margin: auto 0 0 —— 卡片撑高后操作行贴底，内容少时不悬在中间
  .rbTools {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: auto 0 0;
    .rbBtn {
      font-size: 11px;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--macos-accent);
      cursor: pointer;
      &:hover {
        text-decoration: underline;
      }
      &.danger {
        color: var(--macos-danger, #f56c6c);
      }
    }
  }

  .rbImpact {
    font-size: 11px;
    margin-bottom: 4px;
    color: var(--macos-text-2);
    background: transparent;
    padding: 0;
  }

  .rbBody {
    .rbTextarea {
      width: 100%;
      min-height: 80px;
      font-size: 12px;
      line-height: 1.6;
      padding: 6px;
      border-radius: 4px;
      border: 1px solid var(--macos-border);
      background: #fff;
      color: #222;
      outline: none;
      resize: vertical;
    }
    // 内容读起来像「引用备注」（左侧细线 + 弱化色），不像输入框
    // 2026-09-21 弹窗高度翻倍：预览可视行数同步放大（折叠 62px≈3 行 → 150px≈7 行；
    // 展开上限 200px → 320px）
    .rbContent {
      margin: 0;
      padding-left: 8px;
      border-left: 2px solid var(--macos-divider, #e4e7ed);
      color: var(--macos-text-2);
      max-height: 320px;
      overflow: auto;
      white-space: pre-wrap;
      font-size: 12px;
      line-height: 1.6;
      &.rbCollapsed {
        max-height: 150px; // 约 7 行预览
        overflow: hidden;
        // 底部渐隐，暗示可展开
        -webkit-mask-image: linear-gradient(to bottom, #000 55%, transparent 100%);
        mask-image: linear-gradient(to bottom, #000 55%, transparent 100%);
      }
    }
    .rbExpand {
      display: inline-block;
      margin-top: 2px;
      font-size: 11px;
      cursor: pointer;
      color: var(--macos-accent);
      user-select: none;
      &:hover {
        text-decoration: underline;
      }
    }
  }
  .rbFoot {
    margin-top: 4px;
    font-size: 11px;
    color: var(--macos-text-2);
  }
  .rbRebound {
    margin-top: 4px;
    font-size: 11px;
    color: var(--macos-text-2);
  }
}

body.isDark .refBlock {
  .rbBody .rbTextarea {
    background: #1a1a1a;
    color: #eee;
  }
}
</style>
