from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from auth import require_roles
from database import BACKUPS_DIR, get_db
from models import ExpertCorrection, GeographicalReport, Prediction, User
from schemas import ExpertVerifyRequest
from services.backup_service import create_sqlite_backup, list_sqlite_backups

router = APIRouter(prefix="/api", tags=["expert-admin"])


@router.get("/expert/queue")
def expert_queue(
    status_filter: str = "pending",
    reviewer: User = Depends(require_roles(["expert", "admin"])),
    db: Session = Depends(get_db),
):
    q = db.query(Prediction)
    if status_filter != "all":
        q = q.filter(Prediction.verification_status == status_filter)
    queue = q.order_by(Prediction.id.desc()).all()
    corrections = db.query(ExpertCorrection).order_by(ExpertCorrection.id.desc()).limit(50).all()
    return {
        "reviewer": {"id": reviewer.id, "name": reviewer.name, "role": reviewer.role},
        "queue": [
            {
                "id": p.id,
                "crop": p.crop,
                "predicted_disease": p.predicted_disease,
                "confidence": p.confidence,
                "severity": p.severity,
                "verification_status": p.verification_status,
                "user_feedback_status": p.user_feedback_status,
            }
            for p in queue
        ],
        "corrections": [{"id": c.id, "prediction_id": c.prediction_id, "action": c.action} for c in corrections],
    }


@router.post("/expert/verify")
def expert_verify(
    body: ExpertVerifyRequest,
    reviewer: User = Depends(require_roles(["expert", "admin"])),
    db: Session = Depends(get_db),
):
    pred = db.query(Prediction).filter(Prediction.id == body.predictionId).first()
    if not pred:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Prediction not found.")

    if body.action == "correct" and (not body.correctedCrop or not body.correctedDisease):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Corrected crop and disease are required when action is 'correct'.",
        )

    next_status = "confirmed" if body.action == "confirm" else "rejected" if body.action == "reject" else "corrected"
    final_crop = body.correctedCrop.strip() if body.action == "correct" and body.correctedCrop else pred.crop
    final_disease = (
        body.correctedDisease.strip() if body.action == "correct" and body.correctedDisease else pred.predicted_disease
    )

    pred.verification_status = next_status
    pred.verified_crop = None if body.action == "reject" else final_crop
    pred.verified_disease = None if body.action == "reject" else final_disease

    if body.action in ("confirm", "correct"):
        db.query(GeographicalReport).filter(GeographicalReport.prediction_id == pred.id).update(
            {"verified": 1, "crop": final_crop, "disease": final_disease}
        )
    else:
        db.query(GeographicalReport).filter(GeographicalReport.prediction_id == pred.id).delete()

    db.add(
        ExpertCorrection(
            prediction_id=pred.id,
            reviewer_id=reviewer.id,
            reviewer_name=reviewer.name,
            action=body.action,
            original_crop=pred.crop,
            original_disease=pred.predicted_disease,
            corrected_crop=final_crop if body.action == "correct" else None,
            corrected_disease=final_disease if body.action == "correct" else None,
            comments=body.comments.strip(),
        )
    )
    db.commit()
    return {"ok": True, "status": next_status}


@router.get("/admin/backups")
def get_backups(_admin: User = Depends(require_roles(["admin"]))):
    return {"backups": list_sqlite_backups()}


@router.post("/admin/backup", status_code=status.HTTP_201_CREATED)
def trigger_backup(_admin: User = Depends(require_roles(["admin"]))):
    info = create_sqlite_backup()
    return {"backup": info, "backups": list_sqlite_backups()}


@router.get("/admin/backup/download/{filename}")
def download_backup(filename: str, _admin: User = Depends(require_roles(["admin"]))):
    safe_name = Path(filename).name
    if not safe_name.endswith(".db") or safe_name != filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid backup filename.")
    full_path = (BACKUPS_DIR / safe_name).resolve()
    if full_path.parent != BACKUPS_DIR.resolve() or not full_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backup file not found.")
    return FileResponse(full_path, filename=safe_name, media_type="application/octet-stream")
