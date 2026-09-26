# I2 验收工具实现与受控验证

本文件记录验收工具本身，不是用户 Mac 的真机报告。T02／I2／R1 保留未完成；原台账仍为 20 / 23。

## 实现与实际测试

验证日期：2026-09-26。PR #3 的代码提交 `adea6b8081da0f9c021ca5550936ed8d53922224` 已通过 [CI run 36237278940](https://github.com/yzin-17/codex-task-lens/actions/runs/36237278940)。该 PR 工作流检出其临时合并提交 `fd7e0a3982faf0996a4cd0f542d1ba99ebf78dc4`；两者不混称为同一个 SHA。

| 平台 | 执行结果 | 证据 |
| --- | --- | --- |
| GitHub 托管 macOS 26.6.2／arm64，Node 24.20.0，pnpm 10.28.2 | 冻结安装、lint、typecheck、29 个 Vitest 文件／103 项测试、build、22 项浏览器测试全部通过；本次无失败重试 | [macOS job](https://github.com/yzin-17/codex-task-lens/actions/runs/36237278940/job/108391236156) |
| Ubuntu runner | 冻结安装、lint、typecheck、核心测试、build 与相同浏览器用例均通过 | [Linux job](https://github.com/yzin-17/codex-task-lens/actions/runs/36237278940/job/108391236286) |

实际全量命令：

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm exec playwright install --with-deps chromium
pnpm test:ui
```

实现入口：`src/cli/mac-acceptance.ts`；共享测量／报告／只读观察器：`src/validation/`。向导运行 production runtime，测试临时文档，不复刻一套成功快照。

## 新增用例覆盖

| 入口 | 已验证内容 |
| --- | --- |
| `tests/unit/acceptance-report.test.ts` | 缺项、人工跳过、fixture、脏工作树、测量缺失或清理残留不能成为完整通过；报告脱敏、p95、私有导出 |
| `tests/unit/mac-acceptance-args.test.ts` | 显式授权、交互终端、拒绝接管用户状态或自动启动 Codex |
| `tests/unit/acceptance-document-checks.test.ts` | 中断／超时不转换为成功，临时文件原子写入 |
| `tests/ui/acceptance-checks.spec.ts` | 生产 React 构建＋真实 Chromium CDP＋独立读取客户端，运行同一生命周期和 20 次时延采集函数；不把服务端快照当作 UI，保留宿主测试草稿，清理后无自有根 |
| `tests/standalone/session-fallback.spec.ts` | 可选会话源无法打开时，真实目录候选、绑定和 HTTP 面板仍可用 |

这些用例已包含在上面的实际全量运行，不宣称另跑了不存在的定向命令。最初的中间提交因 ESLint `no-unsafe-finally` 失败，随后把清理提取为独立函数修复；没有关闭规则或跳过断言来换取通过。

## 不能外推的结论

CI 中的 Chromium 页面与对话身份为合成 fixture，原生 CDP、React、文件监听和服务是真实实现。该结果证明验收测量组件与回归场景可运行，**不证明整个交互向导已在用户 Codex Desktop 中跑完**，也不能作为用户 Mac 的更新时延成绩。

完整向导仍需在真实交互终端中运行，用户进行 A/B 首次确认和人工场景观察；缺少日志授权或任何必需场景选择 SKIP，都不能得到完整通过。托管 macOS 的源码和测试编译成功不等于已获取 T02／I2 的环境证据。

实际运行与报告审计要求见 [I2](I2.md)；最终门禁状态见 [R1](R1.md)。
