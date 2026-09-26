# 桌面发行与跨平台运行

目标：从 GitHub Releases 下载后直接安装/解压并双击，不需要 Node、pnpm、Git 或构建命令。核心服务、文档格式和内嵌进度组件复用。

## 功能与边界

- Electron 控制台：自动连接已配置 CDP 端口、明确状态、选择 Codex/项目目录、连接与停止、独立清单、托盘和重复启动唤回。默认不读对话日志、不启动或重启 Codex。
- 调试启动需要应用内确认。已运行 Codex 不被强退；已有可信 CDP 端口直接复用，冲突进程不被终止。
- macOS 保持现有签名校验；Windows 校验 Authenticode 的有效性、OpenAI 发布者、产品名、本机回环监听与真实进程路径，未知身份不降级信任。
- 原生文件选择由受信任主进程提供，仍仅选择 Markdown 文件，单份/多份统一；不扩大目录混选范围。
- 桌面数据默认路径与旧 Mac CLI 相同，已有 CLI 占用存储时明确提示，不删锁强行接管。Windows 使用用户应用数据目录。
- 控制台加载自带资源；contextIsolation/sandbox 开启、nodeIntegration 关闭。固定 IPC 白名单验证发送者与输入；无任意执行接口，禁止导航/新窗口。

## 交付

macOS arm64/x64 的 DMG 和 ZIP，Windows x64 安装 EXE 和便携 ZIP，自带运行时和依赖；校验和、构建提交与平台验证说明随 Release 发布。只打包白名单文件。

每个平台在原生 runner 构建并测试实际打包应用：启动窗口/预加载、读取真实临时 Markdown、绑定/更新和清理。源码回归与产物测试分开记录；CI 不冒充真实 Codex Windows 验收。

没有开发者签名凭证时仅交付明确标识的预发布：Mac 临时签名但未公证、Windows 未签名。不得关闭用户系统安全功能，不承诺无系统提示。不自动合并 PR；只有全部构建与产物测试成功后才发布。

参考：https://www.electronjs.org/docs/latest/tutorial/security · https://www.electron.build/publish/ · https://learn.microsoft.com/powershell/module/microsoft.powershell.security/get-authenticodesignature · https://learn.microsoft.com/powershell/module/nettcpip/get-nettcpconnection
