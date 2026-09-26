import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const output = path.resolve('release'), temporary = await mkdtemp(path.join(tmpdir(), 'task-lens-packaged-'));
const reportFile = path.join(temporary, 'report.json');
let executable;
if (process.platform === 'win32') executable = path.join(output, 'win-unpacked/Codex Task Lens.exe');
else if (process.platform === 'darwin') {
  const directories = await readdir(output); const directory = directories.find(name => name === (process.arch === 'arm64' ? 'mac-arm64' : 'mac'));
  assert(directory, 'No package for the native runner architecture'); executable = path.join(output, directory, 'Codex Task Lens.app/Contents/MacOS/Codex Task Lens');
} else throw new Error('Packaged smoke requires a native macOS or Windows runner');
await mkdir(path.join(temporary, 'empty-bin'));
const env = { ...process.env, PATH: path.join(temporary, 'empty-bin') }; delete env.ELECTRON_RUN_AS_NODE;
let diagnostics = '';
try {
  const code = await new Promise((resolve, reject) => {
    const child = spawn(executable, ['--smoke-test', reportFile], { cwd: temporary, env, windowsHide: true });
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Packaged application timed out')); }, 120000);
    child.stdout.on('data', data => { diagnostics = (diagnostics + data).slice(-12000); });
    child.stderr.on('data', data => { diagnostics = (diagnostics + data).slice(-12000); });
    child.once('error', error => { clearTimeout(timeout); reject(error); }); child.once('exit', code => { clearTimeout(timeout); resolve(code); });
  });
  const report = JSON.parse(await readFile(reportFile, 'utf8'));
  await writeFile(path.join(output, `packaged-smoke-${process.platform}-${process.arch}.json`), JSON.stringify(report, null, 2));
  assert.equal(code, 0, diagnostics); assert.equal(report.passed, true, JSON.stringify(report)); assert.equal(report.noExternalNodePath, true);
  console.log(JSON.stringify(report));
} catch (error) { console.error(diagnostics); throw error; }
finally { await rm(temporary, { recursive: true, force: true }); }
