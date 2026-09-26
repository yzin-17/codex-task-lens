# Codex Task Lens · 任务透镜

看清已经完成什么，还有什么待完成。

> 当前交付：**独立本地文档监控面板**，一期台账 **13 / 23**。已完成真实文件、绑定、监听、浏览器清单闭环；**尚未实现 Codex 内嵌面板和自动跟随当前对话**。原一期范围未缩减，Mac/CDP 后续任务继续保留。

## 现在能做什么

选择普通 Markdown 任务文档，明确授权并预览整份文档或一个标题章节，再确认绑定。面板把未完成项放在上方、已完成项放在下方，两组默认展开，显示具体事项、原文详情、源行号和 `已完成 / 总项数`。

外部编辑勾选后自动更新；支持编辑器原子保存、重启恢复、文件删除与重建。源不可用时保留带明确标识的缓存，不把缓存说成当前有效进度。不同独立监控可以绑定不同文档，也可共享同一实际文件。

不依赖任何 Skill、Hooks、模型登记命令或 app-server；不修改 Task 文档、Codex 配置或应用包，不发送消息，不推测任务正在做什么。整体工作量、百分比与 ETA 不属于一期。

## 在 Mac 上运行独立面板

需要 Node.js **24.x**；项目固定 pnpm **10.28.2**。在已包含本实现的分支中执行：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev:standalone
```

命令构建并启动本地服务，在 macOS 上打开默认浏览器。选择“选择文档”，输入文件绝对路径，确认只读授权，预览计数范围后点击“确认绑定”。选择项目目录时会扫描默认任务目录；没有候选仍可直接输入文件路径。当前使用路径输入，不包含原生文件选择器。

已经构建过时：

```bash
pnpm start -- --standalone
# 独立测试数据目录和指定本地端口：
pnpm start -- --standalone --data-dir "$HOME/Library/Application Support/CodexTaskLens-Test" --port 9342
```

`Ctrl+C` 停止本工具，不停止或重启 Codex。正常使用不需要开放 Codex 的 CDP 端口。

访问凭证通过首次打开的 URL fragment 交给页面后立即从地址栏清除，只存在内存中。**直接刷新页面不会保留凭证**；当前源码版可停止工具后重新启动，自动重新打开已授权入口，文档绑定仍保留。不要分享最初的带凭证地址。`--no-open` 用于程序化集成／测试，不会把凭证打印到日志；程序可通过 `startStandalone()` 的返回值取得入口。

## 数据与安全边界

工具状态只写入 `~/Library/Application Support/CodexTaskLens/`，可用 `--data-dir` 指定其他绝对路径。单文件授权不会自动扩大成父目录授权；目录读取经过 realpath 检查，不跟随越权符号链接。状态文件使用原子替换和单写入者锁。损坏状态会保留原件并报错；恢复前先停止工具、备份数据目录，不能删除不明进程的锁或覆盖原文件。

本机 API 只监听 `127.0.0.1`，要求运行凭证以及准确的 Host／Origin。源文件操作只接受已绑定的授权路径，系统打开使用固定程序和参数数组，不执行文档中的命令、HTML、远程图片或 JavaScript 链接。工具不是抵抗已取得本机账户权限的恶意软件的安全边界。

默认源上限：2 MiB、5,000 个叶子任务、50,000 行、10,000 个标题、单标题 512 字符。解析展开后的数据和扫描也有大小／数量边界；超限显示明确错误或扫描不完整提示，不静默截断为完成。文件大小与叶子数只是上限，不是所有极端组合均能解析的保证。

## 开发和验证

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:ui
```

Node 产物在 `dist/node/`，独立面板在 `dist/ui/`。`dist/inject/task-lens.js` **目前仅为构建占位产物**，不具备注入功能。`--cdp-port`、`doctor`、`test:mac` 入口尚未实现，不要以构建成功判断 Codex 接入完成。

已验证代码基线 `06e8c234074dfc9bdf18ac802aeee36779650a56`：Linux 与 GitHub 托管 macOS 的 lint／typecheck／62 项核心测试／build 均通过，Linux Chromium 的 13 项浏览器测试通过，其中包含真实文件和实际服务进程重启。托管 macOS 核心测试**不等于用户 Mac 上的 Codex Desktop 真机验收**，详见 [验证索引](docs/validation/task-lens-mvp/README.md)。

## 接下来的接入工作

先按 [Mac 兼容资料交接](docs/compatibility/macos.md) 完成 T02，补录用户已经验证过的版本和脱敏结构样例，再实施会话记录、可信端点、CDP／DOM adapter、bridge 和内嵌面板。不能用猜测的 DOM 字段或托管 CI 代替真实兼容基线。

- [一期 Spec](docs/specs/2026-09-26-task-lens-mvp.md)
- [实施台账与剩余任务](docs/tasks/task-lens-mvp.md)
- [后续 TODO](docs/TODO.md)

非 OpenAI 官方产品。当前实现未复制参考项目的源码、主题或美术资源。
