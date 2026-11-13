import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Served from https://shadowbook.godvig.com/ in production.
export default defineConfig({
  base: '/',
  plugins: [react()],
  resolve: {
    // maia3-js imports the full onnxruntime-web build; we only need the CPU/wasm backend.
    alias: { 'onnxruntime-web': 'onnxruntime-web/wasm' },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    // One HTML entry per crawlable page: the app plus the match hub in English and Swedish.
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        match: resolve(import.meta.dirname, 'world-chess-championship-2026/index.html'),
        matchSv: resolve(import.meta.dirname, 'sv/schack-vm-2026/index.html'),
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
