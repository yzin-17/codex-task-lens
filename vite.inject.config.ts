import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({ build: {
  outDir: 'dist/inject', emptyOutDir: true, target: 'es2022',
  lib: { entry: fileURLToPath(new URL('./src/ui/embedded/build-entry.ts', import.meta.url)), name: 'CodexTaskLensBuild', formats: ['iife'], fileName: () => 'task-lens.js' },
} });
