<template>
  <el-dialog
    class="conflictDialog"
    :title="'⚠️ 章节「' + title + '」已在别处被修改'"
    v-model="visible"
    width="860px"
    :close-on-click-modal="false"
    append-to-body
  >
    <div class="cdMeta">
      <div>影响范围：覆盖后，此修改将同步到 {{ impact }} 处引用</div>
      <div class="cdTip">
        ℹ️ 覆盖后原内容保存到 <code>.mindlink/history/</code>，可在「引用历史」中恢复
      </div>
    </div>

    <!-- 双栏 diff（§8.4） -->
    <div class="cdDiff">
      <div class="cdCol">
        <div class="cdColTitle">你的修改</div>
        <div class="cdLines customScrollbar">
          <div
            v-for="(l, i) in mineLines"
            :key="'m' + i"
            class="cdLine"
            :class="l.type"
          >{{ l.text || '&nbsp;' }}</div>
        </div>
      </div>
      <div class="cdCol">
        <div class="cdColTitle">当前内容（磁盘）</div>
        <div class="cdLines customScrollbar">
          <div
            v-for="(l, i) in currentLines"
            :key="'c' + i"
            class="cdLine"
            :class="l.type"
          >{{ l.text || '&nbsp;' }}</div>
        </div>
      </div>
    </div>

    <!-- 手动合并（§8.4 H3）：三栏 -->
    <div v-if="merging" class="cdMerge">
      <div class="cdColTitle">合并结果（可编辑）</div>
      <textarea v-model="merged" class="cdMergeArea"></textarea>
    </div>

    <template #footer>
      <div class="cdBtns">
        <div class="cdBtnWrap">
          <el-button type="primary" @click="choose('keep-mine')">保留我的并覆盖</el-button>
          <div class="cdBtnSub">同步到 {{ impact }} 处</div>
        </div>
        <div class="cdBtnWrap">
          <el-button @click="choose('use-latest')">用最新的</el-button>
          <div class="cdBtnSub">丢弃我的修改</div>
        </div>
        <div class="cdBtnWrap">
          <el-button @click="startMerge">{{ merging ? '提交合并结果' : '手动合并' }}</el-button>
          <div class="cdBtnSub">逐行编辑</div>
        </div>
        <div class="cdBtnWrap">
          <el-button @click="choose('cancel')">取消</el-button>
          <div class="cdBtnSub">保留草稿</div>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script>
import { diffLines } from '@/utils/diff.js'

export default {
  name: 'ConflictDialog',
  props: {
    modelValue: { type: Boolean, default: false },
    title: { type: String, default: '' },
    mine: { type: String, default: '' },
    current: { type: String, default: '' },
    impact: { type: Number, default: 1 }
  },
  emits: ['update:modelValue', 'resolve'],
  data() {
    return {
      visible: this.modelValue,
      merging: false,
      merged: ''
    }
  },
  computed: {
    diff() {
      return diffLines(this.mine || '', this.current || '')
    },
    mineLines() {
      return this.diff.mine
    },
    currentLines() {
      return this.diff.current
    }
  },
  watch: {
    modelValue(v) {
      this.visible = v
      if (v) {
        this.merging = false
        this.merged = ''
      }
    },
    visible(v) {
      this.$emit('update:modelValue', v)
    }
  },
  methods: {
    startMerge() {
      if (!this.merging) {
        // 初值：3-way 不可自动合并处用冲突标记占位
        this.merged = this.diff.merged || this.mine || ''
        this.merging = true
        return
      }
      this.choose('manual-merge', { merged: this.merged })
    },
    choose(choice, extra) {
      this.$emit('resolve', { choice, ...(extra || {}) })
      this.visible = false
    }
  }
}
</script>

<style lang="less" scoped>
.conflictDialog {
  .cdMeta {
    font-size: 12px;
    margin-bottom: 8px;
    color: var(--macos-text-2);
    .cdTip {
      margin-top: 2px;
    }
  }
  .cdDiff {
    display: flex;
    gap: 8px;
    .cdCol {
      flex: 1;
      min-width: 0;
    }
    .cdColTitle {
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 4px;
      color: var(--macos-text);
    }
    .cdLines {
      height: 260px;
      overflow: auto;
      border: 1px solid var(--macos-border);
      border-radius: 4px;
      font-size: 12px;
      line-height: 1.7;
      font-family: Consolas, Menlo, monospace;
    }
    .cdLine {
      padding: 0 6px;
      white-space: pre-wrap;
      &.add {
        background: var(--mm-diff-add-bg, #dcfce7);
        color: var(--mm-diff-add-text, #166534);
      }
      &.del {
        background: var(--mm-diff-del-bg, #fee2e2);
        color: var(--mm-diff-del-text, #991b1b);
        text-decoration: line-through;
      }
      &.mod {
        background: var(--mm-diff-mod-bg, #fef3c7);
        color: var(--mm-diff-mod-text, #92400e);
      }
    }
  }
  .cdMerge {
    margin-top: 10px;
    .cdMergeArea {
      width: 100%;
      height: 160px;
      font-family: Consolas, Menlo, monospace;
      font-size: 12px;
      padding: 6px;
      border-radius: 4px;
      border: 1px solid var(--macos-border);
      background: transparent;
      color: var(--macos-text);
      outline: none;
    }
  }
  .cdBtns {
    display: flex;
    gap: 10px;
    .cdBtnWrap {
      text-align: center;
      .cdBtnSub {
        margin-top: 2px;
        font-size: 11px;
        color: var(--macos-text-2);
      }
    }
  }
}
</style>
