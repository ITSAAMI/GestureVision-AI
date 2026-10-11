# AI Model Licenses

GestureVision AI's source code is licensed under AGPL-3.0. The model weights are **not** distributed
with the repository — `scripts/download_models.py` fetches them from their official publishers, and
each keeps its own license.

| File | Model | Publisher | Source | License |
|---|---|---|---|---|
| `backend/models/yolo11n.onnx` | YOLO11n (person class) | Ultralytics | [ultralytics/assets v8.3.0](https://github.com/ultralytics/assets/releases/tag/v8.3.0) | AGPL-3.0 (Enterprise license required for closed-source commercial use) |
| `backend/models/det_500m.onnx` | SCRFD-500M with 5 keypoints | InsightFace | [`buffalo_sc.zip`, insightface v0.7](https://github.com/deepinsight/insightface/releases/tag/v0.7) | InsightFace pretrained models: non-commercial research only |
| `backend/models/w600k_mbf.onnx` | ArcFace MobileFaceNet, WebFace600K | InsightFace | same archive | InsightFace pretrained models: non-commercial research only |
| `frontend/public/models/hand_landmarker.task` | MediaPipe Hand Landmarker | Google | [MediaPipe models](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) | Apache-2.0 |
| `frontend/public/models/pose_landmarker_lite.task` | MediaPipe Pose Landmarker Lite | Google | [MediaPipe models](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) | Apache-2.0 |

If the browser models are not downloaded, the app loads them from Google's CDN instead.

## Notes

1. The project is published under AGPL-3.0 to stay compatible with Ultralytics' YOLO weights.
2. InsightFace's code is MIT, but its **pretrained weights** are licensed for non-commercial research.
   Replace them with commercially licensed weights before any commercial deployment.
3. Model files are excluded from version control (`.gitignore`).

## Data privacy

- Face embeddings (512 floats) and 112×112 aligned thumbnails are stored locally in SQLite.
- No biometric data is sent to external services.
- Identities can be deleted individually or all at once (Face Registry / Settings).
- Camera frames are processed in memory and never written to disk.
