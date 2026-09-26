# Codex Task Lens · 任务透镜

嵌入 Codex 的任务进度面板：从本地 Markdown 逐项展示已完成／未完成，支持多个文档、章节范围、进度圆环、固定与拖动。独立于 Skill、Hooks 和模型登记命令；不改写 Task 文档，不推断代码是否验收，不估算工作量或 ETA。非 OpenAI 官方产品。

## 下载桌面版

从 [GitHub Releases](https://github.com/yzin-17/codex-task-lens/releases) 下载对应系统的构建，**无需 Node、pnpm、Git 或命令行构建**。目前为 `0.1.0-alpha.2` 预发布，平台与验收边界见 [发行说明](docs/releases/0.1.0-alpha.2.md)。

| 系统 | 附件后缀 | 使用 |
| --- | --- | --- |
| Apple Silicon Mac | `mac-arm64.dmg` / `mac-arm64.zip` | 安装或解压 `.app` 后双击 |
| Intel Mac | `mac-x64.dmg` / `mac-x64.zip` | 安装或解压 `.app` 后双击 |
| Windows x64 | `win-x64-Setup.exe` / `win-x64.zip` | 安装版或完整解压便携目录后运行 EXE |

Mac 尚未完成 Developer ID 签名与 Apple 公证，Windows 未签名，系统可能提示来源未知。不要关闭系统安全保护。Windows 真实 Codex Desktop 的界面／签名兼容尚待单独验收；连接不受支持时仍可使用独立清单。

双击启动后，控制台自动连接已配置端口（默认 9341），提供连接／停止、选择 Codex 应用、选择项目、独立清单和调试启动。关闭控制台后可从菜单栏／托盘返回，退出 Task Lens 才停止监控。

首次从旧脚本版升级，应先停止旧 Task Lens，**不需要退出已有 CDP 的 Codex**。桌面版复用 Mac 的原有绑定数据目录；不会删除锁或强行接管旧实例。之后日常运行只需双击。

## 连接与共存

已有其他 CDP 工具时，填相同的可信本机端口即可。不同工具使用独立连接；Task Lens 不导航、不暂停宿主、不接管网络，只清理自己的面板。新版 Task Lens 使用目标锁，第二个实例不会替换活跃实例；旧版本不支持该协议，不应重复启动。见 [CDP 共存边界](docs/specs/cdp-coexistence.md)。

未开放 CDP 时，先等待任务结束并正常退出 Codex，再点击控制台“调试启动”。该操作会请求明确确认，不强退正在运行的 Codex，不接管未知端口进程。

**退出 Task Lens 不会关闭 Codex 的 CDP 调试端口。** 需正常退出调试启动的 Codex，再从普通入口启动。回环地址不是认证边界，同机程序仍可能连接；不要转发到公网或运行不可信的调试工具。

## 使用任务清单

点击 Codex 输入框工具栏中的“进度”。文档页顶部常驻已选摘要，候选优先展示；手动添加仅分“文件／目录”，文件支持一个或多个绝对路径，每行一个，无需授权复选框。点击“预览文件”才读取所列路径，目录点击“查找文档”后再从候选添加。

最多 16 份 `.md`／`.markdown`，真实路径去重。章节可搜索；点击已选文件名或“管理”调整范围，标签 × 可快速移除。新增／移除／范围调整先进入草稿，底部确认后才更新绑定和进度；取消恢复原绑定，不删除源文件。

清单按文档显示未完成与已完成，两组默认展开。关闭浮窗后进度仍更新，图钉可固定，标题栏可在当前对话区域内拖动。源文件失效时明确标记缓存，不把失败显示成零项成功。

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

需要 Node.js 24.x，pnpm 版本由仓库固定。`--workspace` 是对该目录 Markdown 的明确授权；不传时可在面板选择具体文件。Mac 可用 `--app "/实际路径/Codex.app"` 指定应用；不同 profile 使用不同且固定的 `--source-id`，不要随端口变化修改。

可选会话记录仅在明确传入 `--session-root "${CODEX_HOME:-$HOME/.codex}" --allow-session-read` 时读取。日志缺失、未知格式和路径歧义时仍可扫描授权目录、手动绑定；不猜最近活动会话就是当前页面。

独立源码模式使用 `pnpm start -- --standalone` 或 `pnpm dev:standalone`。CLI 浏览器凭证只在内存中使用，刷新后可能需要重新打开本次授权入口；桌面版独立窗口的 Ctrl/Cmd+R 会重新使用内存入口，不把凭证写入日志。

## 验证与构建桌面包

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:desktop && pnpm build
pnpm exec playwright install chromium
pnpm test:ui
# 开发者打包：目标须与本机匹配
npm ci --prefix tools/desktop --ignore-scripts
node scripts/generate-icons.mjs
pnpm build:desktop -- --mac --arm64
pnpm test:package
```

Windows 使用 `--win --x64`，Intel Mac 使用 `--mac --x64`。依赖锁固定在 `tools/desktop/package-lock.json`；Release workflow 在三个原生 runner 上打包并测试实际可执行文件。只有产物测试和校验和检查都通过才可发布。

实际 Codex 验收入口仍为 `pnpm test:mac -- --enable --probe-only --cdp-port 9341`（只读预检）和 `pnpm test:mac:acceptance -- --enable --interactive --cdp-port 9341`（交互向导）。先停止 Task Lens，保留 Codex 运行；跳过场景不算通过。CI 的受控 Chromium 与打包自检均不能替代真实账号／多窗口／侧聊验收。

## 文档

- [桌面发行 Spec](docs/specs/2026-09-27-desktop-release.md) · [发行任务](docs/tasks/desktop-release.md) · [产物验证](docs/validation/desktop-release-2026-09-27.md)
- [一期 Spec](docs/specs/2026-09-26-task-lens-mvp.md) · [原实施台账](docs/tasks/task-lens-mvp.md) · [后续 TODO](docs/TODO.md)
- [开发与运行](docs/development.md) · [Mac 兼容记录](docs/compatibility/macos.md) · [适配契约](docs/compatibility/adapter-contracts.md)
- [工具栏／多文档修订台账](docs/tasks/toolbar-multidoc.md) · [文档页验证](docs/validation/task-lens-mvp/document-manager-2026-09-27.md)
- [I2 向导](docs/validation/task-lens-mvp/I2.md) · [I2 工具测试](docs/validation/task-lens-mvp/I2-runner.md) · [R1 状态](docs/validation/task-lens-mvp/R1.md) · [原验证索引](docs/validation/task-lens-mvp/README.md)
