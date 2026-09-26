# 开发与运行说明

## 构建产物

使用 `package.json` 与冻结的 `pnpm-lock.yaml`，不安装浮动依赖。

| 产物 | 用途 |
| --- | --- |
| `dist/node/cli/index.js` | 构建后的 CLI，组合独立或 Codex runtime |
| `dist/node/cli/mac-probe.js` | 显式启用的 Mac 只读结构探测 |
| `dist/ui/` | 本机浏览器独立面板 |
| `dist/inject/task-lens.js`、`task-lens.css` | 实际 React 内嵌产物，不是构建占位 |

`pnpm build` 构建三种产物；浏览器测试必须在构建后执行。`pnpm dev:standalone` 每次先构建，不是持续热更新服务器。浏览器开发 fixture 的 Vite 服务仅用于受控测试，不用于读取用户真实文件。

## 分层与数据链路

`core / contracts` 不依赖 Codex。`LensService` 组合授权、解析、存储、发现和文件监听；本机 HTTP 与 CDP bridge 只提供不同传输，两种 UI 复用组件和同一个服务。

```text
已授权文件 → 真实文件流 → LensService → 独立 HTTP 面板
                                  └→ CDP bridge → 每个 pane 的 Shadow DOM
当前会话 → 可选记录 adapter → 明确路径线索 ─→ 候选发现
```

Codex 接入在已验证应用的主 renderer 中建立 `CodexTaskLens` 隔离 world。主页面脚本拿不到该 world 的随机 binding 函数与 nonce；请求同时验证连接所属 context、nonce、pane、generation 和监控身份。非当前 generation 的回复不能修改新对话。源码文档仅作为文本渲染。

刷新、重连、页面重建会清理旧订阅。重新接管同一个工具 world 时先销毁前一份 renderer 实例，避免旧 React root／observer／timer 堆叠。源文件仍被其他监控绑定时，保留共享文件流；不能把“关闭一个 pane”误当作取消其他绑定。

## CLI 参数

| 参数 | 意义 |
| --- | --- |
| `--standalone` | 只启动独立模式，不能混用 Codex 参数 |
| `--cdp-port 9341` | 连接经过本机进程与回环校验的端点 |
| `--app /absolute/App.app` | 指定应用，由 Info.plist 定位真实可执行文件并校验签名 |
| `--launch-codex` | 明确请求启动；已有实例或占用端口时拒绝，不强退 |
| `--workspace /absolute/project` | 明确授权 Markdown 扫描根目录，不包含符号链接逃逸 |
| `--session-root /absolute/codex --allow-session-read` | 明确授权可选会话记录 adapter；不扫描认证存储 |
| `--source-id name` | 稳定的 profile 身份，默认 `codex-default`；同一数据源以后沿用，同一工具不要把不同 profile 合并命名 |
| `--data-dir /absolute/state` | 工具状态目录；不改变源文档位置 |
| `--port 18441` | 指定独立 HTTP 端口；省略由系统分配 |
| `--no-open` | 不自动打开浏览器，不打印认证凭证 |

当 `--app`／`--workspace`／会话记录参数出现时，会进入 Codex 组合模式，CDP 端口未指定则用 9341。无任何 Codex 参数时默认独立模式。

配置目录使用 JSON 原子持久化和单写入者锁。应用正常退出释放锁；遇到损坏状态不覆盖原文件。日志仅输出安全的终端诊断，不另建包含私人路径、对话正文或端点凭证的日志文件。

## 本地记录支持边界

只枚举授权根的 `sessions/` 与 `archived_sessions/` 中 `rollout-*.jsonl`。先按文件名缩小候选，再验证记录内部 `session_meta.payload.id`，从 `session_meta`／`turn_context` 的明确 cwd 解析相对路径。

当前支持 Markdown 链接、反引号内的明确 `.md` 路径、`apply_patch` 文件头，以及 `exec_command / shell_command` 中受限的单个 `cat / head / tail` 字面路径。不会执行命令，也不解释 `cd`、管道、变量、命令替换或完整 shell 语法。未知格式只返回不可用／诊断，由手动路径和目录扫描兜底。

单条记录限制 1 MiB，每次每文件最多读取 4 MiB，半行等待补全，超限行跳过；索引有数量限制。大记录未读完时显示增量读取提示，重新查找继续，不把部分结果标为完整。多份匹配记录无法确定唯一性时拒绝猜测。文件被替换为链接或越出授权路径时拒绝读取。

日志授权不会自动授权工作目录或文档；`--workspace` 或 UI 授权是独立的确认。文件候选出现不等于绑定，绑定必须用户确认。

## 常见问题

**端点不可连接：** 运行 `pnpm doctor -- --cdp-port 9341`。检查实际端口、应用路径和是否调试启动。Task Lens 不会通过退出／循环重启 Codex 修复问题。等待正在执行的工作结束后，用户自行正常退出，再明确启动调试实例。

**端点可信但没有面板：** 检查是否进入了可识别的主对话页面。辅助窗口、侧聊歧义或未知布局可能不提供安全挂载点；不要改成“取最后一个 UUID”来绕过。运行只读 Mac probe，参考 [兼容记录](compatibility/macos.md)。

**文档存在但无候选：** 检查授权根、扫描规则和记录格式；可以直接输入绝对路径。无结果不意味着该对话没有 Task 文档。

**页面刷新失去认证：** 当前浏览器凭证不持久化，重启工具重新打开；原绑定保留。不要为方便使用而移除 Host／Origin 或 token 检查。

**停止后 Codex 仍监听调试端口：** 这是 Codex 的启动参数生命周期，不是 Task Lens 的 HTTP 服务未释放。完全退出调试启动的 Codex，并从普通应用入口重开。

## 验证分层

`pnpm test` 为核心与适配契约测试；`pnpm test:ui` 在受控 Chromium 中使用真实文件、服务与 CDP，其中也运行编译后的 CLI。CI 的 Linux 和托管 macOS 都执行这些测试，但不拥有用户的实际 Codex 会话，因此不代替 I2。

`pnpm test:mac -- --enable --probe-only ...` 只采集实际 Mac 的签名／端点与脱敏 DOM 识别结果。省略 `--probe-only` 时，入口不会把这部分结果冒充完整验收：写报告后以 2 退出，等待 [I2 的实际场景证据](validation/task-lens-mvp/I2.md)。无授权／环境错误为非零退出；只有正式补齐 I2 证据后才可勾选门禁。
