// 代码高亮语言注册中心（备注里的 ```代码块 使用）
// 备注由 @toast-ui/editor-viewer 渲染成 <pre><code class="language-xxx">，
// 这里把 Prism 语法库注入全局单例，再由 NodeNoteContentShow 调 Prism.highlightAllUnder 上色。
import Prism from 'prismjs'

// 官方组件（prismjs 自带）。注意依赖顺序：c -> cpp；clike 由 prismjs 核心已内置。
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-csharp'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-go'

// Verilog 无官方组件，自定义最小语法：关键字 / 数字 / 字符串 / 注释 / 操作符 / 标点
if (!Prism.languages.verilog) {
  Prism.languages.verilog = {
    comment: /\/\/.*|\/\*[\s\S]*?\*\//,
    string: /"(?:\\.|[^"\\])*"/,
    keyword:
      /\b(?:module|endmodule|input|output|inout|wire|reg|integer|parameter|localparam|genvar|supply0|supply1|tri|tri0|tri1|wand|wor|signed|unsigned|always|always_comb|always_ff|always_latch|initial|assign|begin|end|if|else|case|casez|casex|default|for|while|repeat|forever|function|endfunction|task|endtask|generate|endgenerate|fork|join|join_any|join_none|posedge|negedge|or|and|not|buf|nor|nand|xor|xnor|primitive|endprimitive|defparam|include|timescale|ifdef|ifndef|elsif|endif|define|celldefine|endcelldefine|specify|endspecify|table|endtable|edge|wait|disable|force|release|deassign|event)\b/i,
    number:
      /\b\d+(?:\.\d+)?\b|\b[01]+'[bBoOdDhH][0-9a-fA-F_xzXz]+\b|\b'd?\d+\b/,
    operator: /[<>+\-*/%=!&|^~?:]+/,
    punctuation: /[{}[\];(),.]/,
    identifier: /[a-zA-Z_]\w*/
  }
}

export default Prism
