from pydantic import BaseModel


class DetectionResult(BaseModel):
    bbox: list[float]  # [x, y, w, h] normalized 0-1
    confidence: float
    class_id: int = 0


class TrackedPerson(BaseModel):
    track_id: int
    bbox: list[float]
    confidence: float
    frames_tracked: int
    age_s: float = 0.0
    trail: list[list[float]] = []
    name: str | None = None
    identity_confidence: float | None = None


class FaceResult(BaseModel):
    bbox: list[float]
    confidence: float = 0.0
    landmarks: list[list[float]] | None = None
    name: str | None = None
    similarity: float | None = None
    track_id: int | None = None


class Timing(BaseModel):
    total_ms: float
    person_ms: float = 0.0
    face_ms: float = 0.0


class FrameAnalysis(BaseModel):
    type: str = "analysis"
    frame_id: int
    width: int
    height: int
    persons: list[TrackedPerson]
    faces: list[FaceResult]
    timing: Timing
