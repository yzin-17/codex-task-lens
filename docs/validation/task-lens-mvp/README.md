# 一期验证索引：独立文档链路

验证日期：2026-09-26。代码基线：`06e8c234074dfc9bdf18ac802aeee36779650a56`。后续本次收尾只更新说明、台账与证据，不把文档提交当作新的产品功能。

## 实际执行证据

[GitHub Actions run 36229617979](https://github.com/yzin-17/codex-task-lens/actions/runs/36229617979)

| 环境与工作 | 结果 | 证据 |
| --- | --- | --- |
| Ubuntu 24.04.5 / x86_64，Node 24.21.0，pnpm 10.28.2 | 冻结安装、lint、typecheck、15 个测试文件／62 项 Vitest 测试、build 通过 | [Linux job](https://github.com/yzin-17/codex-task-lens/actions/runs/36229617979/job/108370166792) |
| GitHub 托管 macOS | 冻结安装、lint、typecheck、核心测试、build 通过；未运行 Codex Desktop | [macOS job](https://github.com/yzin-17/codex-task-lens/actions/runs/36229617979/job/108370166624) |
| Linux Chromium / Playwright 1.58.0 | 13 项浏览器测试全部通过；含 3 项 I1 真实文件与实际进程测试 | Linux job 中 `pnpm test:ui` 步骤 |

实际全量命令：`pnpm install --frozen-lockfile`；`pnpm lint && pnpm typecheck && pnpm test && pnpm build`；Linux 另执行 `pnpm exec playwright install --with-deps chromium` 和 `pnpm test:ui`。下方各任务文件提供定向复现入口；这些定向命令的用例已被上述全量命令执行，不宣称另跑了一轮不存在的结果。

## 已完成项

[T01](T01.md)、[T03](T03.md)、[T04](T04.md)、[T05](T05.md)、[T06](T06.md)、[T07](T07.md)、[T09](T09.md)、[T13](T13.md)、[T14](T14.md)、[T15](T15.md)、[T16](T16.md)、[T17](T17.md)、[I1](I1.md)。任务计数 **13 / 23**，不是工作量完成比例。

## 未完成及不可外推的结论

T02 缺少 [已授权 Mac 的兼容资料](../../compatibility/macos.md)。T08、T10、T11、T12、T18、T19 仍未实现；T20 只有 T17 提供的独立入口可复用，完整 Codex 组合／doctor 未完成。I2、R1 未通过。

本次检查修复了两类实现问题并补回归：共享文件的授权失效后冻结各 monitor 自己的缓存；请求重放与 Markdown 结构展开的内存上限。测试中的 Host 伪造改为真实 HTTP 请求发送，避免 fetch 规范化 Host 导致测试错误。没有弱化授权断言来换取 CI 通过。

局部 UI 测试采用合成契约数据；I1 使用编译后的真实 parser、store、watcher、HTTP 和 React 面板，测试只负责创建／修改临时源文件。运行凭证不写测试 trace 或日志。没有上传私人日志、用户源码或真实对话。

未测得目标 Mac 的更新 p95，也未执行真实 Codex 中的对话切换、注入／卸载、输入与审批兼容验证。因此这不是整个一期的最终 Review 结论；剩余义务仍留在原 [实施台账](../../tasks/task-lens-mvp.md)。
