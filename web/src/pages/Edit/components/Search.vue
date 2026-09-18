<template>
  <div class="searchContainer" :class="{ isDark: isDark, show: show }">
    <div class="closeBtnBox">
      <span class="closeBtn el-icon-close" @click="close"></span>
    </div>
    <div class="searchInputBox">
      <el-input
        ref="searchInputRef"
        :placeholder="$t('search.searchPlaceholder')"
        size="small"
        v-model="searchText"
        @keyup.native.enter.stop="onSearchNext"
        @keydown.native.stop
        @focus="onFocus"
        @blur="onBlur"
      >
        <i slot="prefix" class="el-input__icon el-icon-search"></i>
        <el-button
          size="small"
          slot="append"
          v-if="!isUndef(searchText)"
          @click="showReplaceInput = true"
          >{{ $t('search.replace') }}</el-button
        >
      </el-input>
      <div class="searchInfo" v-if="showSearchInfo && !isUndef(searchText)">
        {{ currentIndex }} / {{ total }}
      </div>
    </div>
    <el-input
      v-if="showReplaceInput"
      ref="replaceInputRef"
      :placeholder="$t('search.replacePlaceholder')"
      size="small"
      v-model="replaceText"
      style="margin: 12px 0;"
      @keydown.native.stop
      @focus="onFocus"
      @blur="onBlur"
    >
      <i slot="prefix" class="el-input__icon el-icon-edit"></i>
      <el-button size="small" slot="append" @click="hideReplaceInput">{{
        $t('search.cancel')
      }}</el-button>
    </el-input>
    <div class="btnList" v-if="showReplaceInput">
      <el-button size="small" :disabled="isReadonly" @click="replace">{{
        $t('search.replace')
      }}</el-button>
      <el-button size="small" :disabled="isReadonly" @click="replaceAll">{{
        $t('search.replaceAll')
      }}</el-button>
    </div>
    <div
      class="searchResultList"
      :style="{ height: searchResultListHeight + 'px' }"
      v-if="showSearchResultList"
    >
      <div
        class="searchResultItem"
        v-for="(item, index) in searchResultList"
        :key="item.id"
        :title="item.name"
        @click.stop="onSearchResultItemClick(index)"
      >
        <span class="noteBadge" v-if="item.noteHit">备注</span>
        <span v-html="item.text"></span>
      </div>
      <div class="empty" v-if="searchResultList.length <= 0">
        <span class="iconfont iconwushuju"></span>
        <span class="text">{{ $t('search.noResult') }}</span>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import {
  isUndef,
  getTextFromHtml,
  bfsWalk
} from 'simple-mind-map/src/utils/index'

// 正则特殊字符转义
function escapeRegExp(s) {
  return (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 转义 HTML，避免备注里的 < > & 被当成标签
function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]
  })
}

// 高亮命中的关键词（先转义再包裹 match 样式）
function highlight(text, q) {
  const safe = escapeHtml(text)
  if (!q) return safe
  const re = new RegExp(escapeRegExp(q), 'g')
  return safe.replace(re, m => `<span class="match">${m}</span>`)
}

// 从备注里取出包含关键词的一小段作为结果预览
function getNoteSnippet(note, q) {
  const oneLine = (note || '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
  const idx = oneLine.indexOf(q)
  if (idx === -1) return oneLine.slice(0, 50)
  const start = Math.max(0, idx - 12)
  const end = Math.min(oneLine.length, idx + q.length + 18)
  return (
    (start > 0 ? '…' : '') +
    oneLine.slice(start, end) +
    (end < oneLine.length ? '…' : '')
  )
}

// 搜索替换
export default {
  props: {
    mindMap: {
      type: Object
    }
  },
  data() {
    return {
      show: false,
      searchText: '',
      replaceText: '',
      showReplaceInput: false,
      currentIndex: 0,
      total: 0,
      showSearchInfo: false,
      searchResultListHeight: 0,
      searchResultList: [],
      showSearchResultList: false
    }
  },
  computed: {
    ...mapState({
      isReadonly: state => state.isReadonly,
      isDark: state => state.localConfig.isDark
    })
  },
  watch: {
    searchText() {
      if (isUndef(this.searchText)) {
        this.currentIndex = 0
        this.total = 0
        this.showSearchInfo = false
      }
    }
  },
  created() {
    this.$bus.$on('show_search', this.showSearch)
    this.mindMap.on('search_info_change', this.handleSearchInfoChange)
    this.mindMap.on('node_click', this.blur)
    this.mindMap.on('draw_click', this.blur)
    this.mindMap.on('expand_btn_click', this.blur)
    this.mindMap.on(
      'search_match_node_list_change',
      this.onSearchMatchNodeListChange
    )
    // 让搜索同时命中节点备注（node.data.note 里的 markdown 内容）
    this.patchSearchWithNote()
    this.mindMap.keyCommand.addShortcut('Control+f', this.showSearch)
    window.addEventListener('resize', this.setSearchResultListHeight)
    this.$bus.$on('setData', this.close)
  },
  mounted() {
    this.setSearchResultListHeight()
  },
  beforeDestroy() {
    this.$bus.$off('show_search', this.showSearch)
    this.mindMap.off('search_info_change', this.handleSearchInfoChange)
    this.mindMap.off('node_click', this.blur)
    this.mindMap.off('draw_click', this.blur)
    this.mindMap.off('expand_btn_click', this.blur)
    this.mindMap.off(
      'search_match_node_list_change',
      this.onSearchMatchNodeListChange
    )
    this.mindMap.keyCommand.removeShortcut('Control+f', this.showSearch)
    window.removeEventListener('resize', this.setSearchResultListHeight)
    this.$bus.$off('setData', this.close)
  },
  methods: {
    isUndef,

    // 给 simple-mind-map 自带的 Search 插件打补丁：在标题匹配之外，
    // 把"备注(node.data.note)里包含关键词"的节点也并入匹配列表。
    // 这样高亮、跳转、计数都自动沿用插件原有逻辑，且不改动 node_modules。
    patchSearchWithNote() {
      const mindMap = this.mindMap
      if (!mindMap || !mindMap.search) return
      const search = mindMap.search
      if (search.__noteSearchPatched) return
      const origDoSearch = search.doSearch.bind(search)
      search.doSearch = function() {
        // 先跑插件原生的标题/概要匹配
        origDoSearch()
        try {
          const text = this.searchText
          if (!text) return
          const { isOnlySearchCurrentRenderNodes } = this.mindMap.opt
          const tree = isOnlySearchCurrentRenderNodes
            ? this.mindMap.renderer.root
            : this.mindMap.renderer.renderTree
          if (!tree) return
          // renderTree 里是 { data, children } 形式的普通对象；renderer.root 是节点实例。
          // 统一取"节点数据对象"，text/note/uid 都在它上面。
          const getNodeData = n =>
            n && typeof n.getData === 'function' ? n.getData() : n && n.data
          // 已匹配（标题命中）的 uid，避免备注重复计入
          const matchedUids = new Set(
            this.matchNodeList
              .map(n => {
                const d = getNodeData(n)
                return d && d.uid
              })
              .filter(Boolean)
          )
          bfsWalk(tree, node => {
            const d = getNodeData(node)
            if (!d) return
            const note = d.note
            const uid = d.uid
            if (
              typeof note === 'string' &&
              note.includes(text) &&
              uid &&
              !matchedUids.has(uid)
            ) {
              matchedUids.add(uid)
              this.matchNodeList.push(node)
            }
          })
          this.updateMatchNodeList(this.matchNodeList)
        } catch (e) {
          // 备注搜索异常不影响原生搜索
          console.error('note search patch error:', e)
        }
      }
      search.__noteSearchPatched = true
    },

    handleSearchInfoChange(data) {
      this.currentIndex = data.currentIndex + 1
      this.total = data.total
      this.showSearchInfo = true
    },

    showSearch() {
      this.$bus.$emit('closeSideBar')
      this.show = true
      this.$refs.searchInputRef.focus()
    },

    hideReplaceInput() {
      this.showReplaceInput = false
      this.replaceText = ''
    },

    // 输入框聚焦时，禁止思维导图节点响应按键事件自动进入文本编辑
    onFocus() {
      this.mindMap.updateConfig({
        enableAutoEnterTextEditWhenKeydown: false
      })
    },

    // 输入框失焦时恢复
    onBlur() {
      this.mindMap.updateConfig({
        enableAutoEnterTextEditWhenKeydown: true
      })
    },

    // 画布，节点点击时让输入框失焦
    blur() {
      if (this.$refs.searchInputRef) {
        this.$refs.searchInputRef.blur()
      }
      if (this.$refs.replaceInputRef) {
        this.$refs.replaceInputRef.blur()
      }
    },

    onSearchNext() {
      this.showSearchResultList = true
      // 每次搜索前确保补丁挂到当前的 search 实例上（防止 mindMap 重建后丢失）
      this.patchSearchWithNote()
      this.mindMap.search.search(this.searchText)
    },

    replace() {
      this.mindMap.search.replace(this.replaceText, true)
    },

    replaceAll() {
      this.mindMap.search.replaceAll(this.replaceText)
    },

    close() {
      this.show = false
      this.showSearchResultList = false
      this.showSearchInfo = false
      this.total = 0
      this.currentIndex = 0
      this.searchText = ''
      this.hideReplaceInput()
      this.mindMap.search.endSearch()
    },

    onSearchMatchNodeListChange(list) {
      const q = this.searchText.trim()
      this.searchResultList = list.map(item => {
        const data = item.data || (item.nodeData && item.nodeData.data)
        const id = data.uid
        let name = data.text
        if (data.richText) {
          name = getTextFromHtml(name)
        }
        const note =
          typeof data.note === 'string'
            ? data.note
            : item.getData
            ? item.getData('note')
            : ''
        const titleHit = name.includes(q)
        const noteHit = note.includes(q)
        // 标题命中的显示标题；仅备注命中的显示备注片段
        const text = titleHit
          ? highlight(name, q)
          : highlight(getNoteSnippet(note, q), q)
        return {
          data: item,
          id,
          text,
          name,
          noteHit
        }
      })
    },

    setSearchResultListHeight() {
      this.searchResultListHeight = window.innerHeight - 267 - 24
    },

    onSearchResultItemClick(index) {
      this.mindMap.search.jump(index)
    }
  }
}
</script>

<style lang="less" scoped>
.searchContainer {
  position: relative;
  background-color: #fff;
  padding: 16px;
  width: 296px;
  border-radius: 12px;
  box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.1);
  position: fixed;
  top: 110px;
  right: -296px;
  transition: all 0.3s;

  &.isDark {
    background-color: #363b3f;

    .closeBtnBox {
      color: #fff;
      background-color: #363b3f;
    }
  }

  &.show {
    right: 20px;
  }

  .btnList {
    display: flex;
    justify-content: flex-end;
  }

  .closeBtnBox {
    position: absolute;
    right: -5px;
    top: -5px;
    width: 20px;
    height: 20px;
    background-color: #fff;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.1);

    .closeBtn {
      font-size: 16px;
    }
  }

  .searchInputBox {
    position: relative;

    .searchInfo {
      position: absolute;
      right: 70px;
      top: 50%;
      transform: translateY(-50%);
      color: #909090;
      font-size: 14px;
    }
  }

  .searchResultList {
    position: absolute;
    left: 0;
    top: 100%;
    width: 100%;
    background-color: #fff;
    box-shadow: 0 4px 16px 0 rgba(0, 0, 0, 0.1);
    border-radius: 12px;
    margin-top: 5px;
    overflow-y: auto;
    padding: 12px 0;

    .searchResultItem {
      height: 30px;
      line-height: 30px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 0 12px;
      font-size: 14px;
      cursor: pointer;
      position: relative;
      padding-left: 22px;

      &::before {
        content: '';
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        width: 5px;
        height: 5px;
        background-color: #606266;
        border-radius: 50%;
      }

      &:hover {
        background-color: #f2f4f7;
      }

      .noteBadge {
        display: inline-block;
        margin-right: 5px;
        padding: 0 5px;
        font-size: 11px;
        line-height: 16px;
        color: #fff;
        background-color: #909399;
        border-radius: 3px;
        vertical-align: middle;
        flex: none;
      }

      > span:last-child {
        vertical-align: middle;
      }

      /deep/.match {
        color: #409eff;
        font-weight: bold;
      }
    }

    .empty {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;

      .iconfont {
        font-size: 50px;
        margin-bottom: 20px;
      }

      .text {
        font-size: 14px;
        color: rgba(26, 26, 26, 0.8);
      }
    }
  }
}
</style>
