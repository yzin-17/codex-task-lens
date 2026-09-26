import { expect, it, vi } from 'vitest';
const { execute } = vi.hoisted(() => ({ execute: vi.fn((...args: unknown[]) => { const callback = args.at(-1) as (...values: unknown[]) => void; callback(null, '', ''); }) }));
vi.mock('node:child_process', () => ({ execFile: execute }));
import { openSourceFile } from '../../src/platform/macos/open-source.js';
it('opens the authorized literal path through a fixed executable and argument array', async () => {
  const file = '/authorized/任务;$(do-not-run).md';
  expect(await openSourceFile(file, 'darwin')).toBe(true);
  expect(execute).toHaveBeenCalledWith('/usr/bin/open', ['-t', file], { timeout: 10000, maxBuffer: 4096 }, expect.any(Function));
});
it('does not invent a platform opener on other systems', async () => { execute.mockClear(); expect(await openSourceFile('/authorized/task.md', 'linux')).toBe(false); expect(execute).not.toHaveBeenCalled(); });
