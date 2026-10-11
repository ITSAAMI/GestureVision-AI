"""Offline video analysis: samples frames, detects/tracks people and recognizes faces.

Jobs run one at a time on a background worker; the CPU-heavy loop executes in a
thread so the API stays responsive. Progress is kept in memory and the final
results are persisted to SQLite.
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path

import cv2

from app.core import database
from app.core.config import settings
from app.services.pipeline import FramePipeline
from app.services.session_recorder import utc_now

logger = logging.getLogger(__name__)

MAX_TIMELINE_POINTS = 480
MIN_TRACK_DURATION_S = 0.5  # shorter tracks are usually detector flicker

TRACK_COLORS = [
    (246, 130, 59), (94, 197, 34), (11, 158, 245), (247, 85, 168),
    (212, 182, 20), (68, 68, 239), (166, 184, 20), (250, 139, 167),
]


@dataclass
class JobProgress:
    status: str = "queued"
    progress: float = 0.0
    processed_frames: int = 0
    total_frames: int = 0
    error: str | None = None
    cancelled: bool = field(default=False, repr=False)


def peak_frame_path(video_id: str) -> Path:
    return settings.upload_dir / f"{video_id}_peak.jpg"


def thumbnail_path(video_id: str) -> Path:
    return settings.upload_dir / f"{video_id}_thumb.jpg"


def _annotate(frame, analysis) -> bytes | None:
    img = frame.copy()
    h, w = img.shape[:2]
    thickness = max(2, round(min(w, h) / 360))
    for p in analysis.persons:
        x, y, bw, bh = p.bbox
        color = TRACK_COLORS[p.track_id % len(TRACK_COLORS)]
        x1, y1, x2, y2 = int(x * w), int(y * h), int((x + bw) * w), int((y + bh) * h)
        cv2.rectangle(img, (x1, y1), (x2, y2), color, thickness)
        label = f"#{p.track_id}" + (f" {p.name}" if p.name else "")
        scale = 0.5 * thickness
        (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, scale, thickness)
        cv2.rectangle(img, (x1, max(0, y1 - th - 10)), (x1 + tw + 10, y1), color, -1)
        cv2.putText(img, label, (x1 + 5, max(th, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, scale, (255, 255, 255), thickness)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return buf.tobytes() if ok else None


def _downsample(timeline: list[dict], limit: int) -> list[dict]:
    if len(timeline) <= limit:
        return timeline
    bucket = len(timeline) / limit
    out = []
    for i in range(limit):
        chunk = timeline[int(i * bucket):int((i + 1) * bucket)] or [timeline[min(int(i * bucket), len(timeline) - 1)]]
        out.append({
            "t": chunk[0]["t"],
            "persons": max(c["persons"] for c in chunk),
            "faces": max(c["faces"] for c in chunk),
        })
    return out


class VideoAnalyzer:
    def __init__(self):
        self.jobs: dict[str, JobProgress] = {}
        self._queue: asyncio.Queue[tuple[str, Path, float]] | None = None
        self._worker: asyncio.Task | None = None

    def start(self) -> None:
        if self._worker is None or self._worker.done():
            self._queue = asyncio.Queue()
            self._worker = asyncio.create_task(self._run_worker(), name="video-analyzer")

    async def stop(self) -> None:
        for job in self.jobs.values():
            job.cancelled = True
        if self._worker:
            self._worker.cancel()
            try:
                await self._worker
            except (asyncio.CancelledError, Exception):
                pass
            self._worker = None

    def enqueue(self, video_id: str, path: Path, sample_fps: float) -> JobProgress:
        self.start()
        job = JobProgress()
        self.jobs[video_id] = job
        self._queue.put_nowait((video_id, path, sample_fps))
        return job

    def cancel(self, video_id: str) -> None:
        job = self.jobs.get(video_id)
        if job:
            job.cancelled = True

    async def _run_worker(self) -> None:
        while True:
            video_id, path, sample_fps = await self._queue.get()
            job = self.jobs.get(video_id)
            if job is None or job.cancelled:
                continue
            job.status = "processing"
            await self._persist(video_id, status="processing")
            try:
                results = await asyncio.to_thread(self._analyze, video_id, path, sample_fps, job)
                if not job.cancelled:
                    await self._persist(
                        video_id, status="completed", progress=100.0, total_frames=job.total_frames,
                        processed_frames=job.processed_frames, results_json=json.dumps(results),
                        completed_at=utc_now(), error=None,
                    )
            except Exception as exc:
                logger.exception("Video analysis failed for %s", video_id)
                await self._persist(
                    video_id, status="failed", error=str(exc) or exc.__class__.__name__, completed_at=utc_now()
                )
            finally:
                # Final state now lives in the database.
                self.jobs.pop(video_id, None)

    async def _persist(self, video_id: str, **fields) -> None:
        cols = ", ".join(f"{k} = ?" for k in fields)
        try:
            async with database.connect() as db:
                await db.execute(f"UPDATE video_analyses SET {cols} WHERE id = ?", (*fields.values(), video_id))
                await db.commit()
        except Exception:
            logger.exception("Failed to persist video job %s", video_id)

    def _analyze(self, video_id: str, path: Path, sample_fps: float, job: JobProgress) -> dict:
        started = time.perf_counter()
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            raise ValueError("Unsupported or corrupt video file")

        try:
            fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
            if fps <= 0 or fps > 240:
                fps = 25.0
            total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
            job.total_frames = total
            step = max(1, round(fps / max(0.1, sample_fps)))

            effective_fps = fps / step
            pipeline = FramePipeline(max_missed=max(3, int(effective_fps * 1.5)))

            timeline: list[dict] = []
            spans: dict[int, list[float]] = {}
            track_names: dict[int, str] = {}
            identities: dict[str, dict] = {}
            peak_count, peak_t, face_total = -1, 0.0, 0
            person_sum = 0
            idx = 0
            thumb_written = False

            while not job.cancelled:
                if not cap.grab():
                    break
                if idx % step == 0:
                    ok, frame = cap.retrieve()
                    if not ok or frame is None:
                        idx += 1
                        continue
                    t = idx / fps
                    analysis = pipeline.process(frame, frame_id=idx, now=t)

                    if not thumb_written:
                        thumb = cv2.resize(frame, (320, int(320 * frame.shape[0] / frame.shape[1])))
                        cv2.imwrite(str(thumbnail_path(video_id)), thumb, [cv2.IMWRITE_JPEG_QUALITY, 80])
                        thumb_written = True

                    n = len(analysis.persons)
                    person_sum += n
                    face_total += len(analysis.faces)
                    timeline.append({"t": round(t, 2), "persons": n, "faces": len(analysis.faces)})

                    for p in analysis.persons:
                        span = spans.setdefault(p.track_id, [t, t])
                        span[1] = t
                        if p.name:
                            track_names[p.track_id] = p.name
                    for f in analysis.faces:
                        if f.name:
                            info = identities.setdefault(f.name, {"name": f.name, "first_seen": t, "last_seen": t, "detections": 0})
                            info["last_seen"] = t
                            info["detections"] += 1

                    if n > peak_count:
                        peak_count, peak_t = n, t
                        jpeg = _annotate(frame, analysis)
                        if jpeg:
                            peak_frame_path(video_id).write_bytes(jpeg)

                    job.processed_frames += 1
                    if total > 0:
                        job.progress = round(min(99.0, idx / total * 100), 1)
                idx += 1
        finally:
            cap.release()

        if not timeline:
            raise ValueError("No frames could be read from this video")

        duration = (total / fps) if total > 0 else idx / fps
        elapsed = time.perf_counter() - started
        tracks = [
            {
                "track_id": tid,
                "first_seen": round(a, 2),
                "last_seen": round(b, 2),
                "duration_s": round(b - a, 2),
                "name": track_names.get(tid),
            }
            for tid, (a, b) in sorted(spans.items(), key=lambda kv: kv[1][0])
        ]
        people = [t for t in tracks if t["duration_s"] >= MIN_TRACK_DURATION_S] or tracks

        return {
            "summary": {
                "duration_s": round(duration, 2),
                "source_fps": round(fps, 2),
                "total_frames": total or idx,
                "frames_analyzed": len(timeline),
                "sample_fps": round(effective_fps, 2),
                "width": width,
                "height": height,
                "max_persons": max(0, peak_count),
                "max_persons_at": round(peak_t, 2),
                "avg_persons": round(person_sum / len(timeline), 2),
                "unique_people": len(people),
                "face_detections": face_total,
                "processing_time_s": round(elapsed, 2),
                "realtime_factor": round(duration / elapsed, 2) if elapsed > 0 else 0.0,
            },
            "timeline": _downsample(timeline, MAX_TIMELINE_POINTS),
            "tracks": people[:200],
            "identities": sorted(identities.values(), key=lambda i: -i["detections"]),
            "has_peak_frame": peak_frame_path(video_id).exists(),
        }


video_analyzer_instance = VideoAnalyzer()
