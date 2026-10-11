import asyncio
import base64
import binascii

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException

from app.core import database
from app.core.config import settings
from app.schemas.face import FaceData, FaceListResponse, FaceRegisterRequest, FaceRegisterResponse
from app.services.face_align import align_face
from app.services.face_detector import face_detector_instance
from app.services.face_recognizer import face_recognizer_instance

router = APIRouter(prefix="/api/faces", tags=["Faces"])


def _thumbnail_url(blob: bytes | None) -> str | None:
    if not blob:
        return None
    return "data:image/jpeg;base64," + base64.b64encode(blob).decode("ascii")


def _decode_image(payload: str) -> np.ndarray:
    raw = payload.split(",", 1)[1] if payload.startswith("data:") else payload
    try:
        data = base64.b64decode(raw, validate=False)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Image is not valid base64")
    if len(data) > settings.MAX_IMAGE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Image exceeds {settings.MAX_IMAGE_SIZE_MB} MB")
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Could not decode image (use JPEG, PNG or WebP)")
    return img


def _prepare_face(img: np.ndarray):
    """Detect the largest face, align it and compute its embedding (runs in a worker thread)."""
    faces = face_detector_instance.detect_faces(img, max_faces=1)
    if not faces:
        return None
    face = faces[0]
    aligned = align_face(img, face.kps) if face.kps is not None else None
    if aligned is None:
        return None
    embedding = face_recognizer_instance.embed(aligned)
    ok, jpeg = cv2.imencode(".jpg", aligned, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return face, embedding, jpeg.tobytes() if ok else None


@router.post("/register", response_model=FaceRegisterResponse, status_code=201)
async def register_face(req: FaceRegisterRequest):
    if not face_detector_instance.load() or not face_recognizer_instance.load():
        raise HTTPException(
            status_code=503,
            detail="Face models are not installed. Run: python scripts/download_models.py",
        )

    img = _decode_image(req.image_base64)
    prepared = await asyncio.to_thread(_prepare_face, img)
    if prepared is None:
        raise HTTPException(status_code=422, detail="No face detected. Face the camera in good lighting and try again.")
    face, embedding, thumbnail = prepared
    if embedding is None:
        raise HTTPException(status_code=500, detail="Could not compute a face embedding")

    async with database.connect() as db:
        cursor = await db.execute(
            "INSERT INTO registered_faces (name, embedding_blob, thumbnail, embedding_dim) VALUES (?, ?, ?, ?)",
            (req.name, embedding.astype(np.float32).tobytes(), thumbnail, int(embedding.shape[0])),
        )
        face_id = cursor.lastrowid
        await db.commit()
        async with db.execute("SELECT created_at FROM registered_faces WHERE id = ?", (face_id,)) as cur:
            row = await cur.fetchone()

    face_recognizer_instance.add_to_gallery(face_id, req.name, embedding)
    return FaceRegisterResponse(
        face=FaceData(id=face_id, name=req.name, created_at=str(row["created_at"]), thumbnail=_thumbnail_url(thumbnail)),
        detection_confidence=round(face.score, 3),
        aligned=True,
        message=f"Registered a face sample for {req.name}",
    )


@router.get("", response_model=FaceListResponse)
async def list_faces():
    async with database.connect() as db:
        async with db.execute(
            "SELECT id, name, created_at, thumbnail FROM registered_faces ORDER BY created_at DESC, id DESC"
        ) as cursor:
            rows = await cursor.fetchall()
    return FaceListResponse(faces=[
        FaceData(id=r["id"], name=r["name"], created_at=str(r["created_at"]), thumbnail=_thumbnail_url(r["thumbnail"]))
        for r in rows
    ])


@router.delete("/identity/{name}")
async def delete_identity(name: str):
    async with database.connect() as db:
        async with db.execute("SELECT id FROM registered_faces WHERE name = ?", (name,)) as cursor:
            ids = {row["id"] for row in await cursor.fetchall()}
        if not ids:
            raise HTTPException(status_code=404, detail="Identity not found")
        await db.execute("DELETE FROM registered_faces WHERE name = ?", (name,))
        await db.commit()
    face_recognizer_instance.remove_from_gallery(ids)
    return {"deleted": len(ids)}


@router.delete("/{face_id}")
async def delete_face(face_id: int):
    async with database.connect() as db:
        cursor = await db.execute("DELETE FROM registered_faces WHERE id = ?", (face_id,))
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Face not found")
    face_recognizer_instance.remove_from_gallery({face_id})
    return {"deleted": 1}


@router.delete("")
async def delete_all_faces():
    async with database.connect() as db:
        cursor = await db.execute("DELETE FROM registered_faces")
        await db.commit()
    await face_recognizer_instance.load_gallery()
    return {"deleted": cursor.rowcount}
