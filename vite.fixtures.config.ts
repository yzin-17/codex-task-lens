import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({ root: fileURLToPath(new URL('./tests/fixtures/ui', import.meta.url)), server: { host: '127.0.0.1', port: 4174, strictPort: true, fs: { allow: [fileURLToPath(new URL('.', import.meta.url))] } } });
