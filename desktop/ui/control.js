const api = window.taskLens;
const find = id => document.getElementById(id);
let editingPort = false, localBusy = false;
find('port').addEventListener('input', () => { editingPort = true; });
function render(state) {
  find('version').textContent = `v${state.version} · ${state.arch}`;
  find('status').textContent = state.targets ? '已连接 Codex' : state.running ? '本地服务已就绪' : '监控已停止';
  find('dot').classList.toggle('connected', state.targets > 0);
  find('targets').textContent = state.targets ? `${state.targets} 个页面` : '';
  find('diagnostic').textContent = state.diagnostic;
  if (!editingPort) find('port').value = state.settings.port;
  find('app-path').textContent = state.settings.appPath || '自动查找已安装的 Codex';
  find('workspace').textContent = state.settings.workspace || '尚未授权项目目录';
  for (const id of ['app-path', 'workspace']) find(id).title = find(id).textContent;
  for (const button of document.querySelectorAll('button')) button.disabled = localBusy || state.busy;
  if (!localBusy && !state.busy) { find('stop').disabled = !state.running; find('clear-workspace').disabled = !state.settings.workspace; }
}
async function perform(work) {
  if (localBusy) return; localBusy = true; find('error').textContent = '';
  for (const button of document.querySelectorAll('button')) button.disabled = true;
  try { const result = await work(); if (!result.ok) find('error').textContent = result.error; else if (result.state) render(result.state); }
  catch { find('error').textContent = '控制台暂时不可用，请重新打开 Task Lens。'; }
  finally { localBusy = false; await refresh(); }
}
async function refresh() { try { const result = await api.state(); if (result.ok) render(result.state); } catch { /* Keep the last visible status during shutdown. */ } }
find('connect').addEventListener('click', () => { const port = Number(find('port').value); editingPort = false; void perform(() => api.connect(port)); });
find('stop').addEventListener('click', () => { void perform(() => api.stop()); });
find('panel').addEventListener('click', () => { void perform(() => api.openPanel()); });
find('choose-app').addEventListener('click', () => { void perform(() => api.chooseApp()); });
find('choose-workspace').addEventListener('click', () => { void perform(() => api.chooseWorkspace()); });
find('clear-workspace').addEventListener('click', () => { void perform(() => api.clearWorkspace()); });
find('launch').addEventListener('click', () => { void perform(() => api.launch()); });
void refresh(); setInterval(() => { void refresh(); }, 1500);
