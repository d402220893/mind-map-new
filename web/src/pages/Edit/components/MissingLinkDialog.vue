<template>
  <!-- F22 失效链接（§10-#/边界矩阵）：点击指向不存在文件的链接时，不能"点了没反应"。
       给两条真实出路：① 就地新建该文件并打开；② 显式告知并复制路径，让用户自己找。 -->
  <el-dialog
    v-model="visible"
    title="链接指向的文件不存在"
    width="480px"
    :close-on-click-modal="false"
    append-to-body
  >
    <div class="mlRow"><span class="mlLabel">链接</span><code class="mlVal">{{ href || '(空)' }}</code></div>
    <div class="mlRow"><span class="mlLabel">路径</span><code class="mlVal">{{ abs || '(无法解析)' }}</code></div>
    <div class="mlRow" v-if="fromPath"><span class="mlLabel">来自</span><code class="mlVal">{{ fromPath }}</code></div>

    <div class="mlHint">
      <template v-if="canCreate && !outsideRoot">
        可以在该位置新建一个 Markdown 文件并立即打开。
      </template>
      <template v-else-if="outsideRoot">
        该链接指向工作区之外，为避免误建文件，请手动确认路径。
      </template>
      <template v-else>
        当前环境无法写入该路径（需要工作区或绝对路径）。
      </template>
    </div>

    <template #footer>
      <span class="mlFooter">
        <el-button size="small" @click="copyPath">复制路径</el-button>
        <el-button size="small" @click="visible = false">关闭</el-button>
        <el-button
          type="primary"
          size="small"
          :disabled="!canCreate || outsideRoot"
          :loading="creating"
          @click="createAndOpen"
        >
          新建并打开
        </el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script>
import { getServices, openPath } from '@/utils/workspaceBridge'

export default {
  name: 'MissingLinkDialog',
  data() {
    return {
      visible: false,
      href: '',
      fromPath: '',
      abs: '',
      outsideRoot: false,
      creating: false
    }
  },
  computed: {
    // 只有"看起来是文件"的绝对路径才允许新建：目录/无扩展/越界一律不给按钮
    canCreate() {
      const p = String(this.abs || '')
      if (!p) return false
      if (!/^[A-Za-z]:[\\/]/.test(p) && !p.startsWith('/')) return false
      const base = p.replace(/\\/g, '/').split('/').pop() || ''
      return base.includes('.')
    }
  },
  created() {
    this.$bus.$on('link-missing', this.onMissing)
  },
  beforeUnmount() {
    this.$bus.$off('link-missing', this.onMissing)
  },
  methods: {
    onMissing(payload) {
      if (!payload) return
      this.href = payload.href || ''
      this.fromPath = payload.fromPath || ''
      this.abs = payload.abs || ''
      this.outsideRoot = !!payload.outsideRoot
      this.visible = true
    },
    copyPath() {
      const text = this.abs || this.href
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text)
          this.$message.success('已复制')
          return
        }
      } catch (e) {
        /* 降级到提示 */
      }
      this.$message.info(text)
    },
    async createAndOpen() {
      const svc = getServices()
      if (!svc) {
        this.$message.error('服务未就绪')
        return
      }
      const name = String(this.abs).replace(/\\/g, '/').split('/').pop() || '新建'
      const title = name.replace(/\.(md|markdown)$/i, '')
      this.creating = true
      try {
        const w = await svc.workspaceService.writeText(this.abs, '# ' + title + '\n\n')
        if (!w.ok) {
          this.$message.error('新建失败：' + ((w.error && (w.error.message || w.error.code)) || '未知错误'))
          return
        }
        this.visible = false
        await openPath(this.abs)
      } finally {
        this.creating = false
      }
    }
  }
}
</script>

<style lang="less" scoped>
.mlRow {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 6px;
  font-size: 13px;
}
.mlLabel {
  flex: 0 0 40px;
  color: var(--macos-text-2, #6b7280);
}
.mlVal {
  flex: 1;
  min-width: 0;
  word-break: break-all;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
}
.mlHint {
  margin-top: 12px;
  font-size: 12px;
  color: var(--macos-text-2, #6b7280);
  line-height: 1.6;
}
.mlFooter {
  display: inline-flex;
  gap: 8px;
}
</style>
