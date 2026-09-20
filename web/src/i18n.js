import { createI18n } from 'vue-i18n'
import messages from './lang'

const i18n = createI18n({
  // legacy 模式：保留 Options API 下 this.$t / 模板 {{ $t(...) }} 的用法，
  // 与 vue-i18n v8 保持一致，模板无需改动。
  legacy: true,
  globalInjection: true,
  locale: 'zh',
  fallbackLocale: 'zh',
  messages
})

export default i18n
