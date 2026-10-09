# 新版 Codex 输入区兼容任务

规格：[新版输入区兼容](../specs/2026-10-10-codex-composer-compatibility.md)。基线：`main`，开始时工作区干净；真实 Mac Codex `26.1007.21159`，CDP `9341` 已连接。

## 执行单元

- [x] C1：修复明确输入区内的深层身份查找，并验证边界与工具栏兼容（AC1–AC3）。
  - 修改范围：`src/adapters/codex/dom/selection.ts`、`toolbar.ts`、`tests/ui/embedded.spec.ts`。
  - 输入：只读探测显示标记位于第 11 层，根节点带 `data-codex-composer-root`。
  - 验证：新版深层结构、对话切换、根外标记拒绝、多编辑器及冲突拒绝；类型检查、代码检查、构建。
  - 停止条件：无法证明身份属于当前输入区时保持未识别，不扩大为全页面猜测。
- [x] G1：只重载 Task Lens，检查真实入口、浮窗及绑定完整性（AC4）。
  - 依赖：C1 通过。
  - 不重启 Codex，不发送业务消息，不保存绑定。

## 当前证据

开始前：旧入口已注入但禁用，真实编辑器上方第 1–10 层无标记，第 11 层包含两个同区域标记。远端同步首次受文件系统沙箱限制，提交前需完成同步。

规划核对：C1 的身份查找与工具栏定位共享明确输入区边界，G1 单独负责当前 Mac 的安装和真实验证；验收映射完整，无阻塞问题。

2026-10-10 验证：

- `pnpm typecheck`、`pnpm lint`、`pnpm build`：最终代码通过。
- `pnpm exec playwright test tests/ui/embedded.spec.ts --workers=2`：47 项通过。补充输入区包含关系保护后重建，并定向复跑身份、隐藏标记与隔离场景：10 项通过。
- `pnpm exec vitest run tests/unit/thread-selection.test.ts tests/unit/cdp-world.test.ts tests/integration/cdp-bridge.test.ts`：5 项通过。
- 浏览器依赖置于 `/tmp/task-lens-playwright`，测试使用明确仓库路径和 `PLAYWRIGHT_BROWSERS_PATH`。初次缺浏览器及受沙箱限制的运行未计作通过。分析工具共享工作目录曾发生偏移，偏移结果也未计入验收；最终静态与构建验证明确固定本仓库。
- 只更新 `/Users/yzin/Downloads/Codex Task Lens.app/Contents/Resources/agent/inject/task-lens.js`，未发布新版本；原脚本备份为 `/tmp/task-lens-original-inject-1791570476836.js`。
- 首次正常停止旧 Agent 时清理卡住，已回滚脚本。再次重载在原停止请求之后，对经父进程与路径确认的 Task Lens CLI 补发 `SIGTERM`，随后启动 Downloads 中的 launcher；未终止或启动 Codex。
- 安装脚本与构建产物 SHA-256 均为 `bac8e8ef2b1aaa28ea73139cc978f2e71e6f384fd949993eba428a6e30afec21`；重载前后绑定状态文件校验和相同。
- 真实 Mac Codex `26.1007.21159`：仅有一个 Task Lens 根节点，入口文字“进度”，可见且未禁用；点击后浮窗实际打开，随后关闭，编辑器内容一致。Codex 主进程始终为 `53373`，新 Task Lens supervisor 为 `91273`。
- `git fetch origin` 已通过，开始基线与远端一致；`git diff --check` 通过。

## 最终核对

通过本轮 AC1–AC4。实现和测试覆盖明确输入区边界、有限深度、冲突拒绝、身份切换与工具栏定位；当前实机证明入口与浮窗恢复，用户绑定及输入保持一致。没有剩余阻塞。

真实证据仅覆盖当前 Mac、Codex `26.1007.21159` 与当前窗口；多输入区和 A→B→A 为浏览器回归证据。没有重新宣称全部历史 MVP 验收完成，也没有创建 Release 或覆盖版本标签。旧 Agent 退出清理卡住的根因不属于本轮身份适配范围；仅记录本次重载处理过程。

## 0.1.2 版本发布

用户追加授权：升级版本并推送改动。版本采用补丁号 `0.1.2`，使用新的 `v0.1.2` 标签，不覆盖已有 Release。

- [x] P1：升级 `package.json`，新增中文发布说明，并验证本地 macOS 发行包和直接启动检查。
  - 输入：C1/G1 已通过；`main` 只有本轮已提交修复，远端已同步。
  - 写入：`package.json`、`docs/releases/0.1.2.md`、本任务记录与构建产物。
- [ ] P2：提交并推送 `main`，主分支 CI 与发行包检查通过后推送新标签；检查标签工作流与 Release 附件。
  - 依赖：P1 通过。
  - 验收：`main` 与远端一致，新标签指向经过验证的提交，Release 包含 macOS/Windows 两个 `0.1.2` 发行包，标签工作流成功。

发布核对：范围明确，P1/P2 顺序与版本门禁一致；本机已恢复的真机证据继续有效，不用发布替代产品验收。

P1 证据：`package.json` 与发布说明均为 `0.1.2`；本地 macOS 包构建及 `pnpm test:agent` 通过，隔离目录中的启动器连续启动检查通过。归档大小 `634242` 字节，直接启动报告见 `release/agent-smoke-darwin-arm64.json`（忽略的本地产物）。默认 CommandLineTools SDK 与 Xcode 链接器不兼容，显式使用 Xcode 自带 SDK 后编译通过；图标生成使用允许的系统打包权限完成，未改系统设置。

发布前完整单元／集成复核：38 个测试文件、141 项测试通过。沙箱内首次运行出现一项共享文件监听断言失败；明确仓库路径的非沙箱完整复核通过，远端 CI 仍作为标签前的必要门禁。
