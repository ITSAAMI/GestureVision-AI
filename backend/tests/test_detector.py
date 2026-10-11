import numpy as np

from app.services.detector import YOLODetector


def make_preds(boxes, n=8400):
    """Fake YOLO output (1, 84, n): boxes are (cx, cy, w, h, person_score) in 640 space."""
    preds = np.zeros((1, 84, n), dtype=np.float32)
    for i, (cx, cy, w, h, score) in enumerate(boxes):
        preds[0, 0:4, i] = [cx, cy, w, h]
        preds[0, 4, i] = score
    return preds


def test_missing_model_returns_empty():
    detector = YOLODetector(model_path="does/not/exist.onnx")
    assert detector.detect(np.zeros((480, 640, 3), dtype=np.uint8)) == []
    assert detector.is_loaded is False


def test_empty_frame_returns_empty():
    detector = YOLODetector(model_path="does/not/exist.onnx")
    assert detector.detect(np.zeros((0, 0, 3), dtype=np.uint8)) == []


def test_decode_maps_letterbox_back_to_normalized_frame():
    detector = YOLODetector(model_path="unused.onnx", conf_threshold=0.5)
    # 640x480 frame -> scale 1.0, vertical padding 80px
    preds = make_preds([(320, 320, 100, 200, 0.9)])
    dets = detector.decode(preds, scale=1.0, pad_w=0, pad_h=80, orig_w=640, orig_h=480)
    assert len(dets) == 1
    x, y, w, h = dets[0].bbox
    assert np.allclose([x, y, w, h], [270 / 640, 140 / 480, 100 / 640, 200 / 480], atol=1e-4)
    assert dets[0].confidence == np.float32(0.9)


def test_decode_filters_low_scores_and_suppresses_duplicates():
    detector = YOLODetector(model_path="unused.onnx", conf_threshold=0.5, nms_threshold=0.45)
    preds = make_preds([
        (200, 300, 100, 200, 0.95),
        (202, 301, 100, 200, 0.80),  # duplicate of the first
        (500, 300, 80, 180, 0.70),   # separate person
        (100, 100, 50, 50, 0.20),    # below threshold
    ])
    dets = detector.decode(preds, scale=1.0, pad_w=0, pad_h=0, orig_w=640, orig_h=640)
    assert len(dets) == 2
    assert sorted(round(d.confidence, 2) for d in dets) == [0.70, 0.95]
