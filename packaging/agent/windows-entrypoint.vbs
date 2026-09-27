Option Explicit
Dim shell, fso, base, nodePath, launcherPath, smoke, cmd, p, versionText, lines
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
launcherPath = fso.BuildPath(base, "launcher.mjs")
smoke = shell.Environment("PROCESS")("TASK_LENS_AGENT_SMOKE")

Function Q(value)
  Q = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function

Function FirstExisting(paths)
  Dim i
  For i = 0 To UBound(paths)
    If Len(paths(i)) > 0 And fso.FileExists(paths(i)) Then FirstExisting = paths(i): Exit Function
  Next
  FirstExisting = ""
End Function

Function AgentAlive(lockPath)
  Dim file, text, regex, matches, pid, service, processes
  AgentAlive = False
  If Not fso.FileExists(lockPath) Then Exit Function
  On Error Resume Next
  Set file = fso.OpenTextFile(lockPath, 1, False)
  text = file.ReadAll: file.Close
  Set regex = New RegExp: regex.Pattern = """pid""\s*:\s*([0-9]+)": regex.Global = False
  Set matches = regex.Execute(text)
  If matches.Count = 1 Then
    pid = CLng(matches(0).SubMatches(0))
    Set service = GetObject("winmgmts:\\.\root\cimv2")
    Set processes = service.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE ProcessId=" & pid)
    AgentAlive = (processes.Count > 0)
  End If
  On Error GoTo 0
End Function

Dim localAppData, programFiles, userProfile, candidates, stateDir, lockPath, controlPath, controlFile
localAppData = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%")
programFiles = shell.ExpandEnvironmentStrings("%ProgramFiles%")
userProfile = shell.ExpandEnvironmentStrings("%USERPROFILE%")
candidates = Array(shell.ExpandEnvironmentStrings("%CODEX_TASK_LENS_NODE%"), _
  fso.BuildPath(localAppData, "Volta\bin\node.exe"), _
  fso.BuildPath(programFiles, "nodejs\node.exe"), _
  fso.BuildPath(userProfile, ".volta\bin\node.exe"))
nodePath = FirstExisting(candidates)
If Len(nodePath) = 0 Then
  Set p = shell.Exec("cmd.exe /d /c where node.exe 2>nul")
  Do While p.Status = 0: WScript.Sleep 20: Loop
  If p.ExitCode = 0 Then
    lines = Split(p.StdOut.ReadAll, vbCrLf)
    If UBound(lines) >= 0 Then nodePath = Trim(lines(0))
  End If
End If
If Len(nodePath) = 0 Or Not fso.FileExists(nodePath) Then
  MsgBox "Codex Task Lens 需要 Node.js 22.20+。请先安装 Node.js。", 48, "Codex Task Lens"
  WScript.Quit 1
End If

cmd = Q(nodePath) & " -e " & Q("const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=20)?0:1)")
Set p = shell.Exec(cmd)
Do While p.Status = 0: WScript.Sleep 20: Loop
If p.ExitCode <> 0 Then
  Set p = shell.Exec(Q(nodePath) & " -p " & Q("process.version"))
  Do While p.Status = 0: WScript.Sleep 20: Loop
  versionText = Trim(p.StdOut.ReadAll)
  MsgBox "Codex Task Lens 需要 Node.js 22.20+；当前为 " & versionText & "。", 48, "Codex Task Lens"
  WScript.Quit 1
End If

stateDir = fso.BuildPath(shell.ExpandEnvironmentStrings("%APPDATA%"), "CodexTaskLens")
lockPath = fso.BuildPath(stateDir, "agent.lock")
controlPath = fso.BuildPath(stateDir, "agent.control.json")
If smoke <> "1" And AgentAlive(lockPath) Then
  If Not fso.FolderExists(stateDir) Then fso.CreateFolder(stateDir)
  Set controlFile = fso.CreateTextFile(controlPath, True, False)
  controlFile.Write "{""action"":""restart"",""requestedAt"":" & CStr(DateDiff("s", "01/01/1970 00:00:00", Now())) & "}"
  controlFile.Close
  shell.Popup "Task Lens 已在运行，正在刷新连接；若 Codex 已退出会自动重新启动。", 3, "Codex Task Lens", 64
  WScript.Quit 0
End If

cmd = Q(nodePath) & " " & Q(launcherPath)
If smoke = "1" Then
  Set p = shell.Exec(cmd)
  Do While p.Status = 0: WScript.Sleep 20: Loop
  WScript.StdOut.Write p.StdOut.ReadAll
  WScript.StdErr.Write p.StdErr.ReadAll
  WScript.Quit p.ExitCode
End If
shell.Run cmd, 0, False
shell.Popup "Task Lens 正在启动或已经运行。若 Codex 已经打开但没有出现 Task Lens，请正常退出 Codex 后再次双击本文件。", 4, "Codex Task Lens", 64
