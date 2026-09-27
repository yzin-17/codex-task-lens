Codex Task Lens · Lightweight Agent

这是默认发行版，不包含 Electron / Chromium / Node 运行时。
需要：Node.js 24.x，以及已安装的 Codex Desktop。

macOS：双击 install.command。安装后从 ~/Applications/Codex Task Lens.app 启动。
Windows：双击 install.cmd。安装后从桌面或开始菜单的 Codex Task Lens 启动。

启动器会复用 9341 CDP 端口：若 Codex 尚未运行，会以仅回环地址的调试端口启动；若 Codex 已以 CDP 运行，则直接连接。
如果 Codex 已经以普通模式运行，Task Lens 不会强制退出或重启它；请正常退出后再从 Task Lens 入口启动。

默认启用 ~/.codex 会话扫描，只读取 sessions / archived_sessions 中的路径线索，不读取 auth.json。
对话中明确出现的真实 Task 文档可直接作为候选；点击“添加”才授权读取该文件，最终仍需“确认绑定”。

状态和绑定数据保存在 CodexTaskLens 用户数据目录中，升级不会删除现有绑定。
