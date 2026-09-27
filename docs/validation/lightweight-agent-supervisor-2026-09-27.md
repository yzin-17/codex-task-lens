# 轻量 Agent Supervisor 与退出流程验证（2026-09-27）

## 变更

- supervisor 增加 `agent.control.json` 本地控制通道，支持 `restart` / `stop`。
- macOS：Agent 已运行且 Codex 已退出时，再次双击 App 写入 `restart`，supervisor graceful 停止旧 CLI 后重新启动 CLI；CLI 继续使用 `--launch-codex` 拉起 Codex。
- Windows：检测到活跃 `agent.lock` 时写入同一 `restart` 命令，刷新现有 Agent 而不是创建第二个 supervisor。
- 注入面板新增“设置 → 退出 Task Lens”，必须二次确认；成功 reply 发回 renderer 后才触发 CLI SIGTERM。
- standalone HTTP 面板显式拒绝 shutdown 操作，避免普通本地页面控制后台 Agent 生命周期。

## 自动验证

- lint、typecheck 通过。
- 核心测试：38 个文件 / 139 项通过。
- Playwright：63 项 UI / CDP / standalone 回归通过。
- `agent-supervisor.test.ts`：restart 后 lock PID 不变，CLI 子进程实际重新启动；supervisor SIGTERM 后 lock 删除。
- macOS package / direct-launch smoke 通过。
## 用户 Mac 真实验证

Codex Desktop `26.924.22138`，CDP `127.0.0.1:9341`。

- 在真实注入面板进入“设置”，点击“退出 Task Lens”，再次点击“确认退出”。
- 退出后 `~/Library/Application Support/CodexTaskLens/agent.lock` 被删除，Task Lens Node 进程全部退出。
- Codex 主进程 PID 仍为 `31181`，9341 listener 仍由 Codex / SkyComputerUseService 持有；Task Lens 退出不会关闭 Codex。
- 再次双击 `Codex Task Lens.app` 后出现新 lock（PID `89747`），数秒后页面恢复 `host=true`，触发器为“进度”，设置 Tab 可见。
- 验证期间未修改业务 Task 文档或绑定。

## 退出语义

`设置 → 退出 Task Lens` 的 graceful shutdown 顺序为：

`renderer ack → CLI SIGTERM → runtime.close() → CDP bridge / target lock / SessionRecords / local server / file streams 关闭 → CLI 退出 → supervisor 退出 → agent.lock 删除`。

Codex 自身不属于 Task Lens 生命周期，因此不会被退出动作关闭。

## Release

- `v0.1.0-alpha.9` tag workflow `36315980638` 全部成功，Release ID `397623630`。
- macOS ZIP `627,012` bytes，SHA-256 `b547704360fee71c37aa6d46708c0afe0b6b963653ccafced9cb6fdca3852097`。
- Windows ZIP `303,761` bytes，SHA-256 `b4fab0284883c70280fb742464ace44d2f19bd51743de93f7455c9a76344e471`。
- 用户 Mac 已切到本地 `alpha.9` App：Codex PID 仍为 `31181`，页面验证 `host=true`，Tab 包含“设置”。
