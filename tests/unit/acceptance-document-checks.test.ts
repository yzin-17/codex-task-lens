import { test, expect } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { atomicFixtureWrite, waitUntil } from '../../src/validation/document-checks.js';
test('an interrupted wait does not read or turn an absent observation into success', async () => {
  const controller = new AbortController(); controller.abort(); let reads = 0;
  await expect(waitUntil(async () => { reads++; return false; }, Boolean, controller.signal)).rejects.toThrow();
  expect(reads).toBe(0);
});
test('a timed-out observation fails instead of returning the last stale sample', async () => {
  await expect(waitUntil(async () => false, Boolean, new AbortController().signal, 1)).rejects.toThrow('timed out');
});
test('atomic test writes leave no temporary files and replace only the allocated fixture', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lens-atomic-check-'));
  try { const file = path.join(root, 'TASKS.md'); await atomicFixtureWrite(file, 'first'); await atomicFixtureWrite(file, 'second'); expect(await readFile(file, 'utf8')).toBe('second'); expect(await readdir(root)).toEqual(['TASKS.md']); }
  finally { await rm(root, { recursive: true, force: true }); }
});
