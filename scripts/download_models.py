"""
Download the open-weight AI models used by GestureVision AI.

Backend (ONNX, -> backend/models/):
  yolo11n.onnx      Person detection        Ultralytics            AGPL-3.0
  det_500m.onnx     Face detection (SCRFD)  InsightFace buffalo_sc  non-commercial research
  w600k_mbf.onnx    Face recognition        InsightFace buffalo_sc  non-commercial research

Browser (MediaPipe, -> frontend/public/models/):
  hand_landmarker.task, pose_landmarker_lite.task   Google MediaPipe   Apache-2.0

Usage:  python scripts/download_models.py [--skip-browser]
"""

import argparse
import shutil
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND_MODELS = ROOT / "backend" / "models"
BROWSER_MODELS = ROOT / "frontend" / "public" / "models"

INSIGHTFACE_ZIP = "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_sc.zip"

FILES = [
    {
        "name": "yolo11n.onnx",
        "dest": BACKEND_MODELS,
        "url": "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.onnx",
        "description": "YOLO11n — person detection",
    },
    {
        "name": "det_500m.onnx",
        "dest": BACKEND_MODELS,
        "zip": INSIGHTFACE_ZIP,
        "description": "SCRFD-500M — face detection with landmarks",
    },
    {
        "name": "w600k_mbf.onnx",
        "dest": BACKEND_MODELS,
        "zip": INSIGHTFACE_ZIP,
        "description": "ArcFace MobileFaceNet (WebFace600K) — face embeddings",
    },
    {
        "name": "hand_landmarker.task",
        "dest": BROWSER_MODELS,
        "browser": True,
        "url": "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        "description": "MediaPipe Hand Landmarker",
    },
    {
        "name": "pose_landmarker_lite.task",
        "dest": BROWSER_MODELS,
        "browser": True,
        "url": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        "description": "MediaPipe Pose Landmarker (lite)",
    },
]


def download(url: str, dest: Path) -> None:
    """Download to a temp file first so an interrupted download never leaves a corrupt model."""
    tmp = dest.with_suffix(dest.suffix + ".part")

    def progress(blocks: int, block_size: int, total: int) -> None:
        if total > 0:
            done = min(total, blocks * block_size)
            pct = done * 100 / total
            bar = "#" * int(pct / 2.5)
            print(f"\r    [{bar:<40}] {pct:5.1f}%  {done / 1048576:6.1f} MB", end="", flush=True)

    try:
        urllib.request.urlretrieve(url, tmp, reporthook=progress)
        print()
        tmp.replace(dest)
    finally:
        tmp.unlink(missing_ok=True)


def extract_from_zip(zip_path: Path, member_name: str, dest: Path) -> bool:
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            # Match by base name only; never trust archive paths.
            if Path(info.filename).name == member_name and not info.is_dir():
                with zf.open(info) as src, dest.open("wb") as out:
                    shutil.copyfileobj(src, out)
                return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--skip-browser", action="store_true", help="skip MediaPipe models (the app falls back to Google's CDN)")
    args = parser.parse_args()

    print("=" * 64)
    print("  GestureVision AI - model downloader")
    print("=" * 64)

    failures: list[str] = []
    zip_cache: dict[str, Path] = {}
    tmpdir = Path(tempfile.mkdtemp(prefix="gv-models-"))
    try:
        for item in FILES:
            if args.skip_browser and item.get("browser"):
                continue
            dest_dir: Path = item["dest"]
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest = dest_dir / item["name"]
            print(f"\n[{item['name']}] {item['description']}")
            if dest.exists() and dest.stat().st_size > 0:
                print(f"    already present ({dest.stat().st_size / 1048576:.1f} MB)")
                continue
            try:
                if "zip" in item:
                    url = item["zip"]
                    if url not in zip_cache:
                        print(f"    downloading {url}")
                        archive = tmpdir / Path(url).name
                        download(url, archive)
                        zip_cache[url] = archive
                    if not extract_from_zip(zip_cache[url], item["name"], dest):
                        raise FileNotFoundError(f"{item['name']} not found in archive")
                else:
                    print(f"    downloading {item['url']}")
                    download(item["url"], dest)
                print(f"    OK ({dest.stat().st_size / 1048576:.1f} MB)")
            except Exception as exc:  # noqa: BLE001 - report and continue with other models
                dest.unlink(missing_ok=True)
                print(f"\n    FAILED: {exc}")
                failures.append(item["name"])
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)

    print("\n" + "=" * 64)
    if failures:
        print(f"  {len(failures)} model(s) failed: {', '.join(failures)}")
        print("  The app still starts; features needing these models are disabled.")
        print("  Re-run this script to retry.")
    else:
        print("  All models ready.")
    print("=" * 64)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
