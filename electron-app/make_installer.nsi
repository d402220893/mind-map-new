Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"

; ---------- 基本信息 ----------
Name "思绪思维导图"
OutFile "E:\03_学习文件\mind-map-main\electron-app\dist-electron\思绪思维导图 Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\思绪思维导图"
RequestExecutionLevel user
SetCompressor /SOLID zlib

!define APPID "com.mindmap.app"
!define VERSION "1.0.7"
!define UNINST "Uninstall 思绪思维导图.exe"

; ---------- MUI 页面（安装页须先于语言宏） ----------
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"

; ---------- 安装段 ----------
Section "Install"
  SetOutPath "$INSTDIR"

  ; 自动卸载旧版本（同 appId/同安装目录），实现覆盖安装免手动卸载
  ; 注意：不要加 _?=$INSTDIR，否则卸载器会在 $INSTDIR 原地运行、删不掉自身，
  ;       导致重装后目录里缺文件（表现为“打不开”）。去掉后卸载器会自拷贝到临时目录，
  ;       可完整删除旧目录；再补一次 RMDir 清掉残留的旧卸载器 exe。
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPID}" "UninstallString"
  ${If} $0 != ""
    ExecWait '$0 /S'
    RMDir /r "$INSTDIR"
  ${EndIf}

  ; 复制应用（win-unpacked 的全部内容，不含 win-unpacked 自身目录）
  File /r "E:\03_学习文件\mind-map-main\electron-app\dist-electron\win-unpacked\*.*"

  ; 写卸载程序
  WriteUninstaller "$INSTDIR\${UNINST}"

  ; 卸载注册表
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPID}" "DisplayName" "思绪思维导图"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPID}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPID}" "UninstallString" '"$INSTDIR\${UNINST}" /S'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPID}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPID}" "Publisher" "思绪思维导图"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPID}" "DisplayIcon" "$INSTDIR\思绪思维导图.exe"

  ; 快捷方式
  CreateShortcut "$DESKTOP\思绪思维导图.lnk" "$INSTDIR\思绪思维导图.exe"
  CreateShortcut "$SMPROGRAMS\思绪思维导图.lnk" "$INSTDIR\思绪思维导图.exe"
SectionEnd

; ---------- 卸载段 ----------
Section "Uninstall"
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\思绪思维导图.lnk"
  Delete "$SMPROGRAMS\思绪思维导图.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPID}"
SectionEnd
