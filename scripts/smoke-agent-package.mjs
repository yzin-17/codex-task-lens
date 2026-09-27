import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const target = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : null;
if (!target) throw new Error('Direct-launch smoke requires macOS or Windows');
const root = path.resolve('release', `Codex-Task-Lens-${pkg.version}-${target}`);
const resources = target === 'mac' ? path.join(root, 'Codex Task Lens.app/Contents/Resources') : root;
const launcher = path.join(resources, 'launcher.mjs'), cli = path.join(resources, 'agent/node/cli/index.mjs');
const entry = target === 'mac' ? path.join(root, 'Codex Task Lens.app/Contents/MacOS/Codex Task Lens') : path.join(root, 'Codex Task Lens.vbs');
const icon = target === 'mac' ? path.join(root, 'Codex Task Lens.app/Contents/Resources/AppIcon.icns') : path.join(root, 'task-lens-icon.png');
await stat(launcher); await stat(cli); await stat(entry); await stat(icon);

async function run(program, args, env = {}, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd, env: { ...process.env, NODE_PATH: '', ...env }, windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    child.once('error', reject); child.once('exit', code => resolve({ code, stdout, stderr }));
  });
}
const help = await run(process.execPath, [cli, '--help']);
assert.equal(help.code, 0, help.stderr); assert.match(help.stdout, /Codex Task Lens/); assert.doesNotMatch(help.stdout, /Codex Task Lens 独立模式/);
const temporaryHome = await mkdtemp(path.join(tmpdir(), 'task-lens-agent-smoke-'));
const codexHome = path.join(temporaryHome, 'custom-codex-home');
const env = { TASK_LENS_AGENT_SMOKE: '1', HOME: temporaryHome, USERPROFILE: temporaryHome, APPDATA: path.join(temporaryHome, 'AppData/Roaming'), CODEX_HOME: codexHome, CODEX_TASK_LENS_NODE: process.execPath };
await mkdir(env.APPDATA, { recursive: true }); await mkdir(codexHome, { recursive: true });
const launcherSmoke = await run(process.execPath, [launcher], env);
assert.equal(launcherSmoke.code, 0, launcherSmoke.stderr);
const config = JSON.parse(launcherSmoke.stdout.trim());
assert.equal(config.port, 9341); assert.equal(config.sessionScanEnabled, true);
assert(config.args.includes(codexHome), 'CODEX_HOME was not selected as the default session root');

let direct;
if (target === 'mac') direct = await run(entry, [], env);
else {
  const cscript = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/cscript.exe');
  direct = await run(cscript, ['//nologo', entry], env);
}
assert.equal(direct.code, 0, direct.stderr);
const directConfig = JSON.parse(direct.stdout.trim());
assert.equal(directConfig.sessionScanEnabled, true); assert(directConfig.args.includes(codexHome));
const directAgain = target === 'mac' ? await run(entry, [], env) : await run(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/cscript.exe'), ['//nologo', entry], env);
assert.equal(directAgain.code, 0, directAgain.stderr);

async function total(directory) {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    bytes += entry.isDirectory() ? await total(file) : (await stat(file)).size;
  }
  return bytes;
}
const bytes = await total(root);
assert(bytes < 5 * 1024 * 1024, `Agent package directory too large: ${bytes} bytes`);
assert(!(await readdir(resources)).includes('node_modules'));
const archive = path.resolve('release', `Codex-Task-Lens-${pkg.version}-${target}.zip`);
const archiveBytes = (await stat(archive)).size;
assert(archiveBytes < 5 * 1024 * 1024, `Agent archive too large: ${archiveBytes} bytes`);
const report = { passed: true, kind: 'lightweight-agent', version: pkg.version, target, platform: process.platform, arch: process.arch, commit: process.env.GITHUB_SHA || 'local', bytes, archiveBytes, externalNode: process.version, codeHome: codexHome, directLaunchSmoke: true };
if (process.env.TASK_LENS_SMOKE_OUTPUT) await writeFile(process.env.TASK_LENS_SMOKE_OUTPUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await rm(temporaryHome, { recursive: true, force: true });
