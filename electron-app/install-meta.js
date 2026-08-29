// 安装器元数据（纯逻辑，CJS，可被 main.js require，也可被 .mjs 测试 import）。
// 安装器创建的快捷方式 / 卸载图标所指向的 exe 名，必须与
// package.json 的 productName 完全一致，否则快捷方式指向不存在的文件。
// 详见《详细设计_全量改造.md》模块9 高危项。
function getAppExeName(productName) {
  return `${productName}.exe`
}

module.exports = { getAppExeName }
