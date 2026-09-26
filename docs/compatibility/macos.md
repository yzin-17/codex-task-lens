# macOS 兼容记录

## 当前结论

用户已在 2026-09-26 的需求讨论中确认 Mac CDP 可行性验证通过；该反馈没有包含 macOS／架构／Codex 版本和本项目运行结果。保留这个前提，不反复要求重做路线验证，也不推断具体版本。

本项目已按 [上游源码与合成输入契约](adapter-contracts.md) 实现并测试平台校验、会话记录 adapter、DOM 识别、CDP bridge 和内嵌 UI。**这些代码的完成不等于 T02 的用户环境基线或 I2 的 Codex Desktop 真机验收已通过。**

| 环境／证据 | 作用 | 不证明的内容 |
| --- | --- | --- |
| GitHub Actions 的 Linux／托管 macOS + Node 24 + 受控 Chromium | 构建、文件流、独立 UI、真实 CDP 的协议和内嵌组件测试 | 用户的 Codex 版本与实际对话布局兼容 |
| 用户先前反馈的 CDP 验证 | 技术路线已有可行输入 | 本项目全部功能已验收 |
| 用户环境的 `mac-probe` 报告 | 实际版本、签名、监听归属和可识别 pane 的脱敏结构 | 候选语义、完整交互、时延、权限恢复或整体 I2 通过 |

当前没有可公开宣称完整通过的 Codex Desktop 版本组合；T02／I2／R1 保持待验收。

## 补录真实基线

在已开放端口的 Mac 上构建后执行，不退出或重启 Codex：

```bash
pnpm run doctor -- --cdp-port 9341
pnpm test:mac -- --enable --probe-only --cdp-port 9341
```

必要时追加 `--app "/实际路径/应用.app"`。probe 不调用发送、输入、恢复会话或修改配置接口，也不读取本地对话日志。它在单独的只读探测 world 中读取候选 DOM 结构，不挂载 UI。`test-results/mac-probe-*.json` 含系统／架构／Codex 版本、应用身份、已校验端点状态、允许的元素类型与属性名；会话 ID 用单次随机盐哈希，不输出原始 ID、正文、绝对私人路径或登录凭据。报告不自动上传。

T02 还需要在两个实际对话、首页／歧义场景中确认选择器行为，以及已授权记录中 `session_meta`／`turn_context`／文件引用事件的脱敏结构。只提交必要的键结构与合成路径，不提交整份聊天、`auth.json`、API Key 或真实项目正文。

经确认的资料放入 `tests/fixtures/codex/macos-baseline/`，同时记录实际版本和采集时间。已有 `contract-baseline/` 是合成 fixture，不得改名充当用户实测样例。

## 接入边界

Bundle 标识、签名团队和 CDP target 形状以 `adapter-contracts.md` 中的来源为当前合同。若签名／布局变化，先核对新来源与实际报告，再修改 adapter 和测试；不能通过允许任意进程、任意 renderer、忽略冲突 ID 或读取宿主 React 私有对象绕过失败。

正式验收入口与剩余场景见 [I2](../validation/task-lens-mvp/I2.md)。
