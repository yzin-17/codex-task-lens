# 轻量 Agent 默认发行 Task

- [x] A1：Node host 使用 esbuild bundle 为单文件 Agent，注入 UI/独立 UI 作为静态资产随包分发。
- [x] A2：CLI 平台发现改走通用 macOS/Windows 适配；Windows 文件选择补原生 PowerShell/WinForms 实现。
- [x] A3：新增跨平台 `launcher.mjs`，复用现有设置，默认会话扫描开启，并增加单实例锁与日志。
- [x] A4：完成 macOS / Windows 轻量双击入口；A11 进一步取消安装复制流程，改为 ZIP 内直接运行。
- [x] A5：轻量 staging / ZIP 构建与 smoke 已实现；本机 ZIP 约 240 KiB，staging 约 0.75 MiB。
- [x] A6：默认 Release workflow 改为 Agent 包；Electron workflow 降为手动兼容构建，不再随 tag 发布。
- [x] A7：修复单文件 bundle 中 `standalone-runtime` 误判直接入口的问题；smoke 明确拒绝重复启动独立模式。
- [x] G1：CI `36307522717` 的 Ubuntu/macOS 回归全部通过；轻量 Agent workflow `36307522751` 的 macOS/Windows 安装 smoke、package 均通过，安装后的 launcher 不依赖仓库 `node_modules`。用户 Mac 另以实际轻量 launcher 连接 Codex `26.924.22138`，只启动一个 CLI runtime 并成功注入。
- [x] G2：`v0.1.0-alpha.6` 已发布；tag workflow `36308068069` 全部通过。Release `397577408` 仅含轻量 Agent ZIP（`239,618` bytes）、macOS/Windows smoke JSON 与 `SHA256SUMS`，无 Electron 大包；ZIP SHA-256 `b86639923e5eb195565acedcc8c5440c889bddfe5716a67b9b491c4e3c9efeb2`。
- [x] A8：移除 Node 24 专属限制；Agent bundle target 下调到 Node 22，并将支持范围明确为 Node 22.20+ / 24.x。
- [x] A9：默认会话目录优先读取绝对路径 `CODEX_HOME`，否则使用用户 Home 下 `.codex`；Windows 即通常的 `%USERPROFILE%\.codex`。
- [x] A10：默认发行拆成 `-mac.zip` 与 `-windows.zip`，不再使用单一跨平台 `-agent.zip`。
- [x] A11：去掉安装器与快捷方式创建流程；macOS ZIP 直接提供 `.app`，Windows ZIP 直接提供隐藏 `.vbs` 启动器。
- [x] G3：实现提交 `4f4c595`：Agent workflow `36309267794` 的 Node 22.20 / 24 验证、macOS `.app`、Windows `.vbs` 直接启动 smoke 全部通过；主 CI `36309267790` 的 Ubuntu/macOS 回归通过。用户 Mac 另以解压后的 `.app` 直接连接 Codex `26.924.22138` / CDP 9341 成功。
- [ ] G4：发布下一版分平台轻量 Release，核对两份 ZIP、smoke 与 SHA256。
