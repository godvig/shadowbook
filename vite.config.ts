import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Served from https://godvig.github.io/shadowbook/ in production.
export default defineConfig({
  base: '/shadowbook/',
  plugins: [react()],
  resolve: {
    // maia3-js imports the full onnxruntime-web build; we only need the CPU/wasm backend.
    alias: { 'onnxruntime-web': 'onnxruntime-web/wasm' },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
