import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({ define: { 'process.env.NODE_ENV': JSON.stringify('production') }, build: {
  outDir: 'dist/inject', emptyOutDir: true, target: 'es2022', cssCodeSplit: false,
  lib: { entry: fileURLToPath(new URL('./src/ui/embedded/build-entry.ts', import.meta.url)), name: 'CodexTaskLensBuild', formats: ['iife'], fileName: () => 'task-lens.js', cssFileName: 'task-lens' },
} });
