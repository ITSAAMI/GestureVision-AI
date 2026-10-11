"""GestureVision AI backend entry point.

Run in development:   python main.py          (or: uvicorn main:app --reload)
"""

import logging
import mimetypes
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api import websocket
from app.api.routes import faces, sessions, system, video
from app.api.routes import settings as settings_api
from app.core.config import APP_NAME, APP_VERSION, settings
from app.core.database import init_db
from app.services.face_recognizer import face_recognizer_instance
from app.services.runtime_settings import runtime_settings
from app.services.video_analyzer import video_analyzer_instance

logging.basicConfig(
    level=settings.LOG_LEVEL.upper(),
    format="%(asctime)s  %(levelname)-7s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("gesturevision")

# Windows' registry often lacks these; MediaPipe needs application/wasm for streaming compilation.
mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("text/javascript", ".js")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    await runtime_settings.load()
    await face_recognizer_instance.load_gallery()
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    video_analyzer_instance.start()
    logger.info("%s v%s ready on http://%s:%s", APP_NAME, APP_VERSION, settings.HOST, settings.PORT)
    yield
    await video_analyzer_instance.stop()
    logger.info("Shut down cleanly")


app = FastAPI(
    title=f"{APP_NAME} API",
    version=APP_VERSION,
    description="Real-time person detection, tracking and face recognition for the GestureVision AI workstation.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (faces.router, settings_api.router, video.router, sessions.router, system.router, websocket.router):
    app.include_router(router)


@app.get("/api/health", tags=["System"])
async def health():
    return {"status": "ok", "version": APP_VERSION}


# Production mode: serve the built React app (frontend/dist) from the same origin.
dist = settings.frontend_dist_dir
if settings.SERVE_FRONTEND and (dist / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        if path.startswith(("api/", "ws/")):
            raise HTTPException(status_code=404)
        candidate = (dist / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(dist.resolve()):
            return FileResponse(candidate)
        return FileResponse(dist / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=settings.RELOAD)
