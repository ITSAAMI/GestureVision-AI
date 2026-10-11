import json
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.core import database
from app.core.config import settings
from app.schemas.video import VideoAnalysis, VideoAnalysisDetail, VideoListResponse
from app.services.video_analyzer import peak_frame_path, thumbnail_path, video_analyzer_instance

router = APIRouter(prefix="/api/video", tags=["Video"])

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".mpg", ".mpeg", ".wmv"}
CHUNK = 1024 * 1024
UUID_RE = re.compile(r"^[0-9a-f-]{36}$")


def _display_name(filename: str | None) -> str:
    name = Path(filename or "video").name  # strips any directory components
    return re.sub(r"[\x00-\x1f]", "", name)[:200] or "video"


def _check_id(video_id: str) -> None:
    if not UUID_RE.match(video_id):
        raise HTTPException(status_code=404, detail="Video not found")


def _to_model(row, include_results: bool = False):
    r = dict(row)
    results = None
    if r.get("results_json"):
        try:
            results = json.loads(r["results_json"])
        except ValueError:
            results = None

    status, progress = r["status"], r["progress"] or 0.0
    processed, total = r.get("processed_frames") or 0, r.get("total_frames") or 0
    job = video_analyzer_instance.jobs.get(r["id"])
    if job is not None:  # live progress for running jobs
        status, progress = job.status, job.progress
        processed, total = job.processed_frames, job.total_frames

    data = dict(
        id=r["id"],
        filename=r["filename"],
        status=status,
        progress=progress,
        file_size=r.get("file_size") or 0,
        sample_fps=r.get("sample_fps") or 5.0,
        total_frames=total,
        processed_frames=processed,
        created_at=str(r["created_at"]),
        completed_at=str(r["completed_at"]) if r.get("completed_at") else None,
        error=r.get("error"),
        summary=(results or {}).get("summary"),
    )
    if include_results:
        return VideoAnalysisDetail(**data, results=results)
    return VideoAnalysis(**data)


async def _get_row(video_id: str):
    _check_id(video_id)
    async with database.connect() as db:
        async with db.execute("SELECT * FROM video_analyses WHERE id = ?", (video_id,)) as cursor:
            row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Video not found")
    return row


@router.post("/upload", response_model=VideoAnalysis, status_code=201)
async def upload_video(file: UploadFile = File(...), sample_fps: float = Form(5.0)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail=f"Unsupported file type '{ext or 'unknown'}'. Use MP4, MOV, AVI, MKV or WebM.")
    if not 0.5 <= sample_fps <= 30:
        raise HTTPException(status_code=422, detail="sample_fps must be between 0.5 and 30")

    video_id = str(uuid.uuid4())
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    dest = settings.upload_dir / f"{video_id}{ext}"
    limit = settings.MAX_VIDEO_SIZE_MB * 1024 * 1024
    size = 0
    try:
        with dest.open("wb") as out:
            while chunk := await file.read(CHUNK):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(status_code=413, detail=f"Video exceeds {settings.MAX_VIDEO_SIZE_MB} MB limit")
                out.write(chunk)
    except BaseException:
        dest.unlink(missing_ok=True)
        raise
    if size == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    async with database.connect() as db:
        await db.execute(
            "INSERT INTO video_analyses (id, filename, filepath, status, progress, file_size, sample_fps) "
            "VALUES (?, ?, ?, 'queued', 0, ?, ?)",
            (video_id, _display_name(file.filename), str(dest), size, sample_fps),
        )
        await db.commit()

    video_analyzer_instance.enqueue(video_id, dest, sample_fps)
    return _to_model(await _get_row(video_id))


@router.get("", response_model=VideoListResponse)
async def list_videos():
    async with database.connect() as db:
        async with db.execute("SELECT * FROM video_analyses ORDER BY created_at DESC LIMIT 100") as cursor:
            rows = await cursor.fetchall()
    return VideoListResponse(videos=[_to_model(r) for r in rows])


@router.get("/{video_id}", response_model=VideoAnalysisDetail)
async def get_video(video_id: str):
    return _to_model(await _get_row(video_id), include_results=True)


@router.get("/{video_id}/peak.jpg")
async def get_peak_frame(video_id: str):
    await _get_row(video_id)
    path = peak_frame_path(video_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="No annotated frame available")
    return FileResponse(path, media_type="image/jpeg")


@router.get("/{video_id}/thumbnail.jpg")
async def get_thumbnail(video_id: str):
    await _get_row(video_id)
    path = thumbnail_path(video_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="No thumbnail available")
    return FileResponse(path, media_type="image/jpeg")


@router.delete("/{video_id}")
async def delete_video(video_id: str):
    row = await _get_row(video_id)
    video_analyzer_instance.cancel(video_id)
    for path in (Path(row["filepath"]), peak_frame_path(video_id), thumbnail_path(video_id)):
        try:
            # Only ever delete files inside the upload directory.
            if path.resolve().is_relative_to(settings.upload_dir.resolve()):
                path.unlink(missing_ok=True)
        except OSError:
            pass
    async with database.connect() as db:
        await db.execute("DELETE FROM video_analyses WHERE id = ?", (video_id,))
        await db.commit()
    return {"deleted": 1}
