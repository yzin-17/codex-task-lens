const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { monitoringOptions, effectiveSessionRoot } = require('../../desktop/runtime-options.cjs');

test('desktop session scanning defaults on, supports custom root and stays off after explicit disable', () => {
  const home = path.resolve('state'), openFile = async () => true;
  const previousCodexHome = process.env.CODEX_HOME; delete process.env.CODEX_HOME;
  const automatic = monitoringOptions({ port: 9341 }, home, openFile);
  assert.equal(automatic.allowSessionRead, true);
  assert.equal(automatic.sessionRoot, path.join(os.homedir(), '.codex'));
  process.env.CODEX_HOME = path.resolve('.codex-env');
  assert.equal(effectiveSessionRoot({}), process.env.CODEX_HOME);
  if (previousCodexHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previousCodexHome;
  const root = path.resolve('.codex-custom');
  const custom = monitoringOptions({ port: 9341, sessionRoot: root, workspace: path.resolve('repo') }, home, openFile);
  assert.equal(custom.sessionRoot, root); assert.equal(custom.allowSessionRead, true);
  assert.equal(custom.workspace, path.resolve('repo')); assert.equal(custom.openFile, openFile);
  assert.equal(effectiveSessionRoot({ sessionRoot: root, sessionScanEnabled: false }), undefined);
  assert.equal(monitoringOptions({ port: 9341, sessionRoot: root, sessionScanEnabled: false }, home, openFile).allowSessionRead, false);
});
