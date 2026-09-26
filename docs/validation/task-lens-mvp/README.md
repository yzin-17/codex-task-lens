# 一期验证索引：独立、内嵌与验收工具

日期：2026-09-26。当前代码验证基线为 `adea6b8081da0f9c021ca5550936ed8d53922224`。正式任务计数仍为 **20 / 23**；T02／I2／R1 的真实环境与最终审计义务未完成。

## 当前实际执行证据

[CI run 36237278940](https://github.com/yzin-17/codex-task-lens/actions/runs/36237278940) 已通过。该工作流检验 PR #3 上述 head 对应的临时合并提交 `fd7e0a3982faf0996a4cd0f542d1ba99ebf78dc4`。

| 环境 | 结果 |
| --- | --- |
| [macOS job](https://github.com/yzin-17/codex-task-lens/actions/runs/36237278940/job/108391236156) | 冻结安装、lint、typecheck、29 个测试文件／103 项 Vitest 测试、build、22 项浏览器测试通过；无失败重试 |
| [Linux job](https://github.com/yzin-17/codex-task-lens/actions/runs/36237278940/job/108391236286) | 冻结安装、lint、typecheck、核心测试、build 与浏览器验证均通过 |

macOS runner 为 macOS 26.6.2／arm64、Node 24.20.0、pnpm 10.28.2，浏览器由 Playwright 1.58.0 提供。两个平台运行相同用例，不累加为两套功能覆盖；该环境不包含用户的 Codex Desktop 对话。

实际命令：`pnpm install --frozen-lockfile`；`pnpm lint && pnpm typecheck && pnpm test && pnpm build`；`pnpm exec playwright install --with-deps chromium`；`pnpm test:ui`。

## 本轮新增与修复

修复可选、已授权的会话目录无法打开时导致整体启动失败的问题。现在降级为会话线索不可用，目录扫描、手动绑定和本地面板继续工作；修复数据源后重新启动恢复线索。

新增 `pnpm test:mac:acceptance -- --enable --interactive`：隔离临时仓库与绑定，真实 A→B→A 确认，文件生命周期、20 次可见更新采样、50 次工具启停清理、独立降级和分项人工观察。报告区分 measured／operator／mixed，记录原始测量和构建身份，缺项、跳过、失败或 fixture 不可成为完整通过。实现和受控测试详见 [I2-runner](I2-runner.md)。

原有真实 Chromium CDP 回归仍覆盖页面重载、多 pane、歧义身份、原子保存、跨客户端重连与清理。新增测试没有弱化身份或授权校验；验收工具不发送消息、不改写宿主输入和生产 Task 文档。

## 已完成项与剩余门禁

[T01](T01.md)、[T03](T03.md)、[T04](T04.md)、[T05](T05.md)、[T06](T06.md)、[T07](T07.md)、[T08](T08.md)、[T09](T09.md)、[T10](T10.md)、[T11](T11.md)、[T12](T12.md)、[T13](T13.md)、[T14](T14.md)、[T15](T15.md)、[T16](T16.md)、[T17](T17.md)、[T18](T18.md)、[T19](T19.md)、[T20](T20.md)、[I1](I1.md)。既有单项证据中的提交和 run 保留其历史含义，不替换成未实际验证过的结论。

T02 尚需用户实际版本与脱敏输入；[I2](I2.md) 尚需在用户实际 Codex 中运行向导、核对自动测量和人工场景；[R1](R1.md) 已开展预审但不能在必要证据缺失时宣布通过。原 [Spec](../../specs/2026-09-26-task-lens-mvp.md)／[Task](../../tasks/task-lens-mvp.md) 不归档，不削减原有验收范围。

## 历史证据

| 阶段 | 代码基线及 CI | 覆盖 |
| --- | --- | --- |
| 首批独立文档链路 | `06e8c234074dfc9bdf18ac802aeee36779650a56`；[run 36229617979](https://github.com/yzin-17/codex-task-lens/actions/runs/36229617979) | 62 项核心测试；Linux 13 项浏览器测试，含真实文件／进程的 I1 |
| Codex 内嵌实现 | `4f8595bd72a893b408a08f03a80875bdf2f332a0`；[run 36234589984](https://github.com/yzin-17/codex-task-lens/actions/runs/36234589984) | 92 项核心测试；Linux／托管 macOS 各 20 项浏览器测试 |

所有测试数量均为该次运行所含用例，不代表整体工作量百分比。真实 Codex Desktop 的兼容性、宿主交互和目标时延不能从这些受控测试外推。
