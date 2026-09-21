<template>
  <div class="mindMapPreview" :style="{ height: height }" @click="open">
    <div class="mmpHost" ref="host"></div>
    <div v-if="err" class="mmpErr">无法预览：{{ err }}</div>
    <div class="mmpBar">
      <span class="mmpName">{{ name }}</span>
      <span class="mmpTip">点击在新标签打开</span>
    </div>
  </div>
</template>

<script>
import MindMap from 'simple-mind-map'
import { getServices, decodeSmm } from '@/utils/workspaceBridge'

export default {
  name: 'MindMapPreview',
  props: {
    src: { type: String, required: true },
    sheetId: { type: String, default: null },
    height: { type: String, default: '400px' }
  },
  emits: ['open'],
  data() {
    return {
      mm: null,
      name: '',
      err: ''
    }
  },
  async mounted() {
    this.name = String(this.src || '').replace(/\\/g, '/').split('/').pop() || ''
    const svc = getServices()
    const read = await svc.workspaceService.readText(this.src)
    if (!read.ok) {
      this.err = (read.error && (read.error.message || read.error.code)) || '读取失败'
      return
    }
    // decodeSmm 返回 {sheets, activeId}（不是 Result），且解析失败会**抛** —— 必须 try/catch，
    // 不能写成 `if (!decoded.ok) return`（ok 恒 undefined → 永远提前返回 → 预览永远空白）。
    let container
    try {
      container = decodeSmm(read.data.content)
    } catch (e) {
      this.err = (e && e.code) || '文件已损坏'
      return
    }
    const sheets = (container && container.sheets) || []
    const active = sheets.find(s => s.id === (this.sheetId || container.activeId)) || sheets[0]
    // ⚠️ 用 readonly:true 新建独立实例（不复用主画布实例，避免状态串）
    // 构造兜底：simple-mind-map 在容器宽高为 0 时会 throw（'容器元素el的宽高不能为0'）。
    // 本组件 mounted 里有 await 读文件，期间可能被卸载 / 容器离开文档流 → 尺寸变 0；
    // 这里兜住并落到 err 提示，不再让异常冒到全局「启动时有 N 项异常」横幅。
    try {
      const host = this.$refs.host
      const rect = host && host.getBoundingClientRect()
      if (!rect || rect.width <= 0 || rect.height <= 0) {
        this.err = '预览容器不可见'
        return
      }
      this.mm = new MindMap({
        el: host,
        data: (active && active.data) || { root: { data: { text: '' }, children: [] } },
        readonly: true,
        fit: true,
        enableFreeDrag: false
      })
    } catch (e) {
      this.err = (e && e.message) || '预览初始化失败'
      this.mm = null
    }
  },
  beforeUnmount() {
    if (this.mm) {
      try {
        // simple-mind-map 需先解绑监听再 destroy
        this.mm.removeAllListeners && this.mm.removeAllListeners()
        this.mm.destroy()
      } catch (e) {}
      this.mm = null
    }
  },
  methods: {
    // 只上报，不自己打开：打开动作统一由父级走 fileRouter.open（§7.11）。
    // 组件内再调一次 openPath 会造成"同一次点击开两次 Tab"。
    open() {
      this.$emit('open', this.src)
    }
  }
}
</script>

<style lang="less" scoped>
.mindMapPreview {
  position: relative;
  width: 100%;
  border: 1px solid var(--macos-border);
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  background: var(--macos-bg);
  .mmpHost {
    width: 100%;
    height: 100%;
  }
  .mmpErr {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: var(--macos-danger, #f56c6c);
    background: var(--macos-bg);
  }
  .mmpBar {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: space-between;
    padding: 2px 8px;
    font-size: 11px;
    color: var(--macos-text-2);
    background: rgba(0, 0, 0, 0.04);
  }
}
</style>
