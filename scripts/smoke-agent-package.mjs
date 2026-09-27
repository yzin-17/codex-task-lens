import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const root = path.resolve('release', `Codex-Task-Lens-${pkg.version}-agent`);
const launcher = path.join(root, 'launcher.mjs'), cli = path.join(root, 'agent/node/cli/index.mjs');
await stat(launcher); await stat(cli);
async function run(program, args, env = {}, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd, env: { ...process.env, NODE_PATH: '', ...env }, windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    child.once('error', reject); child.once('exit', code => resolve({ code, stdout, stderr }));
  });
}
const help = await run(process.execPath, [cli, '--help']);
assert.equal(help.code, 0, help.stderr); assert.match(help.stdout, /Codex Task Lens/);
const temporaryHome = await mkdtemp(path.join(tmpdir(), 'task-lens-agent-smoke-'));
const env = { TASK_LENS_AGENT_SMOKE: '1', HOME: temporaryHome, USERPROFILE: temporaryHome, APPDATA: path.join(temporaryHome, 'AppData/Roaming') };
await mkdir(env.APPDATA, { recursive: true });
const smoke = await run(process.execPath, [launcher], env);
assert.equal(smoke.code, 0, smoke.stderr);
const config = JSON.parse(smoke.stdout.trim());
assert.equal(config.port, 9341); assert.equal(config.sessionScanEnabled, true);
let installedLauncher;
if (process.platform === 'darwin') {
  const install = await run('/bin/zsh', [path.join(root, 'install.command')], { ...env, TASK_LENS_INSTALL_NO_LAUNCH: '1' });
  assert.equal(install.code, 0, install.stderr);
  installedLauncher = path.join(temporaryHome, 'Applications/Codex Task Lens.app/Contents/MacOS/Codex Task Lens');
} else if (process.platform === 'win32') {
  const installRoot = path.join(temporaryHome, 'CodexTaskLensInstall');
  const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const install = await run(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'install.ps1'), '-InstallRoot', installRoot, '-NoLaunch', '-SkipShortcuts'], env);
  assert.equal(install.code, 0, install.stderr + install.stdout);
  installedLauncher = path.join(installRoot, 'runtime', pkg.version, 'launcher.mjs');
}
if (installedLauncher) {
  const installed = process.platform === 'darwin' ? await run(installedLauncher, [], env) : await run(process.execPath, [installedLauncher], env);
  assert.equal(installed.code, 0, installed.stderr);
  assert.equal(JSON.parse(installed.stdout.trim()).sessionScanEnabled, true);
}
async function total(directory) {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    bytes += entry.isDirectory() ? await total(file) : (await stat(file)).size;
  }
  return bytes;
}
const bytes = await total(root);
assert(bytes < 5 * 1024 * 1024, `Agent staging directory too large: ${bytes} bytes`);
assert(!(await readdir(root)).includes('node_modules'));
const report = { passed: true, kind: 'lightweight-agent', version: pkg.version, platform: process.platform, arch: process.arch, commit: process.env.GITHUB_SHA || 'local', bytes, externalNode: process.version, config, installerSmoke: !!installedLauncher };
if (process.env.TASK_LENS_SMOKE_OUTPUT) await writeFile(process.env.TASK_LENS_SMOKE_OUTPUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await rm(temporaryHome, { recursive: true, force: true });
