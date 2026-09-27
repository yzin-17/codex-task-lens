# 轻量 Agent 默认发行 Task

- [x] A1：Node host 使用 esbuild bundle 为单文件 Agent，注入 UI/独立 UI 作为静态资产随包分发。
- [x] A2：CLI 平台发现改走通用 macOS/Windows 适配；Windows 文件选择补原生 PowerShell/WinForms 实现。
- [x] A3：新增跨平台 `launcher.mjs`，复用现有设置，默认会话扫描开启，并增加单实例锁与日志。
- [x] A4：macOS `install.command` 创建轻量 `~/Applications/Codex Task Lens.app`；Windows 安装器创建隐藏启动脚本和快捷方式。
- [x] A5：轻量 staging / ZIP 构建与 smoke 已实现；本机 ZIP 约 240 KiB，staging 约 0.75 MiB。
- [x] A6：默认 Release workflow 改为 Agent 包；Electron workflow 降为手动兼容构建，不再随 tag 发布。
- [x] A7：修复单文件 bundle 中 `standalone-runtime` 误判直接入口的问题；smoke 明确拒绝重复启动独立模式。
- [x] G1：CI `36307522717` 的 Ubuntu/macOS 回归全部通过；轻量 Agent workflow `36307522751` 的 macOS/Windows 安装 smoke、package 均通过，安装后的 launcher 不依赖仓库 `node_modules`。用户 Mac 另以实际轻量 launcher 连接 Codex `26.924.22138`，只启动一个 CLI runtime 并成功注入。
- [ ] G2：更新 README / Release 文档，版本升级并发布轻量版，核对 Release 附件与 SHA256。
