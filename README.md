# Codex Task Lens · 任务透镜

嵌入 Codex 的任务清单面板，让长任务的进展一目了然。

本地读取 Markdown Task 文档，逐项展示 **已完成／未完成**。独立于任何 Skill、Hooks、模型登记命令和 app-server；不修改 Task 文档，不推断代码是否完成，不估算百分比或 ETA。

> Alpha：已提供 macOS CDP 接入、对话识别、内嵌面板与独立浏览器面板。受控 Chromium 的注入测试不等于某个 Codex Desktop 版本的真机验收；实际环境与剩余门禁见 [兼容记录](docs/compatibility/macos.md) 和 [实施台账](docs/tasks/task-lens-mvp.md)。非 OpenAI 官方产品。

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
pnpm doctor -- --cdp-port 9341
pnpm start -- --cdp-port 9341 --workspace "$PWD"
```

`--workspace` 表示明确授权读取该目录内的 Markdown。展开输入区附近的“任务清单”，点击“绑定 Task 文档”后自动查找已授权目录内的候选；预览整份文档或一个章节，确认绑定。以后切换对话时跟随对应绑定，首次选择不会自动替你确认。

不传 `--workspace` 也可在面板中输入文件或目录路径并授权。可用 `--app "/实际路径/Codex.app"` 指定应用。不同 Codex profile 使用不同且固定的 `--source-id`；不要随端口或窗口变化改这个标识。

需要结合当前对话的本地记录查找文档时，显式授权记录目录：

```bash
pnpm start -- --cdp-port 9341 --workspace "$PWD" \
  --session-root "${CODEX_HOME:-$HOME/.codex}" --allow-session-read
```

仅适配已声明的 rollout JSONL 格式与明确文件引用。日志缺失、新格式或路径有歧义时，仍可扫描授权目录、手动绑定；不会猜“最近活动的会话就是当前对话”。

## 独立模式

```bash
pnpm start -- --standalone
# 或开发时构建并启动
pnpm dev:standalone
```

macOS 自动打开本地浏览器面板。可手动选择已有绑定或独立文档；CDP 连接失败不影响这个模式。支持文件实时更新、原子保存、删除重建、章节选择、绑定持久化和源文件打开。

每次运行的浏览器凭证只在内存中使用，不打印到日志。直接刷新或关闭页面后，当前版本需要重新启动工具以重新打开授权入口，文档绑定保留。`--no-open` 适合仅使用内嵌面板；不会输出可复制的带凭证网址。

## 诊断、停止与边界

`pnpm start -- --help` 查看参数；`Ctrl+C` 只停止本工具。没有运行中的 Codex 时，才可显式使用 `--launch-codex` 调试启动；已有实例不会被强退，未知进程占用的端口不会被接管。

**关闭面板或停止 Task Lens 不会关闭 Codex 的 CDP 调试端口。** 需正常退出调试启动的 Codex，再从普通应用入口启动。CDP 的回环地址不是认证边界，同机进程仍可能连接；不要转发到公网或运行不可信的本地程序。

工具只写自己的状态目录（默认 `~/Library/Application Support/CodexTaskLens/`），不写 `.app`、`app.asar`、登录文件或模型配置；不读取 `auth.json`，不上传聊天和文件。不要同时启动多个工具实例接管同一个 Codex renderer。

## 验证与文档

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm exec playwright install chromium
pnpm test:ui
# 在用户授权的 Mac 上只采集脱敏结构，不发送消息或修改对话
pnpm test:mac -- --enable --probe-only --cdp-port 9341
```

最后一条是 **结构探测**，不是 I2 全部验收通过。探测报告保存在忽略提交的 `test-results/`；无授权或无兼容环境时失败，不用跳过冒充成功。完整真机验收操作见 [I2 清单](docs/validation/task-lens-mvp/I2.md)。

- [一期 Spec](docs/specs/2026-09-26-task-lens-mvp.md) · [Task 台账](docs/tasks/task-lens-mvp.md) · [验证索引](docs/validation/task-lens-mvp/README.md)
- [开发与运行说明](docs/development.md) · [适配契约来源](docs/compatibility/adapter-contracts.md) · [后续 TODO](docs/TODO.md)
