# Hackathon submission — GestureVision AI

**Event:** Hacktoberfest Hack Day Rawalpindi × CNCF Islamabad (MLH)
**Track:** Best Open-Source AI Project
**Repository:** https://github.com/ITSAAMI/GestureVision-AI · **License:** AGPL-3.0

## Tagline

Real-time people, face and gesture recognition — plus hand-controlled 3D particles — powered entirely by open-weight AI running on your own machine.

## What it does

GestureVision AI turns any laptop webcam into a private computer-vision workstation:

- **Detects and tracks people** with YOLO11n and a Hungarian-matched tracker with motion trails.
- **Recognizes enrolled faces** — SCRFD finds faces and 5 landmarks, faces are aligned to the ArcFace template, and 512-d embeddings are matched with per-track identity smoothing.
- **Reads 11 hand gestures and body pose** with MediaPipe and a rotation- and scale-invariant 3D gesture classifier (including waving and two-hand gestures).
- **Particle Studio:** steer a GPU particle field (8 formations, up to 40k particles) with gestures — open palm spreads, fist attracts, victory switches formation, pinch scales, wave ripples.
- **Video analysis:** upload footage and get a people-count timeline, per-person tracks, recognized identities and an annotated peak frame.
- Sessions history, live system health, and settings that apply instantly.

## How open-weight AI is central

Every capability is an open-weight model running locally. There are no cloud APIs, and frames never leave the machine.

| Model | Role |
|---|---|
| YOLO11n (Ultralytics, ONNX) | person detection |
| SCRFD-500M (InsightFace) | face detection + landmarks |
| ArcFace MobileFaceNet (InsightFace) | face embeddings for recognition |
| MediaPipe Hand & Pose Landmarker (Google) | hand and body landmarks in the browser (WASM/WebGL) |

## How we built it

- **Backend:** Python, FastAPI, ONNX Runtime, OpenCV, SQLite. A WebSocket protocol with one-frame-in-flight backpressure, a background video worker, and runtime-tunable thresholds.
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, Three.js / React Three Fiber, Zustand, TanStack Query. A single vision engine loop runs only the models that the current page needs.
- **Quality:** 32 backend tests (pytest) and 25 frontend tests (Vitest). Models were checked on real images: same-person face similarity ≈ 0.93, different people ≤ 0.22.

## Challenges

- The original model download links were dead. We moved to YOLO11n and InsightFace's lightweight buffalo_sc models, which cut the download from about 260 MB to about 40 MB and made inference faster on CPU.
- Keeping interaction smooth: hands, pose and gestures run in the browser, while heavier detection runs on the backend without letting frames queue up.
- Stopping a recognized name from "sticking" to the wrong person when tracks swap. We solved this with EMA identity scores that decay quickly on contrary evidence.

## What's next

- Docker / Kubernetes deployment manifests (cloud-native packaging)
- GPU execution providers (CUDA / DirectML) and WebGPU in the browser
- Custom gesture training from a few recorded samples

## Built with

python, fastapi, onnxruntime, opencv, sqlite, react, typescript, vite, tailwindcss, threejs, react-three-fiber, mediapipe, yolo, insightface, arcface
