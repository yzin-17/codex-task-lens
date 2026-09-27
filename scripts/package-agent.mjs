import { spawnSync } from 'node:child_process';
import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const version = pkg.version, release = path.resolve('release');
const requested = process.argv.slice(2).filter(arg => arg !== '--');
if (requested.some(arg => !['--mac', '--windows'].includes(arg)) || requested.length > 1) throw new Error('Use --mac or --windows');
const target = requested[0] === '--mac' ? 'mac' : requested[0] === '--windows' ? 'windows' : process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : null;
if (!target) throw new Error('Specify --mac or --windows on this platform');
if ((target === 'mac' && process.platform !== 'darwin') || (target === 'windows' && process.platform !== 'win32')) throw new Error(`Build ${target} package on its native runner`);
const name = `Codex-Task-Lens-${version}-${target}`, stage = path.join(release, name), archive = path.join(release, `${name}.zip`);
await rm(stage, { recursive: true, force: true }); await rm(archive, { force: true }); await mkdir(stage, { recursive: true });

async function copyRuntime(destination) {
  await mkdir(destination, { recursive: true });
  await cp('dist/agent', path.join(destination, 'agent'), { recursive: true });
  await cp('packaging/agent/launcher.mjs', path.join(destination, 'launcher.mjs'));
  await cp('packaging/agent/README.txt', path.join(destination, 'README.txt'));
}

function run(program, args, cwd) {
  const result = spawnSync(program, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (target === 'mac') {
  const app = path.join(stage, 'Codex Task Lens.app'), macOS = path.join(app, 'Contents/MacOS'), resources = path.join(app, 'Contents/Resources');
  await mkdir(macOS, { recursive: true }); await copyRuntime(resources);
  const executable = path.join(macOS, 'Codex Task Lens');
  await cp('packaging/agent/mac-entrypoint.sh', executable); await chmod(executable, 0o755);
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Codex Task Lens</string>
<key>CFBundleDisplayName</key><string>Codex Task Lens</string>
<key>CFBundleIdentifier</key><string>dev.yzin.codex-task-lens.agent</string>
<key>CFBundleVersion</key><string>${version}</string>
<key>CFBundleShortVersionString</key><string>${version}</string>
<key>CFBundleExecutable</key><string>Codex Task Lens</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSUIElement</key><true/>
</dict></plist>\n`;
  await writeFile(path.join(app, 'Contents/Info.plist'), plist);
  run('/usr/bin/plutil', ['-lint', path.join(app, 'Contents/Info.plist')]);
  run('/usr/bin/ditto', ['-c', '-k', '--keepParent', app, archive]);
} else {
  await copyRuntime(stage);
  await cp('packaging/agent/windows-entrypoint.vbs', path.join(stage, 'Codex Task Lens.vbs'));
  const escapedStage = stage.replaceAll("'", "''"), escapedArchive = archive.replaceAll("'", "''");
  run('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path (Join-Path '${escapedStage}' '*') -DestinationPath '${escapedArchive}' -CompressionLevel Optimal`]);
}
console.log(`Built ${archive}`);
