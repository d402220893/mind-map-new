<template>
  <div
    class="richTextToolbar"
    ref="richTextToolbar"
    :style="style"
    :class="{ isDark: isDark }"
    @click.stop.passive
    v-show="showRichTextToolbar"
  >
    <el-tooltip :content="$t('richTextToolbar.bold')" placement="top">
      <div class="btn" :class="{ active: formatInfo.bold }" @click="toggleBold">
        <span class="icon iconfont iconzitijiacu"></span>
      </div>
    </el-tooltip>

    <el-tooltip :content="$t('richTextToolbar.italic')" placement="top">
      <div
        class="btn"
        :class="{ active: formatInfo.italic }"
        @click="toggleItalic"
      >
        <span class="icon iconfont iconzitixieti"></span>
      </div>
    </el-tooltip>

    <el-tooltip :content="$t('richTextToolbar.underline')" placement="top">
      <div
        class="btn"
        :class="{ active: formatInfo.underline }"
        @click="toggleUnderline"
      >
        <span class="icon iconfont iconzitixiahuaxian"></span>
      </div>
    </el-tooltip>

    <el-tooltip :content="$t('richTextToolbar.strike')" placement="top">
      <div
        class="btn"
        :class="{ active: formatInfo.strike }"
        @click="toggleStrike"
      >
        <span class="icon iconfont iconshanchuxian"></span>
      </div>
    </el-tooltip>

    <el-tooltip :content="$t('richTextToolbar.fontFamily')" placement="top">
      <el-popover placement="bottom" trigger="hover">
        <div class="fontOptionsList" :class="{ isDark: isDark }">
          <div
            class="fontOptionItem"
            v-for="item in fontFamilyList"
            :key="item.value"
            :style="{ fontFamily: item.value }"
            :class="{ active: formatInfo.font === item.value }"
            @click="changeFontFamily(item.value)"
          >
            {{ item.name }}
          </div>
        </div>
        <template #reference>
          <div class="btn">
            <span class="icon iconfont iconxingzhuang-wenzi"></span>
          </div>
        </template>
      </el-popover>
    </el-tooltip>

    <el-tooltip :content="$t('richTextToolbar.fontSize')" placement="top">
      <el-popover placement="bottom" trigger="hover">
        <div class="fontOptionsList" :class="{ isDark: isDark }">
          <div
            class="fontOptionItem"
            v-for="item in fontSizeList"
            :key="item"
            :style="{
              fontSize: item + 'px',
              height: (item < 30 ? 30 : item + 10) + 'px'
            }"
            :class="{ active: formatInfo.size === item + 'px' }"
            @click="changeFontSize(item)"
          >
            {{ item }}px
          </div>
        </div>
        <template #reference>
          <div class="btn">
            <span class="icon iconfont iconcase fontColor"></span>
          </div>
        </template>
      </el-popover>
    </el-tooltip>

    <el-tooltip :content="$t('richTextToolbar.color')" placement="top">
      <el-popover placement="bottom" trigger="hover">
        <Color :color="fontColor" @change="changeFontColor"></Color>
        <template #reference>
          <div class="btn" :style="{ color: formatInfo.color }">
            <span class="icon iconfont iconzitiyanse"></span>
          </div>
        </template>
      </el-popover>
    </el-tooltip>

    <el-tooltip
      :content="$t('richTextToolbar.backgroundColor')"
      placement="top"
    >
      <el-popover placement="bottom" trigger="hover">
        <Color
          :color="fontBackgroundColor"
          @change="changeFontBackgroundColor"
        ></Color>
        <template #reference>
          <div class="btn">
            <span class="icon iconfont iconbeijingyanse"></span>
          </div>
        </template>
      </el-popover>
    </el-tooltip>

    <el-tooltip :content="$t('richTextToolbar.textAlign')" placement="top">
      <el-popover placement="bottom" trigger="hover">
        <div class="fontOptionsList" :class="{ isDark: isDark }">
          <div
            class="fontOptionItem"
            v-for="item in alignList"
            :key="item.value"
            :class="{ active: formatInfo.align === item.value }"
            @click="changeTextAlign(item.value)"
          >
            {{ item.name }}
          </div>
        </div>
        <template #reference>
          <div class="btn">
            <span class="icon iconfont iconjuzhongduiqi"></span>
          </div>
        </template>
      </el-popover>
    </el-tooltip>

    <el-tooltip :content="$t('richTextToolbar.removeFormat')" placement="top">
      <div class="btn" @click="removeFormat">
        <span class="icon iconfont iconqingchu"></span>
      </div>
    </el-tooltip>
  </div>
</template>

<script>
import { fontFamilyList, fontSizeList, alignList } from '@/config'
import Color from './Color.vue'
import { mapState } from 'vuex'

export default {
  components: {
    Color
  },
  props: {
    mindMap: {
      type: Object
    }
  },
  data() {
    return {
      fontSizeList,
      showRichTextToolbar: false,
      style: {
        left: 0,
        top: 0
      },
      fontColor: '',
      fontBackgroundColor: '',
      formatInfo: {}
    }
  },
  computed: {
    ...mapState({
      isDark: state => state.localConfig.isDark
    }),

    fontFamilyList() {
      return fontFamilyList[this.$i18n.locale] || fontFamilyList.zh
    },

    alignList() {
      return alignList[this.$i18n.locale] || alignList.zh
    }
  },
  created() {
    this.$bus.$on('rich_text_selection_change', this.onRichTextSelectionChange)
  },
  mounted() {
    document.body.append(this.$refs.richTextToolbar)
  },
  beforeUnmount() {
    this.$bus.$off('rich_text_selection_change', this.onRichTextSelectionChange)
  },
  methods: {
    onRichTextSelectionChange(hasRange, rect, formatInfo) {
      if (hasRange) {
        this.style.left = rect.left + rect.width / 2 + 'px'
        this.style.top = rect.top - 60 + 'px'
        this.formatInfo = { ...(formatInfo || {}) }
      }
      this.showRichTextToolbar = hasRange
    },

    toggleBold() {
      this.formatInfo.bold = !this.formatInfo.bold
      this.safeFormatText({
        bold: this.formatInfo.bold
      })
    },

    toggleItalic() {
      this.formatInfo.italic = !this.formatInfo.italic
      this.safeFormatText({
        italic: this.formatInfo.italic
      })
    },

    toggleUnderline() {
      this.formatInfo.underline = !this.formatInfo.underline
      this.safeFormatText({
        underline: this.formatInfo.underline
      })
    },

    toggleStrike() {
      this.formatInfo.strike = !this.formatInfo.strike
      this.safeFormatText({
        strike: this.formatInfo.strike
      })
    },

    changeFontFamily(font) {
      this.formatInfo.font = font
      this.safeFormatText({
        font
      })
    },

    changeFontSize(size) {
      this.formatInfo.size = size
      this.safeFormatText({
        size: size + 'px'
      })
    },

    changeFontColor(color) {
      this.formatInfo.color = color
      this.safeFormatText({
        color
      })
    },

    changeFontBackgroundColor(background) {
      this.formatInfo.background = background
      this.safeFormatText({
        background
      })
    },

    changeTextAlign(align) {
      this.formatInfo.align = align
      this.safeFormatText({
        align
      })
    },

    removeFormat() {
      this.safeRemoveFormat()
    },

    // 选区失效窗口期守卫（v2.0.45 启动报错修复）：悬浮工具栏显示后、点击前，
    // 节点可能已重渲染/脱离 DOM，quill 保存的原生选区指向已卸载节点，
    // formatText → getRange → normalizedToRange 会读 null.offset 抛错
    // （实测栈：onClick → changeTextAlign → formatText → setSelection →
    //   getRange → normalizedToRange → Array.map 读 null.offset，2026-10-10 renderer.log）。
    // 降级为静默放弃本次格式化，绝不冒泡成「启动时有 N 项异常」横幅。
    safeFormatText(format) {
      try {
        this.mindMap.richText.formatText(format)
      } catch (e) {
        // 选区已失效：放弃本次格式化
      }
    },

    safeRemoveFormat() {
      try {
        this.mindMap.richText.removeFormat()
      } catch (e) {
        // 同上
      }
    }
  }
}
</script>

<style lang="less" scoped>
.richTextToolbar {
  position: fixed;
  z-index: 2000;
  height: 55px;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 8px;
  box-shadow: 0 2px 16px 0 rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  transform: translateX(-50%);

  &.isDark {
    background: #363b3f;

    .btn {
      color: #fff;

      &:hover {
        background: hsla(0, 0%, 100%, 0.05);
      }
    }
  }

  .btn {
    width: 55px;
    height: 55px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;

    &:hover {
      background-color: #eefbed;
    }

    &.active {
      color: #12bb37;
    }

    .icon {
      font-size: 20px;

      &.fontColor {
        font-size: 26px;
      }
    }
  }
}

.fontOptionsList {
  width: 150px;

  &.isDark {
    .fontOptionItem {
      color: #fff;

      &:hover {
        background-color: hsla(0, 0%, 100%, 0.05);
      }
    }
  }

  .fontOptionItem {
    height: 30px;
    width: 100%;
    display: flex;
    align-items: center;
    cursor: pointer;

    &:hover {
      background-color: #f7f7f7;
    }

    &.active {
      color: #12bb37;
    }
  }
}
</style>
