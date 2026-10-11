/// <reference types="vitest/config" />
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const backend = process.env.BACKEND_URL ?? 'http://127.0.0.1:8000';

/**
 * Serves MediaPipe's WASM runtime from node_modules (dev) and copies it into the
 * build (prod), so the runtime always matches the installed JS version and works offline.
 */
function mediapipeWasm(): Plugin {
  const dir = path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
  const files = [
    'vision_wasm_internal.js',
    'vision_wasm_internal.wasm',
    'vision_wasm_nosimd_internal.js',
    'vision_wasm_nosimd_internal.wasm',
  ];
  return {
    name: 'mediapipe-wasm',
    configureServer(server) {
      server.middlewares.use('/mediapipe/wasm', (req, res, next) => {
        const name = path.basename((req.url ?? '').split('?')[0]);
        if (!files.includes(name)) return next();
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        fs.createReadStream(path.join(dir, name)).pipe(res);
      });
    },
    generateBundle() {
      for (const name of files) {
        this.emitFile({ type: 'asset', fileName: `mediapipe/wasm/${name}`, source: fs.readFileSync(path.join(dir, name)) });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), mediapipeWasm()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/ws': { target: backend.replace(/^http/, 'ws'), ws: true },
    },
  },
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision'],
  },
  build: {
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
