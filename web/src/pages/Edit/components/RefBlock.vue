<template>
  <div class="refBlock" :class="['status-' + status]">
    <!-- 黄色警告条（§8.3，G2/F4） -->
    <div class="rbWarn">⚠️ 下方引用块为「章节引用」，编辑它 = 直接修改 md 源文件</div>

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
    </div>

    <!-- 反链浮层（§7.14 H2） -->
    <div v-if="showPopover" class="rbPopover">
      <div v-if="!backlinkList.length" class="rbPopEmpty">尚无其他引用</div>
      <div v-for="b in backlinkList" :key="b.nodeId" class="rbPopItem" @click="jumpBacklink(b)">
        <span class="rbPopPath">{{ b.source || b.file }}</span>
        <span class="rbPopText">{{ b.text || '(无文字)' }}</span>
      </div>
    </div>

    <div class="rbTools">
      <span class="rbBtn" @click="openFile">↗ 打开源文件</span>
      <span class="rbBtn" @click="toggleEdit">{{ editing ? '完成' : '✏️ 编辑' }}</span>
      <span class="rbBtn" @click="refresh">🔄 刷新</span>
      <span class="rbBtn danger" @click="unref">🔗 解除引用</span>
      <span v-if="nodeLink" class="rbBtn" @click="jumpLink">↗ 跳转到 link</span>
      <span v-if="status === 'missing'" class="rbBtn" @click="reselect">重新选择章节</span>
      <span v-if="status === 'missing'" class="rbBtn" @click="toNote">转为备注内容</span>
    </div>

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
      <pre v-else class="rbContent">{{ displayContent }}</pre>
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
.refBlock {
  border: 1px solid var(--mm-ref-border, #7c3aed);
  border-radius: 8px;
  background: var(--mm-ref-bg, #f3f0ff);
  color: var(--mm-ref-text, #4c1d95);
  padding: 8px;
  margin-bottom: 10px;
  position: relative;

  &.status-missing,
  &.status-file-missing,
  &.status-ambiguous {
    border-left: 4px solid var(--macos-danger, #f56c6c);
  }

  .rbWarn {
    font-size: 12px;
    padding: 4px 6px;
    margin-bottom: 6px;
    border-radius: 4px;
    background: var(--mm-warn-bg, #fef3c7);
    color: var(--mm-warn-text, #92400e);
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
    }
    .rbBadge {
      padding: 1px 6px;
      border-radius: 8px;
      background: rgba(124, 58, 237, 0.12);
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

  .rbTools {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 6px 0;
    .rbBtn {
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 4px;
      cursor: pointer;
      border: 1px solid rgba(124, 58, 237, 0.3);
      &:hover {
        background: rgba(124, 58, 237, 0.12);
      }
      &.danger {
        border-color: rgba(245, 108, 108, 0.5);
        color: var(--macos-danger, #f56c6c);
      }
    }
  }

  .rbImpact {
    font-size: 12px;
    padding: 4px 6px;
    margin-bottom: 6px;
    border-radius: 4px;
    background: var(--mm-warn-bg, #fef3c7);
    color: var(--mm-warn-text, #92400e);
  }

  .rbBody {
    .rbTextarea {
      width: 100%;
      min-height: 120px;
      font-size: 12px;
      line-height: 1.6;
      padding: 6px;
      border-radius: 4px;
      border: 1px solid var(--mm-ref-border, #7c3aed);
      background: #fff;
      color: #222;
      outline: none;
      resize: vertical;
    }
    .rbContent {
      margin: 0;
      max-height: 200px;
      overflow: auto;
      white-space: pre-wrap;
      font-size: 12px;
      line-height: 1.6;
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
    color: var(--mm-ref-text, #4c1d95);
  }
}

body.isDark .refBlock {
  .rbBody .rbTextarea {
    background: #1a1a1a;
    color: #eee;
  }
}
</style>
