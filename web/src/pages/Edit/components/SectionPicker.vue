<template>
  <el-dialog
    class="sectionPickerDialog"
    title="选择要引用的章节"
    v-model="visible"
    width="720px"
    :close-on-click-modal="false"
    append-to-body
  >
    <div class="spBar">
      <select v-model="file" class="spSelect" @change="onFileChange">
        <option v-for="f in mdFiles" :key="f" :value="f">{{ f }}</option>
      </select>
      <input v-model="filter" class="spInput" placeholder="过滤标题…" />
      <el-button size="small" @click="newFile">+ 新建 md 文件</el-button>
    </div>

    <div class="spBody">
      <div class="spTree customScrollbar">
        <div
          v-for="s in filtered"
          :key="s.id"
          class="spItem"
          :class="{ active: s.id === pickedId }"
          :style="{ paddingLeft: 6 + (s.level - 1) * 14 + 'px' }"
          @click="pickedId = s.id"
          @dblclick="confirm"
        >
          {{ s.title }}
        </div>
        <div class="spWhole" :class="{ active: pickedId === null }" @click="pickedId = null">
          整文件（不按章节）
        </div>
        <div v-if="!filtered.length && filter" class="spNoHit">
          未找到「{{ filter }}」。
          <el-button size="small" type="primary" @click="createSection"
            >+ 在 {{ file }} 中新建章节「{{ filter }}」</el-button
          >
        </div>
        <div v-if="!sections.length" class="spNoHit">该文件暂无标题</div>
      </div>
      <div class="spPreview customScrollbar">
        <div class="spPreviewTitle">{{ previewTitle }}</div>
        <pre class="spPreviewBody">{{ previewBody }}</pre>
      </div>
    </div>

    <div class="spModes">
      <span class="spModeLabel">引用模式：</span>
      <label><input type="radio" value="link" v-model="mode" /> 仅跳转（写 node.link）</label>
      <label><input type="radio" value="ref" v-model="mode" /> 引用内容（写 _mindlink.refs）</label>
      <label><input type="radio" value="both" v-model="mode" /> 两者都写</label>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" @click="confirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<script>
import { getServices, listSections, createMdFile } from '@/utils/workspaceBridge'

export default {
  name: 'SectionPicker',
  props: {
    modelValue: { type: Boolean, default: false },
    // 失效预选：重新选择章节时传入旧 sectionPath（§7.13 F2）
    preferPath: { type: Array, default: null },
    currentFile: { type: String, default: '' }
  },
  data() {
    return {
      visible: this.modelValue,
      file: '',
      mdFiles: [],
      sections: [],
      filter: '',
      pickedId: null,
      mode: 'ref',
      loading: false,
      wholeText: '',
      fileHash: null
    }
  },
  computed: {
    filtered() {
      const kw = this.filter.trim().toLowerCase()
      if (!kw) return this.sections
      return this.sections.filter(s => String(s.title || '').toLowerCase().includes(kw))
    },
    picked() {
      if (this.pickedId === null) return null
      return this.sections.find(s => s.id === this.pickedId) || null
    },
    previewTitle() {
      return this.picked ? this.picked.title : this.file || '（整文件）'
    },
    previewBody() {
      const src = this.picked ? this.picked.content : this.wholeText
      return String(src || '').split('\n').slice(0, 10).join('\n')
    }
  },
  watch: {
    modelValue(v) {
      this.visible = v
      if (v) this.init()
    },
    visible(v) {
      this.$emit('update:modelValue', v)
    }
  },
  methods: {
    async init() {
      this.loading = true
      const svc = getServices()
      const tree = svc.workspaceService.files() || []
      const out = []
      const walk = nodes => {
        for (const n of nodes || []) {
          if (n.isDir) walk(n.children)
          else if (/\.(md|markdown)$/i.test(n.name || '')) {
            const root = svc.workspaceService.getRoot() || ''
            const p = String(n.path || '').replace(/\\/g, '/')
            out.push(root ? p.slice(String(root).replace(/\\/g, '/').length + 1) : p)
          }
        }
      }
      walk(tree)
      this.mdFiles = out
      this.file = this.currentFile && out.includes(this.currentFile) ? this.currentFile : out[0] || ''
      await this.loadSections()
      this.loading = false
    },
    async loadSections() {
      this.sections = []
      this.wholeText = ''
      this.fileHash = null
      if (!this.file) return
      const r = await listSections(this.file)
      if (!r.ok) {
        this.$message.error('读取章节失败：' + (r.error && (r.error.message || r.error.code)))
        return
      }
      this.sections = r.data.sections || []
      // 整文件引用的基准值与预览都来自整文件本身（§7.13 F-边界#4 / v1.5 I4）
      this.wholeText = r.data.mdText || ''
      this.fileHash = r.data.fileHash || null
      this.preselect()
    },
    /** 失效预选：与旧 sectionPath 最接近的候选（§7.13 F2） */
    preselect() {
      if (this.preferPath && this.preferPath.length) {
        const want = (this.preferPath || []).join('/')
        const exact = this.sections.find(s => (s.path || []).join('/') === want)
        if (exact) {
          this.pickedId = exact.id
          return
        }
        const near = this.sections.find(s => (s.path || []).join('/').includes(want))
        if (near) {
          this.pickedId = near.id
          return
        }
      }
      this.pickedId = this.sections.length ? this.sections[0].id : null
    },
    onFileChange() {
      this.loadSections()
    },
    async newFile() {
      const root = getServices().workspaceService.getRoot()
      if (!root) {
        this.$message.warning('请先打开工作区')
        return
      }
      const name = '新建文档-' + Date.now() + '.md'
      const abs = String(root).replace(/\\/g, '/').replace(/\/+$/, '') + '/' + name
      const r = await createMdFile(abs, '# 新建文档\n\n')
      if (!r.ok) {
        this.$message.error('新建失败：' + (r.error && (r.error.message || r.error.code)))
        return
      }
      await this.init()
      this.file = name
      await this.loadSections()
    },
    async createSection() {
      if (!this.file || !this.filter.trim()) return
      const title = this.filter.trim()
      const svc = getServices()
      const read = await svc.workspaceService.readText(svc.workspaceService.abs(this.file))
      const cur = read.ok ? read.data.content : ''
      const next = (cur ? cur.replace(/\s*$/, '') + '\n\n' : '') + '## ' + title + '\n\n'
      const w = await svc.workspaceService.writeText(svc.workspaceService.abs(this.file), next)
      if (!w.ok) {
        this.$message.error('写入失败：' + (w.error && (w.error.message || w.error.code)))
        return
      }
      await this.loadSections()
      const hit = this.sections.find(s => s.title === title)
      if (hit) this.pickedId = hit.id
      this.filter = ''
    },
    confirm() {
      const sec = this.picked
      this.$emit('pick', {
        file: this.file,
        sectionId: sec ? sec.id : null,
        sectionPath: sec ? sec.path : [],
        // 整文件引用没有章节标题：用文件名充当标题（§7.13 I4「标题显示文件名，无章节锚点」）
        title: sec ? sec.title : this.file || '',
        baseHash: sec ? sec.contentHash : this.fileHash,
        content: sec ? sec.content : this.wholeText,
        mode: this.mode
      })
      this.visible = false
    }
  }
}
</script>

<style lang="less" scoped>
.sectionPickerDialog {
  .spBar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    .spSelect,
    .spInput {
      height: 28px;
      padding: 0 6px;
      font-size: 12px;
      border: 1px solid var(--macos-border);
      border-radius: 4px;
      background: transparent;
      color: var(--macos-text);
      outline: none;
    }
    .spSelect {
      max-width: 240px;
    }
    .spInput {
      flex: 1;
    }
  }
  .spBody {
    display: flex;
    gap: 8px;
    height: 320px;
    .spTree {
      flex: 1;
      overflow: auto;
      border: 1px solid var(--macos-border);
      border-radius: 4px;
      padding: 4px 0;
      .spItem,
      .spWhole {
        height: 24px;
        line-height: 24px;
        padding-right: 8px;
        cursor: pointer;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        &:hover {
          background-color: var(--macos-hover);
        }
        &.active {
          background-color: var(--macos-hover-strong);
          color: var(--macos-accent);
        }
      }
      .spWhole {
        margin-top: 4px;
        border-top: 1px dashed var(--macos-divider);
        color: var(--macos-text-2);
      }
    }
    .spPreview {
      flex: 1;
      overflow: auto;
      border: 1px solid var(--macos-border);
      border-radius: 4px;
      padding: 6px 8px;
      font-size: 12px;
      .spPreviewTitle {
        font-weight: 600;
        margin-bottom: 4px;
      }
      .spPreviewBody {
        margin: 0;
        white-space: pre-wrap;
        color: var(--macos-text-2);
      }
    }
    .spNoHit {
      padding: 8px;
      font-size: 12px;
      color: var(--macos-text-2);
    }
  }
  .spModes {
    margin-top: 8px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12px;
    .spModeLabel {
      color: var(--macos-text-2);
    }
  }
}
</style>
