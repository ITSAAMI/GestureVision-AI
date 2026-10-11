# GestureVision AI backend: FastAPI + ONNX Runtime CPU inference.
# Build from the repository root:  docker build -f backend/Dockerfile -t gesturevision-api .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# OpenCV and ONNX Runtime runtime libraries
RUN apt-get update \
 && apt-get install -y --no-install-recommends libglib2.0-0 libgomp1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

# Bake the backend models (~26 MB) into the image so cold starts don't download them.
COPY scripts/download_models.py scripts/download_models.py
RUN python scripts/download_models.py --skip-browser

COPY backend/ backend/

WORKDIR /app/backend
ENV HOST=0.0.0.0 \
    PORT=8000 \
    SERVE_FRONTEND=false \
    ONNX_THREADS=1

EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
