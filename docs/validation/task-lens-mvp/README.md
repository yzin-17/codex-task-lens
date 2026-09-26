# 一期验证索引：独立与 Codex 内嵌实现

日期：2026-09-26。当前代码基线 `4f8595bd72a893b408a08f03a80875bdf2f332a0`；任务计数 **20 / 23**，不是工作量百分比。T02／I2／R1 仍未完成。

## 当前实际执行证据

[CI run 36234589984](https://github.com/yzin-17/codex-task-lens/actions/runs/36234589984)：Linux 与托管 macOS 均通过冻结安装、lint、typecheck、26 个测试文件／92 项核心测试、build、20 项浏览器测试。两个平台运行相同用例，不重复累加为两套功能覆盖。

- [verify (ubuntu-latest)](https://github.com/yzin-17/codex-task-lens/actions/runs/36234589984/job/108383952416)：全部必要步骤通过。
- [verify (macos-latest)](https://github.com/yzin-17/codex-task-lens/actions/runs/36234589984/job/108383952504)：全部必要步骤通过。

托管 macOS 测试环境为 macOS 26.6.2／arm64、Node 24.20.0、pnpm 10.28.2、Playwright 1.58.0／Chromium 145.0.7632.6。它不是用户的实际 Codex 环境，不能作为 Codex Desktop 版本声明。

实际命令：`pnpm install --frozen-lockfile`；`pnpm lint && pnpm typecheck && pnpm test && pnpm build`；`pnpm exec playwright install --with-deps chromium`；`pnpm test:ui`。各单项记录中的定向命令是复现入口，用例已在此全量运行中执行。

## 已完成项

[T01](T01.md)、[T03](T03.md)、[T04](T04.md)、[T05](T05.md)、[T06](T06.md)、[T07](T07.md)、[T08](T08.md)、[T09](T09.md)、[T10](T10.md)、[T11](T11.md)、[T12](T12.md)、[T13](T13.md)、[T14](T14.md)、[T15](T15.md)、[T16](T16.md)、[T17](T17.md)、[T18](T18.md)、[T19](T19.md)、[T20](T20.md)、[I1](I1.md)。

## 本轮修复与覆盖

内嵌链路使用真实 Chromium CDP，而不是仅 mock 一个成功响应。覆盖确认绑定、原子保存、A→B→A、多 pane、未知身份、源文本安全、独立降级和编译后 CLI。已修复跨 CDP 客户端重连产生孤立 world／双面板的问题；恢复时清理旧 module 的 root／observer／timer。另修复 CLI 打印就绪信息与关停处理安装顺序的竞态，以及晚到初始快照覆盖新推送。

会话 adapter 拒绝索引后文件改成越权链接和过多记录中猜测唯一会话；候选 UI 自动查找已授权范围，但仍要求用户确认绑定。没有弱化身份或文件授权断言以换取绿色测试。

## 剩余门禁

T02：用户实际版本与脱敏输入基线；[I2](I2.md)：实际 Codex Desktop 场景、时延和清理证据；R1：完整门禁通过后的最终审计。已提供不读取正文／登录文件的 probe，不假装自动完成所有真机检查。原 Spec／Task 不归档。

## 前一阶段历史证据


[GitHub Actions run 36229617979](https://github.com/yzin-17/codex-task-lens/actions/runs/36229617979)

| 环境与工作 | 结果 | 证据 |
| --- | --- | --- |
| Ubuntu 24.04.5 / x86_64，Node 24.21.0，pnpm 10.28.2 | 冻结安装、lint、typecheck、15 个测试文件／62 项 Vitest 测试、build 通过 | [Linux job](https://github.com/yzin-17/codex-task-lens/actions/runs/36229617979/job/108370166792) |
| GitHub 托管 macOS | 冻结安装、lint、typecheck、核心测试、build 通过；未运行 Codex Desktop | [macOS job](https://github.com/yzin-17/codex-task-lens/actions/runs/36229617979/job/108370166624) |
| Linux Chromium / Playwright 1.58.0 | 13 项浏览器测试全部通过；含 3 项 I1 真实文件与实际进程测试 | Linux job 中 `pnpm test:ui` 步骤 |

实际全量命令：`pnpm install --frozen-lockfile`；`pnpm lint && pnpm typecheck && pnpm test && pnpm build`；Linux 另执行 `pnpm exec playwright install --with-deps chromium` 和 `pnpm test:ui`。下方各任务文件提供定向复现入口；这些定向命令的用例已被上述全量命令执行，不宣称另跑了一轮不存在的结果。
