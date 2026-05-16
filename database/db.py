import sqlite3
import os
from datetime import datetime


DB_PATH = os.path.join(os.path.dirname(__file__), "bot.db")

_connection = None


def get_db() -> sqlite3.Connection:
    global _connection
    if _connection is None:
        _connection = sqlite3.connect(DB_PATH)
        _connection.row_factory = sqlite3.Row
        _connection.execute("PRAGMA journal_mode=WAL")
        _connection.execute("PRAGMA foreign_keys=ON")
        init_tables(_connection)
    return _connection


def init_tables(db: sqlite3.Connection):
    db.executescript("""
        CREATE TABLE IF NOT EXISTS afk_status (
            user_id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            minutes INTEGER NOT NULL,
            started_at REAL NOT NULL,
            expires_at REAL NOT NULL,
            guild_id TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS inactive_status (
            user_id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            from_date TEXT NOT NULL,
            to_date TEXT NOT NULL,
            from_timestamp REAL NOT NULL,
            to_timestamp REAL NOT NULL,
            guild_id TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS active_rolls (
            message_id TEXT PRIMARY KEY,
            channel_id TEXT NOT NULL,
            guild_id TEXT NOT NULL,
            emoji TEXT NOT NULL DEFAULT '✅',
            created_at REAL NOT NULL,
            expires_at REAL,
            is_emergency INTEGER NOT NULL DEFAULT 0,
            creator_id TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS roll_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT NOT NULL,
            winner_id TEXT,
            winner_username TEXT,
            participants_count INTEGER DEFAULT 0,
            created_at REAL NOT NULL
        );
    """)
    db.commit()


# ============ AFK ============

def set_afk_status(user_id: str, username: str, minutes: int, guild_id: str) -> dict:
    import time
    now = time.time()
    expires_at = now + minutes * 60
    db = get_db()
    db.execute(
        "INSERT OR REPLACE INTO afk_status (user_id, username, minutes, started_at, expires_at, guild_id) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, username, minutes, now, expires_at, guild_id)
    )
    db.commit()
    return {"started_at": now, "expires_at": expires_at}


def remove_afk_status(user_id: str) -> bool:
    db = get_db()
    cursor = db.execute("DELETE FROM afk_status WHERE user_id = ?", (user_id,))
    db.commit()
    return cursor.rowcount > 0


def get_afk_status(user_id: str) -> dict | None:
    db = get_db()
    row = db.execute("SELECT * FROM afk_status WHERE user_id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def get_all_afk_statuses() -> list[dict]:
    db = get_db()
    rows = db.execute("SELECT * FROM afk_status ORDER BY expires_at ASC").fetchall()
    return [dict(r) for r in rows]


def get_expired_afk_statuses() -> list[dict]:
    import time
    db = get_db()
    rows = db.execute("SELECT * FROM afk_status WHERE expires_at <= ?", (time.time(),)).fetchall()
    return [dict(r) for r in rows]


# ============ INACTIVE ============

def set_inactive_status(user_id: str, username: str, from_date: str, to_date: str, guild_id: str) -> dict:
    from_ts = datetime.strptime(from_date, "%Y-%m-%d").timestamp()
    to_ts = datetime.strptime(to_date, "%Y-%m-%d").timestamp() + 86400 - 1
    db = get_db()
    db.execute(
        "INSERT OR REPLACE INTO inactive_status (user_id, username, from_date, to_date, from_timestamp, to_timestamp, guild_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, username, from_date, to_date, from_ts, to_ts, guild_id)
    )
    db.commit()
    return {"from_timestamp": from_ts, "to_timestamp": to_ts}


def remove_inactive_status(user_id: str) -> bool:
    db = get_db()
    cursor = db.execute("DELETE FROM inactive_status WHERE user_id = ?", (user_id,))
    db.commit()
    return cursor.rowcount > 0


def get_inactive_status(user_id: str) -> dict | None:
    db = get_db()
    row = db.execute("SELECT * FROM inactive_status WHERE user_id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def get_all_inactive_statuses() -> list[dict]:
    db = get_db()
    rows = db.execute("SELECT * FROM inactive_status ORDER BY from_timestamp ASC").fetchall()
    return [dict(r) for r in rows]


def get_expired_inactive_statuses() -> list[dict]:
    import time
    db = get_db()
    rows = db.execute("SELECT * FROM inactive_status WHERE to_timestamp <= ?", (time.time(),)).fetchall()
    return [dict(r) for r in rows]


# ============ ROLLS ============

def create_roll(message_id: str, channel_id: str, guild_id: str, emoji: str, expires_at: float, is_emergency: bool, creator_id: str):
    import time
    db = get_db()
    db.execute(
        "INSERT INTO active_rolls (message_id, channel_id, guild_id, emoji, created_at, expires_at, is_emergency, creator_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (message_id, channel_id, guild_id, emoji, time.time(), expires_at, int(is_emergency), creator_id)
    )
    db.commit()


def get_active_roll(message_id: str) -> dict | None:
    db = get_db()
    row = db.execute("SELECT * FROM active_rolls WHERE message_id = ?", (message_id,)).fetchone()
    return dict(row) if row else None


def get_all_active_rolls() -> list[dict]:
    db = get_db()
    rows = db.execute("SELECT * FROM active_rolls").fetchall()
    return [dict(r) for r in rows]


def remove_active_roll(message_id: str):
    db = get_db()
    db.execute("DELETE FROM active_rolls WHERE message_id = ?", (message_id,))
    db.commit()


def save_roll_result(message_id: str, winner_id: str, winner_username: str, participants_count: int):
    import time
    db = get_db()
    db.execute(
        "INSERT INTO roll_results (message_id, winner_id, winner_username, participants_count, created_at) VALUES (?, ?, ?, ?, ?)",
        (message_id, winner_id, winner_username, participants_count, time.time())
    )
    db.commit()
