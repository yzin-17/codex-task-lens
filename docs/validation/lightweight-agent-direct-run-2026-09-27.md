# 轻量 Agent 分平台直接运行验证（2026-09-27）

## 实现

- `4f4c595b1ee3f3af29545cdeaac700bb05317db0`：Node 22.20+ 支持、`CODEX_HOME`、macOS/Windows 分包、解压后直接运行。

## Node 运行时

- Node 24 不是功能硬需求。
- Agent bundle target 已下调到 Node 22。
- Agent workflow `36309267794` 在 Node `22.20.0` 与 Node `24` 上均完成 lint/typecheck/core tests/build-agent/CLI help 验证。
- 原生 macOS / Windows package smoke 均使用 Node `22.20.0`。

## 会话目录

- `desktop-settings.json` 的显式 `sessionRoot` 最高优先。
- 未显式配置时，优先绝对路径 `CODEX_HOME`；否则使用 `os.homedir()/.codex`。
- Windows 默认因此解析为当前用户 Home 下 `.codex`，通常为 `%USERPROFILE%\.codex`。

## 直接运行

- macOS ZIP 内直接包含 `Codex Task Lens.app`；无需安装器。CI 与用户 Mac 均直接运行 App 成功。
- Windows ZIP 内直接包含 `Codex Task Lens.vbs`；CI 使用 `cscript.exe` 调用同一入口完成 smoke，普通双击使用 `wscript` 隐藏启动。
- 两个平台都不复制程序文件、不创建快捷方式；绑定与设置仍独立保存在 CodexTaskLens 用户数据目录。
