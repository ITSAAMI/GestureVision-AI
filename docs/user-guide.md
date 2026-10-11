# GestureVision AI — User Guide

## Getting Started

After installation, open [http://localhost:5173](http://localhost:5173) in your browser.

### First Launch Checklist

1. **Allow camera access** when prompted by the browser
2. **Check system diagnostics** — Navigate to System Diagnostics to verify all models are loaded
3. **Test live detection** — Go to Live Detection and click Start

## Application Sections

### 1. Live Detection

The main workspace for real-time AI processing.

**What you'll see:**
- Live camera feed with bounding boxes around detected people
- Person count display
- Tracking IDs for each person
- Active gesture display (when hands are visible)
- Body pose information

**Controls:**
- **Start** — Begin camera processing
- **Pause** — Freeze processing (camera stays active)
- **Stop** — Release camera and stop processing

### 2. Particle Studio

Interactive 3D particle environment controlled by hand gestures.

**Formations available:**
1. Sphere — Particles arranged on a sphere surface
2. Torus — Donut shape
3. Galaxy — Spiral galaxy with arms
4. DNA Helix — Double helix structure
5. Wave — Sinusoidal wave surface
6. Cube — Particles on cube faces
7. Human Silhouette — Body outline
8. Free Cloud — Random distribution

**Gesture Controls:**
- Open Palm → Spread particles
- Closed Fist → Attract to center
- Victory Sign → Next formation
- Pinch → Scale formation
- Point → Move cursor
- Thumbs Up → Positive animation
- Wave → Wave effect

You can also use mouse controls:
- Left drag — Rotate view
- Scroll — Zoom
- Right drag — Pan

### 3. Gesture Controls

Configure how hand gestures map to actions.

- View all supported gestures
- Customize action mappings
- Adjust detection thresholds
- Set cooldown durations (prevent rapid triggers)
- Test gestures with the camera preview

### 4. Face Registration

Register faces for identity recognition.

**To register a new face:**
1. Navigate to Face Registration
2. Click "Capture from Camera" (ensure your face is clearly visible)
3. Enter your display name
4. Click "Register"

**Important:**
- Only register your own face or faces with consent
- Face data is stored locally only
- You can delete any registration at any time
- Recognition requires frontal face visibility

### 5. Human Tracking

Monitor multi-person tracking in detail.

- View all tracked individuals
- See tracking IDs and persistence
- Select which person controls the 3D scene
- Controller modes: Primary user, Selected ID, Closest person

### 6. Video Analysis

Analyze uploaded video files.

**Supported formats:** MP4, WebM, AVI, MOV (browser-dependent)

**To analyze a video:**
1. Click "Upload Video" or drag-and-drop
2. Wait for upload to complete
3. Click "Start Analysis"
4. View detection results with timestamps

**Note:** Processing speed depends on video length and resolution.

### 7. Session History

View past detection sessions.

- Session timestamps
- Total detections and gestures per session
- Delete old sessions

### 8. Settings

Configure all application parameters.

**Detection Settings:**
- Confidence threshold (higher = fewer false positives)
- Processing FPS (lower = better performance)
- Processing resolution

**Gesture Settings:**
- Stability frames (more frames = more confident detection)
- Cooldown duration (prevent rapid re-triggers)

**Particle Settings:**
- Particle count (lower = better performance)
- Performance mode (reduces effects)

**Privacy Settings:**
- Data retention period
- Clear all data

### 9. System Diagnostics

Check system health and capabilities.

- Model loading status (green = loaded, red = missing)
- WebSocket connection status
- Browser capabilities (WebGL2, WASM)
- Camera devices detected
- Performance metrics

## Tips for Best Results

### Camera
- Use good lighting (avoid backlighting)
- Face the camera directly for face recognition
- Keep hands in the camera frame for gesture detection
- A plain background improves detection accuracy

### Performance
- Close other GPU-intensive applications
- Use Chrome or Edge for best WebGL performance
- Reduce particle count if FPS drops below 30
- Lower detection FPS to 3 if the system feels sluggish

### Gestures
- Make gestures clearly and hold them briefly
- Keep your hand within the camera frame
- Start with palm facing the camera for best detection
- Practice individual gestures before using them to control 3D

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Toggle camera Start/Pause |
| Escape | Stop camera |
| 1-8 | Switch particle formation |
| F | Toggle fullscreen camera view |
