from typing import Any, Dict, List, Optional
import httpx


async def fetch_open_meteo_weather(
    location_name: str,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    crop: str = "Tomato",
) -> Optional[Dict[str, Any]]:
    async with httpx.AsyncClient(timeout=8.0) as client:
        lat, lng, resolved_name = latitude, longitude, location_name.strip()
        if (lat is None or lng is None) and resolved_name:
            geo_resp = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": resolved_name, "count": 1, "language": "en", "format": "json"},
            )
            if geo_resp.status_code == 200:
                results = geo_resp.json().get("results") or []
                if results:
                    lat = float(results[0]["latitude"])
                    lng = float(results[0]["longitude"])
                    resolved_name = f"{results[0]['name']}, {results[0].get('country', '')}".strip(", ")

        if lat is None or lng is None:
            return None

        wx_resp = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lng,
                "current": "temperature_2m,relative_humidity_2m,precipitation",
                "timezone": "auto",
            },
        )
        if wx_resp.status_code != 200:
            return None

        cur = wx_resp.json().get("current") or {}
        temp = float(cur.get("temperature_2m", 24.0))
        hum = float(cur.get("relative_humidity_2m", 60.0))
        rain = float(cur.get("precipitation", 0.0))

        factors: List[str] = []
        risk = "Low"
        if hum >= 82 or rain >= 4.0:
            risk = "High"
            factors.append("High relative humidity (>82%) or rainfall strongly promotes blight and mildew spore spread.")
        elif hum >= 65 or (18 <= temp <= 30):
            risk = "Medium"
            factors.append("Warm-to-mild temperatures with moderate moisture can sustain foliar leaf spot development.")
        else:
            factors.append("Current dry conditions limit most moisture-dependent fungal spreads.")

        return {
            "location_name": resolved_name or f"{lat:.2f}, {lng:.2f}",
            "latitude": lat,
            "longitude": lng,
            "crop": crop,
            "temperature_c": temp,
            "humidity_pct": hum,
            "rainfall_mm": rain,
            "risk_level": risk,
            "risk_factors": factors,
        }


def build_soil_recommendations(
    moisture: str = "Unknown",
    soil_ph: Optional[float] = None,
    soil_type: str = "Unknown",
    fertility: str = "Unknown",
    weather: Optional[Dict[str, Any]] = None,
) -> List[str]:
    recs: List[str] = []
    if moisture == "Waterlogged":
        recs.append("Waterlogged soil raises canopy humidity and root stress; improve field drainage ridges immediately.")
    elif moisture == "Dry":
        recs.append("Dry soil weakens foliage against Early Blight and scorching; water steadily at the root zone and apply mulch.")
    elif moisture == "Moist":
        recs.append("Soil moisture is balanced; irrigate in morning hours at the base so leaves stay dry.")

    if soil_ph is not None:
        if soil_ph < 5.5:
            recs.append(f"Acidic soil (pH {soil_ph:.1f}) limits calcium and magnesium uptake; consider lime based on a soil lab test.")
        elif soil_ph > 7.8:
            recs.append(f"Alkaline soil (pH {soil_ph:.1f}) restricts iron/zinc uptake causing leaf yellowing; add organic compost.")
        else:
            recs.append(f"Soil pH ({soil_ph:.1f}) is within a favorable 5.8–7.5 nutrient availability window.")

    if soil_type in ("Clay", "Black Cotton"):
        recs.append(f"{soil_type} soil retains moisture longer; grow crops on raised beds to prevent splash-borne blight.")
    elif soil_type == "Sandy":
        recs.append("Sandy soil leaches nitrogen rapidly; incorporate compost and use split fertilizer doses.")

    if fertility == "Low":
        recs.append("Low fertility weakens natural disease tolerance; enrich soil with well-decomposed compost and potassium.")
    elif fertility == "High":
        recs.append("Avoid excess nitrogen top-dressing in high-fertility plots as soft shoots attract fungal blasts and pests.")

    if weather and weather.get("humidity_pct", 0) >= 80 and moisture == "Waterlogged":
        recs.append("High air humidity combined with waterlogged soil elevates blight pressure; improve airflow immediately.")

    if not recs:
        recs.append("Enter known soil moisture, pH, type, or fertility for tailored soil care notes. Missing soil values are never guessed.")

    return recs
