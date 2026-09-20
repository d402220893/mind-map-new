import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Edit',
    component: () => import(`./pages/Edit/Index.vue`)
  },
  {
    path: '/index',
    redirect: '/'
  },
  {
    path: '/doc/zh',
    component: () => import(`./pages/Doc.vue`)
  }
]

// Vue 2 的 `new VueRouter({ routes })` 默认即 hash 模式，这里保持一致
const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
