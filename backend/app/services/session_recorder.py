"""Records statistics for one live detection session and persists them to SQLite."""

import json
import logging
import time
import uuid
from collections import Counter
from datetime import datetime, timezone

from app.core import database
from app.schemas.detection import FrameAnalysis

logger = logging.getLogger(__name__)

FLUSH_INTERVAL_S = 10.0


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class SessionRecorder:
    def __init__(self):
        self.id = str(uuid.uuid4())
        self.started_at = utc_now()
        self._t0 = time.monotonic()
        self._last_flush = self._t0
        self.frames = 0
        self.detections = 0
        self.max_persons = 0
        self.track_ids: set[int] = set()
        self.identities: set[str] = set()
        self.gestures: Counter[str] = Counter()
        self._latency_sum = 0.0
        self._created = False

    def record_frame(self, analysis: FrameAnalysis) -> None:
        self.frames += 1
        self.detections += len(analysis.persons)
        self.max_persons = max(self.max_persons, len(analysis.persons))
        self._latency_sum += analysis.timing.total_ms
        for p in analysis.persons:
            self.track_ids.add(p.track_id)
            if p.name:
                self.identities.add(p.name)
        for f in analysis.faces:
            if f.name:
                self.identities.add(f.name)

    def record_gesture(self, gesture: str) -> None:
        if gesture and len(gesture) <= 40:
            self.gestures[gesture] += 1

    @property
    def is_empty(self) -> bool:
        return self.frames == 0 and not self.gestures

    def _row(self) -> dict:
        duration = time.monotonic() - self._t0
        return {
            "id": self.id,
            "start_time": self.started_at,
            "end_time": utc_now(),
            "duration_s": round(duration, 1),
            "frames_processed": self.frames,
            "detections_count": self.detections,
            "unique_persons": len(self.track_ids),
            "max_persons": self.max_persons,
            "identities_json": json.dumps(sorted(self.identities)),
            "gestures_count": sum(self.gestures.values()),
            "gestures_json": json.dumps(dict(self.gestures)),
            "avg_latency_ms": round(self._latency_sum / self.frames, 1) if self.frames else 0.0,
            "avg_fps": round(self.frames / duration, 2) if duration > 0 else 0.0,
        }

    async def flush(self, force: bool = False) -> None:
        now = time.monotonic()
        if self.is_empty or (not force and now - self._last_flush < FLUSH_INTERVAL_S):
            return
        self._last_flush = now
        row = self._row()
        cols = ", ".join(row)
        marks = ", ".join("?" for _ in row)
        try:
            async with database.connect() as db:
                await db.execute(f"INSERT OR REPLACE INTO sessions ({cols}) VALUES ({marks})", tuple(row.values()))
                await db.commit()
            self._created = True
        except Exception:
            logger.exception("Failed to persist session %s", self.id)

    async def close(self) -> None:
        if self.is_empty:
            return
        await self.flush(force=True)
        logger.info("Session %s saved (%d frames, %d gestures)", self.id[:8], self.frames, sum(self.gestures.values()))
