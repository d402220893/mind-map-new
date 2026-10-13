# Deploy to the real running location.
# Usage: powershell -File deploy_running.ps1 <SrcAsar> <DstAsar> <ProcName>
# (Chinese paths/names are passed as arguments to avoid UTF-8 decoding issues.)
param([string]$SrcAsar, [string]$DstAsar, [string]$ProcName)

$ErrorActionPreference = 'Stop'
$ts = Get-Date -Format 'yyyyMMdd_HHmmss'

# 1) Kill the running instance to release the file lock.
# 注意：Get-Process -Name 对中文进程名在本环境会返回空（通配/编码坑），导致杀进程被跳过、
# 运行中的 app 一直锁住 app.asar、Copy-Item 静默失败（或抛错被吞），构建日志却报"deploy OK"假成功。
# 改用 Get-CimInstance Win32_Process 按精确名取 PID 杀（对中文名可靠），并带重试。
if ($ProcName) {
  $killedAny = $false
  $procs = Get-CimInstance Win32_Process -Filter "Name = '$ProcName'" -ErrorAction SilentlyContinue
  if ($procs) {
    foreach ($p in $procs) {
      try {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
        Write-Host ("killed PID " + $p.ProcessId)
        $killedAny = $true
      } catch {
        Write-Host ("kill PID " + $p.ProcessId + " ERR: " + $_.Exception.Message)
      }
    }
    if ($killedAny) { Start-Sleep -Seconds 1 }
  } else {
    Write-Host ("no running instance of " + $ProcName)
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
# PowerShell 的 Split-Path/GetDirectoryName 对 '/' 分隔的路径会返回 null（只认 '\'），
# 这里先归一化为反斜杠再取父目录并复制，避免 DirectoryNotFoundException。
# 用字符串方法 Replace（不是正则 -replace）：PowerShell 正则替换里 '\' 是转义符，
# '-replace '/', '\'' 实际不会发生替换，导致 $normalDst 仍带 '/'、Split-Path 返回 null。
$normalDst = $DstAsar.Replace('/', '\')
$parentDir = Split-Path -Parent $normalDst
if (-not (Test-Path $parentDir)) {
  New-Item -ItemType Directory -Force -Path $parentDir | Out-Null
  Write-Host ("created dir -> " + $parentDir)
}
if (-not (Test-Path $SrcAsar)) {
  Write-Error ("src asar missing: " + $SrcAsar)
  exit 1
}
# 复制加重试：即使杀进程后文件锁未立即释放（Windows 句柄回收延迟），也最多重试 5 次（每次 1s）。
$deployOk = $false
for ($i = 0; $i -lt 5; $i++) {
  try {
    Copy-Item -Force $SrcAsar $normalDst -ErrorAction Stop
    $deployOk = $true
    break
  } catch {
    Write-Host ("copy attempt $i failed: " + $_.Exception.Message + " — retrying")
    Start-Sleep -Seconds 1
  }
}
if (-not $deployOk) {
  Write-Error ("FAILED to deploy asar after 5 attempts (file likely still locked)")
  exit 1
}
Write-Host ("deployed -> " + $DstAsar)

# 4) Verify
$item = Get-Item $normalDst
Write-Host ("size=" + $item.Length + " mtime=" + $item.LastWriteTime)
