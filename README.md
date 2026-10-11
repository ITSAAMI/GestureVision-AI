<div align="center">

# GestureVision AI

**A real-time computer-vision workstation built entirely on open-weight AI models.**

Detect and track people, recognize enrolled faces, read 11 hand gestures and body pose,
analyze recorded video — and steer a 40,000-particle 3D galaxy with your hands.
Everything runs locally: no cloud APIs, no data leaves your machine.

![License](https://img.shields.io/badge/license-AGPL--3.0-8b7bff)
![Python](https://img.shields.io/badge/python-3.10%2B-38bdf8)
![React](https://img.shields.io/badge/react-19-34d399)
![Models](https://img.shields.io/badge/models-YOLO11%20%C2%B7%20SCRFD%20%C2%B7%20ArcFace%20%C2%B7%20MediaPipe-fbbf24)

</div>

---

## Features

| | |
|---|---|
| 🎯 **Person detection & tracking** | YOLO11n (ONNX) + Hungarian-matched IoU tracker with velocity prediction and motion trails |
| 🧑 **Face recognition** | SCRFD-500M face detection → 5-point alignment → ArcFace 512-d embeddings, with per-track identity smoothing |
| ✋ **11 hand gestures** | MediaPipe hand landmarks + a rotation/scale-invariant 3D classifier, temporal smoothing, wave and two-hand gestures |
| 🧍 **Body pose** | MediaPipe pose (33 points): standing, sitting, arms raised, T-pose, leaning |
| 🌌 **Particle Studio** | GPU shader particle field (8 formations, 6 palettes) controlled by gestures — or the mouse |
| 🎞️ **Video analysis** | Upload footage → people-count timeline, per-person tracks, recognized identities, annotated peak frame |
| 📊 **Sessions & health** | Every live session is recorded; live model status, CPU/RAM, browser GPU capabilities |
| ⚙️ **Live-tunable** | Detection thresholds, recognition strictness and FPS caps apply instantly, persisted in SQLite |

## Open-weight models

| Model | Task | Runs in | License |
|---|---|---|---|
| [YOLO11n](https://github.com/ultralytics/ultralytics) | Person detection | Backend · ONNX Runtime | AGPL-3.0 |
| [SCRFD-500M](https://github.com/deepinsight/insightface/tree/master/detection/scrfd) | Face detection + landmarks | Backend · ONNX Runtime | InsightFace (non-commercial research) |
| [ArcFace MobileFaceNet (WebFace600K)](https://github.com/deepinsight/insightface) | Face embeddings | Backend · ONNX Runtime | InsightFace (non-commercial research) |
| [MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) | 21 hand landmarks × 2 | Browser · WASM/WebGL | Apache-2.0 |
| [MediaPipe Pose Landmarker Lite](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) | 33 body landmarks | Browser · WASM/WebGL | Apache-2.0 |

Total download ≈ 40 MB. See [docs/model-licenses.md](docs/model-licenses.md).

## Architecture

```
 Browser (React 19 · TypeScript · Vite)                 Backend (FastAPI · Python)
┌────────────────────────────────────────┐   JPEG     ┌──────────────────────────────────┐
│ Camera ─► Vision engine (rAF loop)     │  frames    │ /ws/detect                        │
│   ├─ MediaPipe hands  ─► gesture rules ├──────────► │   YOLO11n ─► person tracker       │
│   ├─ MediaPipe pose   ─► pose rules    │ WebSocket  │   SCRFD ─► align ─► ArcFace match │
│   └─ frame encoder (1 frame in flight) │ ◄──────────┤   identity smoothing per track    │
│ Canvas overlays · Three.js particles   │   JSON     │ REST: faces · video · sessions ·  │
│ Zustand stores · React Query           │ ◄────────► │       settings · system           │
└────────────────────────────────────────┘    REST    │ SQLite · background video worker  │
                                                      └──────────────────────────────────┘
```

* **Low-latency work stays in the browser** (hands, pose, gestures, 3D) so interaction never waits on the network.
* **Heavier models run on the backend**; the WebSocket keeps exactly one frame in flight, so a slow CPU never builds a backlog.
* Pages declare what they need (`useVisionDemand`) — inference only runs for features on screen.

## Quick start

**Requirements:** Python 3.10+, Node.js 18+, a webcam, Chrome/Edge.

```bash
# 1. Download the AI models (~40 MB)
python scripts/download_models.py

# 2. Backend
cd backend
python -m pip install -r requirements.txt
python main.py                      # http://127.0.0.1:8000  (API docs at /docs)

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                         # http://localhost:5173
```

On Windows you can start everything with `.\scripts\start.ps1`.

**Single-process mode:** run `npm run build` in `frontend/`, then `python backend/main.py` serves the app at http://127.0.0.1:8000.

## Deploy (free)

The repo includes a [Render Blueprint](render.yaml) that deploys both parts on Render's free tier:

| Service | What | URL |
|---|---|---|
| `gesturevision` | Static React build (`frontend/`), always on | https://gvisionai.tech |
| `gesturevision-api` | FastAPI backend in Docker ([backend/Dockerfile](backend/Dockerfile)), models baked in | https://api.gvisionai.tech |

1. Render → **New → Blueprint** → select this repository → **Apply**.
2. Point DNS at Render (shown under each service's *Custom Domains*): `api` and `www` as CNAMEs, the apex as an A record.
3. The frontend reads the backend address from `VITE_API_URL` at build time.

Free web services sleep after ~15 minutes idle and wake in about a minute; browser-side features (hands, gestures, pose, Particle Studio) work immediately. Data on the free backend is ephemeral (it resets on redeploy).

## Gestures

| Gesture | Particle Studio action |
|---|---|
| ✋ Open palm | Spread particles outward |
| ✊ Closed fist | Attract particles to your hand |
| ☝️ Point | Steer a cursor that pushes particles |
| 🤏 Pinch | Pinch and move up/down to scale |
| ✌️ Victory / 🤞 Two fingers | Next / previous formation |
| 👍 Thumbs up / 👎 Thumbs down | Energy burst / reverse rotation |
| 👋 Wave | Ripple through the field |
| 🙌 Both hands up / 🙏 Hands together | Expand / compact |

## Testing

```bash
cd backend && python -m pip install -r requirements-dev.txt && python -m pytest   # 32 tests
cd frontend && npm test                                                           # 25 tests
```

## Project structure

```
backend/
  app/api/          REST routes + WebSocket protocol
  app/services/     detector, face detector/aligner/recognizer, tracker, pipeline, video worker
  app/core/         config (.env), SQLite with additive migrations
  tests/            pytest suite (isolated temp database)
frontend/src/
  app/              shell: sidebar, header, status bar, navigation
  features/vision/  vision engine, MediaPipe loader, WebSocket client, overlay renderer
  features/gestures gesture classifier, smoother, catalog (+ tests)
  features/particles formations, shader particle field (+ tests)
  pages/            Overview, Live, Particle Studio, Gesture Lab, Faces, Video, Sessions, System, Settings
scripts/            model downloader, Windows start script
docs/               architecture, installation, user guide, model licenses
```

## Privacy

* All inference runs on your machine; camera frames go only to your local backend.
* Face embeddings and thumbnails are stored in a local SQLite database and can be deleted per person or all at once.
* Only enroll people who have given consent.

## License

GestureVision AI is licensed under the [GNU AGPL-3.0](LICENSE). Model weights are downloaded separately and remain under their own licenses — the InsightFace face models are for non-commercial research use only.
