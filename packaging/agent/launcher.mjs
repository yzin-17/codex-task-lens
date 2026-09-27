import { spawn } from 'node:child_process';
import { mkdir, open, readFile, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 20)) {
  console.error(`Codex Task Lens 需要 Node.js 22.20+；当前为 ${process.version}`);
  process.exit(1);
}
const state = process.platform === 'darwin'
  ? path.join(homedir(), 'Library/Application Support/CodexTaskLens')
  : process.platform === 'win32'
    ? path.join(process.env.APPDATA || path.join(homedir(), 'AppData/Roaming'), 'CodexTaskLens')
    : path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config'), 'CodexTaskLens');
const configFile = path.join(state, 'desktop-settings.json');
const lockFile = path.join(state, 'agent.lock');
const logFile = path.join(state, 'agent.log');
const cli = path.join(root, 'agent/node/cli/index.mjs');

function absolute(value) { return typeof value === 'string' && path.isAbsolute(value) && !/[\0\r\n]/.test(value) ? value : undefined; }
async function settings() {
  try {
    if ((await stat(configFile)).size > 16384) return {};
    const raw = JSON.parse(await readFile(configFile, 'utf8'));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch { return {}; }
}
async function buildArgs() {
  const value = await settings(), port = Number.isInteger(value.port) && value.port >= 1024 && value.port <= 65535 ? value.port : 9341;
  const args = [cli, '--cdp-port', String(port), '--source-id', 'codex-default', '--data-dir', state, '--launch-codex', '--no-open'];
  const appPath = absolute(value.appPath), workspace = absolute(value.workspace);
  if (appPath) args.push('--app', appPath);
  if (workspace) args.push('--workspace', workspace);
  if (value.sessionScanEnabled !== false) {
    const sessionRoot = absolute(value.sessionRoot) ?? absolute(process.env.CODEX_HOME) ?? path.join(homedir(), '.codex');
    args.push('--session-root', sessionRoot, '--allow-session-read');
  }
  return { args, port, sessionScanEnabled: value.sessionScanEnabled !== false };
}
async function alive(pid) { if (!Number.isSafeInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch { return false; } }
async function claim() {
  await mkdir(state, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(lockFile, 'wx', 0o600); await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: Date.now() })); await handle.close(); return true;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let pid = 0; try { pid = Number(JSON.parse(await readFile(lockFile, 'utf8')).pid); } catch { /* malformed stale lock */ }
      if (await alive(pid)) return false;
      await rm(lockFile, { force: true });
    }
  }
  return false;
}
const config = await buildArgs();
if (process.env.TASK_LENS_AGENT_SMOKE === '1') {
  console.log(JSON.stringify({ cli: path.relative(root, cli), port: config.port, sessionScanEnabled: config.sessionScanEnabled, args: config.args.slice(1) }));
  process.exit(0);
}
if (!(await claim())) process.exit(0);
let child;
try {
  const log = await open(logFile, 'a', 0o600);
  await log.write(`\n[${new Date().toISOString()}] Task Lens agent start\n`);
  child = spawn(process.execPath, config.args, { cwd: root, env: { ...process.env, TASK_LENS_AGENT: '1' }, stdio: ['ignore', log.fd, log.fd], windowsHide: true });
  const stop = () => { try { child?.kill('SIGTERM'); } catch { /* already stopped */ } };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', value => resolve(value ?? 0)); });
  process.off('SIGINT', stop); process.off('SIGTERM', stop);
  await log.close();
  process.exitCode = Number(code) || 0;
} catch (error) {
  await mkdir(state, { recursive: true });
  const handle = await open(logFile, 'a', 0o600); await handle.write(`[${new Date().toISOString()}] ${error instanceof Error ? error.message : 'Agent failed'}\n`); await handle.close();
  process.exitCode = 1;
} finally {
  await rm(lockFile, { force: true });
}
