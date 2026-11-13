import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import GeographicalReport, WeatherRecord
from services.weather_service import fetch_open_meteo_risk, geocode_location, reverse_geocode_label

router = APIRouter(prefix="/api", tags=["weather-map"])


@router.get("/weather/risk")
async def weather_risk(
    location: str = "",
    crop: str = "Tomato",
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    db: Session = Depends(get_db),
):
    resolved_name = location.strip()
    if lat is None or lng is None:
        if not resolved_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provide a location name or GPS coordinates.",
            )
        geo = await geocode_location(resolved_name)
        if not geo:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Location '{resolved_name}' not found.")
        resolved_name = geo["name"]
        lat, lng = geo["latitude"], geo["longitude"]
    elif not resolved_name:
        resolved_name = await reverse_geocode_label(lat, lng)

    risk = await fetch_open_meteo_risk(resolved_name, lat, lng, crop)
    rec = WeatherRecord(
        location_name=risk["locationName"],
        latitude=risk["latitude"],
        longitude=risk["longitude"],
        crop=risk["crop"],
        temperature_c=risk["temperatureC"],
        humidity_pct=risk["humidityPct"],
        rainfall_mm=risk["rainfallMm"],
        risk_level=risk["riskLevel"],
        risk_factors_json=json.dumps(risk["riskFactors"]),
    )
    db.add(rec)
    db.commit()
    return risk


@router.get("/outbreaks")
def outbreak_reports(verified_only: bool = False, db: Session = Depends(get_db)):
    q = db.query(GeographicalReport)
    if verified_only:
        q = q.filter(GeographicalReport.verified == 1)
    rows = q.order_by(GeographicalReport.id.desc()).all()
    return {
        "reports": [
            {
                "id": r.id,
                "crop": r.crop,
                "disease": r.disease,
                "severity": r.severity,
                "region_label": r.region_label,
                "approx_lat": r.approx_lat,
                "approx_lng": r.approx_lng,
                "verified": r.verified,
            }
            for r in rows
        ]
    }
