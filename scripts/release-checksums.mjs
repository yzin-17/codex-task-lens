import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const directory = path.resolve(process.argv[2] || 'artifacts'), version = JSON.parse(await readFile('package.json', 'utf8')).version;
const files = (await readdir(directory)).sort();
for (const platform of ['mac-arm64', 'mac-x64']) for (const ext of ['dmg', 'zip']) assert(files.includes(`Codex-Task-Lens-${version}-${platform}.${ext}`), `Missing ${platform}.${ext}`);
assert(files.includes(`Codex-Task-Lens-${version}-win-x64-Setup.exe`)); assert(files.includes(`Codex-Task-Lens-${version}-win-x64.zip`));
for (const [platform, arch] of [['darwin', 'arm64'], ['darwin', 'x64'], ['win32', 'x64']]) {
  const report = JSON.parse(await readFile(path.join(directory, `packaged-smoke-${platform}-${arch}.json`), 'utf8'));
  assert(report.passed && report.version === version && report.platform === platform && report.arch === arch);
}
const lines = [];
for (const name of files) {
  if (!/\.(dmg|exe|zip|json)$/.test(name)) continue;
  const hash = createHash('sha256'); for await (const chunk of createReadStream(path.join(directory, name))) hash.update(chunk);
  lines.push(`${hash.digest('hex')}  ${name}`);
}
await writeFile(path.join(directory, 'SHA256SUMS'), lines.join('\n') + '\n');
