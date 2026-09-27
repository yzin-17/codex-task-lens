# Codex Task Lens · 任务透镜

嵌入 Codex 的任务进度面板：从本地 Markdown 逐项展示已完成／未完成，支持多个文档、章节范围、进度圆环、固定与拖动。独立于 Skill、Hooks 和模型登记命令；不改写 Task 文档，不推断代码是否验收，不估算工作量或 ETA。非 OpenAI 官方产品。

## 下载轻量版

从 [GitHub Releases](https://github.com/yzin-17/codex-task-lens/releases) 按系统下载：macOS 使用 `Codex-Task-Lens-<version>-mac.zip`，Windows 使用 `Codex-Task-Lens-<version>-windows.zip`。默认发行版**不捆绑 Electron / Chromium / Node runtime**，需要本机已有 **Node.js 22.20+**；不需要 pnpm、Git 或源码构建。

| 系统 | 解压后直接运行 |
| --- | --- |
| macOS | 双击 `Codex Task Lens.app` |
| Windows | 双击 `Codex Task Lens.vbs` |

没有安装步骤，也不会额外创建 App 或快捷方式。解压目录本身就是可运行程序；后台 Agent 是单文件 Node bundle，主要界面继续通过 CDP 注入 Codex。

启动入口默认使用本机回环端口 9341，并默认启用 Codex 会话扫描：若存在绝对路径 `CODEX_HOME` 则优先使用，否则读取当前用户 Home 下的 `.codex`（Windows 通常是 `%USERPROFILE%\.codex`）。已有 `desktop-settings.json` 中的端口、应用路径、项目目录、会话目录及显式“停用扫描”设置继续复用。若 Codex 已普通启动且没有 CDP，Task Lens 不会强制退出或重启它；正常退出 Codex 后再从 Task Lens 入口启动即可。

旧 Electron 桌面实现已删除，项目只保留轻量 Agent 发行链路。旧绑定和状态目录继续复用，不需要重新绑定文档。

### 启动流程

- Codex **没运行**：双击 Task Lens → 启动轻量 Agent → Agent 用仅回环 CDP 参数启动 Codex → 注入 Task Lens；不需要用户再重启一次。
- Codex **已经以 Task Lens/CDP 模式运行**：双击后直接复用现有 Codex，并把 Codex 切到前台；不会重启。
- Codex **已经普通运行、没有 CDP**：现有进程无法事后追加 Electron/Chromium 调试参数。Task Lens 不会强制重启它；macOS 会明确弹窗提示，用户正常退出 Codex 后再双击 Task Lens 即可。
- Task Lens **已经运行**：再次双击会刷新现有 Agent 与 Codex 的连接；Codex 已退出时会由现有 supervisor 重启 CLI 并重新拉起 Codex，不创建第二个长期 Agent。
- 需要退出时：面板 `设置 → 退出 Task Lens → 确认退出`。它会正常释放 CDP bridge、文件监听、本地 server 与 lock，但不会关闭 Codex；之后再次双击 App 即可恢复。

## 连接与共存

已有其他 CDP 工具时，填相同的可信本机端口即可。不同工具使用独立连接；Task Lens 不导航、不暂停宿主、不接管网络，只清理自己的面板。新版 Task Lens 使用目标锁，第二个实例不会替换活跃实例；旧版本不支持该协议，不应重复启动。见 [CDP 共存边界](docs/specs/cdp-coexistence.md)。

未开放 CDP 时，先等待任务结束并正常退出 Codex，再从 `Codex Task Lens` 入口启动。启动器会请求现有 CLI 以仅回环 CDP 参数启动 Codex；运行中的普通 Codex 不会被强退或接管。

**退出 Task Lens 不会关闭 Codex 已开放的 CDP 调试端口。** 需正常退出调试启动的 Codex，再从普通 Codex 入口启动即可关闭该端口。回环地址不是认证边界，同机程序仍可能连接；不要转发到公网或运行不可信的调试工具。

## 使用任务清单

点击 Codex 输入框工具栏中的“进度”。当前对话中明确出现、且真实存在的 `docs/tasks/**`、`tasks/**` 或 `TASKS.md` 会优先列为“待授权”候选；候选阶段只检查精确文件是否存在，不读取正文、不扫描父目录。点击候选“添加”即授权读取这一份文件并生成预览，最后仍需确认绑定。手动添加继续支持“文件／目录”。

最多 16 份 `.md`／`.markdown`，真实路径去重。章节可搜索；点击已选文件名或“管理”调整范围，标签 × 可快速移除。新增／移除／范围调整先进入草稿，底部确认后才更新绑定和进度；取消恢复原绑定，不删除源文件。

清单按文档显示未完成与已完成，两组默认展开。关闭浮窗后进度仍更新，同时取消固定并清除拖动位置，下次打开重新锚定进度入口；图钉可固定，标题栏可在当前对话区域内拖动。章节范围列表使用顶层浮层，会根据可用空间向上或向下展开，不被文档滚动区或确认底栏裁切。源文件失效时明确标记缓存，不把失败显示成零项成功。

工具只写自己的应用数据目录。Mac 默认 `~/Library/Application Support/CodexTaskLens/`，Windows 默认 `%APPDATA%/CodexTaskLens/`。不修改 Codex 应用包，不读取 `auth.json`，不上传聊天或文件。绑定存储为 schema v2，旧 v1 自动兼容读取；回退旧二进制前需备份，不能删状态绕过错误。

## 源码开发

以下仅面向开发者，桌面包用户不需要执行。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm run doctor -- --cdp-port 9341
pnpm start -- --cdp-port 9341 --workspace "$PWD"
```

运行轻量 Agent 要求 Node.js >=22.20.0；源码构建与 CI 的 pnpm 版本由仓库固定。`--workspace` 是对该目录 Markdown 的明确授权；不传时可在面板选择具体文件。Mac 可用 `--app "/实际路径/Codex.app"` 指定应用；不同 profile 使用不同且固定的 `--source-id`，不要随端口变化修改。

轻量 Agent 默认启用本地会话扫描，并复用 `desktop-settings.json` 中的自定义会话目录或显式停用状态。源码 CLI 仍保留显式参数：`--session-root "${CODEX_HOME:-$HOME/.codex}" --allow-session-read`。日志缺失、未知格式和路径歧义时仍可手动绑定；不猜最近活动会话就是当前页面。

独立源码模式使用 `pnpm start -- --standalone` 或 `pnpm dev:standalone`。CLI 浏览器凭证只在内存中使用，刷新后可能需要重新打开本次授权入口；桌面版独立窗口的 Ctrl/Cmd+R 会重新使用内存入口，不把凭证写入日志。

## 验证与构建发行包

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm exec playwright install chromium
pnpm test:ui

# 默认轻量发行：单文件 Node Agent + 注入资产
pnpm package:agent
pnpm test:agent
```

轻量 staging 有 5 MiB 硬上限，版本 Release 的 ZIP 也在 CI 中检查体积；macOS 与 Windows runner 会实际执行直接启动 smoke，确认 launcher 不依赖仓库 `node_modules`。Electron 自包含发行链路已经删除。

实际 Codex 验收入口仍为 `pnpm test:mac -- --enable --probe-only --cdp-port 9341`（只读预检）和 `pnpm test:mac:acceptance -- --enable --interactive --cdp-port 9341`（交互向导）。先停止 Task Lens，保留 Codex 运行；跳过场景不算通过。CI 的受控 Chromium 与打包自检均不能替代真实账号／多窗口／侧聊验收。

## 文档

- [轻量 Agent 发行 Spec](docs/specs/2026-09-27-lightweight-agent-release.md) · [实施任务](docs/tasks/2026-09-27-lightweight-agent-release.md)
- [一期 Spec](docs/specs/2026-09-26-task-lens-mvp.md) · [原实施台账](docs/tasks/task-lens-mvp.md) · [后续 TODO](docs/TODO.md)
- [开发与运行](docs/development.md) · [Mac 兼容记录](docs/compatibility/macos.md) · [适配契约](docs/compatibility/adapter-contracts.md)
- [工具栏／多文档修订台账](docs/tasks/toolbar-multidoc.md) · [文档页验证](docs/validation/task-lens-mvp/document-manager-2026-09-27.md)
- [I2 向导](docs/validation/task-lens-mvp/I2.md) · [I2 工具测试](docs/validation/task-lens-mvp/I2-runner.md) · [R1 状态](docs/validation/task-lens-mvp/R1.md) · [原验证索引](docs/validation/task-lens-mvp/README.md)
