import { it, expect } from 'vitest';
import { parseArgs, HELP } from '../../src/cli/index.js';
it('parses explicit standalone, CDP and profile configuration', () => {
  expect(parseArgs(['--', '--standalone', '--no-open']).standalone).toBe(true);
  expect(parseArgs(['--cdp-port', '9341', '--source-id', 'work', '--app', '/Applications/Example.app'])).toMatchObject({ cdpPort: 9341, sourceId: 'work' });
  expect(parseArgs(['--session-root', '/tmp/codex', '--allow-session-read']).allowSessionRead).toBe(true);
});
it('rejects unsafe, missing and conflicting arguments before touching a process', () => {
  for (const args of [['--cdp-port', '0'], ['--cdp-port', 'NaN'], ['--app', 'relative.app'], ['--session-root', '/tmp/codex'], ['--allow-session-read'], ['--standalone', '--launch-codex'], ['--source-id', '$HOME'], ['--arbitrary-command', 'echo']]) expect(() => parseArgs(args)).toThrow();
});
it('keeps the CDP shutdown boundary explicit', () => { expect(HELP).toContain('不会关闭 Codex'); expect(HELP).toContain('--allow-session-read'); });
