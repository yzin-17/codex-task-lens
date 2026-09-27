[CmdletBinding()]
param([string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'Programs\CodexTaskLens'), [switch]$NoLaunch, [switch]$SkipShortcuts)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $root 'VERSION') -Raw).Trim()
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw 'Codex Task Lens lightweight agent requires Node.js 24.x.' }
$nodePath = [string]$nodeCommand.Source
$major = & $nodePath -p "process.versions.node.split('.')[0]"
if ([string]$major -ne '24') { throw "Unsupported Node.js major version: $major. Node.js 24.x is required." }
$install = Join-Path $InstallRoot ('runtime\' + $version)
New-Item -ItemType Directory -Force -Path $install | Out-Null
$agentTarget = Join-Path $install 'agent'
if (Test-Path -LiteralPath $agentTarget) { Remove-Item -LiteralPath $agentTarget -Recurse -Force }
Copy-Item -LiteralPath (Join-Path $root 'agent') -Destination $agentTarget -Recurse
$launcher = Join-Path $install 'launcher.mjs'
Copy-Item -LiteralPath (Join-Path $root 'launcher.mjs') -Destination $launcher -Force
$stable = Join-Path $InstallRoot 'launch-agent.ps1'
$nodeLiteral = $nodePath.Replace("'", "''")
$launcherLiteral = $launcher.Replace("'", "''")
$launchScript = "& '$nodeLiteral' '$launcherLiteral'`r`n"
[IO.File]::WriteAllText($stable, $launchScript, [Text.UTF8Encoding]::new($true))
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$quote = [char]34
function New-TaskLensShortcut([string]$Path) {
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = $powershell
  $shortcut.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ' + $quote + $stable + $quote
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
Write-Host "Codex Task Lens $version installed."
Write-Host 'Use the Codex Task Lens shortcut to start the agent and inject the UI into Codex.'
if (-not $NoLaunch) {
  Start-Process -FilePath $powershell -WindowStyle Hidden -ArgumentList @('-NoProfile','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-File',$stable)
}
