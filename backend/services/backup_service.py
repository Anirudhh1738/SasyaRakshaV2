import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List
from database import BASE_DIR, BACKUPS_DIR, DATABASE_URL


def _resolve_sqlite_path() -> Path:
    if DATABASE_URL.startswith("sqlite:///"):
        raw = DATABASE_URL.replace("sqlite:///", "", 1)
        p = Path(raw)
        return p if p.is_absolute() else (BASE_DIR / p).resolve()
    return (BASE_DIR / "sasyaraksha.db").resolve()


def create_sqlite_backup() -> Dict:
    src_path = _resolve_sqlite_path()
    if not src_path.exists():
        raise FileNotFoundError("Primary SQLite database file does not exist yet.")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    filename = f"sasyaraksha_backup_{stamp}.db"
    dst_path = BACKUPS_DIR / filename

    src_conn = sqlite3.connect(str(src_path))
    dst_conn = sqlite3.connect(str(dst_path))
    try:
        src_conn.backup(dst_conn)
    finally:
        dst_conn.close()
        src_conn.close()

    return {
        "filename": filename,
        "sizeBytes": dst_path.stat().st_size,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }


def list_sqlite_backups() -> List[Dict]:
    items = []
    for entry in BACKUPS_DIR.glob("*.db"):
        stat = entry.stat()
        items.append(
            {
                "filename": entry.name,
                "sizeBytes": stat.st_size,
                "createdAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
            }
        )
    items.sort(key=lambda x: x["createdAt"], reverse=True)
    return items
