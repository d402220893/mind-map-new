import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readClipboardImage, mimeToExt, randomHex } from '../../src/utils/clipboardImage.js'

test('files 路径优先返回 image', () => {
  const dt = { files: [{ type: 'image/png' }, { type: 'text/plain' }], items: [] }
  assert.equal(readClipboardImage(dt).type, 'image/png')
})

test('files 无图时走 items 路径', () => {
  const dt = {
    files: [{ type: 'text/plain' }],
    items: [{ type: 'image/png', getAsFile: () => ({ type: 'image/png' }) }]
  }
  assert.equal(readClipboardImage(dt).type, 'image/png')
})

test('items 中 getAsFile 返回 null 时继续遍历', () => {
  const dt = {
    files: [],
    items: [
      { type: 'image/png', getAsFile: () => null },
      { type: 'image/jpeg', getAsFile: () => ({ type: 'image/jpeg' }) }
    ]
  }
  assert.equal(readClipboardImage(dt).type, 'image/jpeg')
})

test('非图片返回 null', () => {
  const dt = { files: [{ type: 'text/plain' }], items: [{ type: 'text/plain' }] }
  assert.equal(readClipboardImage(dt), null)
})

test('空 dataTransfer 返回 null', () => {
  assert.equal(readClipboardImage(null), null)
  assert.equal(readClipboardImage({}), null)
})

test('mimeToExt 解析常见类型', () => {
  assert.equal(mimeToExt('image/png'), 'png')
  assert.equal(mimeToExt('image/jpeg'), 'jpeg')
  assert.equal(mimeToExt('image/x-icon'), 'icon')
})

test('mimeToExt 缺省 png', () => {
  assert.equal(mimeToExt(''), 'png')
  assert.equal(mimeToExt(undefined), 'png')
})

test('randomHex 长度且为十六进制', () => {
  assert.equal(randomHex(4).length, 4)
  assert.match(randomHex(8), /^[0-9a-f]{8}$/)
})
