@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
set "BASH="
REM auto-locate PortableGit bash under WorkBuddy managed binaries (version-agnostic)
for /d %%G in ("%USERPROFILE%\.workbuddy\binaries\PortableGit\versions\*") do (
  if exist "%%G\bin\bash.exe" set "BASH=%%G\bin\bash.exe"
)
if not defined BASH (
  where bash >nul 2>&1 && set "BASH=bash"
)
if not defined BASH (
  echo [ERROR] bash.exe not found. Install Git for Windows or check WorkBuddy PortableGit path.
  pause
  exit /b 1
)
echo Using bash: %BASH%
"%BASH%" build_now.sh
if errorlevel 1 (
  echo [BUILD FAILED] see build_now.log for details
) else (
  echo [BUILD OK]
)
pause
