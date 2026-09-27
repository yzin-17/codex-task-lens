@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 (
  echo.
  echo Codex Task Lens 安装失败。请检查上方提示。
  pause
  exit /b 1
)
exit /b 0
