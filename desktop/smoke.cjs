const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { app, BrowserWindow } = require('electron');
module.exports = async ({ control, protect, home }) => {
  assert(app.isPackaged, 'Only an actual packaged application may pass this check');
  const result = { passed: false, kind: 'packaged-application', platform: process.platform, arch: process.arch, version: app.getVersion(), electron: process.versions.electron, node: process.versions.node, commit: process.env.GITHUB_SHA || 'local', noExternalNodePath: !process.env.PATH || process.env.PATH.endsWith('empty-bin') };
  const response = await control.webContents.executeJavaScript('window.taskLens.state()');
  assert(response.ok && response.state.version === app.getVersion());
  assert.equal(await control.webContents.executeJavaScript('typeof require'), 'undefined');
  assert.equal(await control.webContents.executeJavaScript("typeof window.taskLens.chooseSessionRoot + ':' + typeof window.taskLens.clearSessionRoot"), 'function:function');
  assert.equal(await control.webContents.executeJavaScript("!!document.querySelector('#session-root') && !!document.querySelector('#choose-session-root') && !!document.querySelector('#clear-session-root')"), true);
  result.controlLoaded = true; result.preloadIsolated = true; result.sessionControls = true;
  const { startStandalone } = await import('../dist/node/host/standalone-runtime.js');
  const dataDirectory = path.join(home, 'isolated-state'), file = path.join(home, 'task with spaces.md');
  await fs.writeFile(file, '# Package smoke\n- [ ] Pending\n- [x] Done\n');
  let runtime = await startStandalone({ dataDirectory }), window;
  const count = async expected => {
    for (let i = 0; i < 150; i++) { const text = await window.webContents.executeJavaScript("document.querySelector('.lens-task-count')?.textContent || ''"); if (text.includes(expected)) return; await delay(100); }
    throw new Error('Packaged panel did not render the expected file count: ' + expected);
  };
  const load = async () => { window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } }); protect(window); await window.loadURL(runtime.url); };
  try {
    const ref = { kind: 'standalone', id: 'local' }, grant = await runtime.service.authorize(file, 'file');
    const preview = await runtime.service.preview(ref, 0, grant.id, file, { kind: 'document' });
    await runtime.service.confirm(ref, 0, preview.id, 0); await load(); await count('1 / 2');
    assert.equal(await window.webContents.executeJavaScript('typeof window.taskLens'), 'undefined');
    result.documentRendered = true; result.panelHasNoPrivilegedBridge = true;
    await fs.writeFile(file + '.tmp', '# Package smoke\n- [x] Pending\n- [x] Done\n'); await fs.rename(file + '.tmp', file); await count('2 / 2');
    result.atomicFileUpdate = true;
    window.destroy(); await runtime.close(); runtime = await startStandalone({ dataDirectory }); await load(); await count('2 / 2');
    result.bindingRestored = true;
    if (process.platform === 'win32') { const { querySystem } = await import('../dist/node/platform/windows/codex-app.js'); const owner = await querySystem('process', { pid: process.pid }); assert(owner && path.basename(owner.path).toLowerCase() === path.basename(process.execPath).toLowerCase()); result.windowsSystemQuery = true; }
    result.passed = true; return result;
  } finally { if (window && !window.isDestroyed()) window.destroy(); await runtime.close(); }
};
