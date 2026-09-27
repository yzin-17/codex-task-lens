# 默认会话扫描与项目授权 CTA 验证（2026-09-27）

实现提交：`4a5830f4463c86b36035c0a9fc7906d226029cb7`。

## 自动验证

- 本机：lint、typecheck、134 项核心测试、4 项桌面策略/运行参数测试与生产构建通过。
- CI `36300566499`：Ubuntu / macOS 全部通过，包含新增“授权项目目录”交互的浏览器回归。
- Desktop packages `36300566477`：macOS arm64、macOS x64、Windows x64 打包和 packaged smoke 全部通过。
- 桌面运行参数测试覆盖：缺省扫描启用并解析到 `~/.codex`、自定义目录、显式停用后 `allowSessionRead=false`。
- policy 测试覆盖旧配置缺省迁移为启用、非法状态拒绝；packaged smoke 覆盖控制台默认启用状态和会话控制 API。

## 用户 Mac 实测

Codex Desktop `26.924.22138` 保持运行，CDP 9341 不变。仅停止旧 Task Lens 进程并以：
`--session-root /Users/yzin/.codex --allow-session-read --no-open`
重载源码版 Task Lens。

候选区无项目授权时：
- “授权项目目录”按钮存在，class 为 `lens-authorize-workspace`。
- 点击后“目录”模式为 `aria-checked=true`。
- 本地绝对路径输入框获得焦点。
- 变更摘要仍为“选择并预览后确认”，没有提交绑定或修改 Task 文件。

## 边界

桌面版默认扫描会话记录，不等于默认读取任何 Task 文档；候选文件仍必须处于单独授权的文件/项目目录范围。用户明确停用后持久保持关闭。
