import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const directory = path.resolve(process.argv[2] || 'artifacts');
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const files = (await readdir(directory)).sort();

for (const target of ['mac', 'windows']) {
  assert(
    files.includes(`Codex-Task-Lens-${version}-${target}.zip`),
    `Missing ${target} archive`,
  );
}

for (const platform of ['darwin-arm64', 'win32-x64']) {
  const name = `agent-smoke-${platform}.json`;
  assert(files.includes(name), `Missing ${name}`);

  const report = JSON.parse(await readFile(path.join(directory, name), 'utf8'));
  assert(
    report.passed &&
      report.kind === 'lightweight-agent' &&
      report.version === version &&
      report.directLaunchSmoke,
    `Invalid smoke report: ${name}`,
  );

  if (process.env.GITHUB_SHA) {
    assert.equal(report.commit, process.env.GITHUB_SHA, 'Artifact commit mismatch');
  }
}
