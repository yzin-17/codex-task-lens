# 桌面发行台账（6/6）

对应 [Spec](../specs/2026-09-27-desktop-release.md)，基于 PR #3 核心和目标锁，发行实现位于 PR #4。各项独立验证，原一期未完成门禁不自动完成。

- [x] P1：跨平台应用发现、签名／回环／进程校验与正常启动；Windows 负例测试。真实 Windows Codex UI/签名兼容仍保留为环境验收，不用假数据冒充。
- [x] P2：平台数据目录与原生文件操作注入，保持 Mac CLI 数据位置与旧文件选择兼容。
- [x] P3：安全桌面控制台、固定 IPC、单实例、托盘、连接／停止与独立窗口；策略测试及打包窗口启动通过。
- [x] P4：平台打包、白名单资源、自带运行时与实际产物启动测试；macOS arm64/x64、Windows x64 均通过。
- [x] P5：原生 runner 构建、校验和与 GitHub 预发布流程；发布仅在全部检查通过后允许，拒绝覆盖已有版本。
- [x] PG：最终发布附件与 Release 状态核对；六个发行包、三个产物测试报告、SHA256SUMS 共十个附件均 uploaded，预发布已公开且不处于 draft。签名／公证及未测范围在发行说明中保留。

## 验证与发布记录

代码基线 `15feddabca659ef5027bae91a71d974633916020` 的 [Desktop packages 36268137751](https://github.com/yzin-17/codex-task-lens/actions/runs/36268137751) 已完成源码回归、三平台构建和打包程序自检。独立目录与空 PATH 环境中验证控制台／隔离 preload、实际 Markdown 显示、原子文件更新和绑定恢复。

最终发行提交 `b74b5820353975eaf43cef66ef54d86119f10a35` 的 [发布运行 36268605842](https://github.com/yzin-17/codex-task-lens/actions/runs/36268605842) 再次通过源码、三个原生平台打包与运行、同提交报告检查、校验和和发布。已核对 [v0.1.0-alpha.2](https://github.com/yzin-17/codex-task-lens/releases/tag/v0.1.0-alpha.2)，Release ID 397381428，发布时间 2026-09-26T20:16:21Z；target_commitish 与发行提交一致，六个可执行发行包均有非零大小及 GitHub SHA256 digest，三个 JSON 报告与校验文件齐全。当前台账补记不改变已发布二进制，也不覆盖 Release。

用户 Mac 没有被本轮重新部署，远程写入受阻后实现与测试均在仓库／CI 进行。Mac 临时签名未公证，Windows 未签名；Windows 真实 Codex 内嵌与原一期 T02／I2／R1 仍不由本轮自动完成。详见 [验证](../validation/desktop-release-2026-09-27.md)。

## main 后续修订（2026-09-27）

PR #3 / #4 已按用户要求合并，此后直接在 main 实施。桌面包工作流跟随 main 检查/构建，只有新版本标签发布，不再依赖功能分支提交标记。

- [ ] P6：桌面控制台提供「选择会话目录／停用扫描」，接通既有 `sessionRoot` / `allowSessionRead`，测试取消不启用、重启恢复、停用清理及范围隔离。本轮控件/运行时接线写入被工具安全检查拦截，未应用，临时未接线文件已移除。

底层 SessionRecords 和 Task Lens CLI 已支持本地会话路径线索；缺口是桌面入口与参数传递，不是 CLI 或 CDP 的能力限制。不开启此功能仍可扫描已授权项目和手动添加文件；不自动扩展授权，不默认读取真实会话数据。
