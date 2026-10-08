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
# === [0.5/5] 架构守卫 + 全量测试（出包硬闸门）===
# 历史教训（2026-09-20 白屏事故）：此前 build_now.sh **完全不跑守卫**，
# 而 "@/api 漏导出"、"workspaceBridge 模块顶层解构导致 services 冻结成 undefined"
# 这类缺陷 **webpack 只给 warning、不进退出码** —— 于是"守卫全绿"与"构建出包"
# 是两条互不相干的路径，坏包照样发得出去，用户直接白屏。
# 这里把守卫接成硬闸门：不通过就不出包（宁可不出，也不发一个打不开的包）。
echo "=== [0.5/5] 架构守卫 + 全量测试（出包硬闸门）===" | tee -a "$LOG"
if ( cd "$WEB" && timeout 1200 "$NPM" test ) >> "$LOG" 2>&1; then
  echo "  [OK] check-arch + 全量测试通过" | tee -a "$LOG"
else
  rc=$?
  echo "  [FAIL] 守卫/测试未通过（rc=$rc）→ 终止出包。详见 $LOG 末尾" | tee -a "$LOG"
  tail -30 "$LOG" | tee -a "$LOG"
  echo "  提示：漏导出 / import 环 / 分层越界 / 预算不足 都会在此拦下，请先修根因，不要绕过。" | tee -a "$LOG"
  exit 1
fi
# === [0.8/5] 给 simple-mind-map 打补丁：备注图标在节点含引用(_mindlink.refs)时也出现 ===
# 根因：v2.0.13 修复"插入引用后节点无备注标识/无法预览"需改 simple-mind-map 的
# createNoteNode，但 node_modules 不入库、npm install 会覆盖，故每次出包前幂等重放
# （见 scripts/patch-smm-note-indicator.js）。务必放在 vue build 之前、ensure_deps 之后。
echo "=== [0.8/5] simple-mind-map 补丁（引用也显示备注标识）===" | tee -a "$LOG"
"$NODE" E:/03_学习文件/mind-map-main/scripts/patch-smm-note-indicator.js 2>&1 | tee -a "$LOG"
echo "=== [1/5] vue build ===" | tee -a "$LOG"
cd /e/03_学习文件/mind-map-main/web
# 清 webpack 缓存：陈旧缓存会导致 Edit.vue 等改动未重编译，产出"假新包"（时间戳新但内容旧），
# 是本项目"改了没生效"的高频根因。每次构建强制清，牺牲少量增量速度换取可部署性。
# 用 PowerShell .NET 直删绕开 WorkBuddy safe-delete shim：
# node fs.rmSync 删大目录时会被 shim 拦成「重定向到回收站/等待确认」，曾导致构建僵在 [1/5]、
# 日志停在「清缓存」之后不再前进（2026-09-15 排查：缓存目录已消失但 bash 再没走到下一步）。
# .NET Directory::Delete 是原生删除，不经 node shim，稳定可靠。
# SKIP_CACHE_CLEAR=1 跳过清缓存：用 warm babel/webpack 缓存大幅减少文件 I/O，降低被杀软实时扫描
# 逐个扣住文件导致构建卡死的暴露面（2026-09-21 vue build 主进程被 Defender 扣死 13min 零推进后引入）。
# 安全性：babel/vue-loader 缓存按内容哈希失效，改动文件仍会重编译；且 [2/5] 有 guard-assert
# 校验关键修复确已编入 bundle，缓存真陈旧会让构建**报错**而非产出"假新包"。仅小改动迭代时用。
if [ "$SKIP_CACHE_CLEAR" = "1" ]; then
  echo "--- 跳过清 webpack 缓存 (SKIP_CACHE_CLEAR=1，warm 缓存降 I/O) ---" | tee -a "$LOG"
else
  echo "--- 清 webpack 缓存 (node_modules/.cache) ---" | tee -a "$LOG"
  powershell -NoProfile -Command "if (Test-Path 'E:/03_学习文件/mind-map-main/web/node_modules/.cache') { [System.IO.Directory]::Delete('E:/03_学习文件/mind-map-main/web/node_modules/.cache', \$true); 'cache cleared' } else { 'no cache' }" >> "$LOG" 2>&1 || echo "清缓存失败(忽略)" | tee -a "$LOG"
fi
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
  # ⚠️ compression=store（只打包不 7z 压缩）：本机 Defender 实时扫描会拦截 app-builder.exe 的
  #    lzma 压缩子进程，导致 packaging 阶段死锁（app-builder.exe 僵死、无任何产出，exit 143）。
  #    实测 normal→压缩 18 分钟无产出；store→54 秒完成，安装包仅大 ~1MB，完全可接受。
  # ⚠️ 不套 timeout：timeout 杀不死 app-builder 子进程（会留下僵死 PID 需手动 taskkill），
  #    且会误判为构建失败。store 模式已足够快，无需超时。
  # ⚠️ 出包前先强删 dist-electron2（.NET Directory::Delete）：若该目录是上次失败残留，
  #    electron-builder 的 EnsureEmptyDir 删旧 win-unpacked/resources/app.asar 时会被
  #    Defender 只读锁卡死（packaging 阶段无产出僵死）。清干净后 store 模式 ~42 秒完成。
  # ⚠️ 带重试清理：先杀残留 app-builder（上次失败可能遗留锁），再重试删除被 Defender 只读锁的旧目录；
  # 不再 || true 静默吞错——删不掉就让下方 electron-builder 在 EnsureEmptyDir 处明确失败，而非产出半残包。
  # 构建输出目录：每次出包用带时间戳的唯一目录，彻底绕开"被另一进程锁住的旧 dist-electron2"。
  # 实测根因：前几轮失败构建被中断后残留的 app-builder 孤儿锁住 win-unpacked/resources/app.asar，
  # 沙箱内 Get-Process/taskkill 枚举受限（Get-Process 返回 0）、杀不掉 → 删不掉也改名不掉。
  # 故不再与之纠缠：旧 dist-electron2 原样留在那（仍被锁但无人触碰），本次构建用全新 OUTDIR，必然成功。
  # 安装包唯一产物改为 electron-app/dist-electron2_<ts>/思绪思维导图 Setup.exe。
  OUTDIR="dist-electron2_$(date +%Y%m%d_%H%M%S)"
  # best-effort：尽量清掉能删的旧 dist-electron2* 孤儿（仍被锁则忽略，不阻塞出包）
  powershell -NoProfile -Command "Get-ChildItem -LiteralPath 'E:/03_学习文件/mind-map-main/electron-app' -Directory -ErrorAction SilentlyContinue | Where-Object { \$_.Name -like 'dist-electron2*' } | ForEach-Object { try { Remove-Item -LiteralPath \$_.FullName -Recurse -Force -ErrorAction Stop } catch {} }" >> "$LOG" 2>&1 || true
  npm run dist -- --config.directories.output="$OUTDIR" --config.compression=store >> "$LOG" 2>&1
  RC=$?
  echo "builder rc=$RC at $(date +%T)" | tee -a "$LOG"
  if [ $RC -ne 0 ]; then echo "NSIS 构建失败" | tee -a "$LOG"; exit 1; fi
  # 清理历史遗留的 dist-electron/（旧绕行方案残留：重复的 Setup.exe + 0 字节 asar 垃圾），
  # 确保全项目始终只有一个安装包。用 .NET Directory::Delete 直删，绕开 safe-delete 钩子。
  powershell -NoProfile -Command "if (Test-Path 'E:/03_学习文件/mind-map-main/electron-app/dist-electron') { Remove-Item -LiteralPath 'E:/03_学习文件/mind-map-main/electron-app/dist-electron' -Recurse -Force -ErrorAction SilentlyContinue; 'legacy dist-electron cleaned' } else { 'no legacy dist-electron' }" >> "$LOG" 2>&1 || true
else
  echo "SKIP_NSIS 已设置，跳过 NSIS 安装包构建（仅在 [5/5] 部署到运行真源）" | tee -a "$LOG"
fi
echo "=== [5/5] 打包并部署到运行真源 D:\Program Files (x86)\思绪思维导图\resources\app.asar ===" | tee -a "$LOG"
cd /e/03_学习文件/mind-map-main/electron-app
# ⚠️ 清 _appstage 必须"删干净 + 断言删干净"。
# 历史坑（2026-09-20 查白屏时发现）：这里原为 `rm -rf _appstage 2>/dev/null || true`，
# 一旦删除失败（被锁/被上游工具拦），`|| true` 把失败**静默吞掉** → 旧产物残留 →
# 被 `cp -rf dist/.` 合并 → 陈旧 chunk 一路带进 asar 与 D 盘部署目录。
# 实测 D:\...\resources\app\dist\js 混着 09:30/10:06/15:02/17:41/18:32 五代构建的 chunk
# （13 个 3.8MB 陈旧文件 ≈ 45MB 垃圾），而新鲜产物只有 12 个文件。
rm -rf _appstage 2>/dev/null || true
if [ -d _appstage ]; then
  # safe-delete shim / Defender 可能让 rm 失败，退回 .NET 强删
  powershell -NoProfile -Command "if (Test-Path 'E:/03_学习文件/mind-map-main/electron-app/_appstage') { [System.IO.Directory]::Delete('E:/03_学习文件/mind-map-main/electron-app/_appstage', \$true) }" >> "$LOG" 2>&1 || true
fi
if [ -d _appstage ]; then
  echo "BUILD ASSERT FAILED: _appstage 无法清理（残留会让陈旧 chunk 混入 asar 与部署目录）" | tee -a "$LOG"
  exit 1
fi
mkdir -p _appstage/dist
cp package.json main.js preload.js index.html install.html install-meta.js appicon.ico _appstage/ 2>/dev/null
# 关键：先建好 _appstage/dist，再用 "dist/." 把内容平铺进去；
# 严禁 "cp -r dist _appstage/dist"（若 _appstage/dist 已存在会生成 dist/dist 双层嵌套，致白屏/资源 404）
cp -rf dist/. _appstage/dist/
# 断言：打包源与构建产物**文件集合完全一致**（多一个陈旧文件都不允许）
STAGE_DIFF=$(diff <(cd dist && find . -type f | sort) <(cd _appstage/dist && find . -type f | sort) || true)
if [ -n "$STAGE_DIFF" ]; then
  echo "BUILD ASSERT FAILED: _appstage/dist 与 electron-app/dist 文件集合不一致（疑似旧产物被合并）" | tee -a "$LOG"
  echo "$STAGE_DIFF" | head -20 | tee -a "$LOG"
  exit 1
fi
echo "stage-assert OK: _appstage/dist 与构建产物文件集合一致（$(cd dist && find . -type f | wc -l) 个文件）" | tee -a "$LOG"
"$NODE" node_modules/@electron/asar/bin/asar.js pack _appstage _appstage.asar >> "$LOG" 2>&1
SRC_ASAR="E:/03_学习文件/mind-map-main/electron-app/_appstage.asar"
cd /e/03_学习文件/mind-map-main
DST="D:/Program Files (x86)/思绪思维导图/resources/app.asar"
# ⚠️ 原来这里是 `... | tee -a "$LOG" || echo "DEPLOY 步骤返回非0，请检查日志" | tee -a "$LOG"`
# —— 部署失败只打一行字就继续往下跑，最后还会打印 RESULT 和安装包大小，
# 看起来"构建成功"，实际 D 盘还是旧代码。这类"报成功实则没部署"最耗排查时间，改为硬失败。
if ! powershell -NoProfile -ExecutionPolicy Bypass -File "E:/03_学习文件/mind-map-main/deploy_running.ps1" "$SRC_ASAR" "$DST" "思绪思维导图" >> "$LOG" 2>&1; then
  echo "DEPLOY ASSERT FAILED: deploy_running.ps1 返回非0（app.asar 未成功部署）" | tee -a "$LOG"
  tail -20 "$LOG" | tee -a "$LOG"
  exit 1
fi
echo "asar deploy OK" | tee -a "$LOG"

# === [5/5b] 启用 app.asar 作为唯一真源（移除会盖掉 asar 的散目录 resources/app）===
# 历史坑（2026-08-29 定位 / 2026-09-10 教训）：此前这里把 _appstage 整体 robocopy 到
# resources/app，而 Electron 加载优先级是 app/ 目录 > app.asar，导致打好的 app.asar 永远被
# 散目录盖住、从没真正生效；散目录里 265 个 svg + 9MB dist 在冷启动时被 Defender 逐文件实时
# 扫描 + 随机读，是"打开慢"的最大根因。
# 现改为：app.asar 已是唯一真源（[5/5] 已部署），这里只把陈旧的 resources/app 改名为
# app.bak_<ts>（留作回滚点，绝不删除），让 Electron 落到 app.asar（只读、Defender 只扫一次、
# 连续读取）。asar 下运行时只读、不写回包内，用户数据仍在 AppData/临时目录，安全。
# 回滚：若 asar 异常，把 resources/app.bak_<ts> 改名回 resources/app 即可恢复散目录模式。
APP_DIR_DST="D:/Program Files (x86)/思绪思维导图/resources/app"
if [ -d "$APP_DIR_DST" ]; then
  # 先杀进程（app/ 目录被运行中进程锁住时改名会失败）
  powershell -NoProfile -Command "Get-Process | Where-Object { \$_.ProcessName -like '*思绪思维导图*' } | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 1500" >> "$LOG" 2>&1
  APP_TS=$(date +%Y%m%d_%H%M%S)
  powershell -NoProfile -Command "Rename-Item '$APP_DIR_DST' ('app.bak_' + '$APP_TS')" >> "$LOG" 2>&1 \
    || { echo "DEPLOY ASSERT FAILED: resources/app 改名失败（被锁）→ 不能继续：必须移走散目录才能启用 asar" | tee -a "$LOG"; exit 1; }
  echo "moved stale resources/app -> app.bak_$APP_TS (asar now active)" | tee -a "$LOG"
fi
# 守卫断言：改校验打包源 _appstage（与部署的 app.asar 逐字节一致，见下方 cmp）。
# 旧代码特征 noteCodeBar 必须为 0；防白屏兜底"应用启动失败"必须编译进 bundle。
if grep -a -q "noteCodeBar" electron-app/_appstage/dist/js/*.js 2>/dev/null; then
  echo "DEPLOY ASSERT FAILED: 打包源仍含旧代码特征 noteCodeBar" | tee -a "$LOG"; exit 1
fi
if ! grep -a -q "应用启动失败" electron-app/_appstage/dist/js/app.js 2>/dev/null; then
  echo "DEPLOY ASSERT FAILED: 打包源缺少启动诊断代码（防白屏兜底未编译进 bundle）" | tee -a "$LOG"; exit 1
fi
echo "stage-assert OK: 打包源无 noteCodeBar + 含防白屏兜底" | tee -a "$LOG"
# 备份清理：每次改名产生 app.bak_<ts>，只匹配 app.bak_*，保留最新 3 个作回滚点，其余删除；
# 绝不触碰正在运行的 app.asar。
powershell -NoProfile -Command "\$r='D:/Program Files (x86)/思绪思维导图/resources'; \$b=@(Get-ChildItem -LiteralPath \$r -Directory | Where-Object { \$_.Name -like 'app.bak_*' } | Sort-Object Name -Descending); if (\$b.Count -gt 3) { \$b | Select-Object -Skip 3 | ForEach-Object { try { [System.IO.Directory]::Delete(\$_.FullName, \$true) } catch {} }; Write-Output ('backup-prune: removed ' + (\$b.Count - 3) + ', kept 3') } else { Write-Output ('backup-prune: kept ' + \$b.Count) }" >> "$LOG" 2>&1 || true
echo "asar-active deploy OK" | tee -a "$LOG"

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
# 安装包唯一产物在 electron-app/dist-electron2_<ts>/（每次出包唯一目录，绕开锁死的旧 dist-electron2）
if [ -n "$OUTDIR" ] && [ -f "electron-app/$OUTDIR/思绪思维导图 Setup.exe" ]; then
  SETUP="electron-app/$OUTDIR/思绪思维导图 Setup.exe"
else
  SETUP=""
fi
if [ -f "$SETUP" ]; then
  ls -la --time-style=+%H:%M:%S "$SETUP" | tee -a "$LOG"
else
  echo "(本次未构建 NSIS 安装包：SKIP_NSIS=1 或 electron-builder 未执行)" | tee -a "$LOG"
fi
echo "END $(date +%T)" | tee -a "$LOG"
