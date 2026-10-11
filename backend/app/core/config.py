"""Application configuration loaded from environment variables / backend/.env.

All relative paths are resolved against the backend directory so the server
behaves the same no matter which working directory it is launched from.
"""

from functools import cached_property
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

APP_NAME = "GestureVision AI"
APP_VERSION = "2.0.0"

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_DIR = BACKEND_DIR.parent


def resolve_path(value: str | Path) -> Path:
    path = Path(value)
    return path if path.is_absolute() else (BACKEND_DIR / path).resolve()


class Settings(BaseSettings):
    # Server
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    RELOAD: bool = False
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    # Model files (ONNX)
    YOLO_MODEL_PATH: str = "models/yolo11n.onnx"
    FACE_DETECT_MODEL_PATH: str = "models/det_500m.onnx"
    FACE_RECOGNIZE_MODEL_PATH: str = "models/w600k_mbf.onnx"
    ONNX_THREADS: int = 0  # 0 = let ONNX Runtime decide

    # Detection defaults (can be overridden at runtime from the Settings page)
    DETECTION_CONFIDENCE: float = 0.5
    NMS_IOU_THRESHOLD: float = 0.45
    FACE_DETECTION_CONFIDENCE: float = 0.5
    FACE_RECOGNITION_THRESHOLD: float = 0.42
    MAX_DETECTION_FPS: int = 10

    # Processing limits
    MAX_FRAME_WIDTH: int = 1280
    MAX_FRAME_HEIGHT: int = 720
    MAX_VIDEO_SIZE_MB: int = 500
    MAX_IMAGE_SIZE_MB: int = 10

    # Storage
    DATA_DIR: str = "data"
    DATABASE_PATH: str = "data/gesturevision.db"
    UPLOAD_DIR: str = "uploads"

    # Serve the built frontend (frontend/dist) from the backend when present
    SERVE_FRONTEND: bool = True

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @cached_property
    def yolo_model_file(self) -> Path:
        return resolve_path(self.YOLO_MODEL_PATH)

    @cached_property
    def face_detect_model_file(self) -> Path:
        return resolve_path(self.FACE_DETECT_MODEL_PATH)

    @cached_property
    def face_recognize_model_file(self) -> Path:
        return resolve_path(self.FACE_RECOGNIZE_MODEL_PATH)

    @cached_property
    def database_file(self) -> Path:
        return resolve_path(self.DATABASE_PATH)

    @cached_property
    def upload_dir(self) -> Path:
        return resolve_path(self.UPLOAD_DIR)

    @cached_property
    def frontend_dist_dir(self) -> Path:
        return PROJECT_DIR / "frontend" / "dist"


settings = Settings()
