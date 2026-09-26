# Codex Task Lens：macOS 一期实施任务

对应 Spec：[2026-09-26-task-lens-mvp](../specs/2026-09-26-task-lens-mvp.md)

> 状态：独立模式与 Codex 内嵌实现已交付，当前 20 / 23。T02 用户环境基线、I2 真机验收与 R1 最终 Review 尚未完成；不代表一期整体通过。
> 已知前提：用户已确认 Mac CDP 可行。适配代码以已核对上游源码和合成契约 M2 实施，已通过托管 macOS／Linux 的真实 Chromium CDP 测试；T02 仍独立保留用户实际版本与脱敏输入义务。
> 延后范围：[TODO](../TODO.md)。其中事项不纳入本期 23 项计数。

## 共享执行约束

本文件是唯一执行台账。每项任务自带局部测试，完成自身声明的结果才勾选；“组件完成”和“产品链路验收通过”分开记录。任务编号表示身份，不代表强制顺序。

执行前阅读所引用的 Spec 小节、已就绪依赖和精确代码入口，不要求重读所有代码。已完成任务的路径已经落地；其余路径仍是计划创建的位置；不得把计划命令或示例输出当作已运行结果。具体依赖版本由 T01 锁定。

每次派发只包含一项叶子任务，使用新上下文；完成本项后返回，不接着执行下一项。遇到缺少授权／环境／契约或范围失控时停止该项并写清阻塞，不能默默扩大写入范围。UI 与非 UI 工作分别派发，模型选择沿用用户当次指令，本项目不绑定模型或 Skill。

允许并行，但须先确认依赖已验证、写入路径不冲突。共享契约由 T03 的执行者负责；变更须先更新契约和受影响任务。`package.json`、lockfile、构建入口与台账仅由当前指定整合者修改，不能让并行 worker 分别安装依赖或覆盖入口。worker 返回证据，由台账维护者统一写回。

### 统一验证入口

基础、独立与内嵌入口均已建立。`test:mac` 当前提供显式授权的只读结构探测，不能替代完整 I2；入口结果与功能验收分开记录：

| 入口 | 责任与用途 |
| --- | --- |
| `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` | T01 建立工具链，后续任务持续保持通过；`test` 使用 Vitest run |
| `pnpm exec vitest run <精确测试路径>` | 每项任务的局部契约／行为测试 |
| `pnpm exec playwright test <精确测试路径>` | UI 和真实本地面板测试；配置由 T01 建立、fixture 由使用任务维护 |
| `pnpm dev:standalone` | T17 建立，启动真实应用服务与本地面板，不需要 Codex |
| `pnpm start -- --standalone` | T17 已建立构建后独立入口 |
| `pnpm start -- --cdp-port 9341`、`pnpm run doctor` | T20 已建立构建后内嵌／诊断入口；真实 Codex 组合由 I2 验收 |
| `pnpm test:mac -- --enable --probe-only` | 只采集真实环境与脱敏结构；不发送消息、不重启。未加 `--enable` 失败；不加 `--probe-only` 会明确报告完整 I2 未完成并非零退出 |

最终记录统一包含：任务 ID、状态、代码／文档提交、执行命令、环境、关键断言结果、证据位置、阻塞与下一步。证据文档按任务写入 `docs/validation/task-lens-mvp/<ID>.md`，不提交私人日志或带凭证的端点。

### M2：已核对的适配输入契约

2026-09-26 按继续实施要求，将可编码的上游格式合同与用户真机证据分开：T08／T10／T12 可消费 [适配来源与合成样例](../compatibility/adapter-contracts.md)，不再等待 T02 才能实现。M2 不增加任务计数，不声称任何 Codex Desktop 版本已通过。T02 与 I2 仍是正式验收前置，不缩减原有产品要求。

## A. 基础与可验证契约

- [x] T01：建立可运行的 TypeScript 构建与测试基线
  - 执行记录：已完成；代码基线 06e8c234；真实命令、环境与断言见 [T01 验证](../validation/task-lens-mvp/T01.md)。
  - 覆盖断言：AC11 的安装、类型检查、构建与测试入口；不证明产品功能。
  - 启动依赖：无。
  - 上下文入口：Spec §7.1、本文“统一验证入口”、根 README。
  - 执行边界：`package.json`、`pnpm-lock.yaml`、`tsconfig*.json`、`vite.config.*`、`vitest.config.*`、`playwright.config.*`、`.gitignore`、`.github/workflows/ci.yml`、`tests/bootstrap/**`；不实现业务模块或修改用户 Codex。
  - 完成条件：Node 24／pnpm 版本与依赖锁定；单一仓库结构可以编译 Node 入口、独立 UI 与注入产物；至少一个真实 smoke test；CI 运行 lint／typecheck／test／build，不把空测试算通过。
  - 验证方式：干净目录执行 `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build`；记录工具版本和构建产物规则。

- [ ] T02：固化已验证 Mac 的兼容输入样例
  - 执行记录：已连接用户授权 Mac，补录实际版本与应用签名；当前运行实例未开放 CDP，DOM／A-B 切换及会话结构尚未采集。见 [本机预检](../validation/task-lens-mvp/mac-preflight-2026-09-26.md)，保持未勾选。
  - 覆盖断言：AC02／AC03／AC04 的适配输入基线与 AC11 的环境信息；不替代产品真机验收。
  - 启动依赖：无；需要用户授权的已验证 Mac 环境或用户提供的脱敏资料。
  - 上下文入口：Spec §1、§5、§8、§11；用户已确认 CDP 验证通过这一前提。
  - 执行边界：`docs/compatibility/macos.md`、`tests/fixtures/codex/macos-baseline/**`；只记录资料，不修改运行中 Codex、不安装主题、不读取认证文件。
  - 完成条件：记录 macOS／架构／Codex 版本、实际应用发现规则、端点和 renderer 形状、两个对话切换及歧义样例、会话身份／cwd／明确文件路径事件样例；字段不可获取时写明能力缺口和降级边界。fixture 使用合成值或获准脱敏值。
  - 验证方式：与实际已通过的连接和切换结果逐项对照，核对资料不含正文／凭证。没有本机资料时保留 T02 未完成；M2 允许适配代码先行验证，不阻塞手动模式，不替代 I2 真机验收。

- [x] T03：建立共享身份、快照和交互消息契约
  - 执行记录：已完成；代码基线 06e8c234；真实命令、环境与断言见 [T03 验证](../validation/task-lens-mvp/T03.md)。
  - 覆盖断言：AC03 的身份隔离基础、AC05 的绑定版本、AC06 的快照结构、AC10 的消息校验。
  - 启动依赖：T01。
  - 上下文入口：Spec §4、§5.1、§7.2。
  - 执行边界：`src/contracts/**`、`tests/contracts/**`；不读文件、不接 CDP、不实现 UI。
  - 完成条件：定义并验证 `MonitorRef`、授权引用、Binding、SessionHints、Candidate、TaskItem、TaskSnapshot、ViewState 与有限操作；包含协议版本、requestId、generation、bindingVersion；独立文档身份不能伪装线程身份，未知字段／非法操作／超限请求有明确拒绝行为。
  - 验证方式：`pnpm exec vitest run tests/contracts`；覆盖合法往返、缺身份、错误版本、冲突状态、重复 requestId 的处理约定和恶意 payload。通过后该契约是下游可用里程碑 M1（protocol v1，含可选 SessionHints）。

## B. 文档与绑定能力

- [x] T04：实现 GFM 叶子任务与章节范围解析
  - 执行记录：已完成；代码基线 06e8c234；真实命令、环境与断言见 [T04 验证](../validation/task-lens-mvp/T04.md)。
  - 覆盖断言：AC06 的语法、计数、源位置和状态含义。
  - 启动依赖：T03。
  - 上下文入口：Spec §4；`src/contracts/` 的 TaskItem／TaskSnapshot；GFM §5.3。
  - 执行边界：`src/core/task-parser.ts`、`src/core/task-scope.ts`、`src/core/task-budget.ts`、`tests/unit/task-parser.test.ts`、`tests/unit/task-scope-limits.test.ts`、`tests/unit/task-budget.test.ts`、`tests/fixtures/markdown/**`；不接文件 watcher 或 UI。
  - 完成条件：按 AST 统计叶子，父分组不重复计数；支持大小写勾选、无 ID／重复标题、源行与详情、文档／章节范围、明确状态字段；零项、冲突和未知状态产生规定结果。
  - 验证方式：`pnpm exec vitest run tests/unit/task-parser.test.ts`；断言 fenced／缩进代码、引用、HTML、普通说明、同名标题、标题删除、CRLF／中文、多行条目和父子矛盾的精确结果。

- [x] T05：实现授权文件与目录的路径校验
  - 执行记录：已完成；代码基线 06e8c234；真实命令、环境与断言见 [T05 验证](../validation/task-lens-mvp/T05.md)。
  - 覆盖断言：AC05 的 worktree 隔离、AC10 的文件访问边界。
  - 启动依赖：T03。
  - 上下文入口：Spec §3.1、§5.3、§8；`src/contracts/` 的授权与 Binding。
  - 执行边界：`src/files/path-policy.ts`、`tests/unit/path-policy.test.ts`；不扫描用户目录、不实现配置持久化或系统文件选择器。
  - 完成条件：显式授权文件／目录后才可读；路径规范化及 realpath 校验不能跨授权根；保留展示路径而以实际路径判定身份，读／打开前复核；权限与不存在错误明确。
  - 验证方式：`pnpm exec vitest run tests/unit/path-policy.test.ts`；用临时目录测试路径穿越、前缀同名目录、符号链接替换、不同 worktree、中文／空格路径和只授权单文件的行为。

- [x] T06：实现原子持久化的绑定台账
  - 执行记录：已完成；代码基线 06e8c234；真实命令、环境与断言见 [T06 验证](../validation/task-lens-mvp/T06.md)。
  - 覆盖断言：AC05 的确认、替换、解除、恢复；AC10 的受限持久化。
  - 启动依赖：T05。
  - 上下文入口：Spec §5.1、§5.3；`src/contracts/`、`src/files/path-policy.ts`。
  - 执行边界：`src/store/**`、`tests/integration/binding-store.test.ts`；只写可配置的工具数据目录，不触碰项目文件和 Codex 配置。
  - 完成条件：线程与独立监控使用不同键；按 expectedBindingVersion 条件更新，一次确认原子保存路径、范围与新版本；取消／失败／版本冲突保持原绑定；损坏状态保留原件；目录／文件权限收敛；单写入者锁与失效锁识别不误伤其他进程。
  - 验证方式：`pnpm exec vitest run tests/integration/binding-store.test.ts`；真实临时数据目录验证重启、写失败、坏 JSON、同线程换绑、同文件多绑定和第二实例竞争；验证源文件 hash 不变。

- [x] T07：实现可靠的文档实时快照流
  - 执行记录：已完成；代码基线 06e8c234；真实命令、环境与断言见 [T07 验证](../validation/task-lens-mvp/T07.md)。
  - 覆盖断言：AC07 的读取／更新／异常状态与时延；AC09 的文件资源释放。
  - 启动依赖：T04、T05。
  - 上下文入口：Spec §6；`src/core/task-parser.ts`、`src/core/task-scope.ts`、`src/files/path-policy.ts`。
  - 执行边界：`src/files/document-stream.ts`、`tests/integration/document-stream.test.ts`；不处理对话或界面。
  - 完成条件：稳定读取、事件合并、父目录监听、原子替换与删除重建恢复；失败标记缓存；区分 lastReadAt 与 lastTaskChangeAt；有限轮询补偿；超限和权限错误不转成零进度；订阅关闭释放资源。
  - 验证方式：`pnpm exec vitest run tests/integration/document-stream.test.ts`；临时文件真实写入、短暂截断、rename 保存、丢事件、持续写入、删除、权限失败、超限与退订。Mac 延迟数据在 I2 记录，局部测试不能替代该门禁。

## C. 候选发现与 Codex 基础适配

- [x] T08：实现只读的本地会话线索适配
  - 执行记录：已完成实现与局部验证；代码基线 4f8595bd；实际命令、断言与范围见 [T08 验证](../validation/task-lens-mvp/T08.md)。不替代 T02／I2。
  - 覆盖断言：AC04 的精确会话匹配、cwd／路径线索和日志失效降级。
  - 启动依赖：T03、T05、M2；用户格式兼容结果由 T02／I2 补录，不用 unavailable 伪装适配完成。
  - 上下文入口：Spec §5.2；`docs/compatibility/adapter-contracts.md`；合成记录 fixture 与 `src/contracts/`。
  - 执行边界：`src/adapters/codex/session-records/**`、`tests/integration/session-records.test.ts`；只读已授权数据源，不接 app-server、Hooks 或聊天推理服务。
  - 完成条件：先缩小文件候选再核对内部 threadId；按已验证格式返回 cwd 和明确路径证据，正确处理上下文目录变化；日志增量读取、轮转、半行、未知／损坏／超限记录可恢复；不执行记录中的命令、不读取 auth.json。
  - 验证方式：`pnpm exec vitest run tests/integration/session-records.test.ts`；用合成记录验证多会话、相同最近修改时间、相对路径无基准、shell 变量、截断追加及数据源不可用的结果；不保存正文副本。

- [x] T09：实现可解释的 Task 文档候选发现
  - 执行记录：已完成；代码基线 06e8c234；真实命令、环境与断言见 [T09 验证](../validation/task-lens-mvp/T09.md)。
  - 覆盖断言：AC04 的候选扫描、合并、预览与手动兜底；不负责自动确认绑定。
  - 启动依赖：T03、T04、T05；仅消费已验证的 M1 SessionHints 契约，不等待日志 adapter 实现。
  - 上下文入口：Spec §5.2、§6；`src/contracts/` 的 SessionHints、`src/core/task-parser.ts`、`src/files/path-policy.ts`。
  - 执行边界：`src/discovery/**`、`tests/integration/candidates.test.ts`；不写绑定、不扩展授权、不扫描所有会话正文。
  - 完成条件：组合会话线索、配置 glob 和手动文件；实际路径去重、保留来源；校验清单与预览计数；扫描可取消、有上限；日志 unavailable 时仍能返回目录／手动结果。不同工作目录同名文件不合并。
  - 验证方式：`pnpm exec vitest run tests/integration/candidates.test.ts`；真实临时目录测试多候选、无清单、归档／依赖目录忽略、越权链接、达到扫描上限、日志失效和取消请求。

- [x] T10：实现 macOS 可信端点发现与显式启动
  - 执行记录：已完成实现与局部验证；代码基线 4f8595bd；实际命令、断言与范围见 [T10 验证](../validation/task-lens-mvp/T10.md)。不替代 T02／I2。
  - 覆盖断言：AC02 的进程／应用／监听校验和不中断现有任务；AC11 的启动诊断基础。
  - 启动依赖：T03、M2；已核对的源码常量／DOM 合同，不以待补录的 T02 阻塞可测试实现。
  - 上下文入口：Spec §8、§11；`docs/compatibility/macos.md`。
  - 执行边界：`src/platform/macos/**`、`tests/unit/macos-launcher.test.ts`；不注入 UI、不修改应用包、不启动常驻自动重启服务。
  - 完成条件：从真实应用元数据定位可执行文件，校验端口所属进程与回环监听；端点不可用且应用已运行时提示等待／正常退出，不强退；仅在用户明确请求且无运行实例时调试启动；分开报告进程、端点和 renderer 检查结果。
  - 验证方式：`pnpm exec vitest run tests/unit/macos-launcher.test.ts`；注入进程／命令执行端口的测试替身，断言参数数组、未知端口拒绝、冲突／超时、不出现 kill／修改包操作。真实路径由 I2 验收。

- [x] T11：实现有界的 CDP 传输与上下文生命周期
  - 执行记录：已完成实现与局部验证；代码基线 4f8595bd；实际命令、断言与范围见 [T11 验证](../validation/task-lens-mvp/T11.md)。不替代 T02／I2。
  - 覆盖断言：AC02 的可信连接；AC09 的超时、断线、重连与销毁。
  - 启动依赖：T10。
  - 上下文入口：Spec §7.2、§7.3、§8；`src/contracts/`、`src/platform/macos/` 的验证结果。
  - 执行边界：`src/adapters/codex/cdp/**`、`tests/integration/cdp-session.test.ts`；不包含对话选择规则或文档业务。
  - 完成条件：仅连接已校验的端点；请求关联、超时、错误传播、context 创建／销毁和有退避的重连；关闭时拒绝未完成请求并清空订阅；不可自动重启 Codex 来修复连接。
  - 验证方式：`pnpm exec vitest run tests/integration/cdp-session.test.ts`；确定性 Socket fixture 与真实 Chromium CDP 共同验证乱序响应、socket 关闭、超时、重复事件、端点改变需重新校验及监听计数归零。

- [x] T12：实现按对话区域识别身份的 DOM adapter
  - 执行记录：已完成实现与局部验证；代码基线 4f8595bd；实际命令、断言与范围见 [T12 验证](../validation/task-lens-mvp/T12.md)。不替代 T02／I2。
  - 覆盖断言：AC03 的当前对话／多窗口／侧聊歧义识别；AC08 的安全挂载位置识别。
  - 启动依赖：T03、M2；已核对的源码常量／DOM 合同，不以待补录的 T02 阻塞可测试实现。
  - 上下文入口：Spec §5.1、§7.3；`tests/fixtures/codex/contract-baseline/`、`docs/compatibility/adapter-contracts.md`。
  - 执行边界：`src/adapters/codex/dom/**`、`tests/unit/thread-selection.test.ts`；不读文件、不维护全局单线程状态、不依赖宿主 React 私有对象。
  - 完成条件：对给定文档／pane 输出明确身份与挂载点或 unknown；没有唯一归属时不取最后节点；识别变化可触发新 generation，主对话与辅助区域不相互顶替。
  - 验证方式：`pnpm exec vitest run tests/unit/thread-selection.test.ts` 与 `pnpm exec playwright test tests/ui/embedded.spec.ts`；覆盖两个对话切换、多区域、隐藏旧节点、侧聊、首页、缺属性、无安全锚点、布局变化和同标题不同 threadId。

## D. 独立模式最小真实链路

- [x] T13：实现与 Codex 无关的监控应用服务
  - 执行记录：已完成；代码基线 06e8c234；真实命令、环境与断言见 [T13 验证](../validation/task-lens-mvp/T13.md)。
  - 覆盖断言：AC01 的独立核心；AC05 的绑定行为；AC03 的过期绑定响应抑制。
  - 启动依赖：T06、T07、T09。
  - 上下文入口：Spec §3、§5、§7.2；store、document-stream、discovery 已通过的接口。
  - 执行边界：`src/host/lens-service.ts`、`tests/integration/lens-service.test.ts`；不处理 HTTP、CDP 或 DOM。
  - 完成条件：组合候选、授权预览、绑定和快照订阅；同文件底层流引用计数复用；切换／解绑按版本取消旧请求，两个 monitor 不串数据；读取失败与日志降级保持正确状态。
  - 验证方式：`pnpm exec vitest run tests/integration/lens-service.test.ts`；用真实临时文件／store 验证双绑定、独立文档、重绑后旧响应、日志不可用、重启恢复和退订资源计数。

- [x] T14：实现受保护的本机面板接口
  - 执行记录：已完成；代码基线 06e8c234；真实命令、环境与断言见 [T14 验证](../validation/task-lens-mvp/T14.md)。
  - 覆盖断言：AC01 的独立访问通路；AC10 的本机 API 与文件打开安全。
  - 启动依赖：T13。
  - 上下文入口：Spec §7.2、§8；`src/host/lens-service.ts`、`src/files/path-policy.ts`。
  - 执行边界：`src/host/local-server/**`、`src/platform/macos/open-source.ts`、`tests/integration/local-server.test.ts`；仅调用现有服务与受限打开文件操作，不暴露任意执行器。
  - 完成条件：静态 UI 与有限 API／订阅只监听回环；随机运行凭证、Host／Origin 校验、大小限制；openSource 仅解析有效引用与授权源位置，使用参数数组；无认证或越权请求不能读数据；关闭端口和订阅可验证。
  - 验证方式：`pnpm exec vitest run tests/integration/local-server.test.ts`；真实临时 HTTP server 验证无 token、错误 Origin／Host、路径穿越、伪造绑定、超限和退出；用替身断言文件打开参数不经过 shell。

- [x] T15：实现只读任务清单组件
  - 执行记录：已完成；代码基线 06e8c234；真实命令、环境与断言见 [T15 验证](../validation/task-lens-mvp/T15.md)。
  - 覆盖断言：AC06 的诚实文案；AC08 的两组事项、详情、可访问性与主题。
  - 启动依赖：T03。
  - 上下文入口：Spec §3.2、§4；`src/contracts/` 的快照与 ViewState。
  - 执行边界：`src/ui/components/task-panel/**`、`tests/ui/task-panel.spec.ts`、`tests/fixtures/ui/main.tsx`、`tests/fixtures/ui/index.html`；使用契约 fixture，不读文件、不接宿主、不改绑定组件。
  - 完成条件：未完成在上、已完成在下，两组默认展开且独立折叠；源顺序、详情、明确状态、缓存／错误／零项／全部勾选文案正确；更新不抢焦点；安全文本渲染、键盘操作、浅深色和窄宽布局通过。
  - 验证方式：`pnpm exec playwright test tests/ui/task-panel.spec.ts`；断言具体条目可见性、详情展开、键盘焦点、无水平溢出、无百分比／验收成功宣称；恶意 HTML／命令链接不执行、不请求远程资源。

- [x] T16：实现候选选择与绑定交互组件
  - 执行记录：已完成；代码基线 06e8c234；真实命令、环境与断言见 [T16 验证](../validation/task-lens-mvp/T16.md)。
  - 覆盖断言：AC04／AC05 的发现来源展示、手动路径、范围预览及确认／取消。
  - 启动依赖：T03。
  - 上下文入口：Spec §3.1、§3.2、§4.1、§5.2；共享操作契约。
  - 执行边界：`src/ui/components/binding-picker/**`、`tests/ui/binding-picker.spec.ts`、`tests/fixtures/ui/picker*`、`src/ui/client.ts`；不实现文件读写或系统原生 picker。
  - 完成条件：展示候选来源／工作目录／计数；无候选仍可输入路径并请求明确授权；支持文档／章节预览、绑定／更换／解除与取消；异步预览对应当前选择；取消不提交，绑定失败不丢旧配置。
  - 验证方式：`pnpm exec playwright test tests/ui/binding-picker.spec.ts`；模拟晚到预览、会话切换、权限拒绝、选择不同范围、扫描截断与重复点击；只有确认操作触发一次有效提交，无额外全局保存流程。

- [x] T17：组装可独立使用的本地面板
  - 执行记录：已完成；代码基线 06e8c234；真实命令、环境与断言见 [T17 验证](../validation/task-lens-mvp/T17.md)。
  - 覆盖断言：AC01 的真实独立入口、AC05 的跨重启查看与 AC08 的源文件操作。
  - 启动依赖：T14、T15、T16。
  - 上下文入口：Spec §3.3、§7；`src/host/local-server/`、两个已验证 UI 组件。
  - 执行边界：`src/ui/standalone/**`、`src/host/standalone-runtime.ts`、`tests/standalone/entry.spec.ts`、`package.json` 的 `dev:standalone` 入口；只接线，不补缺失的 parser／store 能力。
  - 完成条件：真实 HTTP、应用服务和组件连通；启动凭证只在内存中使用并清除 fragment；可以选择已有绑定／独立文档、监控实际文件、打开源文件；无 Codex 进程和端点时正常使用。
  - 验证方式：`pnpm dev:standalone` 与 `pnpm exec playwright test tests/standalone/entry.spec.ts`；使用临时数据目录完成授权、预览、确认、查看、取消更换和退出，不使用写死成功快照。

- [x] I1：验收“真实文档 → 绑定 → 实时清单”的早期闭环
  - 执行记录：已完成；代码基线 06e8c234；真实命令、环境与断言见 [I1 验证](../validation/task-lens-mvp/I1.md)。
  - 覆盖断言：AC01、AC05、AC06、AC07 的最小组合行为；该门禁不依赖 CDP 完成。
  - 启动依赖：T17。
  - 执行所有者与边界：本次整合者；可写 `tests/standalone/document-flow.spec.ts` 和 `docs/validation/task-lens-mvp/I1.md`；不接收尚未实现的核心业务。
  - 环境与入口：真实本地文件／临时工具数据目录／浏览器，`pnpm exec playwright test tests/standalone/document-flow.spec.ts`。
  - 必须场景：普通无专属字段的 Markdown；首次确认绑定；外部改勾选后列表移动且计数同步；原子保存；重启恢复；源删除显示缓存不可用；选择章节不重复统计父项；整个过程中源文件只由测试写入者修改。
  - 通过证据：实际命令、环境、各断言结果与日志摘要；fixture 内容允许合成，但 watcher、store、HTTP 和 UI 必须是真实实现。失败归回责任任务，不推迟到最后收尾。

## E. Codex 内嵌接入与交付

- [x] T18：实现按目标／上下文隔离的宿主 CDP bridge
  - 执行记录：已完成实现与局部验证；代码基线 4f8595bd；实际命令、断言与范围见 [T18 验证](../validation/task-lens-mvp/T18.md)。不替代 T02／I2。
  - 覆盖断言：AC03 的展示版本隔离、AC09 的连接清理、AC10 的有限消息通路。
  - 启动依赖：T11、T12、T13。
  - 上下文入口：Spec §5.1、§7.2、§7.3、§8；CDP、DOM adapter 和应用服务。
  - 执行边界：`src/host/cdp-bridge/**`、`tests/integration/cdp-bridge.test.ts`、`tests/unit/cdp-world.test.ts`、`src/contracts/embedded.ts`；不编写 React UI 或修改宿主输入内容。
  - 完成条件：管理每个可信 target／context／pane 的观察身份、generation 与应用订阅；注册有限 Runtime binding，数据以安全序列化传输；拒绝陌生上下文、旧 generation、错误绑定版本和未知操作；重连重新验证归属，发现并清理存续的工具专属隔离 world；不复用旧 binding／nonce／展示状态。
  - 验证方式：`pnpm exec vitest run tests/integration/cdp-bridge.test.ts`；假 CDP 配合真实应用服务验证两个窗口、A→B→A、延迟响应、上下文销毁、绑定名伪造与停止清理。通过不等于已在 Codex 展示。

- [x] T19：实现可幂等挂载与清理的内嵌面板入口
  - 执行记录：已完成实现与局部验证；代码基线 4f8595bd；实际命令、断言与范围见 [T19 验证](../validation/task-lens-mvp/T19.md)。不替代 T02／I2。
  - 覆盖断言：AC08 的 Codex 内嵌展示与不干扰；AC09 的重复注入／卸载。
  - 启动依赖：T12、T15、T16；T03 的 bridge 消息契约已通过，不等待宿主 bridge 的产品验收。
  - 上下文入口：Spec §3.2、§5.1、§7.3；DOM adapter 与两个共享组件。
  - 执行边界：`src/ui/embedded/**`、`tests/ui/embedded.spec.ts`、注入入口对应的 Vite 配置；只实现 renderer 消费端，不扩展宿主协议。
  - 完成条件：在安全锚点挂载唯一 Shadow DOM 根；折叠计数、展开清单与绑定流程可用；实例与目标身份关联；旧响应丢弃；unknown 无串用数据；重复挂载不增加节点／observer；卸载恢复原布局且不移除其他插件。
  - 验证方式：`pnpm exec playwright test tests/ui/embedded.spec.ts`；真实 DOM fixture + 契约 bridge 验证重复注入、布局重建、双 pane、浅深色、键盘输入／发送／审批与滚动不被遮挡；记录清理前后节点和监听计数。

- [x] T20：组装源码交付入口与运维说明
  - 执行记录：已完成实现与局部验证；代码基线 4f8595bd；实际命令、断言与范围见 [T20 验证](../validation/task-lens-mvp/T20.md)。不替代 T02／I2。
  - 覆盖断言：AC02 的显式连接入口、AC09 的退出语义、AC11 的可运行交付。
  - 启动依赖：T08、T10、T17、T18、T19。
  - 上下文入口：Spec §7、§8；平台启动器、会话记录 adapter、独立 runtime、CDP bridge、注入构建产物。
  - 执行边界：`src/cli/**`、`src/host/codex-runtime.ts`、`tests/integration/cli.test.ts`、`tests/standalone/codex-fallback.spec.ts`、`tests/unit/mac-probe.test.ts`、`docs/development.md`、`README.md`、运行与构建脚本；只组装已完成组件和处理有界接缝，不引入原生壳或自动更新。
  - 完成条件：提供 standalone／指定 CDP 端点／doctor 入口，明确构建产物；会话线索 adapter 仅注入 Codex 模式；未知端点不注入、已有运行中 Codex 不强退；停止工具清理自有资源但不声称关闭 Codex 的调试端口；文档说明安装、授权、日志位置、恢复普通启动与只验证过的平台。
  - 验证方式：`pnpm build`、`pnpm exec vitest run tests/integration/cli.test.ts`；从干净安装运行 `pnpm start -- --standalone` 和 `pnpm run doctor`；CDP 生产组合由 I2 证明。清理测试核对源文件／用户配置 hash 不变。

- [ ] I2：在已验证 Mac 上验收完整 Codex 内嵌链路
  - 执行记录：待用户实际环境验收；已提供安全结构探测与 [I2 场景清单](../validation/task-lens-mvp/I2.md)。托管 macOS 的 Chromium CDP 测试不替代 Codex Desktop 验收。
  - 覆盖断言：AC02、AC03、AC04、AC07、AC08、AC09、AC10、AC11 的真实目标环境组合行为。
  - 启动依赖：I1、T20。
  - 执行所有者与边界：具有用户授权 Mac 环境的整合者；可写 `tests/mac/**`、`package.json` 的 `test:mac` 入口、兼容基线与 `docs/validation/task-lens-mvp/I2.md`；不操作用户长任务，不把缺失实现藏进测试。
  - 环境与入口：记录真实 macOS／架构／Codex 版本；连接已确认安全的端点，`pnpm test:mac` 必须显式启用。无环境时保持未勾选并注明阻塞。
  - 必须场景：真实 CDP target／threadId；两个对话绑定不同文档并反复切换；多窗口、侧聊和不同 worktree 同相对路径不串用；两个对话共享同一文档更新正确；会话线索发现及缺日志手动路径；真实文件修改／原子保存；20 次更新时延；页面重载／重连／重复注入／卸载；源权限失败与恢复；CDP 停用后独立模式继续查看；宿主输入、发送和审批不受影响。
  - 安全与资源证据：检查回环监听与进程归属；拒绝未知端点／过期 bridge 请求；核对工具停止后的自有资源与源文件只读；说明仍运行的 Codex CDP 端口需正常退出才能关闭。执行 50 次切换／挂载清理，确认资源计数不持续增长。
  - 通过证据：各场景实际断言、时间测量原始值与 p95、脱敏截图／录屏或结构化结果、复现命令；不以静态截图、模拟 fixture 或此前可行性反馈替代。

## 最终一致性 Review

- [ ] R1：审计一期交付、验收证据与后续引用
  - 执行记录：未通过；等待 T02／I2 的真实环境证据，本次代码与文档检查不兑换为最终 Review。
  - 覆盖断言：AC12，以及 AC01–AC11 的覆盖完整性审计，不重复继承其实现责任。
  - 启动依赖：T01–T20、I1、I2 已满足各自完成条件。
  - 执行边界：本 Task、原 Spec、README、TODO 与必要验证索引；发现代码缺陷退回责任任务或新建有界修复任务，不能在 Review 中实现一批遗漏能力。
  - 检查内容：需求与实际实现一致；所有勾选均有有效证据；文档路径／命令实际存在；无 Skill／Hooks 硬依赖；不展示估算和验收误导文案；无凭证／私人记录；第三方复用有许可证处理；二期事项引用可达。
  - 验证方式：重跑 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`，审查 I1／I2 的真实环境证据及 AC 映射；输出通过／不通过结论和剩余门禁。无真机证据时不能给出整体通过。

## 验收责任映射

局部任务只证明其声明的断言，门禁证明跨模块组合；R1 审计所有行，不接收未覆盖能力。

| AC | 实现与局部验证责任 | 组合验证 |
| --- | --- | --- |
| AC01 独立核心 | T13、T14、T17 | I1；I2 的 CDP 降级 |
| AC02 可信接入与启动 | T02、T10、T11、T20 | I2 |
| AC03 身份与串数据防护 | T03、T12、T13、T18、T19 | I2 |
| AC04 候选与手动回退 | T08、T09、T16 | I1 的手动路径；I2 的真实会话线索 |
| AC05 绑定与隔离 | T05、T06、T13、T16、T17 | I1；I2 的多窗口／worktree |
| AC06 解析与诚实计数 | T04、T15 | I1 |
| AC07 实时快照与异常 | T07 | I1；I2 的 Mac 时延与恢复 |
| AC08 清单交互与宿主兼容 | T12、T15、T16、T17、T19 | I1；I2 |
| AC09 生命周期与降级 | T07、T11、T13、T14、T18、T19、T20 | I2 |
| AC10 安全与只读 | T03、T05、T06、T08、T14、T15、T18 | I1 的源只读；I2 的真实端点与消息边界 |
| AC11 运行与交付说明 | T01、T02、T20 | I2 |
| AC12 范围与证据一致 | R1 | R1 |

## 并行与整合顺序

T01 与 T02 可以独立推进。T03 就绪后，纯解析、路径策略、DOM 规则和两个互不写同一路径的 UI 组件可以分别派发。T06／T07／T08 等仍需等待其真实依赖；不得因为文件已创建就当作契约已就绪。

第一条组合验收链路是 T17 → I1，不等 CDP 最后完工才验证文件监控。T18 和 T19 可在共享契约就绪后并行，前者负责宿主、后者负责 renderer；T20 只接线，I2 在真实 Mac 验收。`.github`、构建配置和 package 文件有变更时由当前整合者串行处理。

T08 依据 M2 已实现有限的真实记录适配，而非固定返回“日志缺失”。T09 仍只消费 M1 的可选 SessionHints，独立模式不引入日志硬依赖。T20 已组合适配、CDP 与 UI；正式 I2 仍必须覆盖用户实际 Codex 中的候选来源，不以合成 fixture 代替。

## 执行记录

2026-09-26：创建 Spec／Task，尚未实现应用代码，未执行产品测试。用户反馈的 Mac CDP 可行性结果已记录在 Spec §1，不兑换为本台账中的完成项。

2026-09-26：实现独立文件闭环并通过 I1；全量 Linux／托管 macOS 核心 CI 与 Linux 浏览器检查通过。13 个已完成项均链接单项证据，另 10 项保留未完成及依赖。详见 [验证索引](../validation/task-lens-mvp/README.md)。构建／fixture／补充回归路径由整合者串行维护，没有让 worker 并发覆盖共享文件。

后续按任务写入真实状态、产物与验证引用。任务拆分保留原 ID 与验收义务，父项改为分组并说明计数口径变化；不靠拆分增加完成量。事项延期须引用 [TODO](../TODO.md) 中的 ID 与原始要求，不把移动或归档当作完成。

2026-09-26：继续完成 T08／T10／T11／T12／T18／T19／T20，实现内嵌版并通过 [CI 36234589984](https://github.com/yzin-17/codex-task-lens/actions/runs/36234589984)。共 20 / 23；T02／I2／R1 保持未勾选。修复跨 CDP 客户端重连残留 world 与 CLI 就绪前关停竞态；未修改任务分母或引入二期估算。

2026-09-26：通过 Remote Desktop Commander 完成本机安装、签名检查与核心回归，修正诊断命令分发和测试启动／异步断言问题。当前 Codex 普通启动未开放 CDP，未强退或重启；T02 部分补录，I2／R1 保持未通过。见 [实际 Mac 预检](../validation/task-lens-mvp/mac-preflight-2026-09-26.md)。
