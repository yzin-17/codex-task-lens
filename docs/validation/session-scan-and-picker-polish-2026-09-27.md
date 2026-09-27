# 会话扫描与章节范围交互验证（2026-09-27）

实现提交：`97f49ae789030896101ec8ba72207b5ffa2095a0`。

## 自动验证

- 本机：lint、typecheck、134 项核心测试、4 项桌面策略/运行参数测试和生产构建通过。
- CI `36298343457`：Ubuntu 与 macOS 全部通过，包含完整浏览器/CDP 回归。
- Desktop packages `36298343453`：macOS arm64、macOS x64、Windows x64 构建及实际打包程序 smoke 全部通过。
- 打包 smoke 校验控制台 preload 暴露固定的会话目录选择/停用方法，并验证控制台对应元素存在；外部 Node/pnpm 不参与运行。

## 用户 Mac 实测

Codex Desktop `26.924.22138`，CDP 9341。验证前确认 Task Lens 没有未确认草稿，只重载 Task Lens，未重启 Codex。

- 单个已选文档：`borderBottomWidth = 0px`。
- 章节范围菜单：实际 `:popover-open=true`，菜单底部 1230，固定确认底栏顶部 1292.5，菜单完整位于底栏之上。
- 测试后变更摘要为“尚无更改”；未选择章节、未保存绑定、未修改 Task 文件。

## 保留边界

会话扫描在桌面控制台中默认关闭，仅在用户选择会话目录后启用。读取范围仍由 SessionRecords 限制为 `sessions/` 与 `archived_sessions/`；Task 文档必须另行授权。
