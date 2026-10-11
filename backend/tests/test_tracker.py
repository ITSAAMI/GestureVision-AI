import pytest

from app.schemas.detection import DetectionResult
from app.services.tracker import MultiPersonTracker, bb_iou


def det(x, y, w=0.2, h=0.4, conf=0.9):
    return DetectionResult(bbox=[x, y, w, h], confidence=conf)


def test_bb_iou():
    assert bb_iou([0, 0, 0.5, 0.5], [0, 0, 0.5, 0.5]) == pytest.approx(1.0)
    assert bb_iou([0, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]) == pytest.approx(0.0)
    assert bb_iou([0, 0, 0.5, 0.5], [0.25, 0, 0.5, 0.5]) == pytest.approx(1 / 3, rel=1e-3)


def test_ids_start_at_one_and_are_unique():
    tracker = MultiPersonTracker()
    tracks = tracker.update([det(0.1, 0.1), det(0.6, 0.1)], now=0.0)
    assert sorted(t.track_id for t in tracks) == [1, 2]


def test_track_persists_across_small_motion():
    tracker = MultiPersonTracker()
    tracker.update([det(0.10, 0.1)], now=0.0)
    tracks = tracker.update([det(0.12, 0.11)], now=0.1)
    assert len(tracks) == 1
    assert tracks[0].track_id == 1
    assert tracks[0].hits == 2


def test_lost_track_is_hidden_then_forgotten():
    tracker = MultiPersonTracker(max_disappeared=2)
    tracker.update([det(0.1, 0.1)], now=0.0)
    assert tracker.update([], now=0.1) == []  # not visible while missing...
    assert len(tracker.tracks) == 1            # ...but still remembered
    tracker.update([], now=0.2)
    tracker.update([], now=0.3)
    assert len(tracker.tracks) == 0


def test_reacquired_track_keeps_id():
    tracker = MultiPersonTracker(max_disappeared=5)
    tracker.update([det(0.3, 0.2)], now=0.0)
    tracker.update([], now=0.1)
    tracks = tracker.update([det(0.31, 0.2)], now=0.2)
    assert [t.track_id for t in tracks] == [1]


def test_far_detection_creates_new_track():
    tracker = MultiPersonTracker()
    tracker.update([det(0.0, 0.0)], now=0.0)
    tracks = tracker.update([det(0.7, 0.5)], now=0.1)
    assert [t.track_id for t in tracks] == [2]


def test_crossing_people_keep_identities():
    tracker = MultiPersonTracker()
    tracker.update([det(0.10, 0.2), det(0.60, 0.2)], now=0.0)
    tracks = tracker.update([det(0.62, 0.2), det(0.12, 0.2)], now=0.1)  # order swapped
    by_x = sorted(tracks, key=lambda t: t.bbox[0])
    assert [t.track_id for t in by_x] == [1, 2]


def test_trail_is_bounded():
    tracker = MultiPersonTracker(trail_length=5)
    for i in range(20):
        tracker.update([det(0.1 + i * 0.005, 0.1)], now=i * 0.1)
    assert len(tracker.tracks[1].trail) == 5
