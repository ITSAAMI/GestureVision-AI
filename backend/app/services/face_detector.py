"""SCRFD ONNX face detector with full anchor decoding, keypoints and NMS.

Compatible with InsightFace SCRFD exports (e.g. ``det_500m.onnx`` from buffalo_sc).
"""

import logging
import threading
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from app.core.config import settings
from app.services.onnx_utils import create_session, nms

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class Face:
    """A detected face in pixel coordinates of the source frame."""

    box: np.ndarray        # [x1, y1, x2, y2]
    score: float
    kps: np.ndarray | None  # (5, 2) eyes, nose, mouth corners

    def normalized_bbox(self, width: int, height: int) -> list[float]:
        x1, y1, x2, y2 = self.box
        return [float(x1 / width), float(y1 / height), float((x2 - x1) / width), float((y2 - y1) / height)]

    def normalized_kps(self, width: int, height: int) -> list[list[float]] | None:
        if self.kps is None:
            return None
        return [[float(x / width), float(y / height)] for x, y in self.kps]

    @property
    def area(self) -> float:
        return float(max(0.0, self.box[2] - self.box[0]) * max(0.0, self.box[3] - self.box[1]))


def distance2bbox(points: np.ndarray, distance: np.ndarray) -> np.ndarray:
    x1 = points[:, 0] - distance[:, 0]
    y1 = points[:, 1] - distance[:, 1]
    x2 = points[:, 0] + distance[:, 2]
    y2 = points[:, 1] + distance[:, 3]
    return np.stack([x1, y1, x2, y2], axis=-1)


def distance2kps(points: np.ndarray, distance: np.ndarray) -> np.ndarray:
    preds = []
    for i in range(0, distance.shape[1], 2):
        preds.append(points[:, i % 2] + distance[:, i])
        preds.append(points[:, i % 2 + 1] + distance[:, i + 1])
    return np.stack(preds, axis=-1)


class SCRFDFaceDetector:
    INPUT_MEAN = 127.5
    INPUT_STD = 128.0

    def __init__(self, model_path=None, conf_threshold: float = 0.5, nms_threshold: float = 0.4,
                 det_size: tuple[int, int] = (640, 640)):
        self.model_path = Path(model_path) if model_path is not None else settings.face_detect_model_file
        self.conf_threshold = conf_threshold
        self.nms_threshold = nms_threshold
        self.det_size = det_size
        self._session = None
        self._load_attempted = False
        self._lock = threading.Lock()
        self._center_cache: dict[tuple[int, int, int], np.ndarray] = {}

    @property
    def is_loaded(self) -> bool:
        return self._session is not None

    @property
    def model_name(self) -> str:
        return self.model_path.name

    def load(self) -> bool:
        if self._session is not None:
            return True
        with self._lock:
            if self._load_attempted:
                return self._session is not None
            self._load_attempted = True
            session = create_session(self.model_path, settings.ONNX_THREADS)
            if session is None:
                return False
            try:
                self._configure(session)
                self._session = session
            except Exception:
                logger.exception("Unsupported SCRFD model layout: %s", self.model_path)
        return self._session is not None

    def reload(self) -> bool:
        with self._lock:
            self._session = None
            self._load_attempted = False
        return self.load()

    def _configure(self, session) -> None:
        inp = session.get_inputs()[0]
        self._input_name = inp.name
        if isinstance(inp.shape[2], int) and isinstance(inp.shape[3], int):
            self.det_size = (inp.shape[3], inp.shape[2])
        outputs = session.get_outputs()
        self._output_names = [o.name for o in outputs]
        self._batched = len(outputs[0].shape) == 3

        n = len(outputs)
        layouts = {
            6: (3, [8, 16, 32], 2, False),
            9: (3, [8, 16, 32], 2, True),
            10: (5, [8, 16, 32, 64, 128], 1, False),
            15: (5, [8, 16, 32, 64, 128], 1, True),
        }
        if n not in layouts:
            raise ValueError(f"Unexpected number of SCRFD outputs: {n}")
        self._fmc, self._strides, self._num_anchors, self._use_kps = layouts[n]

    def _anchor_centers(self, height: int, width: int, stride: int) -> np.ndarray:
        key = (height, width, stride)
        centers = self._center_cache.get(key)
        if centers is None:
            centers = np.stack(np.mgrid[:height, :width][::-1], axis=-1).astype(np.float32)
            centers = (centers * stride).reshape((-1, 2))
            if self._num_anchors > 1:
                centers = np.stack([centers] * self._num_anchors, axis=1).reshape((-1, 2))
            self._center_cache[key] = centers
        return centers

    def detect_faces(self, frame: np.ndarray, max_faces: int = 0) -> list[Face]:
        """Detect faces in a BGR frame; returns pixel-space results sorted by size."""
        if frame is None or frame.size == 0 or not self.load():
            return []
        try:
            return self._detect(frame, max_faces)
        except Exception:
            logger.exception("Face detection failed")
            return []

    def _detect(self, frame: np.ndarray, max_faces: int) -> list[Face]:
        in_w, in_h = self.det_size
        h, w = frame.shape[:2]
        im_ratio = h / w
        model_ratio = in_h / in_w
        if im_ratio > model_ratio:
            new_h = in_h
            new_w = int(new_h / im_ratio)
        else:
            new_w = in_w
            new_h = int(new_w * im_ratio)
        det_scale = new_h / h

        canvas = np.zeros((in_h, in_w, 3), dtype=np.uint8)
        canvas[:new_h, :new_w] = cv2.resize(frame, (new_w, new_h))
        blob = cv2.dnn.blobFromImage(
            canvas, 1.0 / self.INPUT_STD, (in_w, in_h),
            (self.INPUT_MEAN, self.INPUT_MEAN, self.INPUT_MEAN), swapRB=True,
        )
        outs = self._session.run(self._output_names, {self._input_name: blob})

        scores_all, boxes_all, kps_all = [], [], []
        fmc = self._fmc
        for idx, stride in enumerate(self._strides):
            if self._batched:
                scores = outs[idx][0]
                bbox_preds = outs[idx + fmc][0] * stride
                kps_preds = outs[idx + fmc * 2][0] * stride if self._use_kps else None
            else:
                scores = outs[idx]
                bbox_preds = outs[idx + fmc] * stride
                kps_preds = outs[idx + fmc * 2] * stride if self._use_kps else None

            centers = self._anchor_centers(in_h // stride, in_w // stride, stride)
            scores = scores.reshape(-1)
            pos = np.where(scores >= self.conf_threshold)[0]
            if pos.size == 0:
                continue
            scores_all.append(scores[pos])
            boxes_all.append(distance2bbox(centers, bbox_preds)[pos])
            if kps_preds is not None:
                kps_all.append(distance2kps(centers, kps_preds).reshape((-1, 5, 2))[pos])

        if not scores_all:
            return []

        scores = np.concatenate(scores_all)
        boxes = np.concatenate(boxes_all) / det_scale
        kpss = np.concatenate(kps_all) / det_scale if kps_all else None

        keep = nms(boxes, scores, self.nms_threshold)
        faces = []
        for i in keep:
            box = boxes[i].copy()
            box[[0, 2]] = np.clip(box[[0, 2]], 0, w)
            box[[1, 3]] = np.clip(box[[1, 3]], 0, h)
            faces.append(Face(box=box, score=float(scores[i]), kps=kpss[i] if kpss is not None else None))

        faces.sort(key=lambda f: f.area, reverse=True)
        if max_faces > 0:
            faces = faces[:max_faces]
        return faces


face_detector_instance = SCRFDFaceDetector(conf_threshold=settings.FACE_DETECTION_CONFIDENCE)
