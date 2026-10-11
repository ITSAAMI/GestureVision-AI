"""Runtime-tunable settings: persisted in SQLite and pushed into the model services."""

import json
import logging

from app.core import database
from app.core.config import settings as env
from app.schemas.settings import RuntimeSettings, RuntimeSettingsUpdate
from app.services.detector import detector_instance
from app.services.face_detector import face_detector_instance
from app.services.face_recognizer import face_recognizer_instance

logger = logging.getLogger(__name__)


def env_defaults() -> RuntimeSettings:
    return RuntimeSettings(
        detection_confidence=env.DETECTION_CONFIDENCE,
        nms_iou_threshold=env.NMS_IOU_THRESHOLD,
        face_detection_confidence=env.FACE_DETECTION_CONFIDENCE,
        face_recognition_threshold=env.FACE_RECOGNITION_THRESHOLD,
        max_detection_fps=env.MAX_DETECTION_FPS,
    )


class RuntimeSettingsService:
    def __init__(self):
        self.current = env_defaults()

    def apply(self) -> None:
        s = self.current
        detector_instance.conf_threshold = s.detection_confidence
        detector_instance.nms_threshold = s.nms_iou_threshold
        face_detector_instance.conf_threshold = s.face_detection_confidence
        face_recognizer_instance.threshold = s.face_recognition_threshold

    async def load(self) -> None:
        stored: dict = {}
        async with database.connect() as db:
            async with db.execute("SELECT key, value FROM settings") as cursor:
                async for row in cursor:
                    try:
                        stored[row["key"]] = json.loads(row["value"])
                    except (TypeError, ValueError):
                        continue
        known = {k: v for k, v in stored.items() if k in RuntimeSettings.model_fields}
        try:
            self.current = RuntimeSettings(**{**env_defaults().model_dump(), **known})
        except Exception:
            logger.warning("Stored settings were invalid; falling back to defaults")
            self.current = env_defaults()
        self.apply()

    async def update(self, patch: RuntimeSettingsUpdate) -> RuntimeSettings:
        changes = patch.model_dump(exclude_none=True)
        self.current = RuntimeSettings(**{**self.current.model_dump(), **changes})
        async with database.connect() as db:
            await db.executemany(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                [(k, json.dumps(v)) for k, v in changes.items()],
            )
            await db.commit()
        self.apply()
        return self.current

    async def reset(self) -> RuntimeSettings:
        async with database.connect() as db:
            await db.execute("DELETE FROM settings")
            await db.commit()
        self.current = env_defaults()
        self.apply()
        return self.current


runtime_settings = RuntimeSettingsService()
