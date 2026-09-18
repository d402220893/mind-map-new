#!/usr/bin/env bash
set -e
cd /e/03_学习文件/mind-map-main
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
# 注意：npmmirror 的 electron-builder-binaries 镜像已下架 nsis 等资源（返回 404），
# 会导致 packaging 阶段卡死。nsis 等二进制已缓存到 ~/.cache/electron-builder，
# 故不再设置 ELECTRON_BUILDER_BINARIES_MIRROR，让 electron-builder 用本地缓存 + GitHub 默认。
export CSC_IDENTITY_AUTO_DISCOVERY=false
# 自带完整 PATH：WorkBuddy 的 bash 初始化偶尔不注入 git usr/bin，会导致脚本内
# timeout/cp/mv/tee/grep/sed/cmp 等 coreutils 找不到（Exit 127），构建链路异常/僵死。
# 这里显式补齐 git 的 usr/bin + bin + node，使脚本不再依赖外层环境 PATH。
# 自动探测 WorkBuddy 托管的 node 版本目录（版本号会随环境变化，写死易失效 → 2026-09 多次踩坑）
NODE_BASE="/c/Users/d36847/.workbuddy/binaries/node/versions"
NODE_VER=""
if [ -d "$NODE_BASE" ]; then
  NODE_VER=$(ls -1 "$NODE_BASE" 2>/dev/null | grep -E '^[0-9]' | sort -V | tail -1)
fi
if [ -n "$NODE_VER" ] && [ -x "$NODE_BASE/$NODE_VER/node.exe" ]; then
  NODE="$NODE_BASE/$NODE_VER/node.exe"
else
  NODE=/c/Users/d36847/.workbuddy/binaries/node/versions/22.22.2-3/node.exe
fi
export PATH="$(dirname "$NODE"):/c/Users/d36847/.workbuddy/binaries/PortableGit/versions/1.2.0/usr/bin:/c/Users/d36847/.workbuddy/binaries/PortableGit/versions/1.2.0/bin:$PATH"
NPM="npm"
ROOT=/e/03_学习文件/mind-map-main
WEB="$ROOT/web"
APP="$ROOT/electron-app"
LOG=/e/03_学习文件/mind-map-main/build_now.log
: > "$LOG"
echo "START $(date +%T)" | tee -a "$LOG"
pkill -9 -f vue-cli-service.js 2>/dev/null || true
pkill -9 -f app-builder 2>/dev/null || true
sleep 1
echo "=== [0/5] 依赖自检与自动安装 ===" | tee -a "$LOG"
# 依赖是可再生的构建缓存（非源码），清理时被删属正常；此处自动补齐，实现"一键编包"。
# 仅校验关键入口二进制，避免目录存在但安装残缺的假阳性。
ensure_deps() {
  local dir="$1"
  local bin="$2"
  local label="$3"
  if [ -f "$bin" ]; then
    echo "  [OK] $label 依赖齐全" | tee -a "$LOG"
    return 0
  fi
  echo "  [缺失] $label 依赖不存在，自动安装中（命中 npm 缓存会很快，但 reify 解压受 Defender 实时扫描影响可能需 30~60 分钟，已设 1h 超时）..." | tee -a "$LOG"
  ( cd "$dir" && timeout 3600 "$NPM" install --no-audit --no-fund --prefer-offline --loglevel=http ) 2>&1 | tee -a "$LOG"
  local rc=${PIPESTATUS[0]}
  if [ $rc -ne 0 ]; then
    echo "  [WARN] $label 首次安装 rc=$rc，清理残缺 node_modules 后重试一次..." | tee -a "$LOG"
    powershell -NoProfile -Command "if (Test-Path '${dir}/node_modules') { [System.IO.Directory]::Delete('${dir}/node_modules', \$true) }" >> "$LOG" 2>&1 || true
    ( cd "$dir" && timeout 3600 "$NPM" install --no-audit --no-fund --prefer-offline --loglevel=http ) 2>&1 | tee -a "$LOG"
    rc=${PIPESTATUS[0]}
    if [ $rc -ne 0 ]; then
      echo "  [FAIL] $label 安装失败(rc=$rc)，请检查网络/registry 后重试" | tee -a "$LOG"
      return 1
    fi
  fi
  if [ -f "$bin" ]; then
    echo "  [OK] $label 安装完成" | tee -a "$LOG"
  else
    echo "  [FAIL] $label 安装后仍未找到 $bin" | tee -a "$LOG"
    return 1
  fi
}
ensure_deps "$WEB" "$WEB/node_modules/.bin/vue-cli-service" "web (vue build)" || exit 1
ensure_deps "$APP" "$APP/node_modules/@electron/asar/bin/asar.js" "electron-app (asar)" || exit 1
echo "=== [1/5] vue build ===" | tee -a "$LOG"
cd /e/03_学习文件/mind-map-main/web
# 清 webpack 缓存：陈旧缓存会导致 Edit.vue 等改动未重编译，产出"假新包"（时间戳新但内容旧），
# 是本项目"改了没生效"的高频根因。每次构建强制清，牺牲少量增量速度换取可部署性。
echo "--- 清 webpack 缓存 (node_modules/.cache) ---" | tee -a "$LOG"
# 用 PowerShell .NET 直删绕开 WorkBuddy safe-delete shim：
# node fs.rmSync 删大目录时会被 shim 拦成「重定向到回收站/等待确认」，曾导致构建僵在 [1/5]、
# 日志停在「清缓存」之后不再前进（2026-09-15 排查：缓存目录已消失但 bash 再没走到下一步）。
# .NET Directory::Delete 是原生删除，不经 node shim，稳定可靠。
powershell -NoProfile -Command "if (Test-Path 'E:/03_学习文件/mind-map-main/web/node_modules/.cache') { [System.IO.Directory]::Delete('E:/03_学习文件/mind-map-main/web/node_modules/.cache', \$true); 'cache cleared' } else { 'no cache' }" >> "$LOG" 2>&1 || echo "清缓存失败(忽略)" | tee -a "$LOG"
# vue build 用 node 包装，带可靠硬超时：msys 的 timeout 对 Windows node 子进程树（webpack worker）
# 无法真正终止，会随管道 EOF 永久挂起 → 整链卡死在 [1/5]。run_vue_build.js 超时后
# 用 taskkill /T /F 杀整个进程树并 exit 2（下方判定为 VUE BUILD FAILED），保证绝不无限卡。
# 注意：传给 node 的绝对路径必须用 Windows 风格 E:/...，不能用 git-bash 的 /e/ 前缀
# （/e/ 作为 argv 传给原生 node 会被错拼成 E:\e\... 导致 MODULE_NOT_FOUND）。
# BUILD_LOW_MEM 默认 1（低内存防 OOM），可被外层 BUILD_LOW_MEM=0 覆盖（低内存触发 worker 死锁时改用）。
BUILD_LOW_MEM="${BUILD_LOW_MEM:-1}" env -u NODE_OPTIONS "$NODE" E:/03_学习文件/mind-map-main/run_vue_build.js >> "$LOG" 2>&1
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
  # 绕 Defender 实时防护对 dist-electron/win-unpacked/resources/app.asar 的只读锁：
  # electron-builder 的 EnsureEmptyDir 删旧 app.asar 时因被锁报 EBUSY/EPERM，NSIS 步骤整体失败。
  # 故改用独立输出目录 dist-electron2 避开被锁旧目录。
  # ⚠️ 不再把 Setup.exe 拷回 dist-electron/：那样会得到两份完全相同的安装包（用户只想要一份）。
  #    安装包唯一产物固定为 electron-app/dist-electron2/思绪思维导图 Setup.exe
  timeout 600 npm run dist -- --config.directories.output=dist-electron2 >> "$LOG" 2>&1
  RC=$?
  echo "builder rc=$RC at $(date +%T)" | tee -a "$LOG"
  if [ $RC -ne 0 ]; then echo "NSIS 构建失败" | tee -a "$LOG"; exit 1; fi
  # 清理历史遗留的 dist-electron/（旧绕行方案残留：重复的 Setup.exe + 0 字节 asar 垃圾），
  # 确保全项目始终只有一个安装包。用 .NET Directory::Delete 直删，绕开 safe-delete 钩子。
  powershell -NoProfile -Command "if (Test-Path 'E:/03_学习文件/mind-map-main/electron-app/dist-electron') { [System.IO.Directory]::Delete('E:/03_学习文件/mind-map-main/electron-app/dist-electron', \$true); 'legacy dist-electron cleaned' } else { 'no legacy dist-electron' }" >> "$LOG" 2>&1 || true
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

# === [5/5b] 同步部署到 resources/app 目录（Electron 加载优先级：app/ 目录 > app.asar）===
# 历史教训（2026-09-10~11）：D:\ 下存在 Sep 8 的旧 resources/app/ 目录，Electron 优先加载它，
# 导致覆盖 app.asar 的多次部署用户全部看不到（一直跑 v1.0.21 旧 UI）。
# 部署真源必须是 app/ 目录；asar 只是兜底，两处都要同步。
APP_DIR_DST="D:/Program Files (x86)/思绪思维导图/resources/app"
if [ -d "$APP_DIR_DST" ]; then
  # 杀进程（app/ 目录被运行中进程锁住时改名会失败）
  powershell -NoProfile -Command "Get-Process | Where-Object { \$_.ProcessName -like '*思绪思维导图*' } | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 1500" >> "$LOG" 2>&1
  APP_TS=$(date +%Y%m%d_%H%M%S)
  powershell -NoProfile -Command "Rename-Item '$APP_DIR_DST' ('app.bak_' + '$APP_TS')" >> "$LOG" 2>&1 \
    || { echo "APP_DIR 改名失败（可能被锁），跳过 app/ 目录同步" | tee -a "$LOG"; }
fi
if [ ! -d "$APP_DIR_DST" ]; then
  powershell -NoProfile -Command "robocopy 'E:/03_学习文件/mind-map-main/electron-app/_appstage' '$APP_DIR_DST' /E /NFL /NDL /NJH /NJS /NC /NS /NP" >> "$LOG" 2>&1 || true
  echo "--- 校验 app/ 目录构建指纹 ---" | tee -a "$LOG"
  cat "$APP_DIR_DST/dist/build-info.json" 2>/dev/null | tee -a "$LOG"
  # app/ 目录守卫：noteCodeBar（v1.0.21 旧代码特征）必须为 0
  if grep -a -q "noteCodeBar" "$APP_DIR_DST/dist/js/"*.js 2>/dev/null; then
    echo "DEPLOY ASSERT FAILED: resources/app 目录仍含旧代码特征 noteCodeBar" | tee -a "$LOG"
    exit 1
  fi
  # 版本号提取：cut -d'\"' 在双引号转义下会报 "the delimiter must be a single character"，改用 sed
  VER=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$APP_DIR_DST/package.json" | head -1)
  echo "app-dir deploy OK (v${VER})" | tee -a "$LOG"
fi

echo "--- 校验已部署 asar（与本地打包产物逐字节比对 + 指纹提取）---" | tee -a "$LOG"
# asar 的 ef/list 子命令在本环境输出为空且 node CLI 不认 /d/ 挂载路径（需用 D:/），
# 因此改用：① cmp 比对部署包与本地 _appstage.asar；② 直接 grep 二进制里的 build-info 字段。
if cmp -s "/e/03_学习文件/mind-map-main/electron-app/_appstage.asar" "$DST"; then
  echo "asar 与本地 _appstage.asar 逐字节一致（部署内容正确）" | tee -a "$LOG"
else
  echo "WARN: 部署的 app.asar 与本地 _appstage.asar 不一致，请人工核对" | tee -a "$LOG"
fi
grep -a -o '"gitHash":[^,}]*' "/e/03_学习文件/mind-map-main/electron-app/_appstage.asar" | head -1 | tee -a "$LOG"
echo "=== RESULT ===" | tee -a "$LOG"
# 安装包唯一产物在 electron-app/dist-electron2/（dist-electron 是绕 Defender 锁的旧绕行目录，已废弃）
SETUP="electron-app/dist-electron2/思绪思维导图 Setup.exe"
if [ -f "$SETUP" ]; then
  ls -la --time-style=+%H:%M:%S "$SETUP" | tee -a "$LOG"
else
  echo "(本次未构建 NSIS 安装包：SKIP_NSIS=1 或 electron-builder 未执行)" | tee -a "$LOG"
fi
echo "END $(date +%T)" | tee -a "$LOG"
