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
if (-not (Test-Path $SrcAsar)) {
  Write-Error ("src asar missing: " + $SrcAsar)
  exit 1
}
Copy-Item -Force $SrcAsar $DstAsar
Write-Host ("deployed -> " + $DstAsar)

# 4) Verify
$item = Get-Item $DstAsar
Write-Host ("size=" + $item.Length + " mtime=" + $item.LastWriteTime)
