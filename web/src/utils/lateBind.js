/**
 * 延迟命名空间绑定（late namespace binding）
 *
 * 为什么需要它 —— 2026-09-20 白屏事故根因：
 *   `workspaceBridge.js` 原写成
 *     const { services, events, log } = singleton      // ← 模块顶层解构
 *   而 `singleton` 的服务是**后置赋值**上去的。ESM/CommonJS 的模块求值是"谁先被 import
 *   谁先跑"，于是 bridge 在被求值的那一刻就把 `undefined` **永久冻进闭包**：
 *   之后 singleton.services 有值了，bridge 里的 `services` 仍是 undefined。
 *   结果 `main.js` 的 `getServices().fileRouter.setTabs(...)` 抛 TypeError →
 *   `createApp`/`app.mount` 从未执行 → `#app` 空 → **整页白屏**。
 *
 * 这类故障的恶劣之处：**它只在真实的模块求值顺序下出现**。
 * 单测直接 import bridge 会先建好 singleton，永远测不出来；webpack 也只给 warning。
 *
 * 解法：不要在模块求值期"取一次"，而是让每次属性访问都**当场向真源要**。
 * Proxy 恰好能做到"对外仍是一个对象（`ns.foo.bar()` 写法不变），
 * 但属性访问被劫持为实时取值"。
 *
 * ⚠️ 四个 trap 都不能少（漏一个就会有"看着能用、边界处诡异"的行为）：
 *   get             —— 主路径；函数额外 bind 到真实对象，避免 `this` 指向 Proxy
 *   has             —— `'foo' in ns` / `ns.foo === undefined` 判断
 *   ownKeys         —— `Object.keys(ns)` / `JSON.stringify(ns)` / 展开运算符
 *   getOwnPropertyDescriptor —— 上一条的配套（Proxy 规范要求 ownKeys 的结果
 *                               在 getOwnPropertyDescriptor 里是 configurable）
 *
 * ⚠️ 已知语义偏差（使用方需知）：`ns` 恒为 **truthy**，哪怕真源是 undefined。
 *   所以**不能用 `if (!ns)` 判断"真源没就绪"**，必须做能力探测（`if (!ns.fileRouter)`）。
 */
export function lateNs(pick) {
  const target0 = {}
  return new Proxy(target0, {
    get(_t, key) {
      const target = pick()
      if (!target) return undefined
      // 反射内建符号（Symbol.toPrimitive / Symbol.toStringTag 等）原样透传，
      // 否则 String(ns) / ns + '' 之类会走 Proxy 的默认行为而拿不到 target 的语义。
      if (typeof key === 'symbol') return target[key]
      const v = target[key]
      // 方法绑回真实对象：服务工厂多为闭包（不用 this），但 bind 能兜住
      // "某个服务返回 class 实例"这类未来场景，且成本可忽略。
      return typeof v === 'function' ? v.bind(target) : v
    },
    has(_t, key) {
      const target = pick()
      return !!target && key in target
    },
    ownKeys() {
      const target = pick()
      return target ? Reflect.ownKeys(target) : []
    },
    getOwnPropertyDescriptor(_t, key) {
      const target = pick()
      if (!target) return undefined
      const d = Object.getOwnPropertyDescriptor(target, key)
      // 必须报 configurable: true：ownKeys 结果与真实描述符可能不一致，
      // 不置 configurable 会让 Proxy 违反不变式并**抛 TypeError**。
      return d ? { ...d, configurable: true } : undefined
    }
  })
}

/**
 * 真值判断的可靠替代：`lateNs` 恒 truthy，所以判断"命名空间是否可用"
 * 必须落到具体能力上。传入探测路径（如 'fileRouter.setTabs'）。
 */
export function nsHas(ns, path) {
  if (!ns) return false
  let cur = ns
  for (const key of String(path).split('.')) {
    if (cur == null) return false
    cur = cur[key]
  }
  return cur !== undefined && cur !== null
}
