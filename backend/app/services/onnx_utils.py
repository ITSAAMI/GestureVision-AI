"""Shared helpers for loading ONNX Runtime sessions."""

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def create_session(model_file: Path, threads: int = 0):
    """Create a CPU inference session, or return None when the file is missing/invalid."""
    if not model_file.exists():
        logger.warning("Model not found: %s", model_file)
        return None
    try:
        import onnxruntime as ort

        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        opts.log_severity_level = 3
        if threads > 0:
            opts.intra_op_num_threads = threads
        session = ort.InferenceSession(str(model_file), sess_options=opts, providers=["CPUExecutionProvider"])
        logger.info("Loaded %s", model_file.name)
        return session
    except Exception:
        logger.exception("Failed to load model %s", model_file)
        return None


def nms(boxes, scores, iou_threshold: float) -> list[int]:
    """Greedy non-maximum suppression on [x1, y1, x2, y2] boxes. Returns kept indices."""
    import numpy as np

    if len(boxes) == 0:
        return []
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)
    order = scores.argsort()[::-1]
    keep: list[int] = []
    while order.size > 0:
        i = int(order[0])
        keep.append(i)
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0.0, xx2 - xx1) * np.maximum(0.0, yy2 - yy1)
        iou = inter / (areas[i] + areas[order[1:]] - inter + 1e-9)
        order = order[1:][iou <= iou_threshold]
    return keep
