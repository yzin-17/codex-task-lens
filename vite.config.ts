import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('./src/ui/standalone', import.meta.url)),
  build: { outDir: fileURLToPath(new URL('./dist/ui', import.meta.url)), emptyOutDir: true, target: 'es2022' },
});
