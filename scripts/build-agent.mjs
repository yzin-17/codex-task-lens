import { build } from 'esbuild';
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve('dist/agent');
await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'node/cli'), { recursive: true });
await build({
  entryPoints: ['src/cli/index.ts'],
  outfile: path.join(out, 'node/cli/index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info',
});
await cp('dist/inject', path.join(out, 'inject'), { recursive: true });
await cp('dist/ui', path.join(out, 'ui'), { recursive: true });
const files = [path.join(out, 'node/cli/index.mjs'), path.join(out, 'inject/task-lens.js'), path.join(out, 'inject/task-lens.css')];
let bytes = 0; for (const file of files) bytes += (await stat(file)).size;
console.log(`Agent runtime: ${(bytes / 1024).toFixed(1)} KiB core assets`);
