# 桌面会话扫描与文档范围交互 Task

- [x] S1：复用现有 SessionRecords / CLI 契约，在桌面设置中加入可选 `sessionRoot`，补 IPC 白名单、持久化与运行参数映射。
- [x] S2：控制台加入“选择会话目录／停用扫描”，显示启用路径与会话源降级诊断。
- [x] S3：章节范围列表改为 top-layer popover，按视口和确认底栏动态定位。
- [x] S4：已选文档分隔线改为相邻项分隔；单项和末项无底线。
- [x] S5：补策略、运行参数、打包控制台与浏览器交互回归测试。
- [x] G1：Linux/macOS CI、三平台桌面打包与产物 smoke 全部通过。实现提交 `97f49ae`：CI `36298343457`、Desktop packages `36298343453`。
- [x] G2：用户 Mac Codex `26.924.22138` 实测：单文档底边框 `0px`，章节菜单位于 top layer 且 `menuBottom=1230 < footerTop=1292.5`；验证后 `尚无更改`，未修改真实绑定。
- [x] G3：从验证通过的 main 打 `v0.1.0-alpha.4`，Release `397529927` 已核对：6 个桌面发行包、3 个 packaged smoke 报告和 `SHA256SUMS` 共 10 个附件；tag workflow `36298718724` 全部通过。
- [x] S6：桌面会话扫描改为默认启用 `${HOME}/.codex`；旧配置未声明状态时迁移为启用，明确停用后以 `sessionScanEnabled=false` 持久保持关闭。
- [x] S7：候选空状态的“授权项目目录”改为明确按钮；点击切换目录模式、滚动并聚焦路径输入，不自动授权。
- [x] G4：默认启用／持久停用与明显授权按钮已完成：实现 CI `36300566499`、Desktop packages `36300566477` 全通过；用户 Mac `26.924.22138` 已以 `~/.codex` 会话扫描重载并验证 CTA；`v0.1.0-alpha.5` tag workflow `36300925631` 全通过，Release `397541033` 的 6 个桌面包、3 个 smoke JSON 与 `SHA256SUMS` 共 10 个附件已核对。
- [x] S8：适配当前 Codex `custom_tool_call: exec` rollout 包装，解析其中 `tools.exec_command({cmd: ...})` 的 Markdown 字面路径和包装内 `apply_patch` 文件路径；不执行命令、不展开变量／glob。
- [x] G5：当前真实对话 `01a0d8d3…` 已从 rollout 提取目标 `docs/tasks/2026-09-25-multi-source-adjustment-aware-backtest.md`；在显式授权 thesis-ledger 项目目录后候选为 `63/119`，来源含“会话工具命令／会话文件操作／目录扫描”。
