Codex Task Lens · Lightweight Agent

默认发行版不包含 Electron / Chromium / Node runtime。
运行要求：Node.js >=22.20.0，以及已安装的 Codex Desktop。

macOS：解压后直接双击“Codex Task Lens.app”。
Windows：解压后直接双击“Codex Task Lens.vbs”。

无需安装步骤、无需创建快捷方式。整个解压目录就是可运行程序；删除该目录即可删除程序本体。
Task Lens 的绑定与设置独立保存在用户数据目录中，不会跟随程序目录删除。

启动器复用 9341 CDP 端口：Codex 未运行时会以仅回环地址的调试端口启动；已有可信 CDP 时直接连接。
如果 Codex 已普通启动但没有 CDP，Task Lens 不会强制退出或重启它；请正常退出 Codex 后再双击 Task Lens。

会话扫描默认启用。若设置了 CODEX_HOME，则优先读取该目录；否则读取用户 Home 下的 .codex。
只读取 sessions / archived_sessions 的路径线索，不读取 auth.json。

对话中明确出现的真实 Task 文档会直接作为候选；点击“添加”才授权读取该文件，最后仍需“确认绑定”。
