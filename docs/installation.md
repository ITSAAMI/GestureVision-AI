# GestureVision AI — Installation Guide

## System Requirements

### Minimum
- **OS**: Windows 10/11 (64-bit)
- **CPU**: Intel Core i5 or equivalent (x64)
- **RAM**: 8 GB
- **GPU**: Any WebGL2-compatible graphics (integrated or discrete)
- **Camera**: USB webcam or built-in laptop camera
- **Browser**: Chrome 90+, Edge 90+, Firefox 90+
- **Python**: 3.10 or later
- **Node.js**: 18.0 or later

### Recommended
- **RAM**: 16 GB
- **GPU**: Discrete GPU with 2+ GB VRAM (for higher particle counts)
- **Camera**: 720p or higher resolution

## Installation Steps

### 1. Clone the Repository

```powershell
git clone https://github.com/ITSAAMI/GestureVision-AI.git
cd GestureVision-AI
```

### 2. Download AI Models

```powershell
python scripts/download_models.py
```

This downloads (~40 MB total):
- `yolo11n.onnx` (~11 MB) — person detection → `backend/models/`
- `det_500m.onnx` + `w600k_mbf.onnx` (from InsightFace `buffalo_sc.zip`, ~15 MB) — face detection & recognition → `backend/models/`
- `hand_landmarker.task`, `pose_landmarker_lite.task` (~13 MB) — MediaPipe → `frontend/public/models/`

**If a download fails**, get the files manually:
- YOLO11n: https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.onnx
- Face models: https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_sc.zip (extract `det_500m.onnx` and `w600k_mbf.onnx`)

### 3. Backend Setup

```powershell
cd backend

# Install Python dependencies
python -m pip install -r requirements.txt

# Create environment file
copy .env.example .env

# (Optional) Edit .env to customize settings
notepad .env
```

### 4. Frontend Setup

```powershell
cd frontend

# Install Node.js dependencies
npm install
```

### 5. Start the Application

#### Option A: Start Script (Recommended)

```powershell
.\scripts\start.ps1
```

#### Option B: Manual Start

**Terminal 1 — Backend:**
```powershell
cd backend
python main.py
```

**Terminal 2 — Frontend:**
```powershell
cd frontend
npm run dev
```

### 6. Open the Application

Navigate to [http://localhost:5173](http://localhost:5173) in your browser.

The backend API runs at [http://localhost:8000](http://localhost:8000) with Swagger docs at [http://localhost:8000/docs](http://localhost:8000/docs).

## Configuration

### Environment Variables (backend/.env)

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | 127.0.0.1 | Backend server host |
| `PORT` | 8000 | Backend server port |
| `CORS_ORIGINS` | http://localhost:5173 | Allowed CORS origins |
| `DETECTION_CONFIDENCE` | 0.5 | Person detection threshold (0.0-1.0) |
| `FACE_RECOGNITION_THRESHOLD` | 0.42 | Cosine similarity to accept a face match |
| `MAX_DETECTION_FPS` | 10 | Backend processing rate cap |
| `MAX_FRAME_WIDTH` | 1280 | Larger frames are downscaled |
| `MAX_FRAME_HEIGHT` | 720 | Larger frames are downscaled |
| `MAX_VIDEO_SIZE_MB` | 500 | Maximum upload file size |

### In-App Settings

All settings can also be adjusted from the **Settings** page in the application.

## Troubleshooting

### Camera not detected
1. Ensure your webcam is connected and not in use by another application
2. Check browser permissions for camera access
3. Try a different browser
4. On Windows, check Privacy Settings > Camera

### Backend won't start
1. Check that Python 3.10+ is installed: `python --version`
2. Verify all dependencies installed: `python -m pip install -r requirements.txt`
3. Check if port 8000 is available: `netstat -an | findstr :8000`
4. Look at the console output for error messages

### Models not loading
1. Run `python scripts/download_models.py` to re-download
2. Check `backend/models/` directory for the ONNX files
3. The app will still start without models but detection features will be unavailable

### Low performance
1. Reduce detection FPS in Settings (default: 5)
2. Lower processing resolution in Settings
3. Reduce particle count in Particle Studio settings
4. Close other GPU-intensive applications
5. Use a Chromium-based browser for best WebGL performance

### WebSocket connection failed
1. Ensure the backend is running on port 8000
2. Check for firewall blocking WebSocket connections
3. The frontend will attempt to auto-reconnect every 3 seconds
