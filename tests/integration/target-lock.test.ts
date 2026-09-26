import { it, expect } from 'vitest';
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { claimTarget } from '../../src/host/target-lock.js';
it('excludes a second Task Lens for the same target but allows other targets and safe release', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lens-target-lock-'));
  try {
    const first = await claimTarget(root, '100:9341:main');
    await expect(claimTarget(root, '100:9341:main')).rejects.toMatchObject({ code: 'already_running' });
    const other = await claimTarget(root, '100:9341:side'); await other.release();
    await first.release(); await first.release();
    const resumed = await claimTarget(root, '100:9341:main'); await resumed.release();
    expect(await readdir(root)).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
it('does not remove a lock whose owner changed and refuses malformed ownership', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lens-target-lock-'));
  try {
    const lock = await claimTarget(root, 'target'), file = path.join(root, (await readdir(root))[0]!);
    await writeFile(file, 'invalid ownership'); await lock.release();
    expect(await readFile(file, 'utf8')).toBe('invalid ownership');
    await expect(claimTarget(root, 'target')).rejects.toMatchObject({ code: 'already_running' });
    expect((await readdir(root)).length).toBe(1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
