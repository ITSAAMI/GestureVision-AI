import json

from fastapi import APIRouter, HTTPException, Query

from app.core import database
from app.schemas.session import SessionListResponse, SessionResponse, SessionStats

router = APIRouter(prefix="/api/sessions", tags=["Sessions"])


def _loads(value, fallback):
    try:
        return json.loads(value) if value else fallback
    except (TypeError, ValueError):
        return fallback


def _to_session(row) -> SessionResponse:
    r = dict(row)
    return SessionResponse(
        id=r["id"],
        start_time=str(r["start_time"]),
        end_time=str(r["end_time"]) if r.get("end_time") else None,
        duration_s=r.get("duration_s") or 0.0,
        frames_processed=r.get("frames_processed") or 0,
        detections_count=r.get("detections_count") or 0,
        unique_persons=r.get("unique_persons") or 0,
        max_persons=r.get("max_persons") or 0,
        identities=_loads(r.get("identities_json"), []),
        gestures_count=r.get("gestures_count") or 0,
        gestures=_loads(r.get("gestures_json"), {}),
        avg_latency_ms=r.get("avg_latency_ms") or 0.0,
        avg_fps=r.get("avg_fps") or 0.0,
    )


@router.get("", response_model=SessionListResponse)
async def list_sessions(limit: int = Query(100, ge=1, le=1000)):
    async with database.connect() as db:
        async with db.execute("SELECT * FROM sessions ORDER BY start_time DESC LIMIT ?", (limit,)) as cursor:
            rows = await cursor.fetchall()
        async with db.execute(
            "SELECT COUNT(*) AS n, COALESCE(SUM(duration_s), 0) AS dur, COALESCE(SUM(frames_processed), 0) AS frames, "
            "COALESCE(SUM(gestures_count), 0) AS gestures, COALESCE(MAX(max_persons), 0) AS peak FROM sessions"
        ) as cursor:
            agg = await cursor.fetchone()
    return SessionListResponse(
        sessions=[_to_session(r) for r in rows],
        stats=SessionStats(
            total_sessions=agg["n"],
            total_duration_s=round(agg["dur"], 1),
            total_frames=agg["frames"],
            total_gestures=agg["gestures"],
            max_persons=agg["peak"],
        ),
    )


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str):
    async with database.connect() as db:
        async with db.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)) as cursor:
            row = await cursor.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return _to_session(row)


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    async with database.connect() as db:
        cursor = await db.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
        await db.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"deleted": 1}


@router.delete("")
async def delete_all_sessions():
    async with database.connect() as db:
        cursor = await db.execute("DELETE FROM sessions")
        await db.commit()
    return {"deleted": cursor.rowcount}
