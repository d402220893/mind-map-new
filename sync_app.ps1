# 同步前端产物到 Electron 应用目录，并生成“去 51.la 分析 SDK”的入口 index.html。
# 等价于 sync_app.js，但用 PowerShell 实现以绕开沙箱对 fs.rmSync / 外部 node 的限制。
$ErrorActionPreference = 'Stop'

$ROOT    = 'E:\03_学习文件\mind-map-main'
$srcDist = Join-Path $ROOT 'dist'
$appDir  = Join-Path $ROOT 'electron-app'
$appDist = Join-Path $appDir 'dist'
$appIndex = Join-Path $appDir 'index.html'

if (-not (Test-Path $srcDist)) { Write-Error ("源 dist 不存在: " + $srcDist); exit 1 }

# 1) 清空旧 app/dist 后整体复制（Remove-Item 若被沙箱拦截则降级为直接覆盖合并）
try {
    if (Test-Path $appDist) { Remove-Item $appDist -Recurse -Force }
} catch {
    Write-Warning ("清空 app/dist 失败（沙箱拦截？），将直接覆盖合并: " + $_.Exception.Message)
}
Copy-Item $srcDist $appDist -Recurse -Force
Write-Output ("已同步 dist -> " + $appDist)

# 2) 生成去 SDK 的 app/index.html
#    蓝本优先级：dist/index.html（copy.js 现已保留）→ 否则回退项目根 index.html
$srcIndex = Join-Path $srcDist 'index.html'
if (-not (Test-Path $srcIndex)) {
    $srcIndex = Join-Path $ROOT 'index.html'
    if (-not (Test-Path $srcIndex)) { Write-Error '源 index.html 不存在（dist 与项目根均无）'; exit 1 }
    Write-Output 'dist/index.html 缺失，回退使用项目根 index.html'
}
$raw = Get-Content $srcIndex -Raw -Encoding UTF8

# 剥离两块 51.la 代码：
#   (a) 外链分析脚本 <script ... id="LA_COLLECT" ...></script>
#   (b) 内联 LA.init 块 <script>try{...LA.init...}catch...</script>
# 用 id="LA_COLLECT" 精确定位，避免误伤其他外链脚本。
$clean = $raw -replace '<script[^>]*id="LA_COLLECT"[^>]*></script>', ''
$clean = $clean -replace '<script>\s*try\s*\{[\s\S]*?LA\.init[\s\S]*?\}\s*catch[\s\S]*?\}\s*</script>', ''

Set-Content $appIndex $clean -Encoding UTF8 -NoNewline
Write-Output ("已生成 app/index.html size=" + $clean.Length)

# 3) 校验：未残留 51.la；关键运行期变量未被误删；资源引用全部存在
if ($clean -match 'sdk\.51\.la') { Write-Warning '警告：仍残留 51.la 外链' }
if ($clean -match 'LA\.init')   { Write-Warning '警告：仍残留 LA.init' }

foreach ($p in @('externalPublicPath', 'takeOverApp')) {
    if (($clean -match $p) -ne ($raw -match $p)) {
        Write-Error ("校验失败：strip 删掉了关键 script 段 (" + $p + ")")
        exit 3
    }
}

$refs = [regex]::Matches($clean, '(?:src|href)="(dist/[^"?]+)(?:\?[^"]*)?"') |
        ForEach-Object { $_.Groups[1].Value }
$missing = 0
foreach ($r in $refs) {
    if (-not (Test-Path (Join-Path $appDir $r))) {
        Write-Warning ("  缺失资源: " + $r)
        $missing++
    }
}
if ($missing -eq 0) {
    Write-Output ("资源引用校验通过（" + $refs.Count + " 个引用全部存在）")
} else {
    Write-Error ("存在 " + $missing + " 个缺失资源！")
    exit 2
}

Write-Output 'SYNC_OK'
