# GestureVision AI — Frontend

React 19 + TypeScript + Vite + Tailwind CSS 4. See the [project README](../README.md) for setup.

| Command | Description |
|---|---|
| `npm run dev` | Dev server on http://localhost:5173 (proxies `/api` and `/ws` to the backend on :8000; override with `BACKEND_URL`) |
| `npm run build` | Type-check and build to `dist/` (the backend serves it in single-process mode) |
| `npm test` | Unit tests (gesture classifier, smoother, wave detector, formations, pose) |
| `npm run lint` | Oxlint |

MediaPipe's WASM runtime is served from `node_modules` by a small Vite plugin (see `vite.config.ts`), and the
`.task` models are loaded from `public/models/` when present (downloaded by `scripts/download_models.py`),
otherwise from Google's CDN.
