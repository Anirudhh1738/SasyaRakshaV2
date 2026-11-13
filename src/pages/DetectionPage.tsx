import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CloudRain,
  Download,
  ExternalLink,
  Layers,
  MapPin,
  MessageSquare,
  QrCode,
  ShieldCheck,
  Sprout,
  Upload,
} from 'lucide-react';
import { PlantImageUploader, type UploadedPlantPhoto } from '../components/PlantImageUploader';
import { PlotlyChart } from '../components/PlotlyChart';
import { SeverityIndicator } from '../components/StatusText';
import {
  getLocalizedGuidance,
  IMAGE_ROLE_LABELS,
  SYMPTOM_CHECKLIST_ITEMS,
  translateCategory,
  translateCrop,
  translateDisease,
  translateRisk,
  translateSoilObservation,
} from '../i18n/domainTranslations';
import type {
  AuthUser,
  ConditionCategory,
  DiseaseLibraryEntry,
  FieldPassportRecord,
  LanguageCode,
  PageId,
  PlantImageRole,
  PlantRecord,
  PredictionRecord,
  ScreeningImageRecord,
  SoilRecord,
  WeatherRiskResponse,
} from '../types';
import { downloadFieldPassportPdf, generateQrDataUrl } from '../utils/passportPdf';

interface DetectionPageProps {
  authUser: AuthUser | null;
  selectedPredictionId: number | null;
  onConsumeSelectedPrediction: () => void;
  onRequireAuth: () => void;
  onScrollTo: (sectionId: PageId) => void;
  onOpenPassport: (passportCode: string) => void;
  onInspectionSaved: (plantId?: number | null) => void;
}

interface SingleImageFindingDto {
  role: PlantImageRole;
  filename: string;
  originalPath: string;
  processedPath: string;
  suitable: boolean;
  rejectionReason?: string;
  crop: string;
  predictedDisease: string;
  conditionCategory: ConditionCategory;
  confidence: number;
  affectedAreaPct: number;
  severity: 'Healthy' | 'Low' | 'Medium' | 'High';
  reasoning: string;
}

interface ScreeningResultPayload {
  suitable: boolean;
  plantId?: number | null;
  error?: string;
  prediction: PredictionRecord;
  analysis: {
    crop: string;
    predictedDisease: string;
    conditionCategory: ConditionCategory;
    confidence: number;
    uncertain: boolean;
    uncertaintyReason: string;
    reasoning: string;
    alternativePredictions: Array<{ crop: string; disease: string; confidence: number }>;
    affectedAreaPct: number;
    severity: 'Healthy' | 'Low' | 'Medium' | 'High';
    leafCoveragePct: number;
    chlorosisPct: number;
    necrosisPct: number;
    rustPct: number;
    powderyPct: number;
    modelEngine: string;
    engineNote: string;
    limitationsNote: string;
    consistencyStatus?: 'single' | 'consistent' | 'mixed_symptoms' | 'different_plants_suspected';
    consistencyMessage?: string;
    imageFindings?: SingleImageFindingDto[];
  };
  screeningImages?: ScreeningImageRecord[];
  soilRecord?: SoilRecord | null;
  combinedRecommendations?: string[];
  guidance: DiseaseLibraryEntry | null;
  weatherRisk: WeatherRiskResponse | null;
  weatherError?: string;
  passport: FieldPassportRecord | null;
}

export function DetectionPage({
  authUser,
  selectedPredictionId,
  onConsumeSelectedPrediction,
  onRequireAuth,
  onScrollTo,
  onOpenPassport,
  onInspectionSaved,
}: DetectionPageProps) {
  const { t, i18n } = useTranslation();
  const lang = (['en', 'hi', 'kn'].includes(i18n.language) ? i18n.language : 'en') as LanguageCode;

  const [plantImages, setPlantImages] = useState<UploadedPlantPhoto[]>([]);

  // Optional Soil photo + manual soil values
  const [soilPreviewUrl, setSoilPreviewUrl] = useState('');
  const [soilFilename, setSoilFilename] = useState('');
  const [soilMoisture, setSoilMoisture] = useState('');
  const [soilPh, setSoilPh] = useState('');
  const [soilType, setSoilType] = useState('');
  const [soilFertility, setSoilFertility] = useState('');
  const soilInputRef = useRef<HTMLInputElement | null>(null);

  // Optional Symptoms checklist & Duration onset
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [durationValue, setDurationValue] = useState('');
  const [durationUnit, setDurationUnit] = useState<'days' | 'weeks' | 'months'>('days');

  // Optional Location & Tracked Plant
  const [plantId, setPlantId] = useState('');
  const [regionLabel, setRegionLabel] = useState('');
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState('');
  const [locationSkipped, setLocationSkipped] = useState(false);

  const [plants, setPlants] = useState<PlantRecord[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<ScreeningResultPayload | null>(null);

  const [qrPreviewUrl, setQrPreviewUrl] = useState('');
  const [showTechDetails, setShowTechDetails] = useState(false);
  const [showSeverityDetails, setShowSeverityDetails] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);

  // Post-screening feedback state
  const [samePlantChoice, setSamePlantChoice] = useState<boolean | null>(null);
  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [feedbackSavedMsg, setFeedbackSavedMsg] = useState('');

  // Inline manual weather attach when location was omitted
  const [inlineTown, setInlineTown] = useState('');
  const [fetchingInlineWeather, setFetchingInlineWeather] = useState(false);

  useEffect(() => {
    if (!authUser) {
      setPlants([]);
      return;
    }
    const token = localStorage.getItem('agriguard_token') || '';
    fetch('/api/plants', {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((r) => (r.ok ? r.json() : { plants: [] }))
      .then((d) => setPlants(d.plants || []))
      .catch(() => {});
  }, [authUser]);

  // Load saved prediction when opened from Plant Monitoring
  useEffect(() => {
    if (!selectedPredictionId) return;
    let cancelled = false;
    setLoadingSaved(true);
    setErrorMsg('');
    setFeedbackSavedMsg('');
    setShowSeverityDetails(false);

    const token = localStorage.getItem('agriguard_token') || '';
    fetch(`/api/predictions/${selectedPredictionId}`, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(async (d) => {
        if (cancelled || !d?.prediction) return;
        const p = d.prediction as PredictionRecord;
        let parsedAlternatives: Array<{ crop: string; disease: string; confidence: number }> = [];
        try {
          parsedAlternatives = JSON.parse(p.alternative_predictions_json || '[]');
        } catch {
          parsedAlternatives = [];
        }
        let parsedRecommendations: string[] = [];
        try {
          parsedRecommendations = p.recommendations_json ? JSON.parse(p.recommendations_json) : [];
        } catch {
          parsedRecommendations = [];
        }
        let parsedRiskFactors: string[] = [];
        if (d.weather?.risk_factors_json) {
          try {
            parsedRiskFactors = JSON.parse(d.weather.risk_factors_json);
          } catch {
            parsedRiskFactors = [];
          }
        }

        const payload: ScreeningResultPayload = {
          suitable: true,
          plantId: p.plant_id,
          prediction: p,
          analysis: {
            crop: p.verified_crop || p.crop,
            predictedDisease: p.verified_disease || p.predicted_disease,
            conditionCategory: p.condition_category || 'fungal',
            confidence: p.confidence,
            uncertain: Boolean(p.uncertain),
            uncertaintyReason: p.uncertainty_reason || '',
            reasoning: '',
            alternativePredictions: parsedAlternatives,
            affectedAreaPct: p.affected_area_pct,
            severity: p.severity,
            leafCoveragePct: p.leaf_coverage_pct,
            chlorosisPct: p.chlorosis_pct,
            necrosisPct: p.necrosis_pct,
            rustPct: d.severityDetail?.rust_pct || 0,
            powderyPct: d.severityDetail?.powdery_pct || 0,
            modelEngine: p.model_engine,
            engineNote: '',
            limitationsNote: t('scan.severityApproxNote'),
            consistencyStatus: p.image_consistency || 'single',
            consistencyMessage: p.consistency_message || '',
          },
          screeningImages: d.screeningImages || [],
          soilRecord: d.soilRecord || null,
          combinedRecommendations: parsedRecommendations,
          guidance: d.guidance,
          weatherRisk: d.weather
            ? {
                available: true,
                locationName: d.weather.location_name,
                latitude: d.weather.latitude,
                longitude: d.weather.longitude,
                crop: d.weather.crop,
                temperatureC: d.weather.temperature_c,
                humidityPct: d.weather.humidity_pct,
                rainfallMm: d.weather.rainfall_mm,
                windKmh: 0,
                riskLevel: d.weather.risk_level,
                timePeriod: d.weather.time_period || 'Recorded screening weather snapshot',
                primaryThreats: [],
                riskFactors: parsedRiskFactors,
                dailyForecast: [],
                disclaimer: 'Estimated from Open-Meteo observations.',
              }
            : null,
          passport: d.passport,
        };
        setResult(payload);
        setFeedbackNotes(p.user_feedback_notes || '');
        setSamePlantChoice(typeof p.same_plant_confirmed === 'number' ? p.same_plant_confirmed === 1 : null);
        if (d.passport) {
          const shareUrl = `${window.location.origin}/?passport=${d.passport.passport_code}&token=${d.passport.share_token}`;
          setQrPreviewUrl(await generateQrDataUrl(shareUrl));
        } else {
          setQrPreviewUrl('');
        }
        onConsumeSelectedPrediction();
      })
      .catch(() => {
        if (!cancelled) setErrorMsg('Unable to load saved screening result.');
      })
      .finally(() => {
        if (!cancelled) setLoadingSaved(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPredictionId]);

  function handleSoilFile(file: File | undefined) {
    if (!file) return;
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type.toLowerCase())) {
      setErrorMsg('Only JPG, JPEG, and PNG images are supported for soil photos.');
      return;
    }
    setSoilFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSoilPreviewUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  function requestBrowserGps() {
    if (!navigator.geolocation) {
      setGpsStatus('GPS not supported in this browser.');
      return;
    }
    setLocationSkipped(false);
    setGpsStatus(t('scan.gpsRequesting'));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsStatus(t('scan.gpsReady'));
      },
      () => {
        setGpsStatus(t('scan.gpsDeclined'));
      },
      { timeout: 6000 }
    );
  }

  function toggleSymptom(id: string) {
    setSelectedSymptoms((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function runAnalysis() {
    if (plantImages.length === 0) return;
    if (!authUser) {
      setErrorMsg(t('scan.signInRequiredNotice'));
      onRequireAuth();
      return;
    }

    setAnalyzing(true);
    setErrorMsg('');
    setResult(null);
    setQrPreviewUrl('');
    setFeedbackSavedMsg('');
    setSamePlantChoice(null);
    setShowSeverityDetails(false);

    const token = localStorage.getItem('agriguard_token') || '';
    try {
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          images: plantImages.map((img) => ({
            imageBase64: img.dataUrl,
            filename: img.filename,
            role: img.role,
          })),
          soilImageBase64: soilPreviewUrl || undefined,
          soilFilename: soilFilename || undefined,
          manualSoil:
            soilMoisture || soilPh || soilType || soilFertility
              ? {
                  moisture: soilMoisture,
                  ph: soilPh,
                  soilType,
                  fertility: soilFertility,
                }
              : undefined,
          symptoms: selectedSymptoms,
          durationValue: durationValue ? Number(durationValue) : null,
          durationUnit: durationValue ? durationUnit : '',
          cropHint: 'Auto-Detect',
          plantId: plantId ? Number(plantId) : null,
          regionLabel: locationSkipped ? '' : regionLabel,
          approxLat: locationSkipped ? null : gpsCoords?.lat ?? null,
          approxLng: locationSkipped ? null : gpsCoords?.lng ?? null,
          reportOutbreak: !locationSkipped,
        }),
      });
      const json = (await resp.json()) as ScreeningResultPayload;
      if (!resp.ok) {
        if (resp.status === 401) {
          onRequireAuth();
        }
        setErrorMsg(json.error || 'Could not analyze uploaded photograph(s).');
        return;
      }
      setResult(json);
      if (json.passport) {
        const shareUrl = `${window.location.origin}/?passport=${json.passport.passport_code}&token=${json.passport.share_token}`;
        setQrPreviewUrl(await generateQrDataUrl(shareUrl));
      }
      onInspectionSaved(json.plantId ?? json.prediction.plant_id);
    } catch {
      setErrorMsg('Server error while running analysis.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function submitUserFeedback(status: 'confirmed' | 'incorrect' | 'recheck_requested') {
    if (!result) return;
    setSavingFeedback(true);
    const token = localStorage.getItem('agriguard_token') || '';
    try {
      const resp = await fetch(`/api/predictions/${result.prediction.id}/feedback`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          feedbackStatus: status,
          samePlantConfirmed: samePlantChoice,
          notes: feedbackNotes,
        }),
      });
      if (resp.ok) {
        const j = await resp.json();
        setResult({ ...result, prediction: j.prediction });
        setFeedbackSavedMsg(t('scan.feedbackSaved'));
        if (status === 'recheck_requested') {
          setResult(null);
        }
      }
    } finally {
      setSavingFeedback(false);
    }
  }

  async function attachWeatherToResult(e: React.FormEvent) {
    e.preventDefault();
    if (!inlineTown.trim() || !result) return;
    setFetchingInlineWeather(true);
    const token = localStorage.getItem('agriguard_token') || '';
    try {
      const resp = await fetch(
        `/api/weather/risk?location=${encodeURIComponent(inlineTown.trim())}&crop=${encodeURIComponent(
          result.analysis.crop
        )}&predictionId=${result.prediction.id}`,
        {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        }
      );
      const wJson = await resp.json();
      if (resp.ok) {
        setResult({
          ...result,
          weatherRisk: wJson,
          prediction: { ...result.prediction, region_label: wJson.locationName },
        });
        setInlineTown('');
      }
    } finally {
      setFetchingInlineWeather(false);
    }
  }

  function resetScreening() {
    setResult(null);
    setPlantImages([]);
    setSoilPreviewUrl('');
    setSoilFilename('');
    setSelectedSymptoms([]);
    setDurationValue('');
    setErrorMsg('');
    setQrPreviewUrl('');
    setFeedbackSavedMsg('');
    setFeedbackNotes('');
    setShowSeverityDetails(false);
  }

  // Strict Pre-Analysis Empty Diagnosis Fields Table + Uploader
  const emptyFields = [
    { label: t('scan.fieldPlantName'), value: '—' },
    { label: t('scan.fieldDiseaseName'), value: '—' },
    { label: t('common.confidence'), value: '—' },
    { label: t('scan.fieldSymptoms'), value: '—' },
    { label: t('scan.fieldCauses'), value: '—' },
    { label: t('common.severity'), value: '—' },
    { label: t('scan.fieldTreatment'), value: '—' },
  ];

  return (
    <section
      id="scan-plant"
      className="bg-sr-canvas-alt text-sr-text py-20 sm:py-24 border-b border-sr-border scroll-mt-16 transition-colors"
    >
      <div className="max-w-[1160px] mx-auto px-5 sm:px-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.16em] text-sr-accent-ink">
              01 · {t('nav.detect')}
            </p>
            <h2 className="font-editorial mt-2 text-[clamp(1.9rem,3.4vw,2.75rem)] font-semibold leading-[1.1] text-sr-text">
              {t('scan.title')}
            </h2>
            <p className="mt-2 text-sm text-sr-muted">{t('scan.subtitle')}</p>
          </div>

          {result && (
            <button
              type="button"
              onClick={resetScreening}
              className="px-4 py-2.5 text-xs font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t('scan.scanAnother')}
            </button>
          )}
        </div>

        {loadingSaved && !result ? (
          <div className="p-8 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass text-sm text-sr-muted">
            {t('common.loading')}
          </div>
        ) : result ? (
          // POPULATED DIAGNOSIS RESULT VIEW (ONLY AFTER ACTUAL ANALYSIS)
          (() => {
            const rawCrop = result.analysis.crop;
            const rawDisease = result.analysis.predictedDisease;
            const category = result.analysis.conditionCategory || result.prediction.condition_category || 'fungal';
            const isHealthy = rawDisease.toLowerCase() === 'healthy';
            const isUncertain = result.analysis.uncertain || result.prediction.uncertain === 1;
            const locGuidance = getLocalizedGuidance(result.guidance, rawCrop, rawDisease, category, lang);
            const shareUrl = result.passport
              ? `${window.location.origin}/?passport=${result.passport.passport_code}&token=${jsonSafeToken(result.passport)}`
              : '';

            function jsonSafeToken(p: FieldPassportRecord) {
              return p.share_token;
            }

            const multiFindings =
              result.screeningImages && result.screeningImages.length > 0
                ? result.screeningImages.map((si) => ({
                    role: si.image_role,
                    originalPath: si.original_path,
                    processedPath: si.processed_path,
                    suitable: si.suitable === 1,
                    crop: si.detected_crop,
                    disease: si.detected_disease,
                    confidence: si.confidence,
                    affectedAreaPct: si.affected_area_pct,
                    rejectionReason: si.rejection_reason,
                  }))
                : (result.analysis.imageFindings || []).map((f) => ({
                    role: f.role,
                    originalPath: f.originalPath,
                    processedPath: f.processedPath,
                    suitable: f.suitable,
                    crop: f.crop,
                    disease: f.predictedDisease,
                    confidence: f.confidence,
                    affectedAreaPct: f.affectedAreaPct,
                    rejectionReason: f.rejectionReason,
                  }));

            const recommendations: string[] = result.combinedRecommendations?.length
              ? result.combinedRecommendations
              : result.prediction.recommendations_json
              ? JSON.parse(result.prediction.recommendations_json)
              : [];

            const onsetVal = result.prediction.symptom_onset_value;
            const onsetUnit = result.prediction.symptom_onset_unit;
            const healthyPct = Math.max(0, Number((100 - result.analysis.affectedAreaPct).toFixed(2)));

            return (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-sr-muted">
                  <span className="font-mono">
                    #{result.prediction.id} · {result.prediction.created_at.slice(0, 16)}
                  </span>
                  <div className="flex items-center gap-3">
                    {result.prediction.plant_id && (
                      <button
                        type="button"
                        onClick={() => onScrollTo('plant-monitoring')}
                        className="font-semibold text-sr-accent-ink hover:underline cursor-pointer"
                      >
                        {t('scan.viewInMonitoring')}
                      </button>
                    )}
                  </div>
                </div>

                {/* Uncertain Diagnosis Honest Alert */}
                {isUncertain && (
                  <div className="p-4 rounded-xl border border-sr-warn-border bg-sr-warn-bg flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-sr-warn shrink-0 mt-0.5" />
                    <div className="text-xs text-sr-warn space-y-1">
                      <p className="font-semibold">{t('scan.uncertainTitle')}</p>
                      <p>{result.analysis.uncertaintyReason || t('scan.uncertainFallback')}</p>
                    </div>
                  </div>
                )}

                {/* Different Plants Suspected Warning */}
                {result.analysis.consistencyStatus === 'different_plants_suspected' && (
                  <div className="p-4 rounded-xl border border-sr-danger-border bg-sr-danger-bg flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-sr-danger shrink-0 mt-0.5" />
                    <div className="text-xs text-sr-danger">
                      <p className="font-semibold">{t('scan.differentPlantWarning')}</p>
                      <p className="mt-0.5">{result.analysis.consistencyMessage}</p>
                    </div>
                  </div>
                )}

                {/* A. What is the problem? */}
                <div className="p-6 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-3">
                  <p className="text-xs font-semibold text-sr-accent-ink">{t('scan.secWhatProblem')}</p>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-bold text-sr-text">
                        {translateCrop(rawCrop, lang)} — {translateDisease(rawDisease, lang)}
                      </h3>
                      <p className="mt-1 text-sm text-sr-muted">
                        {translateCategory(category, lang)} ·{' '}
                        <strong className={isHealthy ? 'text-sr-ok' : 'text-sr-danger'}>
                          {isHealthy ? t('scan.statusHealthy') : t('scan.statusIssue')}
                        </strong>{' '}
                        · {t('scan.confidenceLabel')}:{' '}
                        <strong className="font-mono tabular-nums text-sr-text">{result.analysis.confidence}%</strong>
                      </p>
                      {locGuidance.pathogen && (
                        <p className="mt-1 text-xs text-sr-muted font-mono">{locGuidance.pathogen}</p>
                      )}
                    </div>
                    <SeverityIndicator severity={result.analysis.severity} />
                  </div>

                  <p className="text-sm leading-relaxed text-sr-text pt-2 border-t border-sr-border">
                    {locGuidance.summary}
                  </p>

                  {result.analysis.consistencyMessage && multiFindings.length > 1 && (
                    <div className="p-3 rounded-lg bg-sr-surface-alt border border-sr-border text-xs text-sr-text flex items-start gap-2">
                      <Layers className="w-4 h-4 text-sr-accent-ink shrink-0 mt-0.5" />
                      <span>{result.analysis.consistencyMessage}</span>
                    </div>
                  )}
                </div>

                {/* B. Causes & Prevention */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="p-6 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-2.5">
                    <p className="text-xs font-semibold text-sr-accent-ink">{t('scan.secWhatCaused')}</p>
                    <p className="text-sm leading-relaxed text-sr-text">{locGuidance.causes}</p>
                    {locGuidance.favorableConditions && (
                      <p className="text-xs leading-relaxed text-sr-muted pt-1">{locGuidance.favorableConditions}</p>
                    )}
                  </div>

                  <div className="p-6 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-2.5">
                    <p className="text-xs font-semibold text-sr-accent-ink">{t('scan.secHowPrevent')}</p>
                    <p className="text-sm leading-relaxed text-sr-text">{locGuidance.prevent}</p>
                  </div>
                </div>

                {/* D. Structured Verified Treatment Plan */}
                <div className="p-6 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-sr-accent-ink" />
                      <p className="text-xs font-semibold text-sr-accent-ink">{t('scan.secWhatToDo')}</p>
                    </div>
                    <span className="text-[11px] font-medium text-sr-accent-ink">{t('scan.verifiedRefNote')}</span>
                  </div>

                  <p className="text-sm leading-relaxed text-sr-text">{locGuidance.todo}</p>

                  {!isHealthy && result.guidance && result.guidance.recommended_treatment ? (
                    <div className="p-4 rounded-xl border border-sr-border bg-sr-surface-alt grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                      <div>
                        <p className="text-sr-muted">{t('scan.treatmentRecommended')}</p>
                        <p className="mt-0.5 font-semibold text-sr-text">{result.guidance.recommended_treatment}</p>
                      </div>
                      <div>
                        <p className="text-sr-muted">{t('scan.treatmentMedicine')}</p>
                        <p className="mt-0.5 font-semibold text-sr-text">
                          {result.guidance.pesticide_or_medicine || t('scan.noneRequired')}
                        </p>
                      </div>
                      <div>
                        <p className="text-sr-muted">{t('scan.treatmentIngredient')}</p>
                        <p className="mt-0.5 font-mono text-sr-text">
                          {result.guidance.active_ingredient || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sr-muted">{t('scan.treatmentFrequency')}</p>
                        <p className="mt-0.5 text-sr-text">{result.guidance.application_frequency || '—'}</p>
                      </div>
                      <div>
                        <p className="text-sr-muted">{t('scan.treatmentDuration')}</p>
                        <p className="mt-0.5 text-sr-text">{result.guidance.treatment_duration || '—'}</p>
                      </div>
                      <div>
                        <p className="text-sr-muted">{t('scan.treatmentDosage')}</p>
                        <p className="mt-0.5 text-sr-text">{result.guidance.dosage_instructions || '—'}</p>
                      </div>
                      <div className="sm:col-span-2 lg:col-span-3 pt-2 border-t border-sr-border grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <p className="text-sr-muted">{t('scan.treatmentSafety')}</p>
                          <p className="mt-0.5 text-sr-text">{result.guidance.safety_precautions}</p>
                        </div>
                        <div>
                          <p className="text-sr-muted">{t('scan.treatmentExpected')}</p>
                          <p className="mt-0.5 text-sr-text">{result.guidance.expected_outcome}</p>
                        </div>
                        <div>
                          <p className="text-sr-muted">{t('scan.treatmentFollowup')}</p>
                          <p className="mt-0.5 text-sr-text">{result.guidance.followup_schedule}</p>
                        </div>
                      </div>
                    </div>
                  ) : !isHealthy && !result.guidance ? (
                    <div className="p-3.5 rounded-lg border border-sr-border bg-sr-surface-alt text-xs text-sr-muted">
                      {t('scan.noVerifiedTreatmentConsult')}
                    </div>
                  ) : null}

                  <div className="pt-2 border-t border-sr-border flex flex-wrap items-center justify-between gap-2 text-xs text-sr-muted">
                    <a
                      href={locGuidance.referenceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-sr-accent-ink hover:underline"
                    >
                      <span>{locGuidance.referenceSource}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {/* C. Severity Estimation & Highlighted Leaf Regions */}
                <div className="p-6 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-sr-accent-ink">{t('scan.secHowSerious')}</p>
                      <p className="mt-1 text-base font-bold text-sr-text">
                        <span className="font-mono tabular-nums">{result.analysis.affectedAreaPct}%</span>{' '}
                        {t('scan.affectedArea')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <SeverityIndicator severity={result.analysis.severity} />
                      <button
                        type="button"
                        onClick={() => setShowSeverityDetails((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sr-accent-ink bg-sr-accent-soft border border-sr-accent-border rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
                      >
                        <Activity className="w-3.5 h-3.5" />
                        <span>{showSeverityDetails ? t('scan.hideSeverityDetails') : t('scan.viewSeverityDetails')}</span>
                        {showSeverityDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {showSeverityDetails && (
                    <div className="p-4 rounded-xl border border-sr-border bg-sr-surface-alt space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div className="p-3 rounded-lg bg-sr-surface border border-sr-border">
                          <p className="text-sr-muted">{t('scan.healthyRegion')}</p>
                          <p className="mt-1 text-base font-bold font-mono tabular-nums text-sr-ok">{healthyPct}%</p>
                        </div>
                        <div className="p-3 rounded-lg bg-sr-surface border border-sr-border">
                          <p className="text-sr-muted">{t('scan.chlorosisLabel')}</p>
                          <p className="mt-1 text-base font-bold font-mono tabular-nums text-sr-warn">
                            {result.analysis.chlorosisPct}%
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-sr-surface border border-sr-border">
                          <p className="text-sr-muted">{t('scan.necrosisLabel')}</p>
                          <p className="mt-1 text-base font-bold font-mono tabular-nums text-sr-danger">
                            {result.analysis.necrosisPct}%
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-sr-surface border border-sr-border">
                          <p className="text-sr-muted">{t('scan.leafCoverageLabel')}</p>
                          <p className="mt-1 text-base font-bold font-mono tabular-nums text-sr-text">
                            {result.analysis.leafCoveragePct}%
                          </p>
                        </div>
                      </div>

                      <div className="p-4 rounded-lg bg-sr-surface border border-sr-border">
                        <p className="text-xs font-semibold text-sr-text mb-1">{t('scan.severityChartTitle')}</p>
                        <PlotlyChart
                          height={220}
                          data={[
                            {
                              type: 'bar',
                              x: ['Healthy Tissue', 'Chlorosis', 'Necrosis', 'Total Infected'],
                              y: [
                                healthyPct,
                                result.analysis.chlorosisPct,
                                result.analysis.necrosisPct,
                                result.analysis.affectedAreaPct,
                              ],
                              marker: {
                                color: ['#22C55E', '#F59E0B', '#EF4444', '#84CC16'],
                              },
                            },
                          ]}
                          layout={{
                            yaxis: { title: { text: '% of Leaf Area' }, range: [0, 100] },
                          }}
                        />
                      </div>

                      <div className="text-xs text-sr-muted space-y-1">
                        <p>
                          <strong className="text-sr-text">{t('scan.severityThresholdsLabel')}:</strong>{' '}
                          {t('scan.severityThresholdsText')}
                        </p>
                        <p>{t('scan.overlayLegend')}</p>
                      </div>
                    </div>
                  )}

                  {onsetVal && (
                    <div className="p-3.5 rounded-lg bg-sr-surface-alt border border-sr-border text-xs">
                      <div className="flex items-center gap-1.5 font-semibold text-sr-text">
                        <Clock className="w-3.5 h-3.5 text-sr-accent-ink" />
                        <span>
                          {t('scan.durationEstimatedNote')}: {onsetVal} {onsetUnit}
                        </span>
                      </div>
                    </div>
                  )}

                  {(() => {
                    let reportedSymptoms: string[] = [];
                    try {
                      reportedSymptoms = result.prediction.symptoms_json ? JSON.parse(result.prediction.symptoms_json) : [];
                    } catch {
                      reportedSymptoms = [];
                    }
                    if (!Array.isArray(reportedSymptoms) || reportedSymptoms.length === 0) return null;
                    const symptomLabels = reportedSymptoms.map((sid) => {
                      const found = SYMPTOM_CHECKLIST_ITEMS.find((it) => it.id === sid);
                      return found ? found.labels[lang] : sid;
                    });
                    return (
                      <div className="p-3 rounded-lg bg-sr-surface-alt border border-sr-border text-xs text-sr-text">
                        <span className="font-semibold">{t('scan.reportedSymptoms')}:</span> {symptomLabels.join(' · ')}
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-sr-muted mb-1.5">{t('scan.originalPhoto')}</p>
                      <div className="h-52 rounded-lg border border-sr-border bg-sr-surface-alt overflow-hidden">
                        <img
                          src={result.prediction.original_image_path}
                          alt="Original plant photograph"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-sr-muted mb-1.5">{t('scan.highlightedPhoto')}</p>
                      <div className="h-52 rounded-lg border border-sr-border bg-sr-surface-alt overflow-hidden">
                        <img
                          src={result.prediction.processed_image_path}
                          alt="Highlighted affected leaf areas"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    </div>
                  </div>

                  {multiFindings.length > 1 && (
                    <div className="pt-3 border-t border-sr-border space-y-2.5">
                      <p className="text-xs font-semibold text-sr-text">{t('scan.secPerImage')}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {multiFindings.map((f, idx) => (
                          <div key={idx} className="p-3 rounded-lg border border-sr-border bg-sr-surface-alt flex items-center gap-3">
                            <img
                              src={f.processedPath || f.originalPath}
                              alt={`View ${idx + 1}`}
                              className="w-14 h-14 rounded object-cover border border-sr-border shrink-0"
                            />
                            <div className="min-w-0 text-xs">
                              <p className="font-semibold text-sr-text truncate">
                                {IMAGE_ROLE_LABELS[f.role]?.[lang] || f.role}
                              </p>
                              {f.suitable ? (
                                <p className="text-sr-muted">
                                  {translateCrop(f.crop, lang)} — {translateDisease(f.disease, lang)} ·{' '}
                                  <span className="font-mono tabular-nums">{f.confidence}%</span> ({f.affectedAreaPct}%)
                                </p>
                              ) : (
                                <p className="text-sr-danger">{f.rejectionReason || 'Excluded'}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Soil & Recommendations */}
                {(result.soilRecord || recommendations.length > 0) && (
                  <div className="p-6 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-3">
                    <div className="flex items-center gap-2">
                      <Sprout className="w-4 h-4 text-sr-accent-ink" />
                      <p className="text-xs font-semibold text-sr-accent-ink">{t('scan.secSoil')}</p>
                    </div>

                    {result.soilRecord && (
                      <div className="p-4 rounded-lg bg-sr-surface-alt border border-sr-border flex flex-col sm:flex-row gap-4">
                        {result.soilRecord.soil_photo_path && (
                          <img
                            src={result.soilRecord.soil_photo_path}
                            alt="Uploaded soil"
                            className="w-24 h-24 rounded-lg object-cover border border-sr-border shrink-0"
                          />
                        )}
                        <div className="text-xs space-y-1 text-sr-text">
                          {result.soilRecord.observed_color && (
                            <p>• {translateSoilObservation(result.soilRecord.observed_color, lang)}</p>
                          )}
                          {result.soilRecord.observed_moisture && (
                            <p>• {translateSoilObservation(result.soilRecord.observed_moisture, lang)}</p>
                          )}
                          {result.soilRecord.observed_texture && (
                            <p>• {translateSoilObservation(result.soilRecord.observed_texture, lang)}</p>
                          )}
                          {result.soilRecord.observed_surface_signs && (
                            <p>• {translateSoilObservation(result.soilRecord.observed_surface_signs, lang)}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {recommendations.length > 0 && (
                      <ul className="space-y-1.5 text-xs text-sr-text">
                        {recommendations.map((rec, i) => (
                          <li key={i}>• {rec}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Environmental Weather Risk */}
                <div className="p-6 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-3">
                  <div className="flex items-center gap-2">
                    <CloudRain className="w-4 h-4 text-sr-accent-ink" />
                    <p className="text-xs font-semibold text-sr-accent-ink">{t('scan.secWeather')}</p>
                  </div>

                  {result.weatherRisk ? (
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-sr-text">
                          {result.weatherRisk.locationName} —{' '}
                          {result.weatherRisk.available
                            ? translateRisk(result.weatherRisk.riskLevel, lang)
                            : t('scan.weatherUnsupported')}
                        </p>
                        <p className="text-xs font-mono tabular-nums text-sr-muted">
                          {result.weatherRisk.temperatureC}°C · {result.weatherRisk.humidityPct}% RH ·{' '}
                          {result.weatherRisk.rainfallMm} mm
                        </p>
                      </div>
                      <p className="text-[11px] text-sr-muted">
                        {t('scan.weatherPeriodLabel')}: {result.weatherRisk.timePeriod}
                      </p>
                      {result.weatherRisk.unsupportedReason && (
                        <p className="text-xs text-sr-warn bg-sr-warn-bg border border-sr-warn-border rounded-lg p-3">
                          {result.weatherRisk.unsupportedReason}
                        </p>
                      )}
                      <ul className="text-xs text-sr-muted space-y-1">
                        {result.weatherRisk.riskFactors.map((f, i) => (
                          <li key={i}>• {f}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <p className="text-xs text-sr-muted">
                        {result.weatherError || t('scan.attachWeatherPrompt')}
                      </p>
                      <form onSubmit={attachWeatherToResult} className="flex flex-wrap gap-2">
                        <input
                          type="text"
                          value={inlineTown}
                          onChange={(e) => setInlineTown(e.target.value)}
                          placeholder={t('home.townPlaceholder')}
                          className="flex-1 min-w-[200px] px-3 py-1.5 text-xs rounded-lg border border-sr-border bg-sr-input text-sr-text"
                        />
                        <button
                          type="submit"
                          disabled={fetchingInlineWeather}
                          className="px-4 py-1.5 text-xs font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover transition-colors cursor-pointer"
                        >
                          {fetchingInlineWeather ? '...' : t('scan.getWeatherBtn')}
                        </button>
                      </form>
                    </div>
                  )}
                </div>

                {/* Farmer Feedback Confirmation */}
                <div className="p-6 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-4">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-sr-accent-ink" />
                    <p className="text-xs font-semibold text-sr-accent-ink">{t('scan.secFeedback')}</p>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-sr-text">{t('scan.samePlantQuestion')}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSamePlantChoice(true)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${
                          samePlantChoice === true
                            ? 'bg-sr-accent text-sr-accent-text border-sr-accent'
                            : 'bg-sr-surface-alt border-sr-border text-sr-text hover:border-sr-border-strong'
                        }`}
                      >
                        {t('scan.yesSamePlant')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSamePlantChoice(false)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${
                          samePlantChoice === false
                            ? 'bg-sr-warn-bg text-sr-warn border-sr-warn-border'
                            : 'bg-sr-surface-alt border-sr-border text-sr-text hover:border-sr-border-strong'
                        }`}
                      >
                        {t('scan.noMixedPlants')}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium text-sr-text">{t('scan.feedbackQuestion')}</p>
                    <input
                      type="text"
                      value={feedbackNotes}
                      onChange={(e) => setFeedbackNotes(e.target.value)}
                      placeholder={t('scan.feedbackNotesPlaceholder')}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-sr-border bg-sr-input text-sr-text"
                    />
                    <div className="flex flex-wrap gap-2.5 pt-1">
                      <button
                        type="button"
                        disabled={savingFeedback}
                        onClick={() => submitUserFeedback('confirmed')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover transition-colors cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>{t('scan.confirmCorrect')}</span>
                      </button>
                      <button
                        type="button"
                        disabled={savingFeedback}
                        onClick={() => submitUserFeedback('incorrect')}
                        className="px-3.5 py-2 text-xs font-semibold text-sr-danger bg-sr-danger-bg border border-sr-danger-border rounded-lg hover:opacity-90 cursor-pointer"
                      >
                        {t('scan.reportIncorrect')}
                      </button>
                      <button
                        type="button"
                        disabled={savingFeedback}
                        onClick={() => submitUserFeedback('recheck_requested')}
                        className="px-3.5 py-2 text-xs font-semibold text-sr-text bg-sr-surface-alt border border-sr-border rounded-lg hover:bg-sr-accent-soft transition-colors cursor-pointer"
                      >
                        {t('scan.requestRecheck')}
                      </button>
                    </div>
                    {feedbackSavedMsg && <p className="text-xs font-medium text-sr-ok">{feedbackSavedMsg}</p>}
                  </div>
                </div>

                {/* Field Passport */}
                {result.passport && (
                  <div className="p-6 rounded-xl border border-sr-accent-border bg-sr-accent-soft sr-surface-glass flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                    <div className="flex items-center gap-4">
                      {qrPreviewUrl && (
                        <div className="p-2 rounded-lg bg-white border border-sr-border shrink-0">
                          <img src={qrPreviewUrl} alt="Field Passport QR Code" className="w-16 h-16" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-sr-accent-ink">
                          <QrCode className="w-3.5 h-3.5" />
                          <span>
                            {t('scan.passportGenerated')} · {result.passport.passport_code}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-sr-text">{t('scan.passportDesc')}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          downloadFieldPassportPdf({
                            passport: result.passport!,
                            prediction: result.prediction,
                            guidance: result.guidance,
                            weather: result.weatherRisk
                              ? {
                                  id: 0,
                                  location_name: result.weatherRisk.locationName,
                                  latitude: result.weatherRisk.latitude,
                                  longitude: result.weatherRisk.longitude,
                                  crop: result.weatherRisk.crop,
                                  temperature_c: result.weatherRisk.temperatureC,
                                  humidity_pct: result.weatherRisk.humidityPct,
                                  rainfall_mm: result.weatherRisk.rainfallMm,
                                  risk_level: result.weatherRisk.riskLevel,
                                  risk_factors_json: JSON.stringify(result.weatherRisk.riskFactors),
                                  time_period: result.weatherRisk.timePeriod,
                                  recorded_at: new Date().toISOString(),
                                }
                              : null,
                            shareUrl,
                            language: lang,
                          })
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{t('scan.downloadPdf')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenPassport(result.passport!.passport_code)}
                        className="px-3.5 py-2 text-xs font-semibold text-sr-text bg-sr-surface border border-sr-border rounded-lg hover:bg-sr-surface-alt transition-colors cursor-pointer"
                      >
                        {t('scan.openPassport')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Collapsible Technical Model Info */}
                <div className="rounded-xl border border-sr-border bg-sr-surface sr-surface-glass overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowTechDetails((v) => !v)}
                    className="w-full px-6 py-3.5 flex items-center justify-between text-xs font-semibold text-sr-muted hover:text-sr-text transition-colors cursor-pointer"
                  >
                    <span>{t('scan.moreTech')}</span>
                    {showTechDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showTechDetails && (
                    <div className="px-6 pb-5 pt-2 border-t border-sr-border space-y-3 text-xs text-sr-muted">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <span>Engine</span>
                          <p className="font-mono text-sr-text mt-0.5">{result.analysis.modelEngine}</p>
                        </div>
                        <div>
                          <span>Chlorosis</span>
                          <p className="font-mono tabular-nums text-sr-text mt-0.5">{result.analysis.chlorosisPct}%</p>
                        </div>
                        <div>
                          <span>Necrosis</span>
                          <p className="font-mono tabular-nums text-sr-text mt-0.5">{result.analysis.necrosisPct}%</p>
                        </div>
                        <div>
                          <span>Leaf Foreground</span>
                          <p className="font-mono tabular-nums text-sr-text mt-0.5">{result.analysis.leafCoveragePct}%</p>
                        </div>
                      </div>

                      {result.analysis.alternativePredictions.length > 0 && (
                        <div>
                          <p className="font-semibold text-sr-text mb-1">{t('scan.alternatives')}</p>
                          <div className="flex flex-wrap gap-3">
                            {result.analysis.alternativePredictions.map((alt) => (
                              <span key={`${alt.crop}-${alt.disease}`} className="font-mono">
                                {translateCrop(alt.crop, lang)} {translateDisease(alt.disease, lang)} ({alt.confidence}%)
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()
        ) : (
          // DEDICATED SCAN PLANT UPLOADER + STRICT EMPTY DIAGNOSIS STATE BEFORE ANALYSIS
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 space-y-5">
              {/* Section 1: Shared Multi-Image / 3 Individual Views / Camera Uploader */}
              <div className="p-6 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-sr-text">{t('scan.plantPhotosTitle')}</h3>
                  <p className="text-xs text-sr-muted mt-0.5">{t('scan.plantPhotosHint')}</p>
                </div>
                <PlantImageUploader images={plantImages} onChange={setPlantImages} />
              </div>

              {/* Section 2: Symptoms & Onset */}
              <div className="p-6 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-sr-text">{t('scan.symptomsTitle')}</h3>
                  <p className="text-xs text-sr-muted mt-0.5">{t('scan.symptomsHint')}</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {SYMPTOM_CHECKLIST_ITEMS.map((item) => {
                    const checked = selectedSymptoms.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                          checked
                            ? 'bg-sr-accent-soft border-sr-accent text-sr-accent-ink font-semibold'
                            : 'bg-sr-surface-alt border-sr-border text-sr-text hover:border-sr-border-strong'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSymptom(item.id)}
                          className="rounded border-sr-border accent-sr-accent"
                        />
                        <span>{item.labels[lang]}</span>
                      </label>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-sr-border">
                  <p className="text-xs font-semibold text-sr-text mb-2">{t('scan.durationTitle')}</p>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={durationValue}
                      onChange={(e) => setDurationValue(e.target.value)}
                      placeholder={t('scan.durationValuePlaceholder')}
                      className="w-28 px-3 py-2 text-xs rounded-lg border border-sr-border bg-sr-input text-sr-text"
                    />
                    <select
                      value={durationUnit}
                      onChange={(e) => setDurationUnit(e.target.value as 'days' | 'weeks' | 'months')}
                      className="px-3 py-2 text-xs rounded-lg border border-sr-border bg-sr-input text-sr-text"
                    >
                      <option value="days">{t('scan.durationDays')}</option>
                      <option value="weeks">{t('scan.durationWeeks')}</option>
                      <option value="months">{t('scan.durationMonths')}</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 3: Optional Soil Details */}
              <div className="p-6 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-sr-text">{t('scan.soilTitle')}</h3>
                  <p className="text-xs text-sr-muted mt-0.5">{t('scan.soilHint')}</p>
                </div>

                <input
                  ref={soilInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={(e) => handleSoilFile(e.target.files?.[0])}
                  className="hidden"
                />

                <div className="flex flex-wrap items-center gap-4">
                  {!soilPreviewUrl ? (
                    <button
                      type="button"
                      onClick={() => soilInputRef.current?.click()}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-sr-accent-ink bg-sr-accent-soft border border-sr-accent-border rounded-lg hover:opacity-90 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{t('scan.uploadSoilPhoto')}</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-3 p-2 rounded-lg border border-sr-border bg-sr-surface-alt">
                      <img src={soilPreviewUrl} alt="Soil preview" className="w-14 h-14 rounded object-cover" />
                      <div className="text-xs">
                        <p className="font-medium text-sr-text truncate max-w-[180px]">{soilFilename}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setSoilPreviewUrl('');
                            setSoilFilename('');
                          }}
                          className="text-sr-danger mt-1 cursor-pointer"
                        >
                          {t('scan.remove')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-medium text-sr-muted mb-1">
                      {t('scan.soilMoistureLabel')}
                    </label>
                    <select
                      value={soilMoisture}
                      onChange={(e) => setSoilMoisture(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs rounded-lg border border-sr-border bg-sr-input text-sr-text"
                    >
                      <option value="">{t('scan.soilUnknown')}</option>
                      <option value="dry">{t('scan.moistureDry')}</option>
                      <option value="moist">{t('scan.moistureMoist')}</option>
                      <option value="waterlogged">{t('scan.moistureWaterlogged')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-sr-muted mb-1">
                      {t('scan.soilTypeLabel')}
                    </label>
                    <select
                      value={soilType}
                      onChange={(e) => setSoilType(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs rounded-lg border border-sr-border bg-sr-input text-sr-text"
                    >
                      <option value="">{t('scan.soilUnknown')}</option>
                      <option value="loam">{t('scan.typeLoam')}</option>
                      <option value="clay">{t('scan.typeClay')}</option>
                      <option value="sandy">{t('scan.typeSandy')}</option>
                      <option value="black">{t('scan.typeBlack')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-sr-muted mb-1">
                      {t('scan.soilFertilityLabel')}
                    </label>
                    <select
                      value={soilFertility}
                      onChange={(e) => setSoilFertility(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs rounded-lg border border-sr-border bg-sr-input text-sr-text"
                    >
                      <option value="">{t('scan.soilUnknown')}</option>
                      <option value="low">{t('scan.fertLow')}</option>
                      <option value="medium">{t('scan.fertMedium')}</option>
                      <option value="high">{t('scan.fertHigh')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-sr-muted mb-1">
                      {t('scan.soilPhLabel')}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="3"
                      max="10"
                      value={soilPh}
                      onChange={(e) => setSoilPh(e.target.value)}
                      placeholder="e.g., 6.5"
                      className="w-full px-2.5 py-2 text-xs rounded-lg border border-sr-border bg-sr-input text-sr-text"
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: Location & Submit */}
              <div className="p-6 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-4">
                <h3 className="text-sm font-bold text-sr-text">{t('scan.locationTitle')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        disabled={locationSkipped}
                        value={regionLabel}
                        onChange={(e) => {
                          setLocationSkipped(false);
                          setRegionLabel(e.target.value);
                        }}
                        placeholder={t('scan.locationPlaceholder')}
                        className="flex-1 px-3 py-2 text-xs rounded-lg border border-sr-border bg-sr-input text-sr-text disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={requestBrowserGps}
                        title={t('scan.useGps')}
                        className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-sr-border bg-sr-surface-alt hover:bg-sr-accent-soft text-sr-accent-ink text-xs font-medium transition-colors cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>GPS</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLocationSkipped((v) => !v);
                          setGpsCoords(null);
                          setGpsStatus('');
                        }}
                        className={`px-2.5 py-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                          locationSkipped
                            ? 'bg-sr-accent text-sr-accent-text border-sr-accent'
                            : 'bg-sr-surface border-sr-border text-sr-muted hover:text-sr-text'
                        }`}
                      >
                        {t('scan.skipLocation')}
                      </button>
                    </div>
                    {gpsStatus && <p className="text-[11px] text-sr-accent-ink">{gpsStatus}</p>}
                  </div>

                  <div>
                    <select
                      value={plantId}
                      onChange={(e) => setPlantId(e.target.value)}
                      aria-label={t('scan.plantRecordLabel')}
                      disabled={!authUser}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-sr-border bg-sr-input text-sr-text disabled:opacity-50"
                    >
                      <option value="">{t('scan.newStandalone')}</option>
                      {plants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.plant_code} · {translateCrop(p.crop, lang)} ({p.field_label})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {!authUser && (
                  <div className="p-3 rounded-lg border border-sr-border bg-sr-surface-alt flex flex-wrap items-center justify-between gap-2 text-xs text-sr-muted">
                    <span>{t('scan.signInSaveNote')}</span>
                    <button
                      type="button"
                      onClick={onRequireAuth}
                      className="font-semibold text-sr-accent-ink hover:underline cursor-pointer"
                    >
                      {t('auth.signInButton')}
                    </button>
                  </div>
                )}

                {errorMsg && (
                  <div className="p-3.5 rounded-lg border border-sr-danger-border bg-sr-danger-bg text-xs text-sr-danger flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={runAnalysis}
                  disabled={plantImages.length === 0 || analyzing}
                  className="w-full py-3.5 px-5 text-sm font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {analyzing ? t('scan.analyzingBtn') : t('scan.analyzeBtn')}
                </button>
              </div>
            </div>

            {/* Strict Unpopulated Diagnosis Panel Before Analysis */}
            <aside className="lg:col-span-4 p-6 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-4 lg:sticky lg:top-24">
              <div>
                <h3 className="text-sm font-bold text-sr-text">{t('scan.emptyReportTitle')}</h3>
                <p className="mt-1 text-xs text-sr-muted leading-relaxed">{t('scan.emptyReportDesc')}</p>
              </div>

              <dl className="divide-y divide-sr-border text-xs">
                {emptyFields.map((item) => (
                  <div key={item.label} className="py-2.5 flex items-center justify-between gap-3">
                    <dt className="text-sr-muted">{item.label}</dt>
                    <dd className="font-mono text-sr-muted">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </aside>
          </div>
        )}
      </div>
    </section>
  );
}
