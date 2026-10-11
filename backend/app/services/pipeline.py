"""Per-stream frame analysis: person detection + tracking + face detection/recognition."""

import time

import cv2
import numpy as np

from app.core.config import settings
from app.schemas.detection import FaceResult, FrameAnalysis, Timing, TrackedPerson
from app.services.detector import detector_instance
from app.services.face_align import align_face
from app.services.face_detector import face_detector_instance
from app.services.face_recognizer import face_recognizer_instance
from app.services.runtime_settings import runtime_settings
from app.services.tracker import MultiPersonTracker, Track

MAX_FACES = 8
RECOGNITION_REFRESH_S = 0.5  # re-check a confidently identified track at most this often


def _r(values, digits: int = 4) -> list[float]:
    return [round(float(v), digits) for v in values]


class IdentityMemory:
    """Smooths face matches per track so names stay stable across frames.

    Each (track, name) keeps an exponential moving average of match similarity.
    Contrary evidence (a different or no match) halves the other names' scores,
    so a name stops following a track within ~1 s after the person changes.
    """

    def __init__(self, alpha: float = 0.5, contrary_decay: float = 0.5, min_score: float = 0.3):
        self.alpha = alpha
        self.contrary_decay = contrary_decay
        self.min_score = min_score
        self.scores: dict[int, dict[str, float]] = {}
        self.last_checked: dict[int, float] = {}

    def observe(self, track_id: int, name: str | None, similarity: float, now: float) -> None:
        scores = self.scores.setdefault(track_id, {})
        for key in list(scores):
            if key != name:
                scores[key] *= self.contrary_decay
                if scores[key] < 0.05:
                    del scores[key]
        if name:
            prev = scores.get(name, 0.0)
            scores[name] = prev + self.alpha * (similarity - prev) if prev else similarity
        self.last_checked[track_id] = now

    def identity(self, track_id: int) -> tuple[str | None, float | None]:
        scores = self.scores.get(track_id)
        if not scores:
            return None, None
        name, score = max(scores.items(), key=lambda kv: kv[1])
        if score < self.min_score:
            return None, None
        return name, round(score, 3)

    def needs_check(self, track_id: int, now: float) -> bool:
        name, _ = self.identity(track_id)
        return name is None or now - self.last_checked.get(track_id, 0.0) >= RECOGNITION_REFRESH_S

    def prune(self, live_ids: set[int]) -> None:
        for tid in list(self.scores):
            if tid not in live_ids:
                self.scores.pop(tid, None)
                self.last_checked.pop(tid, None)


def _owner_track(face_bbox: list[float], tracks: list[Track]) -> Track | None:
    """The smallest person box that contains the face centre."""
    fx = face_bbox[0] + face_bbox[2] / 2
    fy = face_bbox[1] + face_bbox[3] / 2
    best, best_area = None, float("inf")
    for t in tracks:
        x, y, w, h = t.bbox
        if x <= fx <= x + w and y <= fy <= y + h and w * h < best_area:
            best, best_area = t, w * h
    return best


def limit_frame_size(frame: np.ndarray) -> np.ndarray:
    h, w = frame.shape[:2]
    scale = min(settings.MAX_FRAME_WIDTH / w, settings.MAX_FRAME_HEIGHT / h, 1.0)
    if scale < 1.0:
        frame = cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return frame


class FramePipeline:
    def __init__(self, max_missed: int | None = None):
        self.tracker = MultiPersonTracker()
        self.identities = IdentityMemory()
        self.max_missed = max_missed  # overrides the runtime setting (used for sampled video)

    def process(self, frame: np.ndarray, frame_id: int = 0, now: float | None = None) -> FrameAnalysis:
        now = time.monotonic() if now is None else now
        cfg = runtime_settings.current
        self.tracker.max_disappeared = self.max_missed or cfg.tracker_max_missed

        t0 = time.perf_counter()
        frame = limit_frame_size(frame)
        h, w = frame.shape[:2]

        detections = detector_instance.detect(frame) if cfg.enable_person_detection else []
        tracks = self.tracker.update(detections, now)
        t1 = time.perf_counter()

        faces_out: list[FaceResult] = []
        if cfg.enable_face_detection:
            recognize = cfg.enable_face_recognition and face_recognizer_instance.gallery_size > 0
            for face in face_detector_instance.detect_faces(frame, MAX_FACES):
                bbox = face.normalized_bbox(w, h)
                owner = _owner_track(bbox, tracks)
                name, similarity = None, None

                should_check = owner is None or self.identities.needs_check(owner.track_id, now)
                if recognize and face.kps is not None and should_check:
                    emb = face_recognizer_instance.embed(align_face(frame, face.kps))
                    if emb is not None:
                        match = face_recognizer_instance.match(emb)
                        name, similarity = match.name, round(match.similarity, 3)
                        if owner is not None:
                            self.identities.observe(owner.track_id, match.name, match.similarity, now)

                if owner is not None and name is None:
                    name, _ = self.identities.identity(owner.track_id)

                kps = face.normalized_kps(w, h)
                faces_out.append(FaceResult(
                    bbox=_r(bbox),
                    confidence=round(face.score, 3),
                    landmarks=[_r(p) for p in kps] if kps else None,
                    name=name,
                    similarity=similarity,
                    track_id=owner.track_id if owner else None,
                ))
        t2 = time.perf_counter()

        self.identities.prune(set(self.tracker.tracks))
        persons = []
        for t in tracks:
            name, ident_conf = self.identities.identity(t.track_id)
            persons.append(TrackedPerson(
                track_id=t.track_id,
                bbox=_r(t.bbox),
                confidence=round(t.confidence, 3),
                frames_tracked=t.hits,
                age_s=round(now - t.first_seen, 2),
                trail=[_r(p, 3) for p in t.trail],
                name=name,
                identity_confidence=ident_conf,
            ))

        return FrameAnalysis(
            frame_id=frame_id,
            width=w,
            height=h,
            persons=persons,
            faces=faces_out,
            timing=Timing(
                total_ms=round((t2 - t0) * 1000, 1),
                person_ms=round((t1 - t0) * 1000, 1),
                face_ms=round((t2 - t1) * 1000, 1),
            ),
        )
