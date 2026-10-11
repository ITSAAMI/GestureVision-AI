import os
import platform
import shutil
import sys
import time

from fastapi import APIRouter

from app.core import database
from app.core.config import APP_NAME, APP_VERSION, settings
from app.services.detector import detector_instance
from app.services.face_detector import face_detector_instance
from app.services.face_recognizer import face_recognizer_instance

router = APIRouter(prefix="/api/system", tags=["System"])

STARTED_AT = time.time()


def _model_info(service, task: str, license_: str) -> dict:
    path = service.model_path
    exists = path.exists()
    return {
        "name": path.name,
        "task": task,
        "license": license_,
        "available": exists,
        "loaded": service.is_loaded,
        "size_mb": round(path.stat().st_size / 1024 / 1024, 1) if exists else None,
    }


@router.get("/status")
async def get_status():
    # Trigger lazy loading so the status reflects what the pipeline can actually use.
    detector_instance.load()
    face_detector_instance.load()
    face_recognizer_instance.load()
    try:
        import onnxruntime as ort

        ort_info = {"version": ort.__version__, "providers": ort.get_available_providers()}
    except Exception:
        ort_info = {"version": None, "providers": []}

    return {
        "status": "online",
        "name": APP_NAME,
        "version": APP_VERSION,
        "uptime_s": round(time.time() - STARTED_AT, 1),
        "onnxruntime": ort_info,
        "models": {
            "person_detection": _model_info(detector_instance, "Person detection (YOLO11n)", "AGPL-3.0"),
            "face_detection": _model_info(face_detector_instance, "Face detection (SCRFD-500M)", "Non-commercial research"),
            "face_recognition": _model_info(face_recognizer_instance, "Face recognition (ArcFace MBF)", "Non-commercial research"),
        },
        "registered_face_samples": face_recognizer_instance.gallery_size,
    }


@router.get("/diagnostics")
async def get_diagnostics():
    try:
        import psutil

        vm = psutil.virtual_memory()
        proc = psutil.Process()
        resources = {
            "cpu_percent": psutil.cpu_percent(interval=0.2),
            "memory_total_gb": round(vm.total / 1024**3, 1),
            "memory_used_percent": vm.percent,
            "process_memory_mb": round(proc.memory_info().rss / 1024**2, 1),
        }
    except ImportError:
        resources = {"cpu_percent": None, "memory_total_gb": None, "memory_used_percent": None, "process_memory_mb": None}

    disk = shutil.disk_usage(settings.database_file.parent)
    db_size = settings.database_file.stat().st_size if settings.database_file.exists() else 0
    upload_size = sum(f.stat().st_size for f in settings.upload_dir.glob("*") if f.is_file()) if settings.upload_dir.exists() else 0

    async with database.connect() as db:
        counts = {}
        for table, key in (("registered_faces", "face_samples"), ("sessions", "sessions"), ("video_analyses", "videos")):
            async with db.execute(f"SELECT COUNT(*) AS n FROM {table}") as cursor:
                counts[key] = (await cursor.fetchone())["n"]
        async with db.execute("SELECT COUNT(DISTINCT name) AS n FROM registered_faces") as cursor:
            counts["identities"] = (await cursor.fetchone())["n"]

    return {
        "platform": {
            "os": f"{platform.system()} {platform.release()}",
            "machine": platform.machine(),
            "processor": platform.processor() or platform.machine(),
            "python": sys.version.split()[0],
            "cpu_count": os.cpu_count(),
        },
        "resources": {
            **resources,
            "disk_free_gb": round(disk.free / 1024**3, 1),
            "disk_total_gb": round(disk.total / 1024**3, 1),
        },
        "storage": {
            "database_mb": round(db_size / 1024**2, 2),
            "uploads_mb": round(upload_size / 1024**2, 1),
            **counts,
        },
    }
