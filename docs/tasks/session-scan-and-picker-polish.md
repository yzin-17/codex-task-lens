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
- [ ] G4：新增默认启用／持久停用、明显授权按钮的完整 CI、三平台打包、用户 Mac 实测与新 Release 核对。
