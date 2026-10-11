import base64
import io

import cv2
import numpy as np


def _jpeg(width=320, height=240) -> bytes:
    ok, buf = cv2.imencode(".jpg", np.full((height, width, 3), 40, dtype=np.uint8))
    assert ok
    return buf.tobytes()


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_system_status_reports_models(client):
    r = client.get("/api/system/status")
    assert r.status_code == 200
    body = r.json()
    assert set(body["models"]) == {"person_detection", "face_detection", "face_recognition"}
    for info in body["models"].values():
        assert {"name", "available", "loaded", "license"} <= info.keys()


def test_system_diagnostics(client):
    r = client.get("/api/system/diagnostics")
    assert r.status_code == 200
    assert "platform" in r.json() and "storage" in r.json()


def test_settings_roundtrip_and_validation(client):
    r = client.get("/api/settings")
    assert r.status_code == 200
    assert r.json()["settings"]["detection_confidence"] == r.json()["defaults"]["detection_confidence"]

    r = client.put("/api/settings", json={"detection_confidence": 0.65, "enable_face_recognition": False})
    assert r.status_code == 200
    assert r.json()["settings"]["detection_confidence"] == 0.65
    assert r.json()["settings"]["enable_face_recognition"] is False

    assert client.put("/api/settings", json={"detection_confidence": 3}).status_code == 422
    assert client.put("/api/settings", json={"unknown_key": 1}).status_code == 422

    r = client.post("/api/settings/reset")
    assert r.json()["settings"] == r.json()["defaults"]


def test_faces_list_and_missing_delete(client):
    r = client.get("/api/faces")
    assert r.status_code == 200
    assert isinstance(r.json()["faces"], list)
    assert client.delete("/api/faces/999999").status_code == 404
    assert client.delete("/api/faces/identity/nobody").status_code == 404


def test_face_register_rejects_bad_input(client):
    r = client.post("/api/faces/register", json={"name": "   ", "image_base64": "x" * 32})
    assert r.status_code == 422
    r = client.post("/api/faces/register", json={"name": "Test", "image_base64": "bm90IGFuIGltYWdlIGF0IGFsbA=="})
    assert r.status_code in (400, 503)


def test_face_register_without_face(client):
    payload = "data:image/jpeg;base64," + base64.b64encode(_jpeg()).decode()
    r = client.post("/api/faces/register", json={"name": "Nobody", "image_base64": payload})
    # 422 when models are installed (no face in a blank image), 503 when they aren't.
    assert r.status_code in (422, 503)


def test_sessions_crud(client):
    r = client.get("/api/sessions")
    assert r.status_code == 200
    assert "stats" in r.json()
    assert client.get("/api/sessions/does-not-exist").status_code == 404
    assert client.delete("/api/sessions/does-not-exist").status_code == 404


def test_video_upload_validation(client):
    r = client.post("/api/video/upload", files={"file": ("notes.txt", io.BytesIO(b"hello"), "text/plain")})
    assert r.status_code == 415
    r = client.post("/api/video/upload", files={"file": ("../../evil.mp4", io.BytesIO(b""), "video/mp4")})
    assert r.status_code == 400
    assert client.get("/api/video/not-a-uuid").status_code == 404


def test_video_analysis_end_to_end(client, tmp_path):
    path = tmp_path / "clip.avi"
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"MJPG"), 10, (160, 120))
    for i in range(20):
        writer.write(np.full((120, 160, 3), i * 10, dtype=np.uint8))
    writer.release()

    with path.open("rb") as fh:
        r = client.post("/api/video/upload", files={"file": ("../clip.avi", fh, "video/x-msvideo")}, data={"sample_fps": "5"})
    assert r.status_code == 201, r.text
    video = r.json()
    assert video["filename"] == "clip.avi"  # directory components stripped

    import time
    for _ in range(100):
        detail = client.get(f"/api/video/{video['id']}").json()
        if detail["status"] in ("completed", "failed"):
            break
        time.sleep(0.1)
    assert detail["status"] == "completed", detail
    summary = detail["results"]["summary"]
    assert summary["frames_analyzed"] == 10
    assert summary["max_persons"] == 0
    assert len(detail["results"]["timeline"]) == 10

    assert client.delete(f"/api/video/{video['id']}").status_code == 200
    assert client.get(f"/api/video/{video['id']}").status_code == 404


def test_websocket_protocol_and_session_recording(client):
    with client.websocket_connect("/ws/detect") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "hello"
        session_id = hello["session_id"]

        ws.send_text('{"type": "ping", "t": 123}')
        assert ws.receive_json() == {"type": "pong", "t": 123}

        ws.send_bytes(b"not a jpeg")
        assert ws.receive_json()["type"] == "error"

        for _ in range(2):
            ws.send_bytes(_jpeg())
            analysis = ws.receive_json()
            assert analysis["type"] == "analysis"
            assert analysis["width"] == 320 and analysis["height"] == 240
            assert isinstance(analysis["persons"], list)
            assert analysis["timing"]["total_ms"] >= 0

        ws.send_text('{"type": "gesture", "gesture": "open_palm"}')
        ws.send_text('{"type": "ping", "t": 1}')
        ws.receive_json()  # make sure the gesture was handled before closing

    import time
    for _ in range(50):  # the final save completes asynchronously after disconnect
        r = client.get(f"/api/sessions/{session_id}")
        if r.status_code == 200:
            break
        time.sleep(0.05)
    assert r.status_code == 200, "session was not persisted"
    session = r.json()
    assert session["frames_processed"] == 2
    assert session["gestures"] == {"open_palm": 1}
