from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from models import FieldPassport, Prediction, SoilRecord

router = APIRouter(prefix="/api/passports", tags=["passports"])


class ShareToggleRequest(BaseModel):
    enabled: bool


@router.get("/{code}")
def get_passport(code: str, token: str = "", db: Session = Depends(get_db)):
    passport = db.query(FieldPassport).filter(FieldPassport.passport_code == code).first()
    if not passport:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field Passport not found.")

    if token:
        if not passport.is_public_share or token != passport.share_token:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Passport is private or token is invalid.")

    pred = db.query(Prediction).filter(Prediction.id == passport.prediction_id).first()
    if not pred:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Linked prediction not found.")

    soil = db.query(SoilRecord).filter(SoilRecord.prediction_id == pred.id).first()

    return {
        "passport": {
            "passport_code": passport.passport_code,
            "is_public_share": passport.is_public_share,
            "qr_payload": passport.qr_payload,
        },
        "prediction": {
            "id": pred.id,
            "crop": pred.crop,
            "predicted_disease": pred.predicted_disease,
            "condition_category": pred.condition_category,
            "confidence": pred.confidence,
            "severity": pred.severity,
            "affected_area_pct": pred.affected_area_pct,
            "region_label": pred.region_label,
            "notes": "" if token else pred.notes,
        },
        "soilRecord": (
            {
                "observed_color": soil.observed_color,
                "observed_moisture": soil.observed_moisture,
                "soil_disclaimer": soil.soil_disclaimer,
            }
            if soil
            else None
        ),
    }


@router.patch("/{code}/share")
def toggle_share(code: str, body: ShareToggleRequest, db: Session = Depends(get_db)):
    passport = db.query(FieldPassport).filter(FieldPassport.passport_code == code).first()
    if not passport:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Field Passport not found.")
    passport.is_public_share = 1 if body.enabled else 0
    db.commit()
    return {"passport": {"passport_code": passport.passport_code, "is_public_share": passport.is_public_share}}
