# 实际 Mac：隐藏会话标记识别修复

日期：2026-09-26。代码提交：`fb0cbf0eafabff8c1ba6d0cbed4e9f230a94391c`。
环境：用户授权 Mac，macOS 26.6.2／arm64，Codex 26.924.22138，Node 24.18.0，Corepack pnpm 10.28.2。

## 根因与最小修复

真实页面中有 1 个可见 ProseMirror 输入框与 1 个 `data-above-composer-conversation-id` 标记。标记是无子节点的 DIV，值为合法 UUID，但 CSS 为 `display:none`。标记的父区域可见，只有 1 个对应输入框。旧 `activeMarker` 把元数据节点自身隐藏误判为整个对话不活跃，因此所有采用此布局的对话返回 unknown。

修复只允许这个专用、空 DIV 的自身 `display:none`；没有放行普通隐藏 ID 节点、非空节点、隐藏祖先、非法／冲突 ID 或多个输入区。UUID 校验、局部输入区归属与 generation 隔离不变。不靠窗口标题或最近会话猜测身份。

## 用户 Mac 上实际验证

| 项目 | 修复后的结果 |
| --- | --- |
| 结构 probe | `identifiedPane:true`，退出码 0；修复前为 false／退出码 2 |
| 生产内嵌面板 | 1 个 `.lens-embedded-shell`，无 `.lens-unknown` |
| 当前会话关联 | 机器比较面板的会话标识与当前真实元数据标记，一致；不输出原始 ID |
| 清单入口 | 显示“任务清单 尚未绑定”；存在“绑定 Task 文档”按钮 |
| 可见性 | summary 的上下边界均在当前 viewport 内，不是只存在于 DOM |
| 操作范围 | 只重载 Task Lens 自身，未重启 Codex、未修改宿主输入或业务 Task |

实际执行：`corepack pnpm lint`、`corepack pnpm typecheck`、`corepack pnpm exec vitest run --maxWorkers=2`（30 文件／110 项）、`corepack pnpm build`、`corepack pnpm test:mac -- --enable --probe-only --cdp-port 9341`。只采集允许的结构属性与布尔判断，未保存正文或原始会话 ID。

## 回归与证据边界

`tests/ui/embedded.spec.ts` 新增 7 项：真实结构的最小合成复现、隐藏元数据 A→B→A 绑定与文件同步、4 种隐藏祖先、非空／非法／冲突／普通隐藏标记拒绝、多输入区独立识别。测试页面的 ID 与文字都是合成值，不能充当用户真实多会话切换证据。

此记录证明本次“全都未识别”缺陷已在用户当前对话修复，并已将新版装入实际面板；不代表完整 T02／I2／R1。正式台账保持 20 / 23，仍需完整多会话、日志候选、时延及清理验收。

代码提交的 [CI 36244390507](https://github.com/yzin-17/codex-task-lens/actions/runs/36244390507) 已在 Linux 与托管 macOS 完成：安装、lint、类型检查、核心测试、构建、全部浏览器用例均通过。浏览器回归在 CI 的 Chromium 中执行，不冒充用户 Codex Desktop 的多场景验收。用户 Mac 的浏览器二进制下载停滞，已停止本次下载，不声称本地全量浏览器套件完成。

脱敏结构记录：`tests/fixtures/codex/macos-baseline/hidden-sentinel.json`。其中只保留实际读取的键、标签、样式与数量，不含会话 ID 或截图正文；浏览器测试据此构造合成复现。
