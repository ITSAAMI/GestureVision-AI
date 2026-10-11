# GestureVision AI — Architecture

## System Overview

GestureVision AI is a split-architecture application with compute-intensive AI inference distributed between the browser and a local Python backend.

## Processing Distribution

### Browser (Low Latency Path)
The browser handles tasks that require sub-frame latency for interactive responsiveness:

1. **Camera Capture** — `getUserMedia` API provides the raw video stream
2. **Hand Landmark Detection** — MediaPipe HandLandmarker runs as WASM in the browser thread
3. **Pose Landmark Detection** — MediaPipe PoseLandmarker runs as WASM in the browser thread
4. **Gesture Classification** — TypeScript rules engine processes landmarks into gesture labels
5. **3D Rendering** — Three.js/React Three Fiber renders the particle system at 60fps
6. **Overlay Rendering** — Canvas 2D draws bounding boxes, landmarks, names from backend results
7. **State Management** — Zustand stores coordinate all data between components

### Python Backend (Heavy Inference Path)
The backend handles heavier models that would impact browser performance:

1. **Person Detection** — YOLO11n ONNX model (640x640 input) detects humans
2. **Person Tracking** — IoU-based tracker assigns persistent IDs across frames
3. **Face Detection** — SCRFD-500M detects face bounding boxes and landmarks
4. **Face Recognition** — ArcFace (MobileFaceNet) generates 512-dim embeddings from aligned faces for identity matching
5. **Video Analysis** — OpenCV processes uploaded video files frame by frame
6. **Data Storage** — SQLite stores face registrations, sessions, and settings

## Communication

### WebSocket (Real-Time Detection)
- Path: `ws://localhost:8000/ws/detect`
- Frontend sends compressed JPEG frames (640x480, quality 0.7) at ~5 FPS
- Backend returns JSON detection results (persons, faces, recognized identities)
- Results are overlaid on the live camera feed by the frontend

### REST API (CRUD Operations)
- Base: `http://localhost:8000/api/`
- Face registration, settings management, video upload, session history
- Standard JSON request/response

## Data Flow

```
Camera → Video Element → Canvas (capture) → JPEG Blob → WebSocket → Backend
                      ↓                                              ↓
              MediaPipe Hands                                  YOLO Detection
              MediaPipe Pose                                   Person Tracker
                      ↓                                        Face Detection
              Gesture Classifier                               Face Recognition
                      ↓                                              ↓
              Gesture Store ←───── Detection Results (JSON) ←── WebSocket
                      ↓
              3D Particle Engine
                      ↓
              Three.js Render
```

## Key Design Decisions

1. **MediaPipe in browser, not backend** — Gesture-to-3D interaction needs <50ms latency. WebSocket round-trip would add 100-200ms, making interaction feel sluggish.

2. **YOLO on backend** — YOLO11n inference on CPU takes ~100-200ms per frame. Running this in-browser would block the main thread. At 5 FPS detection rate, the round-trip delay is acceptable since bounding boxes don't need per-frame updates.

3. **JPEG over WebSocket** — Sending raw pixels would consume too much bandwidth. JPEG at quality 0.7 reduces a 640x480 frame from ~900KB to ~30-50KB.

4. **Zustand over Redux** — Simpler API, less boilerplate, adequate for this application's state complexity.

5. **Adaptive particle count** — The Intel UHD integrated GPU can handle 5K-20K points with basic shaders. The system monitors render FPS and adjusts particle count automatically.

6. **IoU tracker, not DeepSORT** — DeepSORT requires a re-identification CNN which adds inference cost. Simple IoU matching is sufficient for a fixed webcam with a few people.
