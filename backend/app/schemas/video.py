from typing import Any

from pydantic import BaseModel


class VideoAnalysis(BaseModel):
    id: str
    filename: str
    status: str  # queued | processing | completed | failed
    progress: float
    file_size: int = 0
    sample_fps: float = 5.0
    total_frames: int = 0
    processed_frames: int = 0
    created_at: str
    completed_at: str | None = None
    error: str | None = None
    summary: dict[str, Any] | None = None


class VideoAnalysisDetail(VideoAnalysis):
    results: dict[str, Any] | None = None


class VideoListResponse(BaseModel):
    videos: list[VideoAnalysis]
