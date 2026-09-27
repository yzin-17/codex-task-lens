import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check: () => Promise<boolean>, timeout = 6000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await sleep(50); }
  throw new Error('timeout');
}

describe('lightweight agent supervisor', () => {
  it('restarts its child on control request and removes the lock on graceful stop', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'task-lens-supervisor-'));
    const agent = path.join(root, 'agent/node/cli'); await mkdir(agent, { recursive: true });
    await cp('packaging/agent/launcher.mjs', path.join(root, 'launcher.mjs'));
    const childLog = path.join(root, 'child.log');
    await writeFile(path.join(agent, 'index.mjs'), `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(childLog)}, 'start\\n');\nprocess.on('SIGTERM',()=>process.exit(0));\nsetInterval(()=>{},1000);\n`);
    const home = path.join(root, 'home'), xdg = path.join(root, 'config');
    await mkdir(home, { recursive: true }); await mkdir(xdg, { recursive: true });
    const state = process.platform === 'darwin' ? path.join(home, 'Library/Application Support/CodexTaskLens') : path.join(xdg, 'CodexTaskLens');
    const lock = path.join(state, 'agent.lock'), control = path.join(state, 'agent.control.json');
    const child = spawn(process.execPath, [path.join(root, 'launcher.mjs')], { cwd: root, env: { ...process.env, HOME: home, XDG_CONFIG_HOME: xdg, APPDATA: path.join(home, 'AppData/Roaming') }, stdio: 'ignore' });
    try {
      await waitFor(async () => { try { await stat(lock); return (await readFile(childLog, 'utf8')).trim().split('\n').length === 1; } catch { return false; } });
      const first = JSON.parse(await readFile(lock, 'utf8')).pid;
      await writeFile(control, JSON.stringify({ action: 'restart', requestedAt: Date.now() }));
      await waitFor(async () => { try { return (await readFile(childLog, 'utf8')).trim().split('\n').length >= 2; } catch { return false; } });
      const second = JSON.parse(await readFile(lock, 'utf8')).pid;
      expect(second).toBe(first);
      const exited = new Promise<void>((resolve, reject) => { child.once('exit', () => resolve()); child.once('error', reject); });
      child.kill('SIGTERM');
      await exited;
      await expect(stat(lock)).rejects.toThrow();
    } finally {
      if (child.exitCode === null) child.kill('SIGKILL');
      await rm(root, { recursive: true, force: true });
    }
  }, 15000);
});
