"""Real-time detection over WebSocket.

Protocol
--------
client -> server
    binary          JPEG/PNG/WebP encoded frame
    text (JSON)     {"type": "gesture", "gesture": "<name>"}   counted in session stats
                    {"type": "ping", "t": <client timestamp>}

server -> client
    {"type": "hello", "session_id", "models", "settings"}
    {"type": "analysis", ...FrameAnalysis}            one per received frame
    {"type": "pong", "t": <echoed timestamp>}
    {"type": "error", "message"}

Clients should wait for an ``analysis`` reply before sending the next frame
(the reference frontend does this), which gives natural backpressure.
"""

import asyncio
import json
import logging
import time

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.detector import detector_instance
from app.services.face_detector import face_detector_instance
from app.services.face_recognizer import face_recognizer_instance
from app.services.pipeline import FramePipeline
from app.services.runtime_settings import runtime_settings
from app.services.session_recorder import SessionRecorder

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_FRAME_BYTES = 4 * 1024 * 1024

_pending_saves: set[asyncio.Future] = set()


def model_status() -> dict[str, bool]:
    return {
        "person_detection": detector_instance.load(),
        "face_detection": face_detector_instance.load(),
        "face_recognition": face_recognizer_instance.load(),
    }


@router.websocket("/ws/detect")
async def detect_stream(websocket: WebSocket):
    await websocket.accept()
    pipeline = FramePipeline()
    recorder = SessionRecorder()
    frame_id = 0
    last_processed = 0.0

    await websocket.send_json({
        "type": "hello",
        "session_id": recorder.id,
        "models": await asyncio.to_thread(model_status),
        "settings": runtime_settings.current.model_dump(),
    })

    try:
        while True:
            message = await websocket.receive()
            if message["type"] == "websocket.disconnect":
                break

            text = message.get("text")
            if text is not None:
                await _handle_control(websocket, recorder, text)
                continue

            data = message.get("bytes")
            if not data:
                continue
            if len(data) > MAX_FRAME_BYTES:
                await websocket.send_json({"type": "error", "message": "Frame too large"})
                continue

            # Enforce the configured FPS ceiling by pacing (never by silently dropping,
            # which would stall a client waiting for a reply).
            min_interval = 1.0 / runtime_settings.current.max_detection_fps
            wait = min_interval - (time.monotonic() - last_processed)
            if wait > 0:
                await asyncio.sleep(wait)
            last_processed = time.monotonic()

            frame = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
            if frame is None:
                await websocket.send_json({"type": "error", "message": "Could not decode frame"})
                continue

            frame_id += 1
            analysis = await asyncio.to_thread(pipeline.process, frame, frame_id)
            recorder.record_frame(analysis)
            await websocket.send_json(analysis.model_dump())
            await recorder.flush()

    except WebSocketDisconnect:
        pass
    except RuntimeError as exc:
        # Raised by Starlette when receiving after the socket closed.
        logger.debug("WebSocket closed: %s", exc)
    except Exception:
        logger.exception("WebSocket error")
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        # The handler task may be cancelled on disconnect/shutdown; run the final
        # save as its own task so session stats are never lost.
        save = asyncio.ensure_future(recorder.close())
        _pending_saves.add(save)
        save.add_done_callback(_pending_saves.discard)
        try:
            await asyncio.shield(save)
        except asyncio.CancelledError:
            pass


async def _handle_control(websocket: WebSocket, recorder: SessionRecorder, text: str) -> None:
    try:
        msg = json.loads(text)
    except ValueError:
        return
    if not isinstance(msg, dict):
        return
    kind = msg.get("type")
    if kind == "gesture" and isinstance(msg.get("gesture"), str):
        recorder.record_gesture(msg["gesture"])
    elif kind == "ping":
        await websocket.send_json({"type": "pong", "t": msg.get("t")})
