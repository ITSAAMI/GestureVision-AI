"""SQLite storage (aiosqlite) with lightweight, additive schema migrations."""

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import aiosqlite

from app.core.config import settings

logger = logging.getLogger(__name__)

DB_PATH = str(settings.database_file)

SCHEMA = {
    "registered_faces": """
        CREATE TABLE IF NOT EXISTS registered_faces (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            embedding_blob BLOB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """,
    "sessions": """
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            end_time TIMESTAMP,
            detections_count INTEGER DEFAULT 0,
            gestures_count INTEGER DEFAULT 0
        )
    """,
    "settings": """
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    """,
    "video_analyses": """
        CREATE TABLE IF NOT EXISTS video_analyses (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            filepath TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            progress REAL DEFAULT 0.0,
            total_frames INTEGER DEFAULT 0,
            processed_frames INTEGER DEFAULT 0,
            results_json TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
        )
    """,
}

# Columns added after the first release. Applied with ALTER TABLE when missing,
# so existing databases upgrade in place without losing data.
MIGRATIONS: dict[str, list[tuple[str, str]]] = {
    "registered_faces": [
        ("thumbnail", "BLOB"),
        ("embedding_dim", "INTEGER DEFAULT 0"),
    ],
    "sessions": [
        ("duration_s", "REAL DEFAULT 0"),
        ("frames_processed", "INTEGER DEFAULT 0"),
        ("unique_persons", "INTEGER DEFAULT 0"),
        ("max_persons", "INTEGER DEFAULT 0"),
        ("identities_json", "TEXT DEFAULT '[]'"),
        ("gestures_json", "TEXT DEFAULT '{}'"),
        ("avg_latency_ms", "REAL DEFAULT 0"),
        ("avg_fps", "REAL DEFAULT 0"),
    ],
    "video_analyses": [
        ("file_size", "INTEGER DEFAULT 0"),
        ("sample_fps", "REAL DEFAULT 5"),
        ("error", "TEXT"),
    ],
}


async def init_db() -> None:
    """Create tables and apply additive column migrations."""
    settings.database_file.parent.mkdir(parents=True, exist_ok=True)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        for ddl in SCHEMA.values():
            await db.execute(ddl)

        for table, columns in MIGRATIONS.items():
            async with db.execute(f"PRAGMA table_info({table})") as cursor:
                existing = {row[1] async for row in cursor}
            for name, decl in columns:
                if name not in existing:
                    await db.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")
                    logger.info("Migrated %s: added column %s", table, name)

        # Analyses interrupted by a server restart can never finish.
        await db.execute(
            "UPDATE video_analyses SET status = 'failed', error = 'Interrupted by server restart' "
            "WHERE status IN ('queued', 'processing')"
        )
        await db.commit()

    logger.info("Database ready at %s", DB_PATH)


@asynccontextmanager
async def connect() -> AsyncIterator[aiosqlite.Connection]:
    """Open a connection with dict-like rows."""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()
