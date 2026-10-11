"""Multi-person tracker: IoU matching (Hungarian) with constant-velocity prediction.

Each live connection and each video analysis owns its own tracker instance so
track IDs never leak between clients.
"""

import time
from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import linear_sum_assignment


def bb_iou(box_a, box_b) -> float:
    """IoU for [x, y, w, h] boxes."""
    xa = max(box_a[0], box_b[0])
    ya = max(box_a[1], box_b[1])
    xb = min(box_a[0] + box_a[2], box_b[0] + box_b[2])
    yb = min(box_a[1] + box_a[3], box_b[1] + box_b[3])
    inter = max(0.0, xb - xa) * max(0.0, yb - ya)
    union = box_a[2] * box_a[3] + box_b[2] * box_b[3] - inter
    return inter / union if union > 0 else 0.0


@dataclass
class Track:
    track_id: int
    bbox: list[float]
    confidence: float
    first_seen: float
    last_seen: float
    hits: int = 1
    missed: int = 0
    velocity: tuple[float, float] = (0.0, 0.0)
    trail: list[tuple[float, float]] = field(default_factory=list)

    def predicted_bbox(self) -> list[float]:
        x, y, w, h = self.bbox
        vx, vy = self.velocity
        steps = self.missed + 1
        return [x + vx * steps, y + vy * steps, w, h]

    @property
    def center(self) -> tuple[float, float]:
        x, y, w, h = self.bbox
        return x + w / 2, y + h / 2


class MultiPersonTracker:
    def __init__(self, max_disappeared: int = 15, iou_threshold: float = 0.2, smoothing: float = 0.6,
                 min_hits: int = 1, trail_length: int = 24):
        self.max_disappeared = max_disappeared
        self.iou_threshold = iou_threshold
        self.smoothing = smoothing  # weight of the new measurement in the bbox EMA
        self.min_hits = min_hits
        self.trail_length = trail_length
        self.next_id = 1
        self.tracks: dict[int, Track] = {}

    # Kept for backwards compatibility with older call sites/tests.
    @property
    def objects(self) -> dict[int, Track]:
        return self.tracks

    @property
    def total_tracks(self) -> int:
        return self.next_id - 1

    def reset(self) -> None:
        self.tracks.clear()
        self.next_id = 1

    def _register(self, det, now: float) -> None:
        track = Track(self.next_id, list(det.bbox), det.confidence, first_seen=now, last_seen=now)
        track.trail.append(track.center)
        self.tracks[self.next_id] = track
        self.next_id += 1

    def _update_track(self, track: Track, det, now: float) -> None:
        a = self.smoothing
        old = track.bbox
        new = [a * n + (1 - a) * o for n, o in zip(det.bbox, old)]
        steps = track.missed + 1
        vx = (new[0] - old[0]) / steps
        vy = (new[1] - old[1]) / steps
        track.velocity = (0.5 * track.velocity[0] + 0.5 * vx, 0.5 * track.velocity[1] + 0.5 * vy)
        track.bbox = new
        track.confidence = det.confidence
        track.hits += 1
        track.missed = 0
        track.last_seen = now
        track.trail.append(track.center)
        if len(track.trail) > self.trail_length:
            del track.trail[0]

    def _age_unmatched(self, track_ids) -> None:
        for tid in list(track_ids):
            track = self.tracks[tid]
            track.missed += 1
            if track.missed > self.max_disappeared:
                del self.tracks[tid]

    def update(self, detections, now: float | None = None) -> list[Track]:
        """Associate detections (objects with .bbox/.confidence) and return visible tracks."""
        now = time.monotonic() if now is None else now

        if not detections:
            self._age_unmatched(self.tracks.keys())
            return self.visible()

        if not self.tracks:
            for det in detections:
                self._register(det, now)
            return self.visible()

        track_ids = list(self.tracks.keys())
        predicted = [self.tracks[t].predicted_bbox() for t in track_ids]
        iou = np.zeros((len(track_ids), len(detections)), dtype=np.float32)
        for i, pb in enumerate(predicted):
            for j, det in enumerate(detections):
                iou[i, j] = bb_iou(pb, det.bbox)

        rows, cols = linear_sum_assignment(-iou)
        matched_tracks, matched_dets = set(), set()
        for r, c in zip(rows, cols):
            if iou[r, c] < self.iou_threshold:
                continue
            self._update_track(self.tracks[track_ids[r]], detections[c], now)
            matched_tracks.add(track_ids[r])
            matched_dets.add(c)

        self._age_unmatched(t for t in track_ids if t not in matched_tracks)
        for j, det in enumerate(detections):
            if j not in matched_dets:
                self._register(det, now)

        return self.visible()

    def visible(self) -> list[Track]:
        return [t for t in self.tracks.values() if t.missed == 0 and t.hits >= self.min_hits]
