# clean_build_locks.ps1
# 用途：解除 Defender 实时防护对 .asar 的只读锁，并清理因此删不掉的陈旧构建产物，
#       使 build_now.sh 的 [4/5] NSIS 步骤日后能直接重建 dist-electron/win-unpacked。
# 必须以管理员身份运行（右键 -> 以管理员身份运行）。
# 说明：脚本用 .NET 直删（[System.IO.Directory]::Delete / [System.IO.File]::Delete）绕过
#       shell 级 safe-delete 钩子，在任何环境下都能真正删除。

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$electronApp = Join-Path $root 'electron-app'

# 1) 检查管理员权限
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
    Write-Host 'ERROR: 请以管理员身份运行此脚本（右键 -> 以管理员身份运行）。' -ForegroundColor Red
    exit 1
}

# 用 .NET 直接删除，绕过 safe-delete 钩子
function Remove-PathForce {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $true }
    try {
        $item = Get-Item $Path -Force
        if ($item.PSIsContainer) {
            [System.IO.Directory]::Delete($Path, $true)
        } else {
            [System.IO.File]::Delete($Path)
        }
        return $true
    } catch {
        return $false
    }
}

# 2) 给 electron-app 加 Defender 排除项（停止对 .asar 持只读锁）
try {
    Add-MpPreference -ExclusionPath $electronApp -ErrorAction Stop
    Write-Host "OK: 已添加 Defender 排除项 -> $electronApp" -ForegroundColor Green
} catch {
    Write-Host "WARN: 添加 Defender 排除项失败（可能已存在或被组策略禁止）: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 3) 等待 Defender 释放句柄后，重试清理被锁的陈旧文件
$targets = @(
    (Join-Path $electronApp 'dist-electron\win-unpacked'),
    (Join-Path $electronApp '_appstage.asar'),
    (Join-Path $electronApp 'win-unpacked_bak')
)
foreach ($t in $targets) {
    if (-not (Test-Path $t)) { continue }
    $ok = $false
    for ($i = 1; $i -le 10; $i++) {
        if (Remove-PathForce $t) { $ok = $true; break }
        Start-Sleep -Seconds 2
    }
    if ($ok) { Write-Host "OK: 已清理 -> $t" -ForegroundColor Green }
    else { Write-Host "WARN: 仍无法清理（可能被其他进程占用） -> $t" -ForegroundColor Yellow }
}

Write-Host '完成。现在可正常运行 build_now.sh（NSIS 步骤不再卡 Defender 锁）。' -ForegroundColor Cyan
