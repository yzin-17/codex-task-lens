[CmdletBinding()]
param([string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'Programs\CodexTaskLens'), [switch]$NoLaunch, [switch]$SkipShortcuts)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $root 'VERSION') -Raw).Trim()
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { throw 'Codex Task Lens 轻量版需要 Node.js 24.x，请先安装 Node.js。' }
$major = & $node.Source -p 'process.versions.node.split(".")[0]'
if ([string]$major -ne '24') { throw "当前 Node.js $major.x 不受支持，需要 Node.js 24.x。" }
$install = Join-Path $InstallRoot ('runtime\' + $version)
New-Item -ItemType Directory -Force -Path $install | Out-Null
$agentTarget = Join-Path $install 'agent'
if (Test-Path -LiteralPath $agentTarget) { Remove-Item -LiteralPath $agentTarget -Recurse -Force }
Copy-Item -LiteralPath (Join-Path $root 'agent') -Destination $agentTarget -Recurse
Copy-Item -LiteralPath (Join-Path $root 'launcher.mjs') -Destination (Join-Path $install 'launcher.mjs') -Force
$stable = Join-Path $InstallRoot 'launch-hidden.vbs'
$nodePath = $node.Source.Replace('"','""')
$launcherPath = (Join-Path $install 'launcher.mjs').Replace('"','""')
$vbs = @"
Set shell = CreateObject("WScript.Shell")
shell.Run Chr(34) & "$nodePath" & Chr(34) & " " & Chr(34) & "$launcherPath" & Chr(34), 0, False
"@
[IO.File]::WriteAllText($stable, $vbs, [Text.UTF8Encoding]::new($false))

function New-TaskLensShortcut([string]$Path) {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = (Join-Path $env:SystemRoot 'System32\wscript.exe')
  $shortcut.Arguments = '"' + $stable + '"'
  $shortcut.WorkingDirectory = $install
  $shortcut.IconLocation = (Join-Path $env:SystemRoot 'System32\shell32.dll') + ',167'
  $shortcut.Save()
}
if (-not $SkipShortcuts) {
  $desktop = [Environment]::GetFolderPath('Desktop')
  $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  New-Item -ItemType Directory -Force -Path $startMenu | Out-Null
  New-TaskLensShortcut (Join-Path $desktop 'Codex Task Lens.lnk')
  New-TaskLensShortcut (Join-Path $startMenu 'Codex Task Lens.lnk')
}
Write-Host "Codex Task Lens $version 已安装。"
Write-Host '以后双击桌面或开始菜单中的 Codex Task Lens 即可；界面直接注入 Codex。'
Write-Host '默认扫描 %USERPROFILE%\.codex 的会话路径线索，不读取 auth.json。'
if (-not $NoLaunch) { Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\wscript.exe') -ArgumentList ('"' + $stable + '"') }
