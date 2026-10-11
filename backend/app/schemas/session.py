from pydantic import BaseModel


class SessionResponse(BaseModel):
    id: str
    start_time: str
    end_time: str | None = None
    duration_s: float = 0.0
    frames_processed: int = 0
    detections_count: int = 0
    unique_persons: int = 0
    max_persons: int = 0
    identities: list[str] = []
    gestures_count: int = 0
    gestures: dict[str, int] = {}
    avg_latency_ms: float = 0.0
    avg_fps: float = 0.0


class SessionStats(BaseModel):
    total_sessions: int
    total_duration_s: float
    total_frames: int
    total_gestures: int
    max_persons: int


class SessionListResponse(BaseModel):
    sessions: list[SessionResponse]
    stats: SessionStats
