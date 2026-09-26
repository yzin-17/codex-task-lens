# Codex Task Lens · 任务透镜

嵌入 Codex 的任务清单面板，让长任务的进展一目了然。

本地读取 Markdown Task 文档，逐项展示 **已完成／未完成**。独立于任何 Skill、Hooks、模型登记命令和 app-server；不修改 Task 文档，不推断代码是否完成，不估算百分比或 ETA。

> Alpha：已提供 macOS CDP 接入、对话识别、内嵌面板与独立浏览器面板。受控 Chromium 测试不等于某个 Codex Desktop 版本的真机验收；实际环境与剩余门禁见 [兼容记录](docs/compatibility/macos.md) 和 [实施台账](docs/tasks/task-lens-mvp.md)。非 OpenAI 官方产品。

## 安装与构建

需要 Node.js 24.x，pnpm 版本由仓库固定。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
```

## 在 Codex 内使用

连接你已开放的本机 CDP 端口，不会自动退出或重启 Codex：

```bash
pnpm run doctor -- --cdp-port 9341
pnpm start -- --cdp-port 9341 --workspace "$PWD"
```

`--workspace` 表示明确授权读取该目录内的 Markdown。点击输入框底部左侧、权限按钮之后的「任务」入口，以浮窗查看清单。入口显示已完成／总数，关闭浮窗仍自动更新，不撑高输入区。首次点击「绑定 Task 文档」，在「文档」中添加文件、明确授权并预览，最后确认绑定；以后切换对话自动跟随各自绑定。

支持一份或多份 `.md`／`.markdown`：可点击「选择文件…」使用 macOS 文件多选，也可在路径框每行输入一个绝对路径。最多 16 份，重复的实际文件不重复计数；每份可选择整篇或章节。新增、移除先进入草稿，确认整组后才保存；取消不修改原绑定。浮窗按文件列出未完成、已完成项；某份异常不阻塞其他文档。

不传 `--workspace` 也可在面板中输入文件或目录路径并授权。可用 `--app "/实际路径/Codex.app"` 指定应用。不同 Codex profile 使用不同且固定的 `--source-id`；不要随端口或窗口变化改这个标识。

需要结合当前对话的本地记录查找文档时，显式授权记录目录：

```bash
pnpm start -- --cdp-port 9341 --workspace "$PWD" \
  --session-root "${CODEX_HOME:-$HOME/.codex}" --allow-session-read
```

仅适配已声明的 rollout JSONL 格式与明确文件引用。日志缺失、无法打开、新格式或路径有歧义时，仍可扫描授权目录、手动绑定；不会猜“最近活动的会话就是当前对话”。已授权目录初始化失败会显示降级诊断，不再导致整个工具退出；修复数据源后重新启动恢复线索。

## 独立模式

```bash
pnpm start -- --standalone
# 或开发时构建并启动
pnpm dev:standalone
```

macOS 自动打开本地浏览器面板。可手动选择已有绑定或独立文档；CDP 连接失败不影响这个模式。支持文件实时更新、原子保存、删除重建、章节选择、绑定持久化和源文件打开。

每次运行的浏览器凭证只在内存中使用，不打印到日志。直接刷新或关闭页面后，当前版本需要重新启动工具以重新打开授权入口，文档绑定保留。`--no-open` 适合仅使用内嵌面板；不会输出可复制的带凭证网址。

## 绑定数据升级

本版将绑定存储升级为 schema v2。旧单文件绑定读取为一项数组，保留身份、范围和版本；只在下一次成功保存时写入新格式。回退旧版本前须备份状态目录；旧二进制不能读取 v2，不应手动删除状态来绕过错误。

## 诊断、停止与边界

`pnpm start -- --help` 查看参数；`Ctrl+C` 只停止本工具。没有运行中的 Codex 时，才可显式使用 `--launch-codex` 调试启动；已有实例不会被强退，未知进程占用的端口不会被接管。

**关闭面板或停止 Task Lens 不会关闭 Codex 的 CDP 调试端口。** 需正常退出调试启动的 Codex，再从普通应用入口启动。CDP 的回环地址不是认证边界，同机进程仍可能连接；不要转发到公网或运行不可信的本地程序。

工具只写自己的状态目录（默认 `~/Library/Application Support/CodexTaskLens/`），不写 `.app`、`app.asar`、登录文件或模型配置；不读取 `auth.json`，不上传聊天和文件。不要同时启动多个工具实例接管同一个 Codex renderer。

## 验证

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm exec playwright install chromium
pnpm test:ui
# 只读结构探测
pnpm test:mac -- --enable --probe-only --cdp-port 9341
```

结构探测不代表 I2 完整通过。需要实际验收时，先停止 Task Lens（保留 Codex 运行），在干净工作树的交互终端执行：

```bash
pnpm build
pnpm test:mac:acceptance -- --enable --interactive --cdp-port 9341
```

向导创建独立临时仓库、两个 worktree 和 Task 文档，引导 A→B→A 真实面板绑定；自动测试文件生命周期、20 次可见更新时延、50 次工具启停清理与独立降级。侧聊、宿主操作等场景逐项记录人工 PASS／FAIL／SKIP；跳过不算通过。可选日志来源授权与完整步骤见 [I2 向导说明](docs/validation/task-lens-mvp/I2.md)。

报告保存在 `test-results/mac-acceptance-*/report.json` 和 `report.md`，包含原始测量、版本、构建指纹与脱敏身份，不含正文或凭证。不自动上传、不修改日常绑定、不勾选 Task；验收向导只修改它创建的临时文件。受控 CI 验证向导功能，不冒充用户 Mac 结果。

## 文档

- [一期 Spec](docs/specs/2026-09-26-task-lens-mvp.md) · [Task 台账](docs/tasks/task-lens-mvp.md) · [验证索引](docs/validation/task-lens-mvp/README.md)
- [开发与运行说明](docs/development.md) · [适配契约来源](docs/compatibility/adapter-contracts.md) · [后续 TODO](docs/TODO.md)
- [I2 验收向导](docs/validation/task-lens-mvp/I2.md) · [验收工具测试](docs/validation/task-lens-mvp/I2-runner.md) · [R1 状态](docs/validation/task-lens-mvp/R1.md)

- [工具栏浮窗与多文档修订台账](docs/tasks/toolbar-multidoc.md) · [修订验证](docs/validation/task-lens-mvp/toolbar-multidoc-2026-09-26.md)
