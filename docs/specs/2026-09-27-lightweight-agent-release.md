# 轻量 Agent 默认发行方案

## 背景

当前 GitHub Release 使用 Electron 自包含桌面包。Task Lens 业务代码不足 1 MiB，但 Electron/Chromium 使单个安装包达到约 107–148 MiB。Task Lens 的主要 UI 已通过 CDP 注入 Codex，因此默认发行不需要第二套 Chromium。

## 目标

1. 默认 Release 改为轻量 Agent ZIP，不包含 Electron、Chromium 或 Node runtime。
2. 运行时要求用户已有 Node.js 24.x；安装脚本负责检测版本并创建可双击启动入口，不要求日常手输命令。
3. Agent 继续通过回环 CDP 注入 Codex，默认启用 `~/.codex` 会话扫描并复用现有绑定/设置目录。
4. macOS 与 Windows 使用同一份平台无关 Agent bundle；平台差异只由安装/启动脚本和系统适配层处理。
5. Electron 源码暂时保留为兼容实现，但不再由版本 tag 默认发布。

## 发行结构

`Codex-Task-Lens-<version>-agent.zip` 包含：

- `agent/node/cli/index.mjs`：将 Node host 与生产依赖 bundle 为单文件。
- `agent/inject/`：注入 Codex 的 JS/CSS。
- `agent/ui/`：独立面板静态资源，保留降级能力。
- `launcher.mjs`：读取现有 `desktop-settings.json`，默认启用会话扫描并启动 Agent。
- `install.command`：macOS 安装器，创建 `~/Applications/Codex Task Lens.app` 轻量启动壳。
- `install.cmd` / `install.ps1`：Windows 安装器，创建桌面与开始菜单快捷方式。
## 行为

- 双击 Task Lens 入口时，若可信 CDP 已存在则直接连接；若 Codex 未运行则请求现有 CLI 以回环 CDP 参数启动；若 Codex 已普通运行则不强制退出或重启。
- 会话扫描默认启用；已有设置显式 `sessionScanEnabled=false` 时继续保持关闭，自定义 `sessionRoot`、`workspace`、`appPath`、`port` 继续复用。
- 同一用户只运行一个轻量 launcher；重复启动时不创建第二个 Agent。
- Windows 文件选择使用系统 PowerShell / WinForms 对话框，不依赖 Electron。

## 安全边界

- 不把 Node runtime、Electron、Chromium 打进轻量包。
- CDP 仍只接受经平台校验、仅绑定回环地址且属于可信 Codex 的端点。
- 安装器不强制结束 Codex；升级不删除绑定、会话设置或 Task 文档。
- 会话扫描仍不读取 `auth.json`；Task 文件只有用户点击候选“添加”或手动选择后才获得文件级授权。

## 验收

- Agent bundle 在没有项目 `node_modules` 的环境中执行 `--help` 成功。
- staging 未压缩体积 < 5 MiB；ZIP 体积记录在验证文档中。
- macOS 安装器在临时 HOME 创建有效 `.app`，该 App 在 smoke 模式可启动 launcher。
- Windows 安装器在 CI 临时目录安装成功，且不启动 Codex、不创建真实用户快捷方式。
- Linux/macOS 主 CI 与 macOS/Windows Agent smoke 均通过。
- 新版本 Release 默认只发布轻量 Agent ZIP、校验和与 smoke 报告；Electron 大包不随 tag 自动发布。
