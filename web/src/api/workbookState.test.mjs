// 纯状态机单测（无框架，node 直接跑）
// 运行： node --experimental-default-type=module web/src/api/workbookState.test.mjs
import assert from 'node:assert'
import * as WB from './workbookState.js'

// 内存版 localStorage 模拟
function makeStorage() {
  const map = new Map()
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    _map: map
  }
}

function freshStorage() {
  const s = makeStorage()
  WB.initWorkbookStorage(s)
  WB.__resetForTest()
  WB.__initEmpty()
  return s
}

function sheetStateWith(name, text) {
  return {
    activeId: 's_' + name,
    sheets: [
      { id: 's_' + name, name, data: { root: { data: { text }, children: [] } } }
    ]
  }
}

let passed = 0
function test(name, fn) {
  try {
    fn()
    passed++
    console.log('  ✓ ' + name)
  } catch (e) {
    console.error('  ✗ ' + name)
    console.error('    ' + (e && e.message))
    process.exitCode = 1
  }
}

console.log('workbookState 状态机测试')

test('空初始化后列表为空；首次 loadState 自动建一个默认 workbook', () => {
  freshStorage()
  let list = WB.getWorkbookList()
  assert.strictEqual(list.workbooks.length, 0)
  // 重新加载（模拟应用冷启动）：storage 为空时应自动创建一个默认 workbook
  WB.__resetForTest()
  list = WB.getWorkbookList()
  assert.strictEqual(list.workbooks.length, 1)
  assert.strictEqual(list.activeId, list.workbooks[0].id)
})

test('addWorkbook 新建并切换为激活，原 workbook 数据不受影响', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: 'C:\\a.smm', sheetState: sheetStateWith('A', 'root-A') })
  const b = WB.addWorkbook({ name: 'B', filePath: 'C:\\b.smm', sheetState: sheetStateWith('B', 'root-B') })
  const list = WB.getWorkbookList()
  assert.strictEqual(list.workbooks.length, 2)
  assert.strictEqual(list.activeId, b.id) // 最后一个为激活
  // 切换回 A，A 的数据仍独立存在
  WB.switchWorkbook(a.id)
  assert.strictEqual(WB.getCurrentFilePath(), 'C:\\a.smm')
  // 改 A 的 sheet 数据不影响 B
  const stA = WB.getActiveSheetState()
  stA.sheets[0].data.root.data.text = 'root-A-modified'
  WB.switchWorkbook(b.id)
  assert.strictEqual(WB.getActiveSheetState().sheets[0].data.root.data.text, 'root-B')
})

test('getCurrentFilePath 仅返回激活 workbook 的绝对路径，否则空串', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: 'C:\\a.smm' })
  const b = WB.addWorkbook({ name: 'B', filePath: '' }) // 未落盘
  WB.switchWorkbook(b.id)
  assert.strictEqual(WB.getCurrentFilePath(), '')
  WB.switchWorkbook(a.id)
  assert.strictEqual(WB.getCurrentFilePath(), 'C:\\a.smm')
})

test('findByPath 去重（大小写不敏感）', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: 'C:\\Test\\a.smm' })
  const hit = WB.findByPath('c:\\test\\A.SMM')
  assert.ok(hit)
  assert.strictEqual(hit.id, a.id)
  assert.strictEqual(WB.findByPath('C:\\nope.smm'), null)
  assert.strictEqual(WB.findByPath(''), null)
})

test('applySaveAs 只重定向当前激活 workbook，原文件/其它文件不受影响', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: 'C:\\a.smm' })
  const b = WB.addWorkbook({ name: 'B', filePath: 'C:\\b.smm' })
  // 把 B 另存为 C:\b2.smm
  WB.switchWorkbook(b.id)
  const newName = WB.applySaveAs('C:\\b2.smm')
  assert.strictEqual(newName, 'b2')
  // B 的路径/名字变了
  const list = WB.getWorkbookList()
  const bNow = list.workbooks.find(w => w.id === b.id)
  assert.strictEqual(bNow.filePath, 'C:\\b2.smm')
  assert.strictEqual(bNow.name, 'b2')
  // A 完全不受影响
  const aNow = list.workbooks.find(w => w.id === a.id)
  assert.strictEqual(aNow.filePath, 'C:\\a.smm')
  assert.strictEqual(aNow.name, 'A')
})

test('removeWorkbook 关闭非激活文件时激活不变；至少保留一个', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: 'C:\\a.smm' })
  const b = WB.addWorkbook({ name: 'B', filePath: 'C:\\b.smm' })
  // 关闭非激活的 a
  WB.switchWorkbook(b.id)
  const r = WB.removeWorkbook(a.id)
  assert.strictEqual(r.newActiveId, b.id)
  let list = WB.getWorkbookList()
  assert.strictEqual(list.workbooks.length, 1)
  // 再关最后一个 -> 用空白替换，仍保留一个
  const r2 = WB.removeWorkbook(b.id)
  list = WB.getWorkbookList()
  assert.strictEqual(list.workbooks.length, 1)
  assert.ok(r2.newActiveId)
})

test('拖拽打开场景：先开 A，再开 B，二者独立且 B 为激活', () => {
  freshStorage()
  WB.addWorkbook({ name: 'A', filePath: 'C:\\a.smm', sheetState: sheetStateWith('A', 'A-content') })
  WB.addWorkbook({ name: 'B', filePath: 'C:\\b.smm', sheetState: sheetStateWith('B', 'B-content') })
  const list = WB.getWorkbookList()
  assert.strictEqual(list.workbooks.length, 2)
  assert.strictEqual(list.activeId, list.workbooks[1].id)
  // B 激活，切到 A 验证数据独立
  WB.switchWorkbook(list.workbooks[0].id)
  assert.strictEqual(WB.getActiveSheetState().sheets[0].data.root.data.text, 'A-content')
  WB.switchWorkbook(list.workbooks[1].id)
  assert.strictEqual(WB.getActiveSheetState().sheets[0].data.root.data.text, 'B-content')
})

test('markDirty / isDirty 按 workbook 独立', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: 'C:\\a.smm' })
  const b = WB.addWorkbook({ name: 'B', filePath: 'C:\\b.smm' })
  WB.markDirty(a.id, true)
  assert.strictEqual(WB.isDirty(a.id), true)
  assert.strictEqual(WB.isDirty(b.id), false)
  WB.markDirty(a.id, false)
  assert.strictEqual(WB.isDirty(a.id), false)
})

test('持久化：reload 后状态保留', () => {
  freshStorage()
  const a = WB.addWorkbook({ name: 'A', filePath: 'C:\\a.smm' })
  WB.switchWorkbook(a.id)
  WB.markDirty(a.id, true)
  // 模拟“重新加载”（清空内存态，从 storage 重建）
  WB.__resetForTest()
  const list = WB.getWorkbookList()
  assert.strictEqual(list.workbooks.length, 1)
  assert.strictEqual(WB.getCurrentFilePath(), 'C:\\a.smm')
  assert.strictEqual(WB.isDirty(a.id), true)
})

console.log('\n通过 ' + passed + ' 项测试' + (process.exitCode ? '（存在失败）' : '，全部通过'))
