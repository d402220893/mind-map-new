# 思绪思维导图 · Markdown 编辑器功能验证样例

> 本文件用于无头（headless）实跑验证 MdEditor 支持的全部 Markdown 特性。
> 每一节对应一个工具栏能力；验证脚本会真实加载本文件并用 Toast UI Editor 引擎断言渲染结果。

## 1. 行内样式

这是**加粗**、*斜体*、~~删除线~~ 与 `行内代码` 的混合示例。

## 2. 标题层级

### 2.1 三级标题

### 2.2 另一个三级标题

## 3. 列表

- 无序项 A
- 无序项 B
  - 嵌套无序项 B-1

1. 有序项一
2. 有序项二

- [x] 已完成任务
- [ ] 未完成任务

## 4. 引用

> 这是一段引用文字。
> 引用可以跨多行。

## 5. 表格

| 列一 | 列二 | 列三 |
| --- | --- | --- |
| a1 | b1 | c1 |
| a2 | b2 | c2 |

## 6. 代码块（prismjs 高亮）

```js
function hello(name) {
  const msg = `hi, ${name}`
  console.log(msg)
  return msg
}
hello('思绪')
```

```python
def add(a, b):
    return a + b
```

## 7. 分割线

---

## 8. 图片

内嵌 base64 图片（验证只读降级渲染）：

![示例图](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==)

相对路径图片（验证写盘 assets/ 引用）：

![相对图](assets/sample.png)

## 9. 链接

外部链接：[Toast UI Editor](https://ui.toast.com)

工作区相对路径链接（验证点击导航）：[回到本文件](MD功能验证_测试样例.md)

## 10. 内嵌导图（独有能力）

![内嵌导图](demo.smm)

## 11. 长段落用于跳转精度验证

第一段用于测试 scrollToLine 是否准确落到目标块。第二段继续扩展内容，使渲染块与 markdown 行号的映射关系更复杂。第三段再补充一些描述性文字，方便观察大纲与查找跳转的落点偏差。第四段收尾，确认整篇文档在 WYSIWYG 模式下可被完整渲染、保存、再加载而内容一致。
