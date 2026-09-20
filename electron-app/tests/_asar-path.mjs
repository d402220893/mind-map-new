// asar 产物路径解析（electron-app/tests 共用）。
//
// 为什么需要这个文件：打包链在 2026-09 期间把 asar 产出从
//   dist-electron/win-unpacked/resources/app.asar
// 改成了项目根目录的 _appstage.asar（build_now.sh 的 [5/5] 步，再由它逐字节部署到
// D:\Program Files (x86)\思绪思维导图\resources\app.asar）。
// 而旧守卫仍硬编码 dist-electron 路径，且写成 `if (!existsSync(p)) return` ——
// **路径不存在就静默通过**，于是 7 条"防白屏/防漏打包"守卫空转了好几天，
// 期间 dist-electron 下只剩 Sep-11 留下的 **0 字节** 同名文件（Defender 锁文件残留）。
//
// 两条纪律：
//   ① 解析顺序按"真实产物优先"，并把 0 字节文件视为不存在（空文件是假产物）；
//   ② 测试里找不到产物必须 **skip 而不是 pass**（空转守卫比没有守卫更危险）。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const ELECTRON_ROOT = path.resolve(here, '..')
export const PROJECT_ROOT = path.resolve(ELECTRON_ROOT, '..')

/** 候选路径按"当前真源优先 → 历史路径兜底"排列 */
export function asarCandidates() {
  return [
    // build_now.sh [5/5] 的真源产物（pack 完直接逐字节部署到 D 盘运行目录）
    path.join(ELECTRON_ROOT, '_appstage.asar'),
    path.join(PROJECT_ROOT, '_appstage.asar'),
    path.join(ELECTRON_ROOT, 'dist-electron2', 'win-unpacked', 'resources', 'app.asar'),
    path.join(ELECTRON_ROOT, 'dist-electron', 'win-unpacked', 'resources', 'app.asar')
  ]
}

/** 返回"真实存在且非空"的 asar 路径；都不可用返回 null */
export function resolveAsar() {
  for (const p of asarCandidates()) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).size > 0) return p
    } catch (e) { /* 权限/占用：视为不可用 */ }
  }
  return null
}

/** 供测试用的 skip 选项：无产物时可见地跳过（而非静默通过） */
export function asarSkip() {
  const p = resolveAsar()
  return p ? false : '未找到已构建的 app.asar（先跑 build_now.sh 或 npm run build 再测）'
}

/** 已部署到运行真源的 asar（可选断言用） */
export const DEPLOYED_ASAR = 'D:/Program Files (x86)/思绪思维导图/resources/app.asar'
