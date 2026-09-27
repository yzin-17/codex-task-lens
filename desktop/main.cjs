const { app, BrowserWindow, Menu, Tray, nativeImage, dialog, ipcMain, protocol, net, shell, session } = require('electron');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const policy = require('./policy.cjs');
const { monitoringOptions } = require('./runtime-options.cjs');
const smokeIndex = process.argv.indexOf('--smoke-test');
const smokeOutput = smokeIndex >= 0 ? process.argv[smokeIndex + 1] : null;
if (smokeIndex >= 0 && (!smokeOutput || !path.isAbsolute(smokeOutput))) throw new Error('Smoke report requires an absolute output path');
const home = smokeOutput ? syncFs.mkdtempSync(path.join(os.tmpdir(), 'task-lens-package-')) : path.join(app.getPath('appData'), 'CodexTaskLens');
syncFs.mkdirSync(home, { recursive: true }); app.setPath('userData', home);
app.setName('Codex Task Lens'); app.setAppUserModelId('dev.yzin.codex-task-lens');
protocol.registerSchemesAsPrivileged([{ scheme: 'tasklens', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let control = null, panel = null, tray = null, runtime = null, platform = null;
let config = { port: 9341 }, diagnostic = '准备连接', quitting = false, quitReady = false, pending = null, configInvalid = false;
const configFile = path.join(home, 'desktop-settings.json');
const state = () => ({ version: app.getVersion(), platform: process.platform, arch: process.arch, settings: { ...config }, busy: !!pending, running: !!runtime, ...(runtime?.status() ?? { diagnostic, targets: 0 }) });
function protect(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
}
async function saveConfig() {
  if (configInvalid) { await fs.rename(configFile, configFile + '.invalid-' + Date.now()).catch(() => undefined); configInvalid = false; }
  const temporary = configFile + '.' + process.pid + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(config, null, 2), { mode: 0o600 }); await fs.rename(temporary, configFile);
}
async function createControl(show = true) {
  if (control && !control.isDestroyed()) { if (show) { control.show(); control.focus(); } return control; }
  control = new BrowserWindow({ width: 680, height: 650, minWidth: 560, minHeight: 510, show: false, title: 'Codex Task Lens', backgroundColor: '#f6f7f9', icon: path.join(__dirname, '../build/icon.png'), webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true } });
  protect(control);
  control.on('close', event => { if (!quitting && tray) { event.preventDefault(); control.hide(); } });
  await control.loadURL(policy.CONTROL_URL); if (show) control.show(); return control;
}
async function stopMonitoring() {
  if (panel && !panel.isDestroyed()) panel.destroy(); panel = null;
  const previous = runtime; runtime = null; await previous?.close(); diagnostic = '已停止 Task Lens；Codex 保持运行';
}
async function startMonitoring() {
  await stopMonitoring(); diagnostic = '正在检测应用和端口…';
  const { startCodex } = await import('../dist/node/host/codex-runtime.js');
  try { runtime = await startCodex(monitoringOptions(config, home, async file => !(await shell.openPath(file)))); }
  catch (error) { diagnostic = error?.name === 'LensError' ? error.message : '启动失败，请检查应用数据目录和端口设置'; }
}
async function exclusive(work) {
  if (pending) return { ok: false, error: '上一项操作尚未完成' };
  pending = Promise.resolve().then(work);
  try { await pending; return { ok: true, state: state() }; }
  catch (error) { return { ok: false, error: error?.name === 'LensError' ? error.message : '操作未完成，请检查路径和设置' }; }
  finally { pending = null; }
}
async function openPanel() {
  if (!runtime) await startMonitoring(); if (!runtime) throw new Error('Runtime unavailable');
  if (panel && !panel.isDestroyed()) { panel.show(); panel.focus(); return; }
  panel = new BrowserWindow({ width: 960, height: 760, title: 'Task Lens · 独立清单', webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  protect(panel);
  // A refresh uses the in-memory bootstrap URL rather than exposing or persisting its token.
  panel.webContents.on('before-input-event', (event, input) => { if ((input.control || input.meta) && input.key.toLowerCase() === 'r') { event.preventDefault(); if (runtime) void panel.loadURL(runtime.url); } });
  await panel.loadURL(runtime.url);
}
async function action(op, value) {
  switch (op) {
    case 'connect': config.port = policy.port(value); await saveConfig(); await startMonitoring(); break;
    case 'stop': await stopMonitoring(); break;
    case 'open-panel': await openPanel(); break;
    case 'choose-app': {
      const result = await dialog.showOpenDialog(control, { title: '选择 Codex 应用', properties: ['openFile'], filters: [{ name: 'Codex', extensions: process.platform === 'darwin' ? ['app'] : ['exe'] }] });
      if (!result.canceled && result.filePaths[0]) { const appInfo = await platform.discoverApp(result.filePaths[0]); config.appPath = process.platform === 'darwin' ? appInfo.bundle : appInfo.executable; await saveConfig(); await startMonitoring(); } break;
    }
    case 'choose-workspace': {
      const result = await dialog.showOpenDialog(control, { title: '选择并授权读取项目内的 Markdown', properties: ['openDirectory'] });
      if (!result.canceled && result.filePaths[0]) { config.workspace = result.filePaths[0]; await saveConfig(); await startMonitoring(); } break;
    }
    case 'clear-workspace': delete config.workspace; await saveConfig(); await startMonitoring(); break;
    case 'choose-session-root': {
      const result = await dialog.showOpenDialog(control, { title: '选择 Codex 会话目录（可随时停用）', defaultPath: config.sessionRoot ?? path.join(os.homedir(), '.codex'), properties: ['openDirectory'] });
      if (!result.canceled && result.filePaths[0]) { config.sessionRoot = result.filePaths[0]; await saveConfig(); await startMonitoring(); } break;
    }
    case 'clear-session-root': delete config.sessionRoot; await saveConfig(); await startMonitoring(); break;
    case 'launch': {
      const result = await dialog.showMessageBox(control, { type: 'warning', title: '调试启动 Codex', message: '仅在 Codex 已正常退出时启动。', detail: '将开放仅本机可访问的 CDP 端口。本机程序可通过它访问应用页面；不要运行不可信的调试工具。不会强退或重启已有 Codex。停止 Task Lens 不会关闭此端口。', buttons: ['取消', '启动 Codex'], defaultId: 0, cancelId: 0 });
      if (result.response === 1) { const appInfo = await platform.discoverApp(config.appPath); await platform.launchCodex(appInfo, config.port, true); await startMonitoring(); } break;
    }
  }
}
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', () => { void createControl(); });
  app.on('activate', () => { void createControl(); });
  app.on('window-all-closed', () => { if (!tray && !smokeOutput) app.quit(); });
  app.on('before-quit', event => {
    if (quitReady) return; event.preventDefault(); quitting = true;
    void (async () => { await pending?.catch(() => undefined); await stopMonitoring(); quitReady = true; app.quit(); })();
  });
  void app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    protocol.handle('tasklens', request => {
      const url = new URL(request.url), allowed = new Set(['/index.html', '/control.css', '/control.js']);
      if (request.method !== 'GET' || url.hostname !== 'control' || !allowed.has(url.pathname) || url.search) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(path.join(__dirname, 'ui', url.pathname.slice(1))).toString());
    });
    platform = await import('../dist/node/platform/codex-app.js');
    const { setDesktopFilePicker } = await import('../dist/node/platform/macos/select-markdown.js');
    setDesktopFilePicker(async () => { const result = await dialog.showOpenDialog({ title: '选择 Markdown 文档（可多选）', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }] }); return { paths: result.filePaths, cancelled: result.canceled }; });
    try { const stat = await fs.stat(configFile); if (stat.size > 16384) throw new Error('large config'); config = policy.settings(JSON.parse(await fs.readFile(configFile, 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') { configInvalid = true; diagnostic = '配置不可读取，原文件保留；暂用默认设置'; } }
    ipcMain.handle('task-lens:control', (event, payload) => {
      if (!policy.senderAllowed(event, control?.webContents)) return { ok: false, error: '调用来源不受信任' };
      try { const request = policy.message(payload); return request.op === 'state' ? { ok: true, state: state() } : exclusive(() => action(request.op, request.value)); }
      catch { return { ok: false, error: '操作参数无效' }; }
    });
    if (!smokeOutput) {
      try { const image = nativeImage.createFromPath(path.join(__dirname, 'tray.png')).resize({ width: 18, height: 18 }); if (process.platform === 'darwin') image.setTemplateImage(true); tray = new Tray(image); tray.setToolTip('Codex Task Lens'); tray.on('click', () => { void createControl(); }); tray.setContextMenu(Menu.buildFromTemplate([{ label: '打开控制台', click: () => { void createControl(); } }, { label: '打开独立清单', click: () => { void exclusive(openPanel); } }, { type: 'separator' }, { label: '退出 Task Lens', click: () => app.quit() }])); } catch { tray = null; }
    }
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Task Lens', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] }, { role: 'editMenu' }]));
    await createControl(!smokeOutput);
    if (smokeOutput) {
      let report;
      try { report = await require('./smoke.cjs')({ control, protect, home }); }
      catch (error) { report = { passed: false, error: String(error.message), platform: process.platform, arch: process.arch }; }
      await fs.mkdir(path.dirname(smokeOutput), { recursive: true }); await fs.writeFile(smokeOutput, JSON.stringify(report, null, 2));
      quitReady = true; app.exit(report.passed ? 0 : 1); return;
    }
    void exclusive(startMonitoring);
  }).catch(async error => {
    if (smokeOutput) { await fs.writeFile(smokeOutput, JSON.stringify({ passed: false, error: String(error.message) })).catch(() => undefined); app.exit(1); }
    else { dialog.showErrorBox('Task Lens 启动失败', '请检查应用是否完整解压，或重新下载与你系统架构匹配的版本。'); app.exit(1); }
  });
}
