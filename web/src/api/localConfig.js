// 本地配置（localStorage 持久化），从 api/index.js 抽出为独立模块。
//
// 目的：破 api/index.js ⇄ store.js 的 ESM 双向环。
//   - 原 api/index.js 在模块顶层 `import vuexStore from '@/store'`
//   - 原 store.js 在模块顶层 `import { storeLocalConfig } from '@/api'`
//   → 双向环。ESM 环会让某个模块在被求值时，其对端绑定仍是 undefined；
//     dev 模式（懒编译）求值顺序常与生产包不同 → 本地正常、打包后白屏。
//
// 本模块只依赖 localStorage 与 window.takeOverApp，**不得 import @/store 或 @/api**，
// 否则会重新引入环。store.js 改为 `import { storeLocalConfig } from '@/api/localConfig'`。

const SIMPLE_MIND_MAP_LOCAL_CONFIG = 'SIMPLE_MIND_MAP_LOCAL_CONFIG'

// 存储本地配置
export const storeLocalConfig = config => {
  if (window.takeOverApp) {
    return window.takeOverAppMethods.saveLocalConfig(config)
  }
  localStorage.setItem(SIMPLE_MIND_MAP_LOCAL_CONFIG, JSON.stringify(config))
}

// 获取本地配置
export const getLocalConfig = () => {
  if (window.takeOverApp) {
    return window.takeOverAppMethods.getLocalConfig()
  }
  let config = localStorage.getItem(SIMPLE_MIND_MAP_LOCAL_CONFIG)
  if (config) {
    return JSON.parse(config)
  }
  return null
}
