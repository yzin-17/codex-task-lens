const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const policy = require('../../desktop/policy.cjs');
test('controller IPC validates method and narrowly shaped input', () => {
  assert.equal(policy.message({ op: 'state' }).op, 'state');
  assert.equal(policy.message({ op: 'connect', value: 9341 }).value, 9341);
  for (const value of [{ op: 'exec', value: 'anything' }, { op: 'state', value: 'unexpected' }, { op: 'connect', value: '9341' }, { op: 'connect', value: 0 }, { op: 'state', extra: true }]) assert.throws(() => policy.message(value));
});
test('renderer is trusted only when it is the exact main frame of the control window', () => {
  const frame = { url: policy.CONTROL_URL }, contents = { mainFrame: frame };
  assert.equal(policy.senderAllowed({ sender: contents, senderFrame: frame }, contents), true);
  assert.equal(policy.senderAllowed({ sender: {}, senderFrame: frame }, contents), false);
  assert.equal(policy.senderAllowed({ sender: contents, senderFrame: { url: policy.CONTROL_URL } }, contents), false);
  frame.url = 'https://example.com'; assert.equal(policy.senderAllowed({ sender: contents, senderFrame: frame }, contents), false);
});
test('stored configuration contains only validated local settings', () => {
  assert.deepEqual(policy.settings({}), { port: 9341 });
  assert.equal(policy.settings({ port: 9341, workspace: path.resolve('fixture') }).port, 9341);
  assert.throws(() => policy.settings({ token: 'not allowed' }));
  assert.throws(() => policy.settings({ port: -1 }));
  assert.throws(() => policy.settings({ appPath: 'relative.exe' }));
});
