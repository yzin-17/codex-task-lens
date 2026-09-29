# 轻量 Agent 默认发行方案

## 背景

早期 GitHub Release 使用 Electron 自包含桌面包。Task Lens 业务代码不足 1 MiB，但 Electron/Chromium 使单个安装包达到约 107–148 MiB。Task Lens 的主要 UI 已通过 CDP 注入 Codex，因此当前发行改为纯轻量 Agent，并已移除旧 Electron 代码。

## 目标

1. 默认 Release 使用轻量 Agent，不包含 Electron、Chromium 或 Node runtime。
2. 运行时要求 Node.js >=22.20.0，不设置上限；当前没有 Node 24 专属运行时能力。最低版本由稳定的全局 WebSocket 与 `path.matchesGlob` 能力决定，并在 Node 22.20 CI 中验证。
3. Agent 继续通过回环 CDP 注入 Codex；会话目录优先采用绝对路径 `CODEX_HOME`，否则使用用户 Home 下的 `.codex`，并复用现有绑定/设置目录。
4. macOS 与 Windows 分别构建独立 ZIP；两者共用平台无关 Agent bundle，但直接启动入口不同。
5. 解压即用：macOS ZIP 直接包含 `.app`，Windows ZIP 直接包含隐藏 `.vbs` 启动器，不再运行安装脚本或创建快捷方式。
6. 删除旧 Electron 源码、依赖、测试与 workflow；仓库只保留轻量 Agent 发行链路。
7. 带预发布后缀的版本标签创建 prerelease；正式版本标签创建最新稳定 Release，并拒绝覆盖同名 Release。

## 发行结构

- `Codex-Task-Lens-<version>-mac.zip`：直接包含 `Codex Task Lens.app`。App 内置轻量 shell 入口、`launcher.mjs`、Agent bundle 与注入静态资产；解压后直接双击。
- `Codex-Task-Lens-<version>-windows.zip`：直接包含 `Codex Task Lens.vbs`、`launcher.mjs`、Agent bundle 与注入静态资产；解压后直接双击 VBS，后台隐藏启动。
- `agent/node/cli/index.mjs`：将 Node host 与生产依赖 bundle 为单文件。
- `agent/inject/`：注入 Codex 的 JS/CSS。
- `agent/ui/`：独立面板静态资源，保留降级能力。
- `launcher.mjs`：读取现有 `desktop-settings.json`，优先 `CODEX_HOME`，默认启用会话扫描并启动 Agent。
## 行为

- 双击 Task Lens 入口时，若可信 CDP 已存在则直接连接；若 Codex 未运行则请求现有 CLI 以回环 CDP 参数启动；若 Codex 已普通运行则不强制退出或重启。
- 会话扫描默认启用；已有设置显式 `sessionScanEnabled=false` 时继续保持关闭，自定义 `sessionRoot`、`workspace`、`appPath`、`port` 继续复用。
- 同一用户只运行一个轻量 launcher；重复启动时不创建第二个 Agent。
- launcher 作为长期 supervisor：CLI 子进程退出则 supervisor 退出；收到 SIGINT/SIGTERM 时先请求 CLI graceful shutdown，再删除 lock。
- supervisor 监听用户状态目录中的本地 control 文件。Agent 已运行但 Codex 已退出时，再次双击入口写入 `restart` 命令；supervisor 正常终止旧 CLI 后重新启动它，从而重新拉起 Codex，supervisor PID 与 lock 不变化。
- 内嵌面板提供 `设置 → 退出 Task Lens`，必须二次确认；退出只停止 Task Lens 的 CDP bridge、watcher、本地 server 与 supervisor，不关闭 Codex。
- Windows 文件选择使用系统 PowerShell / WinForms 对话框，不依赖 Electron。

## 安全边界

- 不把 Node runtime、Electron、Chromium 打进轻量包。
- CDP 仍只接受经平台校验、仅绑定回环地址且属于可信 Codex 的端点。
- 直接启动入口不强制结束 Codex；替换解压目录不会删除独立存放的绑定、会话设置或 Task 文档。
- 会话扫描仍不读取 `auth.json`；Task 文件只有用户点击候选“添加”或手动选择后才获得文件级授权。

## 验收

- Agent bundle 在没有项目 `node_modules` 的环境中执行 `--help` 成功。
- staging 未压缩体积 < 5 MiB；ZIP 体积记录在验证文档中。
- macOS ZIP 中的 `.app` 可直接运行 launcher；Windows ZIP 中的 `.vbs` 可直接隐藏运行 launcher，无安装/复制步骤。
- supervisor control 测试覆盖：`restart` 保持同一 lock PID 并拉起新 CLI；SIGTERM graceful stop 后删除 lock。
- 内嵌退出必须先收到成功 reply，再触发 Agent shutdown；退出后 Codex 进程与 CDP listener 保持运行，重新双击可恢复注入。
- Node 22.20 与 Node 24 均通过 Agent bundle 验证；macOS/Windows 原生 smoke 使用最低支持版本 Node 22.20。
- Linux/macOS 主 CI 与 macOS/Windows Agent smoke 均通过。
- 新版本 Release 只发布 macOS 与 Windows ZIP；CI 校验两平台 smoke 报告，但不将报告或校验和作为 Release 附件；Electron 大包不随 tag 自动发布。
