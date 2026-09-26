import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
rmSync('dist/node', { recursive: true, force: true });
for (const [entry, args] of [
  ['node_modules/typescript/bin/tsc', ['-p', 'tsconfig.build.json']],
  ['node_modules/vite/bin/vite.js', ['build']],
  ['node_modules/vite/bin/vite.js', ['build', '--config', 'vite.inject.config.ts']],
]) {
  const result = spawnSync(process.execPath, [entry, ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
