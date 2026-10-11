import numpy as np

from app.services.face_align import ARCFACE_TEMPLATE, align_face, crop_face
from app.services.face_detector import SCRFDFaceDetector, distance2bbox, distance2kps
from app.services.face_recognizer import ArcFaceRecognizer
from app.services.onnx_utils import nms
from app.services.pipeline import IdentityMemory


def test_distance2bbox():
    points = np.array([[10.0, 20.0]])
    dist = np.array([[2.0, 3.0, 4.0, 5.0]])
    assert np.allclose(distance2bbox(points, dist), [[8, 17, 14, 25]])


def test_distance2kps():
    points = np.array([[10.0, 20.0]])
    dist = np.array([[1.0, 2.0, -1.0, -2.0]])
    assert np.allclose(distance2kps(points, dist), [[11, 22, 9, 18]])


def test_nms_keeps_best_of_overlapping():
    boxes = np.array([[0, 0, 10, 10], [1, 1, 11, 11], [50, 50, 60, 60]], dtype=np.float32)
    scores = np.array([0.6, 0.9, 0.8], dtype=np.float32)
    assert nms(boxes, scores, 0.4) == [1, 2]


def test_align_face_identity_landmarks_is_noop_shape():
    img = np.random.randint(0, 255, (112, 112, 3), dtype=np.uint8)
    aligned = align_face(img, ARCFACE_TEMPLATE.copy())
    assert aligned.shape == (112, 112, 3)
    # Landmarks already on the template -> near-identity warp.
    assert np.mean(np.abs(aligned.astype(int) - img.astype(int))) < 5


def test_crop_face_fallback():
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    assert crop_face(img, None).shape == (112, 112, 3)
    assert crop_face(img, np.array([100, 100, 200, 220])).shape == (112, 112, 3)


def test_face_detector_without_model():
    det = SCRFDFaceDetector(model_path="missing.onnx")
    assert det.detect_faces(np.zeros((480, 640, 3), dtype=np.uint8)) == []


def test_recognizer_gallery_matching():
    rec = ArcFaceRecognizer(model_path="missing.onnx", threshold=0.5)
    a = np.zeros(512, dtype=np.float32); a[0] = 1
    b = np.zeros(512, dtype=np.float32); b[1] = 1
    rec.add_to_gallery(1, "Alice", a)
    rec.add_to_gallery(2, "Bob", b)

    probe = a * 0.9 + b * 0.1
    probe /= np.linalg.norm(probe)
    match = rec.match(probe)
    assert match.name == "Alice" and match.similarity > 0.9

    stranger = np.zeros(512, dtype=np.float32); stranger[5] = 1
    assert rec.match(stranger).name is None

    rec.remove_from_gallery({1})
    assert rec.gallery_size == 1
    assert rec.match(probe).name is None  # Alice gone, Bob too dissimilar


def test_identity_memory_survives_a_missed_frame():
    mem = IdentityMemory()
    mem.observe(1, "Alice", 0.7, now=0.0)
    assert mem.identity(1)[0] == "Alice"
    mem.observe(1, None, 0.0, now=0.5)  # one check where the face wasn't recognized
    assert mem.identity(1)[0] == "Alice"
    mem.prune(set())
    assert mem.identity(1) == (None, None)


def test_identity_memory_drops_name_after_track_changes_person():
    """A name must not follow a track that has been re-assigned to someone else."""
    mem = IdentityMemory()
    for i in range(30):  # long, confident history
        mem.observe(1, "Alice", 0.8, now=i * 0.5)
    mem.observe(1, None, 0.0, now=16.0)
    mem.observe(1, None, 0.0, now=16.5)
    assert mem.identity(1) == (None, None)
    mem.observe(1, "Bob", 0.6, now=17.0)
    assert mem.identity(1)[0] == "Bob"
