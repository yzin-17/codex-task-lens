# 轻量 Agent 启动器与 Electron 清理验证（2026-09-27）

## 变更

- Node 运行时约束统一为 `>=22.20.0`，不设置上限；Agent bundle target 为 Node 22。
- 删除 Electron 控制台、electron-builder、tools/desktop、desktop tests、legacy workflow 与对应旧桌面发行文档。
- macOS `.app` 改为 Universal 原生启动壳（arm64 + x86_64），启动 shell/Agent 后立即退出，避免 LaunchServices 吞掉后续双击。
- macOS 增加启动/已运行/缺少 CDP/缺少 Node 等用户可见提示，并将已有 Codex 切到前台。
- 新增 Task Lens 专用深色 + 金色透镜/清单图标；macOS 打包为 `AppIcon.icns`，Windows 包附同源 PNG。

## 本机自动验证

- lint、typecheck、138 项核心测试通过。
- Playwright 62 项 UI / CDP / standalone 回归全部通过。
- macOS agent package / direct-launch smoke 通过。
- `file` / `lipo` 确认 App launcher 同时包含 `x86_64` 与 `arm64`。
- `Info.plist` 使用 `CFBundleIconFile=AppIcon`，包内 `AppIcon.icns` 与源 PNG 均存在。

## CI

- 主 CI `36312619555`：Ubuntu 与 macOS 全部通过。
- Agent workflow `36312619540`：Node 22.20 / 24 验证、macOS Universal App package/direct-launch smoke、Windows package/direct-launch smoke 全部通过。

## 用户 Mac 真实双击验证

Codex Desktop `26.924.22138`，CDP `127.0.0.1:9341`。

- 双击前 Codex PID：`31181`。
- 第一次双击后 Codex PID：`31181`；第二次双击后仍为 `31181`，未重启 Codex。
- Agent lock PID：第一次 `49095`，第二次仍为 `49095`，没有创建第二个长期 Agent。
- App 原生入口进程计数：第一次完成后 `0`，第二次完成后仍为 `0`，LaunchServices 可再次执行 App。
- 最终页面检查：`targets=1`、`host=true`、工具栏触发器为“进度”。
- 验证过程中未修改业务 Task 文档或用户绑定。

## Release

- `v0.1.0-alpha.8` tag workflow `36313949037` 全部成功，Release ID `397611505`。
- macOS ZIP `625,939` bytes；Windows ZIP `302,241` bytes。
- macOS SHA-256 `f3c54b6bd567b5847b83499cca40caeb46bdb0f7edbde75a86ff876f41f7a789`；Windows SHA-256 `13d61b4c39e1663e8c8414d165901e7fec4facdf9dd88fc1380bbf4dcdca264a`。
- 用户 Mac 已切换到本地 `alpha.8` App；日志显示 `CDP 已连接`，随后页面验证 `host=true`、触发器为“进度”。
