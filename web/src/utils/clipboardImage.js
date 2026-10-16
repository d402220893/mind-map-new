/**
 * 剪贴板图片读取 + 文件名辅助（纯函数，便于 Node 单测）。
 *
 * 痛点：很多截图工具（Windows 截图、Snipaste）复制图片时 `clipboardData.files` 为空，
 * 但 `clipboardData.items` 里含有 image blob。因此读图要同时走 files + items 两条路径。
 */

/**
 * 从 DataTransfer 读取第一个图片 Blob。
 * @param {DataTransfer} dataTransfer
 * @returns {File | Blob | null}
 */
export function readClipboardImage(dataTransfer) {
  if (!dataTransfer) return null

  // 1. files 路径（Chrome / Edge 最常见）
  const files = Array.from(dataTransfer.files || [])
  const fileImg = files.find(f => /^image\//.test(f.type))
  if (fileImg) return fileImg

  // 2. items 路径（截图工具、Firefox 等）
  const items = Array.from(dataTransfer.items || [])
  for (const item of items) {
    if (item && /^image\//.test(item.type)) {
      const blob = item.getAsFile ? item.getAsFile() : null
      if (blob) return blob
    }
  }

  return null
}

/**
 * MIME 类型 → 文件扩展名。
 * @param {string} mime 如 'image/png'
 * @returns {string} 如 'png'（缺省 png）
 */
export function mimeToExt(mime) {
  if (!mime) return 'png'
  const sub = String(mime).split('/')[1] || 'png'
  // 去掉 'x-' 前缀与 ';base64' 之类参数
  return sub.split(/[;+]/)[0].replace(/^x-/, '') || 'png'
}

/**
 * 生成 len 位十六进制随机串（用于文件名去重）。
 * @param {number} len
 * @returns {string}
 */
export function randomHex(len) {
  let s = ''
  for (let i = 0; i < len; i++) {
    s += Math.floor(Math.random() * 16).toString(16)
  }
  return s
}
