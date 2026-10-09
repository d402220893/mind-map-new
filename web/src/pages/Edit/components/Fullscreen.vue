<template>
  <div class="fullscreenContainer" :class="{ isDark: isDark }">
    <el-tooltip
      class="item"
      effect="dark"
      :content="$t('fullscreen.fullscreenShow')"
      placement="top"
    >
      <div class="btn iconfont iconquanping" @click="toFullscreenShow"></div>
    </el-tooltip>
    <el-tooltip
      class="item"
      effect="dark"
      :content="$t('fullscreen.fullscreenEdit')"
      placement="top"
    >
      <div class="btn iconfont iconquanping1" @click="toFullscreenEdit"></div>
    </el-tooltip>
  </div>
</template>

<script>
import { fullscrrenEvent, fullScreen } from '@/utils'
import { isElVisible } from '@/utils/rectGuard'

// 全屏
export default {
  props: {
    mindMap: {
      type: Object
    },
    isDark: {
      type: Boolean
    }
  },
  data() {
    return {}
  },
  created() {
    document[fullscrrenEvent] = () => {
      setTimeout(() => {
        // mindMap prop 经 mindmap-inited 广播赋值，md 页启动时实例未建（null），必须判空
        if (!this.mindMap) return
        // 容器可能仍处 0 尺寸过渡态（同 Edit.vue#handleResize 守卫理由），
        // 直接 resize 会 throw「容器元素el的宽高不能为0」
        if (!isElVisible(this.mindMap.el)) return
        try {
          this.mindMap.resize()
        } catch (e) {
          // 兜底：resize 异常绝不冒泡成用户可见错误框
        }
      }, 1000)
    }
  },
  methods: {
    // 全屏查看
    toFullscreenShow() {
      if (!this.mindMap) return
      fullScreen(this.mindMap.el)
    },

    // 全屏编辑
    toFullscreenEdit() {
      fullScreen(document.body)
    }
  }
}
</script>

<style lang="less" scoped>
.fullscreenContainer {
  display: flex;
  align-items: center;

  &.isDark {
    .btn {
      color: hsla(0,0%,100%,.6);
    }
  }

  .item {
    margin-right: 12px;

    &:last-of-type {
      margin-right: 0;
    }
  }

  .btn {
    cursor: pointer;
  }
}
</style>
