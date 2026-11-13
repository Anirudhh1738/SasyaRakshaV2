import json
import re
import secrets
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from auth import get_optional_user
from database import PLANTS_UPLOAD_DIR, SOIL_UPLOAD_DIR, get_db
from models import FieldPassport, GeographicalReport, Prediction, ScreeningImage, SoilRecord, User, WeatherRecord
from schemas import AnalyzeRequest, FeedbackRequest
from services.vision_service import analyze_multi_plant_images, analyze_soil_image, decode_base64_image
from services.weather_service import fetch_open_meteo_risk, geocode_location, reverse_geocode_label

router = APIRouter(prefix="/api", tags=["screening"])


def _safe_filename(raw_name: str, prefix: str, ext: str) -> str:
    stem = Path(raw_name).stem
    clean = re.sub(r"[^a-zA-Z0-9_-]", "", stem) or prefix
    return f"{prefix}_{int(time.time() * 1000)}_{secrets.token_hex(3)}_{clean}.{ext}"


def _round_privacy_coords(lat: float, lng: float):
    return round(lat * 20) / 20, round(lng * 20) / 20


@router.post("/analyze")
async def analyze_plant(
    body: AnalyzeRequest,
    user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    incoming = body.images if body.images else (
        [{"imageBase64": body.imageBase64, "filename": body.filename or "leaf.jpg", "role": "closeup_leaf"}]
        if body.imageBase64
        else []
    )
    if not incoming:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one plant photo is required.")
    if len(incoming) > 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Maximum 8 plant photos per screening.")

    prepared = []
    saved_plant_paths = []
    try:
        for item in incoming:
            raw_b64 = item["imageBase64"] if isinstance(item, dict) else item.imageBase64
            raw_name = item["filename"] if isinstance(item, dict) else item.filename
            role = item["role"] if isinstance(item, dict) else item.role
            img_bytes, ext = decode_base64_image(raw_b64)
            saved_name = _safe_filename(raw_name, "plant", ext)
            file_path = PLANTS_UPLOAD_DIR / saved_name
            file_path.write_bytes(img_bytes)
            saved_plant_paths.append(file_path)
            prepared.append(
                {
                    "bytes": img_bytes,
                    "role": role,
                    "original_url": f"/api/uploads/plants/{saved_name}",
                }
            )
    except ValueError as exc:
        for p in saved_plant_paths:
            p.unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    result = analyze_multi_plant_images(prepared, body.cropHint, body.symptoms)
    if not result["suitable"]:
        for p in saved_plant_paths:
            p.unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=result["rejectionReason"])

    soil_analysis = None
    soil_url = ""
    if body.soilImageBase64:
        try:
            soil_bytes, soil_ext = decode_base64_image(body.soilImageBase64)
            soil_analysis = analyze_soil_image(soil_bytes)
            if soil_analysis["suitable"]:
                soil_name = _safe_filename(body.soilFilename or "soil.jpg", "soil", soil_ext)
                (SOIL_UPLOAD_DIR / soil_name).write_bytes(soil_bytes)
                soil_url = f"/api/uploads/soil/{soil_name}"
        except ValueError:
            soil_analysis = {"suitable": False, "rejectionReason": "Invalid soil image format."}

    lat, lng = body.approxLat, body.approxLng
    region = body.regionLabel.strip()
    if (lat is None or lng is None) and region:
        geo = await geocode_location(region)
        if geo:
            lat, lng, region = geo["latitude"], geo["longitude"], geo["name"]
    elif lat is not None and lng is not None and not region:
        region = await reverse_geocode_label(lat, lng)

    weather_record = None
    weather_risk = None
    if lat is not None and lng is not None:
        try:
            weather_risk = await fetch_open_meteo_risk(region or f"{lat:.2f}, {lng:.2f}", lat, lng, result["crop"])
            weather_record = WeatherRecord(
                location_name=weather_risk["locationName"],
                latitude=weather_risk["latitude"],
                longitude=weather_risk["longitude"],
                crop=weather_risk["crop"],
                temperature_c=weather_risk["temperatureC"],
                humidity_pct=weather_risk["humidityPct"],
                rainfall_mm=weather_risk["rainfallMm"],
                risk_level=weather_risk["riskLevel"],
                risk_factors_json=json.dumps(weather_risk["riskFactors"]),
            )
            db.add(weather_record)
            db.flush()
        except Exception:
            weather_risk = None

    f_lat, f_lng = _round_privacy_coords(lat, lng) if (lat is not None and lng is not None) else (None, None)
    valid_findings = [f for f in result["imageFindings"] if f["suitable"]]
    primary_orig = valid_findings[0]["originalPath"]

    prediction = Prediction(
        plant_id=body.plantId,
        user_id=user.id if user else None,
        weather_record_id=weather_record.id if weather_record else None,
        crop=result["crop"],
        predicted_disease=result["predictedDisease"],
        condition_category=result["conditionCategory"],
        confidence=result["confidence"],
        uncertain=1 if result["uncertain"] else 0,
        uncertainty_reason=result["uncertaintyReason"],
        affected_area_pct=result["affectedAreaPct"],
        severity=result["severity"],
        leaf_coverage_pct=result["leafCoveragePct"],
        chlorosis_pct=result["chlorosisPct"],
        necrosis_pct=result["necrosisPct"],
        original_image_path=primary_orig,
        processed_image_path=result["processedPath"],
        model_engine=result["modelEngine"],
        region_label=region,
        approx_lat=f_lat,
        approx_lng=f_lng,
        notes=body.notes.strip(),
        symptoms_json=json.dumps(body.symptoms),
        symptom_onset_value=body.durationValue,
        symptom_onset_unit=body.durationUnit,
        image_consistency=result["consistencyStatus"],
        consistency_message=result["consistencyMessage"],
    )
    db.add(prediction)
    db.flush()

    for f in result["imageFindings"]:
        db.add(
            ScreeningImage(
                prediction_id=prediction.id,
                image_role=f["role"],
                original_path=f["originalPath"],
                processed_path=f["processedPath"],
                suitable=1 if f["suitable"] else 0,
                rejection_reason=f["rejectionReason"],
                detected_crop=f["crop"],
                detected_disease=f["predictedDisease"],
                confidence=f["confidence"],
                affected_area_pct=f["affectedAreaPct"],
                severity=f["severity"],
            )
        )

    if soil_url or body.manualSoil:
        ms = body.manualSoil
        db.add(
            SoilRecord(
                prediction_id=prediction.id,
                soil_photo_path=soil_url,
                observed_color=soil_analysis.get("observedColor", "") if soil_analysis else "",
                observed_moisture=soil_analysis.get("observedMoisture", "") if soil_analysis else "",
                observed_texture=soil_analysis.get("observedTexture", "") if soil_analysis else "",
                observed_surface_signs=soil_analysis.get("observedSurfaceSigns", "") if soil_analysis else "",
                soil_disclaimer=soil_analysis.get("disclaimer", "") if soil_analysis else "",
                manual_moisture=ms.moisture if ms else "",
                manual_ph=ms.ph if ms else "",
                manual_soil_type=ms.soilType if ms else "",
                manual_fertility=ms.fertility if ms else "",
            )
        )

    passport_code = f"SRP-{datetime.now(timezone.utc).year}-{prediction.id:05d}"
    share_token = secrets.token_hex(16)
    passport = FieldPassport(
        passport_code=passport_code,
        prediction_id=prediction.id,
        weather_record_id=weather_record.id if weather_record else None,
        share_token=share_token,
        is_public_share=0,
        qr_payload=json.dumps({"passportCode": passport_code, "verifyUrl": f"/?passport={passport_code}&token={share_token}"}),
    )
    db.add(passport)

    if body.reportOutbreak and f_lat is not None and f_lng is not None and result["predictedDisease"] != "Healthy":
        db.add(
            GeographicalReport(
                prediction_id=prediction.id,
                crop=result["crop"],
                disease=result["predictedDisease"],
                severity=result["severity"],
                region_label=region or "Reported Agricultural Zone",
                approx_lat=f_lat,
                approx_lng=f_lng,
                verified=0,
            )
        )

    db.commit()
    db.refresh(prediction)

    return {
        "suitable": True,
        "prediction": {
            "id": prediction.id,
            "crop": prediction.crop,
            "predicted_disease": prediction.predicted_disease,
            "condition_category": prediction.condition_category,
            "confidence": prediction.confidence,
            "severity": prediction.severity,
            "affected_area_pct": prediction.affected_area_pct,
            "image_consistency": prediction.image_consistency,
            "consistency_message": prediction.consistency_message,
            "passport_code": passport_code,
        },
        "analysis": result,
        "soilAnalysis": soil_analysis,
        "weatherRisk": weather_risk,
    }


@router.get("/predictions")
def list_predictions(db: Session = Depends(get_db)):
    rows = db.query(Prediction).order_by(Prediction.id.desc()).limit(100).all()
    return {
        "predictions": [
            {
                "id": r.id,
                "crop": r.crop,
                "predicted_disease": r.predicted_disease,
                "condition_category": r.condition_category,
                "confidence": r.confidence,
                "affected_area_pct": r.affected_area_pct,
                "severity": r.severity,
                "verification_status": r.verification_status,
                "user_feedback_status": r.user_feedback_status,
                "region_label": r.region_label,
                "original_image_path": r.original_image_path,
                "processed_image_path": r.processed_image_path,
            }
            for r in rows
        ]
    }


@router.post("/predictions/{prediction_id}/feedback")
def save_farmer_feedback(prediction_id: int, body: FeedbackRequest, db: Session = Depends(get_db)):
    pred = db.query(Prediction).filter(Prediction.id == prediction_id).first()
    if not pred:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Screening record not found.")

    # Never overwrite predicted_disease / verified_disease from farmer feedback
    pred.user_feedback_status = body.feedbackStatus
    pred.user_feedback_notes = body.notes.strip()
    if body.samePlantConfirmed is not None:
        pred.same_plant_confirmed = 1 if body.samePlantConfirmed else 0
    db.commit()

    return {
        "ok": True,
        "prediction": {
            "id": pred.id,
            "predicted_disease": pred.predicted_disease,
            "user_feedback_status": pred.user_feedback_status,
            "same_plant_confirmed": pred.same_plant_confirmed,
        },
    }
