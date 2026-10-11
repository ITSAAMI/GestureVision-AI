"""Face alignment to the canonical ArcFace 112x112 template."""

import cv2
import numpy as np

ARCFACE_TEMPLATE = np.array(
    [
        [38.2946, 51.6963],
        [73.5318, 51.5014],
        [56.0252, 71.7366],
        [41.5493, 92.3655],
        [70.7299, 92.2041],
    ],
    dtype=np.float32,
)


def align_face(image: np.ndarray, kps: np.ndarray, size: int = 112) -> np.ndarray:
    """Warp a face so its 5 landmarks match the ArcFace template (similarity transform)."""
    dst = ARCFACE_TEMPLATE * (size / 112.0)
    matrix, _ = cv2.estimateAffinePartial2D(kps.astype(np.float32), dst, method=cv2.LMEDS)
    if matrix is None:
        return crop_face(image, None, size)
    return cv2.warpAffine(image, matrix, (size, size), borderValue=0.0)


def crop_face(image: np.ndarray, box: np.ndarray | None, size: int = 112, margin: float = 0.15) -> np.ndarray:
    """Fallback square crop around a box (or the image centre) when landmarks are unavailable."""
    h, w = image.shape[:2]
    if box is None:
        side = min(h, w)
        x1, y1 = (w - side) // 2, (h - side) // 2
        return cv2.resize(image[y1:y1 + side, x1:x1 + side], (size, size))

    x1, y1, x2, y2 = box
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    side = max(x2 - x1, y2 - y1) * (1 + margin)
    x1, y1 = int(max(0, cx - side / 2)), int(max(0, cy - side / 2))
    x2, y2 = int(min(w, cx + side / 2)), int(min(h, cy + side / 2))
    if x2 <= x1 or y2 <= y1:
        return crop_face(image, None, size)
    return cv2.resize(image[y1:y2, x1:x2], (size, size))
