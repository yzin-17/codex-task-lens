const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { monitoringOptions } = require('../../desktop/runtime-options.cjs');

test('desktop session scanning is opt-in and forwarded explicitly', () => {
  const home = path.resolve('state'), openFile = async () => true;
  assert.equal(monitoringOptions({ port: 9341 }, home, openFile).allowSessionRead, false);
  const root = path.resolve('.codex');
  const options = monitoringOptions({ port: 9341, sessionRoot: root, workspace: path.resolve('repo') }, home, openFile);
  assert.equal(options.sessionRoot, root); assert.equal(options.allowSessionRead, true);
  assert.equal(options.workspace, path.resolve('repo')); assert.equal(options.openFile, openFile);
});
