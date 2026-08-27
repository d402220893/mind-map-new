// 仅用于离线校验 .emmx 解析逻辑（复刻 parseEmmx.js 的二进制 BIN 提取路径）。
// 依赖 web/node_modules/jszip。
const fs = require('fs')
const path = require('path')
const JSZip = require(path.join(__dirname, 'web', 'node_modules', 'jszip', 'lib', 'index.js'))

function rdVarint(bytes, off) {
  let val = 0, shift = 0, i = off
  while (i < bytes.length) {
    const b = bytes[i]
    val |= (b & 0x7f) << shift
    if (!(b & 0x80)) return [val, i + 1]
    shift += 7; i++
  }
  return [val, i]
}
function utf8RunStart(bytes, end) {
  let i = end
  while (i >= 0) {
    const b = bytes[i]
    if (b === 0x00) return i + 1
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) return i + 1
    if (!((b >= 0x80 && b <= 0xbf) || (b >= 0xc2 && b <= 0xf4))) return i + 1
    i--
  }
  return 0
}
function extractBinaryTopics(bytes) {
  const term = [0x00, 0x00, 0x00, 0x0a, 0x7f]
  const titles = []
  const dec = new TextDecoder('utf-8')
  let pos = 0
  while (pos <= bytes.length - 5) {
    let match = true
    for (let k = 0; k < 5; k++) if (bytes[pos + k] !== term[k]) { match = false; break }
    if (!match) { pos++; continue }
    const end = pos
    const start = utf8RunStart(bytes, end - 1)
    const text = dec.decode(bytes.subarray(start, end)).trim()
    if (text && !text.includes('\t') && text.length <= 200) titles.push(text)
    pos += 5
  }
  return titles
}

async function main() {
  const file = 'E:\\学习文件\\BTS学习.emmx'
  const buf = fs.readFileSync(file)
  const zip = await JSZip.loadAsync(buf)
  console.log('ZIP 条目：')
  zip.forEach((rel, entry) => console.log('  -', rel, '(' + (entry.dir ? 'dir' : entry._data ? entry._data.uncompressedSize : '?') + ')'))

  const docFile = zip.file('document.xml')
  let xmlHasTree = false
  if (docFile) {
    const xml = await docFile.async('string')
    xmlHasTree = /<OneTopic|<Topic/i.test(xml)
    console.log('\ndocument.xml 含 <OneTopic>/<Topic> 树：', xmlHasTree)
    if (xmlHasTree) {
      const m = xml.match(/<OneTopic|<Topic/gi)
      console.log('  话题标签出现次数：', m ? m.length : 0)
    }
  }

  const bin = zip.file('mmpage/page.bin') || zip.file('page.bin')
  if (bin) {
    const bytes = await bin.async('uint8array')
    const titles = extractBinaryTopics(bytes)
    console.log('\n[BIN 变体] 提取到话题文本数量：', titles.length)
    console.log('前 20 条示例：')
    titles.slice(0, 20).forEach((t, i) => console.log('  ' + (i + 1) + '. ' + t))
  }

  console.log('\n结论：', xmlHasTree ? '走 XML 完整树解析路径' : (bin ? '走 BIN 降级平铺路径（带 warning）' : '无法识别'))
}
main().catch(e => { console.error(e); process.exit(1) })
