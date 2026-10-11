"""ArcFace ONNX face recognition: embeddings, an in-memory gallery and identity matching."""

import logging
import threading
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from app.core import database
from app.core.config import settings
from app.services.onnx_utils import create_session

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class Match:
    name: str | None   # None when no identity passes the threshold
    similarity: float  # best cosine similarity found (0-1)


class ArcFaceRecognizer:
    """Extracts L2-normalized embeddings from aligned 112x112 faces and matches them."""

    def __init__(self, model_path=None, threshold: float = 0.42):
        self.model_path = Path(model_path) if model_path is not None else settings.face_recognize_model_file
        self.threshold = threshold
        self._session = None
        self._load_attempted = False
        self._lock = threading.Lock()
        self._input_size = 112
        self._mean = 127.5
        self._std = 127.5
        self._gallery_lock = threading.Lock()
        self._gallery_names: list[str] = []
        self._gallery_ids: list[int] = []
        self._gallery: np.ndarray = np.zeros((0, 512), dtype=np.float32)

    @property
    def is_loaded(self) -> bool:
        return self._session is not None

    @property
    def model_name(self) -> str:
        return self.model_path.name

    @property
    def gallery_size(self) -> int:
        return len(self._gallery_ids)

    def load(self) -> bool:
        if self._session is not None:
            return True
        with self._lock:
            if self._load_attempted:
                return self._session is not None
            self._load_attempted = True
            session = create_session(self.model_path, settings.ONNX_THREADS)
            if session is None:
                return False
            inp = session.get_inputs()[0]
            self._input_name = inp.name
            if isinstance(inp.shape[2], int):
                self._input_size = inp.shape[2]
            self._session = session
        return True

    def reload(self) -> bool:
        with self._lock:
            self._session = None
            self._load_attempted = False
        return self.load()

    def embed(self, aligned_face: np.ndarray) -> np.ndarray | None:
        """Embedding for an aligned BGR face crop, or None if the model is unavailable."""
        if aligned_face is None or aligned_face.size == 0 or not self.load():
            return None
        try:
            size = self._input_size
            if aligned_face.shape[:2] != (size, size):
                aligned_face = cv2.resize(aligned_face, (size, size))
            blob = cv2.dnn.blobFromImage(
                aligned_face, 1.0 / self._std, (size, size), (self._mean, self._mean, self._mean), swapRB=True
            )
            emb = self._session.run(None, {self._input_name: blob})[0][0].astype(np.float32)
            norm = np.linalg.norm(emb)
            return emb / norm if norm > 0 else None
        except Exception:
            logger.exception("Embedding extraction failed")
            return None

    # ---- gallery -----------------------------------------------------------------

    async def load_gallery(self) -> None:
        """Load registered embeddings from the database into memory."""
        ids, names, embs = [], [], []
        async with database.connect() as db:
            async with db.execute("SELECT id, name, embedding_blob FROM registered_faces") as cursor:
                async for row in cursor:
                    emb = np.frombuffer(row["embedding_blob"], dtype=np.float32)
                    ids.append(row["id"])
                    names.append(row["name"])
                    embs.append(emb)
        dims = {e.shape[0] for e in embs}
        if len(dims) > 1:
            # Embeddings from a different model can't be compared; keep the majority dimension.
            majority = max(dims, key=lambda d: sum(e.shape[0] == d for e in embs))
            keep = [i for i, e in enumerate(embs) if e.shape[0] == majority]
            logger.warning("Ignoring %d face(s) registered with a different model", len(embs) - len(keep))
            ids, names, embs = [ids[i] for i in keep], [names[i] for i in keep], [embs[i] for i in keep]
        with self._gallery_lock:
            self._gallery_ids = ids
            self._gallery_names = names
            self._gallery = np.stack(embs).astype(np.float32) if embs else np.zeros((0, 512), dtype=np.float32)
        logger.info("Face gallery loaded: %d sample(s)", len(ids))

    def add_to_gallery(self, face_id: int, name: str, embedding: np.ndarray) -> None:
        with self._gallery_lock:
            if self._gallery.shape[0] and self._gallery.shape[1] != embedding.shape[0]:
                self._gallery = np.zeros((0, embedding.shape[0]), dtype=np.float32)
                self._gallery_ids, self._gallery_names = [], []
            self._gallery_ids.append(face_id)
            self._gallery_names.append(name)
            base = self._gallery if self._gallery.shape[0] else np.zeros((0, embedding.shape[0]), dtype=np.float32)
            self._gallery = np.vstack([base, embedding[np.newaxis].astype(np.float32)])

    def remove_from_gallery(self, face_ids: set[int]) -> None:
        with self._gallery_lock:
            keep = [i for i, fid in enumerate(self._gallery_ids) if fid not in face_ids]
            self._gallery_ids = [self._gallery_ids[i] for i in keep]
            self._gallery_names = [self._gallery_names[i] for i in keep]
            self._gallery = self._gallery[keep] if keep else np.zeros((0, self._gallery.shape[1] or 512), dtype=np.float32)

    def match(self, embedding: np.ndarray) -> Match:
        """Best identity for an embedding (max cosine similarity over each identity's samples)."""
        with self._gallery_lock:
            if self._gallery.shape[0] == 0 or self._gallery.shape[1] != embedding.shape[0]:
                return Match(None, 0.0)
            sims = self._gallery @ embedding
            best = int(np.argmax(sims))
            score = float(sims[best])
            name = self._gallery_names[best]
        return Match(name if score >= self.threshold else None, max(0.0, score))


face_recognizer_instance = ArcFaceRecognizer(threshold=settings.FACE_RECOGNITION_THRESHOLD)
