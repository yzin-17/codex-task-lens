import { writeFile, rename, unlink, chmod, lstat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
export type PanelObservation = { completed: number | null; total: number | null; ready: boolean; cached: boolean; permissionDenied: boolean; groupsExpanded: boolean; roots: number };
export type ObservePanel = () => Promise<PanelObservation>;
export const SMALL_DOCUMENT = '# CTL-ACCEPTANCE-A\n\n- [ ] CTL-ACCEPTANCE-pending\n- [x] CTL-ACCEPTANCE-done\n';
export async function waitUntil<T>(read: () => Promise<T>, accept: (value: T) => boolean, signal: AbortSignal, timeoutMs = 6000): Promise<T> {
  const started = performance.now();
  do {
    signal.throwIfAborted(); const value = await read(); signal.throwIfAborted();
    if (accept(value)) return value;
    await delay(25, undefined, { signal });
  } while (performance.now() - started < timeoutMs);
  throw new Error('Acceptance observation timed out');
}
/** Only call with a file allocated by the acceptance runner, never a user's document. */
export async function atomicFixtureWrite(file: string, source: string): Promise<void> {
  const temporary = file + '.' + randomBytes(8).toString('hex') + '.tmp';
  try { await writeFile(temporary, source, { flag: 'wx', mode: 0o600 }); await rename(temporary, file); }
  finally { await unlink(temporary).catch(() => undefined); }
}
export async function exerciseFileLifecycle(file: string, observe: ObservePanel, signal: AbortSignal, checkPermissions = true): Promise<void> {
  const ready = (completed: number) => (value: PanelObservation) => value.ready && !value.cached && value.completed === completed && value.total === 2;
  try {
    await atomicFixtureWrite(file, SMALL_DOCUMENT); await waitUntil(observe, ready(1), signal);
    await atomicFixtureWrite(file, SMALL_DOCUMENT.replace('- [ ]', '- [x]')); await waitUntil(observe, ready(2), signal);
    await unlink(file); await waitUntil(observe, value => !value.ready && value.cached && value.total === 2, signal);
    await atomicFixtureWrite(file, SMALL_DOCUMENT); await waitUntil(observe, ready(1), signal);
    if (checkPermissions) {
      if ((await lstat(file)).isSymbolicLink()) throw new Error('Fixture was replaced by a symlink');
      await chmod(file, 0); await waitUntil(observe, value => value.permissionDenied && value.cached, signal);
      await chmod(file, 0o600); await waitUntil(observe, ready(1), signal);
    }
  } finally { await atomicFixtureWrite(file, SMALL_DOCUMENT); }
}
export async function measureVisibleUpdates(file: string, observe: ObservePanel, signal: AbortSignal): Promise<number[]> {
  const source = (extra: boolean) => '# CTL-ACCEPTANCE-LATENCY\n\n' + Array.from({ length: 1000 }, (_, i) => `- [${i % 2 === 1 || (extra && i === 0) ? 'x' : ' '}] CTL-ACCEPTANCE-${i}\n`).join('');
  const times: number[] = [];
  try {
    await atomicFixtureWrite(file, source(false));
    await waitUntil(observe, value => value.ready && !value.cached && value.total === 1000 && value.completed === 500, signal);
    for (let i = 0; i < 20; i++) {
      signal.throwIfAborted(); const extra = i % 2 === 0;
      // Start before the atomic write so the measurement includes the complete save.
      const start = performance.now(); await atomicFixtureWrite(file, source(extra));
      await waitUntil(observe, value => value.ready && !value.cached && value.total === 1000 && value.completed === (extra ? 501 : 500), signal);
      times.push(Math.round((performance.now() - start) * 100) / 100);
    }
    return times;
  } finally { await atomicFixtureWrite(file, SMALL_DOCUMENT); }
}
