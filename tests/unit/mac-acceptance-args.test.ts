import { test, expect } from 'vitest';
import { parseAcceptanceArgs } from '../../src/cli/mac-acceptance.js';
test('real acceptance requires explicit permission and an interactive terminal', () => {
  for (const args of [[], ['--enable'], ['--interactive']]) expect(() => parseAcceptanceArgs(args, true)).toThrow();
  expect(() => parseAcceptanceArgs(['--enable', '--interactive'], false)).toThrow();
  expect(parseAcceptanceArgs(['--', '--enable', '--interactive', '--cdp-port', '9341'], true).cdpPort).toBe(9341);
});
test('acceptance cannot start Codex, overwrite a user state directory or authorize arbitrary project writes', () => {
  for (const extra of [['--launch-codex'], ['--workspace', '/private'], ['--data-dir', '/private'], ['--standalone'], ['--doctor'], ['--port', '9342'], ['--approve-all'], ['--cycles', '1']]) expect(() => parseAcceptanceArgs(['--enable', '--interactive', ...extra], true)).toThrow();
});
test('session hints remain explicitly opt-in', () => {
  expect(() => parseAcceptanceArgs(['--enable', '--interactive', '--session-root', '/sessions'], true)).toThrow();
  expect(parseAcceptanceArgs(['--enable', '--interactive', '--session-root', '/sessions', '--allow-session-read'], true).allowSessionRead).toBe(true);
});
