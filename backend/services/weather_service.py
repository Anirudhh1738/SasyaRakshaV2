from typing import Dict, Optional
import httpx

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


async def geocode_location(query: str) -> Optional[Dict]:
    async with httpx.AsyncClient(timeout=8.0, headers={"User-Agent": "SasyaRaksha/1.0"}) as client:
        resp = await client.get(NOMINATIM_URL, params={"q": query, "format": "json", "limit": 1})
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not data:
            return None
        return {
            "name": data[0].get("display_name", query).split(",")[0].strip(),
            "latitude": float(data[0]["lat"]),
            "longitude": float(data[0]["lon"]),
        }


async def reverse_geocode_label(lat: float, lng: float) -> str:
    try:
        async with httpx.AsyncClient(timeout=8.0, headers={"User-Agent": "SasyaRaksha/1.0"}) as client:
            resp = await client.get(NOMINATIM_REVERSE_URL, params={"lat": lat, "lon": lng, "format": "json"})
            if resp.status_code == 200:
                addr = resp.json().get("address", {})
                label = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("state_district")
                if label:
                    return str(label)
    except Exception:
        pass
    return f"{lat:.2f}, {lng:.2f}"


async def fetch_open_meteo_risk(location_name: str, lat: float, lng: float, crop: str) -> Dict:
    params = {
        "latitude": lat,
        "longitude": lng,
        "current": "temperature_2m,relative_humidity_2m,rain,wind_speed_10m",
        "daily": "temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,rain_sum",
        "forecast_days": 5,
        "timezone": "auto",
    }
    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.get(OPEN_METEO_URL, params=params)
        resp.raise_for_status()
        payload = resp.json()

    cur = payload.get("current", {})
    temp = float(cur.get("temperature_2m", 24.0))
    humidity = float(cur.get("relative_humidity_2m", 60.0))
    rain = float(cur.get("rain", 0.0))
    wind = float(cur.get("wind_speed_10m", 5.0))

    factors = []
    risk_level = "Low"
    if humidity >= 80 or rain >= 3.0:
        risk_level = "High"
        factors.append(f"High humidity ({humidity}%) or rain ({rain} mm) favors fungal/bacterial leaf diseases.")
    elif humidity >= 65 or (18 <= temp <= 30):
        risk_level = "Medium"
        factors.append(f"Moderate temperature ({temp}°C) and humidity ({humidity}%) allow foliar pathogen activity.")
    else:
        factors.append("Current dry/low-humidity conditions suppress most foliar fungal spore germination.")

    return {
        "locationName": location_name,
        "latitude": lat,
        "longitude": lng,
        "crop": crop,
        "temperatureC": temp,
        "humidityPct": humidity,
        "rainfallMm": rain,
        "windKmh": wind,
        "riskLevel": risk_level,
        "riskFactors": factors,
        "disclaimer": "Live Open-Meteo environmental estimate only; always verify crop leaves directly.",
    }
