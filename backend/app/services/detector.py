"""YOLO (v8 / 11) ONNX person detector with letterbox preprocessing and NMS."""

import logging
import threading
from dataclasses import dataclass

import cv2
import numpy as np

from app.core.config import settings
from app.services.onnx_utils import create_session, nms

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class Detection:
    """A single person detection. ``bbox`` is [x, y, w, h] normalized to 0-1."""

    bbox: list[float]
    confidence: float
    class_id: int = 0


class YOLODetector:
    """Person detector for Ultralytics YOLOv8/YOLO11 ONNX exports (output: 1 x 84 x N)."""

    PERSON_CLASS_ID = 0

    def __init__(self, model_path=None, conf_threshold: float = 0.5, nms_threshold: float = 0.45):
        self.model_path = model_path if model_path is not None else settings.yolo_model_file
        self.conf_threshold = conf_threshold
        self.nms_threshold = nms_threshold
        self._session = None
        self._input_name = ""
        self._input_size = 640
        self._load_attempted = False
        self._lock = threading.Lock()

    @property
    def is_loaded(self) -> bool:
        return self._session is not None

    @property
    def model_name(self) -> str:
        return getattr(self.model_path, "name", str(self.model_path))

    def load(self) -> bool:
        """Lazy-load the model once. Returns True if it is available."""
        if self._session is not None:
            return True
        with self._lock:
            if self._load_attempted:
                return self._session is not None
            self._load_attempted = True
            from pathlib import Path

            self._session = create_session(Path(self.model_path), settings.ONNX_THREADS)
            if self._session is not None:
                inp = self._session.get_inputs()[0]
                self._input_name = inp.name
                if isinstance(inp.shape[2], int):
                    self._input_size = inp.shape[2]
        return self._session is not None

    def reload(self) -> bool:
        with self._lock:
            self._session = None
            self._load_attempted = False
        return self.load()

    def _preprocess(self, frame: np.ndarray):
        h, w = frame.shape[:2]
        size = self._input_size
        scale = min(size / w, size / h)
        new_w, new_h = int(round(w * scale)), int(round(h * scale))
        pad_w, pad_h = (size - new_w) // 2, (size - new_h) // 2

        resized = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        canvas = np.full((size, size, 3), 114, dtype=np.uint8)
        canvas[pad_h:pad_h + new_h, pad_w:pad_w + new_w] = resized

        # Ultralytics models are trained on RGB input.
        blob = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        blob = blob.transpose(2, 0, 1)[np.newaxis]
        return np.ascontiguousarray(blob), scale, pad_w, pad_h

    def decode(self, preds: np.ndarray, scale: float, pad_w: int, pad_h: int, orig_w: int, orig_h: int) -> list[Detection]:
        """Turn raw model output (1 x 84 x N) into normalized person detections."""
        if preds.ndim == 3:
            preds = preds[0]
        if preds.shape[0] < preds.shape[1]:
            preds = preds.T  # -> (N, 4 + classes)

        scores = preds[:, 4 + self.PERSON_CLASS_ID]
        mask = scores > self.conf_threshold
        if not np.any(mask):
            return []

        boxes = preds[mask, :4]
        scores = scores[mask]

        cx, cy, bw, bh = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
        x1 = np.clip((cx - bw / 2 - pad_w) / scale, 0, orig_w)
        y1 = np.clip((cy - bh / 2 - pad_h) / scale, 0, orig_h)
        x2 = np.clip((cx + bw / 2 - pad_w) / scale, 0, orig_w)
        y2 = np.clip((cy + bh / 2 - pad_h) / scale, 0, orig_h)
        xyxy = np.stack([x1, y1, x2, y2], axis=1)

        results: list[Detection] = []
        for i in nms(xyxy, scores, self.nms_threshold):
            bw_i, bh_i = x2[i] - x1[i], y2[i] - y1[i]
            if bw_i < 2 or bh_i < 2:
                continue
            results.append(Detection(
                bbox=[float(x1[i] / orig_w), float(y1[i] / orig_h), float(bw_i / orig_w), float(bh_i / orig_h)],
                confidence=float(scores[i]),
                class_id=self.PERSON_CLASS_ID,
            ))
        return results

    def detect(self, frame: np.ndarray) -> list[Detection]:
        """Detect people in a BGR frame. Returns [] when the model is unavailable."""
        if frame is None or frame.size == 0 or not self.load():
            return []
        try:
            h, w = frame.shape[:2]
            blob, scale, pad_w, pad_h = self._preprocess(frame)
            preds = self._session.run(None, {self._input_name: blob})[0]
            return self.decode(preds, scale, pad_w, pad_h, w, h)
        except Exception:
            logger.exception("Person detection failed")
            return []


# Backwards-compatible alias
YOLOv8Detector = YOLODetector

detector_instance = YOLODetector(
    conf_threshold=settings.DETECTION_CONFIDENCE,
    nms_threshold=settings.NMS_IOU_THRESHOLD,
)
