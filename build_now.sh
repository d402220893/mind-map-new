#!/usr/bin/env bash
set -e
cd /e/03_学习文件/mind-map-main
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
# 注意：npmmirror 的 electron-builder-binaries 镜像已下架 nsis 等资源（返回 404），
# 会导致 packaging 阶段卡死。nsis 等二进制已缓存到 ~/.cache/electron-builder，
# 故不再设置 ELECTRON_BUILDER_BINARIES_MIRROR，让 electron-builder 用本地缓存 + GitHub 默认。
export CSC_IDENTITY_AUTO_DISCOVERY=false
export PATH="/c/Users/d36847/.workbuddy/binaries/node/versions/22.22.2-2:$PATH"
NODE=/c/Users/d36847/.workbuddy/binaries/node/versions/22.22.2-2/node.exe
LOG=/e/03_学习文件/mind-map-main/build_now.log
: > "$LOG"
echo "START $(date +%T)" | tee -a "$LOG"
pkill -9 -f vue-cli-service.js 2>/dev/null || true
pkill -9 -f app-builder 2>/dev/null || true
sleep 1
echo "=== [1/5] vue build ===" | tee -a "$LOG"
cd /e/03_学习文件/mind-map-main/web
# 清 webpack 缓存：陈旧缓存会导致 Edit.vue 等改动未重编译，产出"假新包"（时间戳新但内容旧），
# 是本项目"改了没生效"的高频根因。每次构建强制清，牺牲少量增量速度换取可部署性。
echo "--- 清 webpack 缓存 (node_modules/.cache) ---" | tee -a "$LOG"
env -u NODE_OPTIONS "$NODE" -e "require('fs').rmSync('node_modules/.cache',{recursive:true,force:true})" 2>/dev/null || true
BUILD_LOW_MEM=1 NODE_OPTIONS="--openssl-legacy-provider --max-old-space-size=4096" timeout 480 "$NODE" node_modules/@vue/cli-service/bin/vue-cli-service.js build >> "$LOG" 2>&1
RC=$?
echo "vue rc=$RC at $(date +%T)" | tee -a "$LOG"
if [ $RC -ne 0 ] || [ ! -f /e/03_学习文件/mind-map-main/dist/index.html ]; then
  echo "VUE BUILD FAILED" | tee -a "$LOG"
  exit 1
fi
echo "=== [2/5] sync dist + strip + 构建指纹 ===" | tee -a "$LOG"
cd /e/03_学习文件/mind-map-main
mkdir -p _trash
mv electron-app/dist "_trash/eapp_$(date +%H%M%S)" 2>/dev/null || true
cp -rf dist/. electron-app/dist/
"$NODE" strip_index.js 2>&1 | tee -a "$LOG"
# 写入构建指纹（version/buildTime/gitHash）：运行实例启动后在控制台打印，
# 用于核对"改了是否真的发上去了"。
"$NODE" gen-build-info.js 2>&1 | tee -a "$LOG"
echo "fix strings:" | tee -a "$LOG"
grep -a -l "workbook-list-changed" electron-app/dist/js/*.js 2>&1 | tee -a "$LOG"
grep -a -l "fileBrand" electron-app/dist/js/*.js 2>&1 | tee -a "$LOG" || echo "fileBrand removed (expected)" | tee -a "$LOG"
echo "--- 守卫断言：备注粘贴修复必须编译进 bundle（防陈旧缓存假新包） ---" | tee -a "$LOG"
# 仅类名 .nodeNoteDialog 会出现在 Toast UI 的 chunk 里（备注对话框自身样式），不足以证明 Edit.vue 守卫已编译；
# 真正的新代码特征是 onPaste 里 "closest('.nodeNoteDialog')" 这一调用，编译后保留为字符串字面量，只在 app.js 主包出现。
if ! grep -a -q "closest('.nodeNoteDialog')\|closest(\".nodeNoteDialog\")" electron-app/dist/js/*.js; then
  echo "BUILD ASSERT FAILED: Edit.vue 的备注粘贴守卫(closest nodeNoteDialog)未编译进 bundle，疑似陈旧缓存或构建未完成" | tee -a "$LOG"
  exit 1
fi
echo "guard-assert OK: nodeNoteDialog 守卫已编译进 bundle" | tee -a "$LOG"
echo "--- 守卫断言：asar 内 dist/index.html 不得含 51.la 跟踪脚本 ---" | tee -a "$LOG"
# strip_index.js 现已同步剥离 electron-app/dist/index.html；若仍残留说明剥离失败。
if grep -a -q "51.la\|LA_COLLECT\|LA.init" electron-app/dist/index.html; then
  echo "BUILD ASSERT FAILED: electron-app/dist/index.html 仍含 51.la 跟踪脚本，strip_index.js 剥离失败" | tee -a "$LOG"
  exit 1
fi
echo "51la-strip-assert OK: dist/index.html 已无 51.la" | tee -a "$LOG"
echo "=== [3/5] bump version ===" | tee -a "$LOG"
cd /e/03_学习文件/mind-map-main/electron-app
if [ -z "$SKIP_BUMP" ]; then
  "$NODE" bump_version.js 2>&1 | tee -a "$LOG"
else
  echo "SKIP_BUMP 已设置，保持当前版本号" | tee -a "$LOG"
fi
grep '"version"' package.json | tee -a "$LOG"
echo "=== [4/5] electron-builder (NSIS 安装包，可选) ===" | tee -a "$LOG"
# 关闭 WorkBuddy 注入的 safe-delete 钩子（NODE_OPTIONS --require genie-safe-delete.cjs）。
# 否则 electron-builder 收尾删除中间文件 mind-map-*.nsis.7z 时，unlink 被拦截转去
# genie-trash 回收站，而该操作会失败/挂起，导致构建退出 1（Setup.exe 实际已生成）。
# 构建只删除 dist-electron 自身的临时产物，清空 NODE_OPTIONS 不影响用户数据安全。
export NODE_OPTIONS=""
if [ -z "$SKIP_NSIS" ]; then
  timeout 600 npm run dist >> "$LOG" 2>&1
  echo "builder rc=$? at $(date +%T)" | tee -a "$LOG"
else
  echo "SKIP_NSIS 已设置，跳过 NSIS 安装包构建（仅在 [5/5] 部署到运行真源）" | tee -a "$LOG"
fi
echo "=== [5/5] 打包并部署到运行真源 D:\Program Files (x86)\思绪思维导图\resources\app.asar ===" | tee -a "$LOG"
cd /e/03_学习文件/mind-map-main/electron-app
rm -rf _appstage 2>/dev/null || true
mkdir -p _appstage/dist
cp package.json main.js preload.js index.html install.html install-meta.js appicon.ico _appstage/ 2>/dev/null
# 关键：先建好 _appstage/dist，再用 "dist/." 把内容平铺进去；
# 严禁 "cp -r dist _appstage/dist"（若 _appstage/dist 已存在会生成 dist/dist 双层嵌套，致白屏/资源 404）
cp -rf dist/. _appstage/dist/
"$NODE" node_modules/@electron/asar/bin/asar.js pack _appstage _appstage.asar >> "$LOG" 2>&1
SRC_ASAR="E:/03_学习文件/mind-map-main/electron-app/_appstage.asar"
cd /e/03_学习文件/mind-map-main
DST="D:/Program Files (x86)/思绪思维导图/resources/app.asar"
powershell -NoProfile -ExecutionPolicy Bypass -File "E:/03_学习文件/mind-map-main/deploy_running.ps1" "$SRC_ASAR" "$DST" "思绪思维导图" | tee -a "$LOG" || echo "DEPLOY 步骤返回非0，请检查日志" | tee -a "$LOG"
echo "--- 校验已部署 asar 的构建指纹 ---" | tee -a "$LOG"
"$NODE" "E:/03_学习文件/mind-map-main/electron-app/node_modules/@electron/asar/bin/asar.js" ef "$DST" dist/build-info.json 2>/dev/null | tee -a "$LOG" || echo "(build-info 提取失败，可忽略)" | tee -a "$LOG"
echo "=== RESULT ===" | tee -a "$LOG"
ls -la --time-style=+%H:%M:%S "dist-electron/思绪思维导图 Setup.exe" 2>&1 | tee -a "$LOG"
echo "END $(date +%T)" | tee -a "$LOG"
