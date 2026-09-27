# 轻量 Agent 发行验证（2026-09-27）

## 实现提交

- `ffd70857bc0d974c217c23c3c5e4a64311d2cfab`：默认发行切换为轻量 Agent、跨平台安装器与 Windows 文件选择。
- `5230cb5d3742611df03a6d6d3b9897e8b986e8dd`：PowerShell 5.1 兼容修复。
- `54f1cfc2e7a65b70051f5fb281917a6aafef81ad`：单文件 bundle 入口判定修复。

## 体积

在用户 Mac 上以 `alpha.6` 版本号生成轻量包：

- Agent staging：`751,613` bytes（约 0.72 MiB）。
- ZIP：`245,276` bytes（约 240 KiB）。
- 业务 Agent 核心资产：约 480 KiB，Release 不包含 Electron、Chromium、Node runtime 或 `node_modules`。

最终 `alpha.6` ZIP 大小需在 tag workflow 后以 GitHub Release 附件再次记录。

## 自动验证

- 本机 Node 24.18.0：lint、typecheck、138 项核心测试通过。
- macOS 本机安装 smoke：临时 HOME 创建有效 `Codex Task Lens.app`，Info.plist 校验通过，安装后 launcher smoke 成功。
- CI `36307522717`：Ubuntu/macOS 完整测试通过。
- Agent workflow `36307522751`：macOS arm64 与 Windows x64 安装 smoke 全部通过；Windows 使用 PowerShell 5.1 安装路径。
## 用户 Mac 真机

Codex Desktop `26.924.22138`，CDP `127.0.0.1:9341`。

- 停止源码 CLI 后，直接运行 staged 轻量 `launcher.mjs`。
- launcher 只派生一个 bundled CLI；修复后日志不再出现 standalone runtime 的额外启动/参数错误。
- bundled CLI 成功连接现有 Codex CDP，并重新注入工具栏“进度”入口。
- 使用与旧桌面版相同的 `~/Library/Application Support/CodexTaskLens/` 状态目录，未清空或重建用户绑定。
- 验证未重启 Codex、未发送消息、未修改业务 Task 文档。

## 保留边界

- 轻量默认发行把 Node 24.x 作为用户环境前置依赖；这是体积从 100+ MiB 降至几百 KiB 的主要交换条件。
- macOS 安装入口由本地脚本生成轻量 `.app` 壳，不是 Developer ID 签名应用；不要通过关闭系统安全功能绕过来源提示。
- 旧 Electron workflow 仅手动运行，不参与版本 tag 默认发布。
