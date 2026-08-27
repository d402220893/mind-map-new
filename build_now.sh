#!/usr/bin/env bash
set -e
cd /e/03_学习文件/mind-map-main
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
export ELECTRON_BUILDER_BINARIES_MIRROR=https://registry.npmmirror.com/-/binary/electron-builder-binaries/
export CSC_IDENTITY_AUTO_DISCOVERY=false
export PATH="/c/Users/d36847/.workbuddy/binaries/node/versions/22.22.2:$PATH"
NODE=/c/Users/d36847/.workbuddy/binaries/node/versions/22.22.2/node.exe
LOG=/e/03_学习文件/mind-map-main/build_now.log
: > "$LOG"
echo "START $(date +%T)" | tee -a "$LOG"
pkill -9 -f vue-cli-service.js 2>/dev/null || true
pkill -9 -f app-builder 2>/dev/null || true
sleep 1
echo "=== [1/4] vue build ===" | tee -a "$LOG"
cd /e/03_学习文件/mind-map-main/web
BUILD_LOW_MEM=1 NODE_OPTIONS="--openssl-legacy-provider --max-old-space-size=4096" timeout 480 "$NODE" node_modules/@vue/cli-service/bin/vue-cli-service.js build >> "$LOG" 2>&1
RC=$?
echo "vue rc=$RC at $(date +%T)" | tee -a "$LOG"
if [ $RC -ne 0 ] || [ ! -f /e/03_学习文件/mind-map-main/dist/index.html ]; then
  echo "VUE BUILD FAILED" | tee -a "$LOG"
  exit 1
fi
echo "=== [2/4] sync dist + strip ===" | tee -a "$LOG"
cd /e/03_学习文件/mind-map-main
mkdir -p _trash
mv electron-app/dist "_trash/eapp_$(date +%H%M%S)" 2>/dev/null || true
cp -rf dist/. electron-app/dist/
"$NODE" strip_index.js 2>&1 | tee -a "$LOG"
echo "fix strings:" | tee -a "$LOG"
grep -a -l "workbook-list-changed" electron-app/dist/js/*.js 2>&1 | tee -a "$LOG"
grep -a -l "fileBrand" electron-app/dist/js/*.js 2>&1 | tee -a "$LOG" || echo "fileBrand removed (expected)" | tee -a "$LOG"
echo "=== [3/4] bump version ===" | tee -a "$LOG"
cd /e/03_学习文件/mind-map-main/electron-app
"$NODE" bump_version.js 2>&1 | tee -a "$LOG"
grep '"version"' package.json | tee -a "$LOG"
echo "=== [4/4] electron-builder ===" | tee -a "$LOG"
timeout 600 npm run dist >> "$LOG" 2>&1
RC=$?
echo "builder rc=$RC at $(date +%T)" | tee -a "$LOG"
echo "=== RESULT ===" | tee -a "$LOG"
ls -la --time-style=+%H:%M:%S "dist-electron/思绪思维导图 Setup.exe" 2>&1 | tee -a "$LOG"
echo "END $(date +%T)" | tee -a "$LOG"
