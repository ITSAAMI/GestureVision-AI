from pydantic import BaseModel, ConfigDict, Field


class RuntimeSettings(BaseModel):
    """Detection settings that can be changed while the server is running."""

    model_config = ConfigDict(extra="forbid")

    detection_confidence: float = Field(0.5, ge=0.05, le=0.95, description="Minimum person detection score")
    nms_iou_threshold: float = Field(0.45, ge=0.1, le=0.9, description="Overlap threshold for duplicate boxes")
    face_detection_confidence: float = Field(0.5, ge=0.1, le=0.95, description="Minimum face detection score")
    face_recognition_threshold: float = Field(0.42, ge=0.2, le=0.9, description="Cosine similarity to accept a match")
    max_detection_fps: int = Field(10, ge=1, le=30, description="Upper bound on frames analysed per second")
    enable_person_detection: bool = True
    enable_face_detection: bool = True
    enable_face_recognition: bool = True
    tracker_max_missed: int = Field(15, ge=1, le=120, description="Frames a lost person is remembered")


class RuntimeSettingsUpdate(BaseModel):
    """Partial update — only provided fields change."""

    model_config = ConfigDict(extra="forbid")

    detection_confidence: float | None = Field(None, ge=0.05, le=0.95)
    nms_iou_threshold: float | None = Field(None, ge=0.1, le=0.9)
    face_detection_confidence: float | None = Field(None, ge=0.1, le=0.95)
    face_recognition_threshold: float | None = Field(None, ge=0.2, le=0.9)
    max_detection_fps: int | None = Field(None, ge=1, le=30)
    enable_person_detection: bool | None = None
    enable_face_detection: bool | None = None
    enable_face_recognition: bool | None = None
    tracker_max_missed: int | None = Field(None, ge=1, le=120)


class SettingsResponse(BaseModel):
    settings: RuntimeSettings
    defaults: RuntimeSettings
