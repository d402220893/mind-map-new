# Deploy to the real running location.
# Usage: powershell -File deploy_running.ps1 <SrcAsar> <DstAsar> <ProcName>
# (Chinese paths/names are passed as arguments to avoid UTF-8 decoding issues.)
param([string]$SrcAsar, [string]$DstAsar, [string]$ProcName)

$ErrorActionPreference = 'Stop'
$ts = Get-Date -Format 'yyyyMMdd_HHmmss'

# 1) Kill the running instance to release the file lock
if ($ProcName) {
  $proc = Get-Process -Name $ProcName -ErrorAction SilentlyContinue
  if ($proc) {
    $proc | Stop-Process -Force
    Write-Host ("killed " + $ProcName)
    Start-Sleep -Seconds 1
  }
}

# 2) Backup current asar (timestamped)
if (Test-Path $DstAsar) {
  $bak = $DstAsar + ".bak_" + $ts
  Copy-Item -Force $DstAsar $bak
  Write-Host ("backup -> " + $bak)
}

# 3) Overwrite with the freshly built asar
# 目标父目录（resources\）可能尚不存在（首次部署 / 应用未安装到该路径），
# Copy-Item 不会自动建目录会抛 DirectoryNotFoundException；这里先 New-Item 递归建好。
$parentDir = [System.IO.Path]::GetDirectoryName($DstAsar)
if (-not (Test-Path $parentDir)) {
  New-Item -ItemType Directory -Force -Path $parentDir | Out-Null
  Write-Host ("created dir -> " + $parentDir)
}
if (-not (Test-Path $SrcAsar)) {
  Write-Error ("src asar missing: " + $SrcAsar)
  exit 1
}
Copy-Item -Force $SrcAsar $DstAsar
Write-Host ("deployed -> " + $DstAsar)

# 4) Verify
$item = Get-Item $DstAsar
Write-Host ("size=" + $item.Length + " mtime=" + $item.LastWriteTime)
