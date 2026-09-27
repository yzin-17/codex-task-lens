import { spawnSync } from 'node:child_process';
import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const version = pkg.version;
const release = path.resolve('release');
const name = `Codex-Task-Lens-${version}-agent`;
const stage = path.join(release, name);
const archive = path.join(release, `${name}.zip`);
await rm(stage, { recursive: true, force: true });
await rm(archive, { force: true });
await mkdir(stage, { recursive: true });
await cp('dist/agent', path.join(stage, 'agent'), { recursive: true });
for (const file of ['launcher.mjs', 'install.command', 'install.ps1', 'install.cmd', 'README.txt']) await cp(path.join('packaging/agent', file), path.join(stage, file));
await writeFile(path.join(stage, 'VERSION'), version + '\n');
if (process.platform !== 'win32') await chmod(path.join(stage, 'install.command'), 0o755);

let command, args;
if (process.platform === 'darwin') {
  command = '/usr/bin/ditto'; args = ['-c', '-k', '--keepParent', stage, archive];
} else if (process.platform === 'win32') {
  command = 'powershell.exe';
  args = ['-NoProfile', '-Command', `Compress-Archive -LiteralPath '${stage.replaceAll("'", "''")}' -DestinationPath '${archive.replaceAll("'", "''")}' -CompressionLevel Optimal`];
} else {
  command = 'zip'; args = ['-q', '-r', archive, path.basename(stage)];
}
const result = spawnSync(command, args, { cwd: process.platform === 'linux' ? release : undefined, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Built ${archive}`);
