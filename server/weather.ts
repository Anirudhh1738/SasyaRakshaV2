export interface WeatherRiskResult {
  available: boolean;
  unsupportedReason?: string;
  locationName: string;
  latitude: number;
  longitude: number;
  crop: string;
  temperatureC: number;
  humidityPct: number;
  rainfallMm: number;
  windKmh: number;
  riskLevel: 'Low' | 'Medium' | 'High';
  primaryThreats: string[];
  riskFactors: string[];
  timePeriod: string;
  dailyForecast: Array<{
    date: string;
    tempMax: number;
    tempMin: number;
    humidityMean: number;
    rainSum: number;
  }>;
  disclaimer: string;
}

const SUPPORTED_WEATHER_CROPS = new Set([
  'tomato',
  'potato',
  'rice',
  'maize',
  'pepper',
  'strawberry',
  'wheat',
  'apple',
  'grape',
]);

export async function geocodeLocation(
  query: string
): Promise<{ name: string; latitude: number; longitude: number } | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Open-Meteo geocoding error (${resp.status})`);
  }
  const data = (await resp.json()) as {
    results?: Array<{ name: string; admin1?: string; country?: string; latitude: number; longitude: number }>;
  };
  if (!data.results || data.results.length === 0) return null;
  const r = data.results[0];
  const parts = [r.name, r.admin1, r.country].filter(Boolean);
  return {
    name: parts.join(', '),
    latitude: r.latitude,
    longitude: r.longitude,
  };
}

export async function reverseGeocodeLabel(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'SasyaRaksha/1.0 (Open-Source Agricultural Education)' },
    });
    if (!resp.ok) return `Field Area (${lat.toFixed(2)}, ${lng.toFixed(2)})`;
    const data = (await resp.json()) as {
      address?: { city?: string; town?: string; village?: string; county?: string; state?: string; country?: string };
    };
    const a = data.address;
    if (!a) return `Field Area (${lat.toFixed(2)}, ${lng.toFixed(2)})`;
    const parts = [a.city || a.town || a.village || a.county, a.state, a.country].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : `Field Area (${lat.toFixed(2)}, ${lng.toFixed(2)})`;
  } catch {
    return `Field Area (${lat.toFixed(2)}, ${lng.toFixed(2)})`;
  }
}

export async function fetchOpenMeteoRisk(
  locationName: string,
  latitude: number,
  longitude: number,
  crop: string
): Promise<WeatherRiskResult> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,relative_humidity_2m,rain,wind_speed_10m` +
    `&daily=temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,rain_sum` +
    `&past_days=3&forecast_days=5&timezone=auto`;

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Open-Meteo weather forecast error (${resp.status})`);
  }

  const data = (await resp.json()) as {
    current: {
      temperature_2m: number;
      relative_humidity_2m: number;
      rain: number;
      wind_speed_10m: number;
    };
    daily: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      relative_humidity_2m_mean: number[];
      rain_sum: number[];
    };
  };

  const temp = Number(data.current.temperature_2m ?? 0);
  const rh = Number(data.current.relative_humidity_2m ?? 0);
  const rainCurrent = Number(data.current.rain ?? 0);
  const wind = Number(data.current.wind_speed_10m ?? 0);

  const dailyForecast = data.daily.time.map((date, idx) => ({
    date,
    tempMax: Number(data.daily.temperature_2m_max[idx] ?? 0),
    tempMin: Number(data.daily.temperature_2m_min[idx] ?? 0),
    humidityMean: Number(data.daily.relative_humidity_2m_mean[idx] ?? 0),
    rainSum: Number(data.daily.rain_sum[idx] ?? 0),
  }));

  const firstDate = dailyForecast[0]?.date || 'Past 3 days';
  const lastDate = dailyForecast[dailyForecast.length - 1]?.date || 'Next 5 days';
  const timePeriod = `${firstDate} to ${lastDate} (Past 3 days + 5-day Open-Meteo window)`;

  const cropLower = crop.toLowerCase();
  if (!SUPPORTED_WEATHER_CROPS.has(cropLower)) {
    return {
      available: false,
      unsupportedReason: `Crop "${crop}" does not yet have a validated pathogen-weather threshold rule in this model. Weather metrics are displayed without disease risk scoring.`,
      locationName,
      latitude,
      longitude,
      crop,
      temperatureC: Number(temp.toFixed(1)),
      humidityPct: Number(rh.toFixed(0)),
      rainfallMm: Number(rainCurrent.toFixed(1)),
      windKmh: Number(wind.toFixed(1)),
      riskLevel: 'Low',
      primaryThreats: [],
      riskFactors: [
        `Environmental risk threshold unavailable for "${crop}". Observed weather: ${temp.toFixed(1)}°C, ${rh.toFixed(0)}% humidity, ${rainCurrent.toFixed(1)} mm rain.`,
      ],
      timePeriod,
      dailyForecast,
      disclaimer: '',
    };
  }

  const recentRain3d = dailyForecast.slice(0, 4).reduce((sum, d) => sum + d.rainSum, 0);
  const avgHumidity3d =
    dailyForecast.slice(0, 4).reduce((sum, d) => sum + d.humidityMean, 0) /
    Math.max(1, dailyForecast.slice(0, 4).length);

  const factors: string[] = [];
  const threats: string[] = [];
  let riskScore = 0;

  if (cropLower === 'tomato' || cropLower === 'potato') {
    if (temp >= 12 && temp <= 24 && (rh >= 85 || avgHumidity3d >= 82)) {
      riskScore += 2;
      threats.push('Late Blight (Phytophthora infestans)');
      factors.push(`Cool-mild weather (${temp.toFixed(1)}°C) and high humidity (${rh.toFixed(0)}%) favor Late Blight spread.`);
    }
    if (temp >= 23 && temp <= 31 && (rh >= 70 || recentRain3d >= 3)) {
      riskScore += 1;
      threats.push('Early Blight (Alternaria solani)');
      factors.push(`Warm temperatures (${temp.toFixed(1)}°C) with recent moisture (${recentRain3d.toFixed(1)} mm) support Early Blight.`);
    }
  } else if (cropLower === 'rice') {
    if (temp >= 20 && temp <= 28 && (rh >= 85 || avgHumidity3d >= 83)) {
      riskScore += 2;
      threats.push('Rice Blast (Magnaporthe oryzae)');
      factors.push(`High humidity (${rh.toFixed(0)}%) and mild warmth (${temp.toFixed(1)}°C) increase Rice Blast risk.`);
    }
    if (temp >= 25 && recentRain3d >= 5) {
      riskScore += 1;
      threats.push('Brown Spot (Bipolaris oryzae)');
      factors.push(`Warm wet conditions (${temp.toFixed(1)}°C, ${recentRain3d.toFixed(1)} mm rain) elevate Brown Spot pressure.`);
    }
  } else if (cropLower === 'maize') {
    if (temp >= 18 && temp <= 27 && (rh >= 80 || recentRain3d >= 5)) {
      riskScore += 2;
      threats.push('Northern Leaf Blight (Exserohilum turcicum)');
      factors.push(`Extended leaf moisture (${recentRain3d.toFixed(1)} mm rain, ${rh.toFixed(0)}% humidity) favors Northern Leaf Blight.`);
    }
    if (temp >= 16 && temp <= 23 && rh >= 85) {
      riskScore += 1;
      threats.push('Common Rust (Puccinia sorghi)');
      factors.push(`Cool humid air (${temp.toFixed(1)}°C, ${rh.toFixed(0)}% humidity) supports maize rust pustules.`);
    }
  } else if (cropLower === 'pepper') {
    if (temp >= 24 && temp <= 31 && (rh >= 78 || recentRain3d >= 4)) {
      riskScore += 2;
      threats.push('Bacterial Spot (Xanthomonas campestris)');
      factors.push(`Warm rain-splash conditions (${temp.toFixed(1)}°C, ${rh.toFixed(0)}% humidity) favor bacterial spot.`);
    }
  } else if (cropLower === 'strawberry') {
    if (temp >= 18 && temp <= 26 && (rh >= 80 || recentRain3d >= 4)) {
      riskScore += 2;
      threats.push('Leaf Scorch (Diplocarpon earlianum)');
      factors.push(`Mild wet weather (${temp.toFixed(1)}°C, ${recentRain3d.toFixed(1)} mm rain) encourages leaf scorch.`);
    }
  } else if (cropLower === 'wheat') {
    if (temp >= 15 && temp <= 24 && (rh >= 80 || avgHumidity3d >= 78)) {
      riskScore += 2;
      threats.push('Leaf Rust (Puccinia triticina)');
      factors.push(`Mild temperatures (${temp.toFixed(1)}°C) with high humidity (${rh.toFixed(0)}%) favor wheat leaf rust.`);
    }
  } else if (cropLower === 'apple') {
    if (temp >= 12 && temp <= 24 && (recentRain3d >= 4 || rh >= 82)) {
      riskScore += 2;
      threats.push('Apple Scab (Venturia inaequalis)');
      factors.push(`Damp spring-like weather (${recentRain3d.toFixed(1)} mm rain) matches Apple Scab infection windows.`);
    }
  } else if (cropLower === 'grape') {
    if (temp >= 21 && temp <= 30 && rh >= 55 && rh <= 85 && recentRain3d < 10) {
      riskScore += 2;
      threats.push('Powdery Mildew (Erysiphe necator)');
      factors.push(`Warm, moderately humid weather (${temp.toFixed(1)}°C, ${rh.toFixed(0)}% humidity) favors grape powdery mildew.`);
    }
  }

  if (rainCurrent > 1 || recentRain3d > 15) {
    riskScore += 1;
    factors.push(`Recent cumulative rainfall (${recentRain3d.toFixed(1)} mm over recent days) increases splash-dispersal risk.`);
  }
  if (rh < 55 && recentRain3d < 1) {
    factors.push(`Dry air (${rh.toFixed(0)}% humidity) and minimal rain limit most fungal spore germination.`);
  }
  if (factors.length === 0) {
    factors.push(`Current conditions (${temp.toFixed(1)}°C, ${rh.toFixed(0)}% humidity, ${rainCurrent.toFixed(1)} mm rain) sit within moderate baseline ranges for ${crop}.`);
  }

  let riskLevel: 'Low' | 'Medium' | 'High' = 'Low';
  if (riskScore >= 3) riskLevel = 'High';
  else if (riskScore >= 1) riskLevel = 'Medium';

  return {
    available: true,
    locationName,
    latitude,
    longitude,
    crop,
    temperatureC: Number(temp.toFixed(1)),
    humidityPct: Number(rh.toFixed(0)),
    rainfallMm: Number(rainCurrent.toFixed(1)),
    windKmh: Number(wind.toFixed(1)),
    riskLevel,
    primaryThreats: threats,
    riskFactors: factors,
    timePeriod,
    dailyForecast,
    disclaimer: '',
  };
}
