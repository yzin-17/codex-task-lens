# 实际 Mac 预检：2026-09-26

通过已授权的 Remote Desktop Commander 在用户 Mac 上执行，不是托管 runner。受测代码：`5cc859b4d77cc45f98ba707d82cb69783aef8a36`。

| 项目 | 实际结果 |
| --- | --- |
| macOS／架构 | 26.6.2（25G83）／arm64 |
| Node／项目 pnpm | 24.18.0／10.28.2（通过 Corepack；未修改系统全局版本） |
| Codex | 26.924.22138；`com.openai.codex`；`/Applications/ChatGPT.app` |
| 应用身份 | 实际调用 `inspectApp`，应用包和可执行文件签名校验通过 |
| CDP | 当前主进程无调试参数、无 TCP 监听；指定端口 9341 无监听 |
| 项目诊断 | `corepack pnpm run doctor -- --cdp-port 9341` 明确报告没有 CDP 监听，退出码 1 |

## 本机执行与修复

冻结安装成功；`corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm exec vitest run --maxWorkers=2`（29 个文件／103 项）、`corepack pnpm build` 全部通过。

`corepack pnpm exec playwright test tests/standalone/doctor-entry.spec.ts --workers=1 --reporter=list`：1 项命令入口回归通过；该用例不启动浏览器，未把它记成全量浏览器或 Codex UI 验收。

1. 原 `pnpm doctor` 命中了 pnpm 内建命令，没有运行项目诊断；运行说明、帮助和错误提示已改为 `pnpm run doctor`，回归直接验证包管理器脚本分发和参数传递。
2. Playwright webServer 原本再次查找系统 `pnpm`，在当前 Volta 11.9.0／Corepack 10.28.2 组合下失败；改为当前 Node 直接执行项目 Vite，不修改全局工具、不放宽版本约束。
3. 一次全量复跑暴露文件权限测试时序问题：`chmod` 与已有读取交错，先合法产生 `unstable`，再异步产生权限错误。测试改为等待最终状态，并额外断言缓存任务总数仍为 1；未改产品行为、未增重试或固定睡眠。修正后完整核心套件通过。

参考：[pnpm 10 doctor](https://pnpm.io/10.x/cli/doctor)、[pnpm run 同名命令规则](https://pnpm.io/10.x/cli/run)。

## 剩余边界

尚未采集真实 Codex DOM、A/B 切换、会话路径结构或内嵌更新时延；未读取认证文件或对话正文，未强退、重启或注入当前 Codex。普通启动没有 CDP，不能执行 I2。需用户在任务结束后正常退出并调试启动，再继续原验收场景。

[T02 兼容基线](../../compatibility/macos.md) 仅补齐版本／应用身份；[I2](I2.md) 与 [R1](R1.md) 仍未通过。正式台账维持 **20 / 23**，不以预检或新增回归数增加完成项。
