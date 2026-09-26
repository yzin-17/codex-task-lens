# 适配契约与真机证据分层

2026-09-26 继续实施：不再让“未取得用户 Mac 资料”阻塞所有宿主代码的编译与局部验证。产品范围没有缩减，T02／I2 仍需实际环境证据。

- T08／T10／T12 可依下列已核对的上游源码约定实现和测试；T11／T18／T19／T20 可消费局部验证通过的契约。
- 合成 DOM、会话记录及 Chromium CDP 只证明适配器对声明输入的行为，不证明某个 Codex Desktop 版本兼容。T02 仍未完成；任何“支持的 Codex 版本”须以 test:mac 产物与 I2 记录为依据。
- 新建安全的 `doctor` 与 `test:mac` 入口以补录实际环境；不读取认证文件、不要求上传完整对话、不反复重启 Codex。

## 可核对的输入依据

1. DOM 会话属性：JiaYang-BUAA/Codex-Desktop-Usage-Monitor-Windows `scripts/current-thread.mjs`，blob `ff908be23da3f07461d3d3664270b608bbd6920d`。https://github.com/JiaYang-BUAA/Codex-Desktop-Usage-Monitor-Windows/blob/main/scripts/current-thread.mjs
2. macOS bundle `com.openai.codex`、签名团队 `2DC432GLL2` 与 `open --args`：Fei-Away/Codex-Dream-Skin `macos/scripts/common-macos.sh`，blob `f81d8668e45b05aee0fe940ebdb9ad5154e72f22`。https://github.com/Fei-Away/Codex-Dream-Skin/blob/34335d27d54300eccb325cc652f6c93fef428b84/macos/scripts/common-macos.sh
3. 协议方法：CDP Runtime / Page；隔离 world 的执行上下文 ID、binding 事件及参数校验由宿主管理。https://chromedevtools.github.io/devtools-protocol/tot/Runtime/ ，https://chromedevtools.github.io/devtools-protocol/tot/Page/
4. Rollout 会话身份与 cwd：openai/codex `codex-rs/rollout/src/metadata.rs`、`codex-rs/history/src/lib.rs`，commit `e72da2b53805894878023d01949a25a082e0a5cb`。本工具不宣称日志格式是稳定 API。https://github.com/openai/codex/tree/e72da2b53805894878023d01949a25a082e0a5cb/codex-rs

上述实现为独立编写，没有复制主题、第三方 JS 代码或图像资产。常量的来源用于审计与后续兼容更新。未知身份、签名变更、无法唯一关联输入区时应降级，不放宽校验冒充成功。

## 实际 macOS 共享监听合同

见 [2026-09-26 实机证据](../validation/task-lens-mvp/mac-cdp-2026-09-26.md)。lsof `d` 字段对应 socket device（本机 `lsof -F?` 与常规表格交叉确认）。唯一可信 Codex 主进程之外，仅允许共享同一 socket、同用户、直属、精确名称且签名 identifier 为 `com.openai.sky.CUAService` 的辅助进程。记录／归属在 HTTP 查询前后验证，无法证明时拒绝。此变更不扩大界面数据读取或文档授权。
