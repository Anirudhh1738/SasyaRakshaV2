import type { WeatherRiskResult } from './weather.ts';

export interface SoilInput {
  moisture?: string; // Dry | Moist | Waterlogged | Unknown
  ph?: number | null;
  soilType?: string; // Loam | Clay | Sandy | Silt | Red / Laterite | Black Cotton | Unknown
  fertility?: string; // Low | Medium | High | Unknown
}

export interface SoilEnvironmentalAdvice {
  providedFieldsCount: number;
  missingFields: string[];
  summary: string;
  recommendations: string[];
  weatherInteractionNote: string;
}

export function buildSoilAndEnvironmentalAdvice(
  crop: string,
  disease: string,
  conditionCategory: string,
  soil: SoilInput,
  weather: WeatherRiskResult | null
): SoilEnvironmentalAdvice {
  const recs: string[] = [];
  const missing: string[] = [];
  let provided = 0;

  const moisture = soil.moisture && soil.moisture !== 'Unknown' ? soil.moisture : '';
  const ph = typeof soil.ph === 'number' && !Number.isNaN(soil.ph) ? soil.ph : null;
  const soilType = soil.soilType && soil.soilType !== 'Unknown' ? soil.soilType : '';
  const fertility = soil.fertility && soil.fertility !== 'Unknown' ? soil.fertility : '';

  if (moisture) provided++;
  else missing.push('Soil moisture');

  if (ph !== null) provided++;
  else missing.push('Soil pH');

  if (soilType) provided++;
  else missing.push('Soil type');

  if (fertility) provided++;
  else missing.push('Soil fertility');

  // Soil moisture rules
  if (moisture === 'Waterlogged') {
    recs.push(
      'Waterlogged soil stresses roots and keeps canopy humidity high, increasing fungal and oomycete diseases such as Late Blight and root rot. Improve field drainage ridges and pause irrigation until topsoil drains.'
    );
  } else if (moisture === 'Dry') {
    recs.push(
      'Dry soil weakens plants and makes leaf edges prone to scorching and Early Blight or Brown Spot stress. Apply light, steady root-zone watering (avoiding wetting leaves) and use organic mulch to conserve moisture.'
    );
  } else if (moisture === 'Moist') {
    recs.push(
      'Soil moisture is balanced. Keep watering at the root zone in morning hours so leaves dry quickly before nightfall.'
    );
  }

  // Soil pH rules
  if (ph !== null) {
    if (ph < 5.5) {
      recs.push(
        `Acidic soil (pH ${ph.toFixed(1)}) reduces phosphorus, calcium, and magnesium uptake, which can mimic or worsen leaf yellowing and spot susceptibility. Test soil and apply agricultural lime as advised by your local soil lab.`
      );
    } else if (ph > 7.8) {
      recs.push(
        `Alkaline soil (pH ${ph.toFixed(1)}) limits iron, zinc, and micronutrient availability, causing interveinal yellowing. Incorporate well-rotted compost or gypsum/sulfur amendments guided by a soil test.`
      );
    } else {
      recs.push(`Soil pH (${ph.toFixed(1)}) is within the favorable 5.8–7.5 range for nutrient absorption.`);
    }
  }

  // Soil type rules
  if (soilType === 'Clay' || soilType === 'Black Cotton') {
    recs.push(
      `${soilType} soil holds water longer; plant on raised beds or ridges to prevent root suffocation and splash-borne blight after rain.`
    );
  } else if (soilType === 'Sandy') {
    recs.push(
      'Sandy soil drains quickly and leaches nitrogen and potassium faster, which can increase Brown Spot or nutrient yellowing. Add organic compost and split fertilizer applications.'
    );
  } else if (soilType === 'Loam' || soilType === 'Silt' || soilType === 'Red / Laterite') {
    recs.push(
      `${soilType} soil benefits from regular organic matter incorporation to maintain steady aeration and microbial balance.`
    );
  }

  // Soil fertility rules
  if (fertility === 'Low') {
    recs.push(
      'Low soil fertility weakens plant defenses against opportunists like Early Blight and Rice Brown Spot. Supplement with balanced compost and potassium/micronutrients based on a local soil health card.'
    );
  } else if (fertility === 'High') {
    if (crop.toLowerCase() === 'rice' || disease.toLowerCase().includes('blast') || conditionCategory === 'Fungal') {
      recs.push(
        'Avoid excessive nitrogen fertilizer in high-fertility fields, as overly lush, soft leaves are more vulnerable to Rice Blast, powdery mildew, and sap-sucking pests.'
      );
    } else {
      recs.push('Fertility is reported as high; maintain balanced potassium alongside nitrogen rather than excess urea.');
    }
  } else if (fertility === 'Medium') {
    recs.push('Moderate soil fertility is suitable; continue split nutrient schedules rather than single heavy doses.');
  }

  let weatherInteractionNote =
    'No local weather reading was attached yet. Add your town or GPS location to combine temperature, humidity, and rainfall with soil factors.';
  if (weather) {
    weatherInteractionNote = `At ${weather.temperatureC}°C, ${weather.humidityPct}% humidity, and ${weather.rainfallMm} mm rainfall in ${weather.locationName}, weather-based disease risk is estimated as ${weather.riskLevel}.`;
    if (weather.humidityPct >= 80 && moisture === 'Waterlogged') {
      recs.push(
        'Combined high air humidity and waterlogged soil strongly elevate fungal spread; prioritize drainage and airflow pruning immediately.'
      );
    }
  }

  if (recs.length === 0) {
    recs.push('Enter known soil moisture, pH, soil type, or fertility to receive tailored soil improvement advice.');
  }

  const summary =
    provided > 0
      ? `Generated from ${provided} soil attribute${provided > 1 ? 's' : ''}${weather ? ' and Open-Meteo weather readings' : ''}.`
      : 'General soil guidance.';

  return {
    providedFieldsCount: provided,
    missingFields: missing,
    summary,
    recommendations: recs,
    weatherInteractionNote,
  };
}
