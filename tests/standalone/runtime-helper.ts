import { fork } from 'node:child_process';
import path from 'node:path';
export async function launchStandalone(dataDirectory: string) {
  const child = fork(path.resolve('tests/fixtures/standalone-child.mjs'), [dataDirectory], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  child.stderr?.resume();
  const ready = await new Promise<{ origin: string; url: string }>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Test-owned standalone runtime did not start')); }, 10000);
    child.once('error', () => { clearTimeout(timer); reject(new Error('Unable to start test runtime')); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Test runtime exited before ready')); });
    child.once('message', value => { clearTimeout(timer); const data = value as { type?: string; origin?: string; url?: string }; if (data.type !== 'ready' || !data.origin || !data.url) { reject(new Error('Invalid test runtime response')); return; } resolve({ origin: data.origin, url: data.url }); });
  });
  let stopping: Promise<void> | undefined;
  return { ...ready, stop: () => stopping ??= new Promise<void>((resolve, reject) => {
    if (child.exitCode !== null) { resolve(); return; }
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Test runtime did not release its resources')); }, 5000);
    child.once('exit', code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error('Test runtime failed to stop cleanly')); });
    child.send('stop');
  }) };
}
