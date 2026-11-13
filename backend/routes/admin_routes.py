from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from ..auth import require_admin
from ..database import BACKUPS_DIR, create_sqlite_backup
from ..models import User

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/backups")
def list_backups(_admin: User = Depends(require_admin)):
    files = sorted(BACKUPS_DIR.glob("*.db"), key=lambda p: p.stat().st_mtime, reverse=True)
    return {
        "backups": [
            {"filename": f.name, "size_bytes": f.stat().st_size}
            for f in files
        ]
    }


@router.post("/backups", status_code=status.HTTP_201_CREATED)
def trigger_backup(_admin: User = Depends(require_admin)):
    dest = create_sqlite_backup()
    return {"filename": dest.name, "size_bytes": dest.stat().st_size}


@router.get("/backups/{filename}")
def download_backup(filename: str, _admin: User = Depends(require_admin)):
    safe_name = Path_safe_basename(filename)
    if not safe_name.endswith(".db"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid backup filename.")
    target = BACKUPS_DIR / safe_name
    if not target.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backup not found.")
    return FileResponse(target, filename=safe_name, media_type="application/octet-stream")


def Path_safe_basename(name: str) -> str:
    return name.replace("\\", "/").split("/")[-1]
