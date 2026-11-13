export type LanguageCode = 'en' | 'hi' | 'kn';

export type ConditionCategory =
  | 'fungal'
  | 'bacterial'
  | 'viral'
  | 'pest'
  | 'nutrient_deficiency'
  | 'healthy';

export type PlantImageRole =
  | 'closeup_leaf'
  | 'underside_leaf'
  | 'multiple_leaves'
  | 'entire_plant'
  | 'surrounding_field';

export type IndividualViewSlot = 'front' | 'back' | 'closeup';

export type PageId =
  | 'home'
  | 'scan-plant'
  | 'plant-monitoring'
  | 'outbreak-map'
  | 'expert-portal';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: 'farmer' | 'expert' | 'admin';
  region: string;
  preferred_language?: LanguageCode;
}

export interface AlternativePrediction {
  crop: string;
  disease: string;
  confidence: number;
}

export interface ScreeningImageRecord {
  id: number;
  prediction_id: number;
  image_role: PlantImageRole;
  original_path: string;
  processed_path: string;
  suitable: number;
  rejection_reason: string;
  detected_crop: string;
  detected_disease: string;
  confidence: number;
  affected_area_pct: number;
  severity: 'Healthy' | 'Low' | 'Medium' | 'High';
  created_at: string;
}

export interface SoilRecord {
  id: number;
  prediction_id: number;
  soil_photo_path: string;
  observed_color: string;
  observed_moisture: string;
  observed_texture: string;
  observed_surface_signs: string;
  soil_disclaimer: string;
  manual_moisture: string;
  manual_ph: string;
  manual_soil_type: string;
  manual_fertility: string;
  recommendations_json: string;
  created_at: string;
}

export interface PredictionRecord {
  id: number;
  plant_id: number | null;
  plant_code?: string | null;
  field_label?: string | null;
  user_id: number | null;
  weather_record_id?: number | null;
  crop: string;
  predicted_disease: string;
  condition_category?: ConditionCategory;
  confidence: number;
  uncertain?: number;
  uncertainty_reason?: string;
  alternative_predictions_json: string;
  affected_area_pct: number;
  severity: 'Healthy' | 'Low' | 'Medium' | 'High';
  leaf_coverage_pct: number;
  chlorosis_pct: number;
  necrosis_pct: number;
  original_image_path: string;
  processed_image_path: string;
  model_engine: string;
  verification_status: 'pending' | 'confirmed' | 'rejected' | 'corrected';
  verified_crop?: string | null;
  verified_disease?: string | null;
  region_label: string;
  approx_lat: number | null;
  approx_lng: number | null;
  notes: string;
  symptoms_json?: string;
  symptom_onset_value?: number | null;
  symptom_onset_unit?: string;
  image_consistency?: 'single' | 'consistent' | 'mixed_symptoms' | 'different_plants_suspected';
  consistency_message?: string;
  user_feedback_status?: 'unreviewed' | 'confirmed' | 'incorrect' | 'recheck_requested';
  user_feedback_notes?: string;
  same_plant_confirmed?: number | null;
  recommendations_json?: string;
  is_demo: number;
  passport_code?: string | null;
  created_at: string;
}

export interface FieldPassportRecord {
  id: number;
  passport_code: string;
  prediction_id: number;
  weather_record_id: number | null;
  share_token: string;
  is_public_share: number;
  qr_payload: string;
  created_at: string;
}

export interface PlantRecord {
  id: number;
  plant_code: string;
  crop: string;
  field_label: string;
  region_label: string;
  owner_id?: number | null;
  scan_count: number;
  latest_affected_pct: number | null;
  latest_severity: string | null;
  latest_disease?: string | null;
  latest_confidence?: number | null;
  latest_verification_status?: string | null;
  is_demo: number;
  created_at: string;
}

export interface DiseaseLibraryEntry {
  id: number;
  crop: string;
  disease_name: string;
  condition_category?: ConditionCategory;
  pathogen: string;
  simple_summary?: string;
  symptoms: string;
  causes: string;
  favorable_conditions: string;
  prevention: string;
  management: string;
  recommended_treatment?: string;
  pesticide_or_medicine?: string;
  active_ingredient?: string;
  application_frequency?: string;
  treatment_duration?: string;
  dosage_instructions?: string;
  safety_precautions?: string;
  expected_outcome?: string;
  followup_schedule?: string;
  reference_source: string;
  reference_url: string;
}

export interface TreatmentRecord {
  id: number;
  plant_id: number;
  prediction_id: number | null;
  user_id: number;
  medicine_name: string;
  active_ingredient: string;
  dosage_applied: string;
  application_date: string;
  days_used: number;
  observations: string;
  notes: string;
  created_at: string;
}

export interface ProgressionEntry {
  id: number;
  plant_id: number;
  prediction_id: number | null;
  user_id: number;
  day_number: number;
  treatment_status: 'Planned' | 'Ongoing' | 'Completed' | 'Paused';
  medicine_applied: string;
  application_date: string;
  observed_symptoms: string;
  disease_progression: string;
  followup_image_path: string;
  expected_outcome: string;
  actual_outcome: string;
  created_at: string;
  updated_at?: string;
}

export interface WeatherRiskResponse {
  available: boolean;
  unsupportedReason?: string;
  weatherRecordId?: number;
  locationName: string;
  latitude: number;
  longitude: number;
  crop: string;
  temperatureC: number;
  humidityPct: number;
  rainfallMm: number;
  windKmh: number;
  riskLevel: 'Low' | 'Medium' | 'High';
  timePeriod: string;
  primaryThreats: string[];
  riskFactors: string[];
  dailyForecast: Array<{
    date: string;
    tempMax: number;
    tempMin: number;
    humidityMean: number;
    rainSum: number;
  }>;
  disclaimer: string;
}

export interface SavedWeatherRecord {
  id: number;
  location_name: string;
  latitude: number;
  longitude: number;
  crop: string;
  temperature_c: number;
  humidity_pct: number;
  rainfall_mm: number;
  risk_level: 'Low' | 'Medium' | 'High';
  risk_factors_json: string;
  time_period?: string;
  recorded_at: string;
}

export interface OutbreakReport {
  id: number;
  prediction_id: number;
  crop: string;
  disease: string;
  severity: string;
  region_label: string;
  approx_lat: number;
  approx_lng: number;
  verified: number;
  is_demo?: number;
  reported_at: string;
}

export interface OutbreakCluster {
  regionLabel: string;
  crop: string;
  disease: string;
  lat: number;
  lng: number;
  count: number;
  verifiedCount: number;
  latestDate?: string;
}

export interface ExpertCorrection {
  id: number;
  prediction_id: number;
  reviewer_id: number;
  reviewer_name: string;
  action: 'confirm' | 'reject' | 'correct';
  original_crop: string;
  original_disease: string;
  corrected_crop: string | null;
  corrected_disease: string | null;
  comments: string;
  queued_for_retraining: number;
  created_at: string;
}

export interface ModelEvaluationRecord {
  id: number;
  model_name: string;
  dataset_name: string;
  status: 'not_evaluated' | 'evaluated';
  accuracy: number | null;
  precision_macro: number | null;
  recall_macro: number | null;
  f1_macro: number | null;
  confusion_matrix_json: string;
  classes_json: string;
  notes: string;
  evaluated_at: string;
}

export interface AuditLogEntry {
  id: number;
  actor_id: number | null;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string;
  details_json: string;
  created_at: string;
}

export interface AdminUserSummary {
  id: number;
  name: string;
  email: string;
  role: 'farmer' | 'expert' | 'admin';
  region: string;
  is_active: number;
  created_at: string;
}
