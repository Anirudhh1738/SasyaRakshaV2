import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, Copy, Download, Lock, Share2, Unlock } from 'lucide-react';
import { SeverityIndicator, VerificationIndicator } from '../components/StatusText';
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
  DiseaseLibraryEntry,
  FieldPassportRecord,
  LanguageCode,
  PredictionRecord,
  SavedWeatherRecord,
  ScreeningImageRecord,
  SoilRecord,
} from '../types';
import { downloadFieldPassportPdf, generateQrDataUrl } from '../utils/passportPdf';

interface PassportPageProps {
  passportCode: string;
  shareToken?: string;
  onBack: () => void;
}

export function PassportPage({ passportCode, shareToken, onBack }: PassportPageProps) {
  const { t, i18n } = useTranslation();
  const lang = (['en', 'hi', 'kn'].includes(i18n.language) ? i18n.language : 'en') as LanguageCode;

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [passport, setPassport] = useState<FieldPassportRecord | null>(null);
  const [prediction, setPrediction] = useState<PredictionRecord | null>(null);
  const [guidance, setGuidance] = useState<DiseaseLibraryEntry | null>(null);
  const [weather, setWeather] = useState<SavedWeatherRecord | null>(null);
  const [screeningImages, setScreeningImages] = useState<ScreeningImageRecord[]>([]);
  const [soilRecord, setSoilRecord] = useState<SoilRecord | null>(null);
  const [history, setHistory] = useState<Array<{ id: number; affected_area_pct: number; severity: string; created_at: string }>>([]);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [togglingShare, setTogglingShare] = useState(false);

  const shareUrl = passport
    ? `${window.location.origin}/?passport=${passport.passport_code}&token=${passport.share_token}`
    : '';

  useEffect(() => {
    setLoading(true);
    setErrorMsg('');
    const qs = shareToken ? `?token=${encodeURIComponent(shareToken)}` : '';
    const token = localStorage.getItem('agriguard_token') || '';
    fetch(`/api/passports/${encodeURIComponent(passportCode)}${qs}`, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) {
          throw new Error(json.error || 'Could not load Field Passport.');
        }
        return json;
      })
      .then(async (d) => {
        setPassport(d.passport);
        setPrediction(d.prediction);
        setGuidance(d.guidance);
        setWeather(d.weather);
        setScreeningImages(d.screeningImages || []);
        setSoilRecord(d.soilRecord || null);
        setHistory(d.historicalComparison || []);
        const url = `${window.location.origin}/?passport=${d.passport.passport_code}&token=${d.passport.share_token}`;
        setQrDataUrl(await generateQrDataUrl(url));
      })
      .catch((e) => setErrorMsg(e instanceof Error ? e.message : 'Unable to load Field Passport'))
      .finally(() => setLoading(false));
  }, [passportCode, shareToken]);

  async function togglePublicShare() {
    if (!passport) return;
    setTogglingShare(true);
    const token = localStorage.getItem('agriguard_token') || '';
    try {
      const resp = await fetch(`/api/passports/${passport.passport_code}/share`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ enabled: !passport.is_public_share }),
      });
      if (resp.ok) {
        const json = await resp.json();
        setPassport(json.passport);
      }
    } finally {
      setTogglingShare(false);
    }
  }

  async function handleCopyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="p-8 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass text-sm text-sr-muted">
        {t('common.loading')}
      </div>
    );
  }

  if (errorMsg || !passport || !prediction) {
    return (
      <div className="p-8 rounded-xl border border-sr-danger-border bg-sr-danger-bg space-y-3">
        <h2 className="text-base font-semibold text-sr-danger">{t('nav.passport')}</h2>
        <p className="text-sm text-sr-danger">{errorMsg || 'Passport not found.'}</p>
        <button
          onClick={onBack}
          className="px-4 py-2 text-xs font-semibold bg-sr-surface text-sr-text border border-sr-border rounded-lg cursor-pointer"
        >
          {t('common.back')} — SasyaRaksha
        </button>
      </div>
    );
  }

  const effectiveCrop = prediction.verified_crop || prediction.crop;
  const effectiveDisease = prediction.verified_disease || prediction.predicted_disease;
  const locGuidance = getLocalizedGuidance(
    guidance,
    effectiveCrop,
    effectiveDisease,
    prediction.condition_category || 'fungal',
    lang
  );

  let parsedSymptoms: string[] = [];
  try {
    parsedSymptoms = prediction.symptoms_json ? JSON.parse(prediction.symptoms_json) : [];
  } catch {
    parsedSymptoms = [];
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-sr-muted hover:text-sr-accent-ink transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t('common.back')}</span>
        </button>

        <div className="flex flex-wrap items-center gap-2.5">
          {!shareToken && (
            <button
              onClick={togglePublicShare}
              disabled={togglingShare}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-sr-border bg-sr-surface text-sr-text hover:bg-sr-surface-alt transition-colors cursor-pointer"
            >
              {passport.is_public_share ? (
                <Unlock className="w-3.5 h-3.5 text-sr-accent-ink" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-sr-muted" />
              )}
              <span>{passport.is_public_share ? 'QR Sharing Enabled' : 'Private (Enable QR Sharing)'}</span>
            </button>
          )}
          <button
            onClick={() =>
              downloadFieldPassportPdf({
                passport,
                prediction,
                guidance,
                weather,
                shareUrl,
                language: lang,
              })
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t('scan.downloadPdf')}</span>
          </button>
        </div>
      </div>

      {/* Digital Field Passport Card */}
      <div className="card-3d p-6 sm:p-8 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5 pb-5 border-b border-sr-border">
          <div>
            <p className="text-xs font-mono text-sr-accent-ink font-semibold">
              SASYA RAKSHA FIELD PASSPORT · {passport.passport_code}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-sr-text">
              {translateCrop(effectiveCrop, lang)} — {translateDisease(effectiveDisease, lang)}
            </h1>
            <p className="mt-1 text-xs font-medium text-sr-accent-ink">
              {translateCategory(prediction.condition_category || 'fungal', lang)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-sr-muted">
              <span>{t('common.date')}: {prediction.created_at.slice(0, 16)}</span>
              <span>·</span>
              <span>{t('common.location')}: {prediction.region_label || 'Not provided'}</span>
              <span>·</span>
              <span className="font-mono tabular-nums">{t('common.confidence')}: {prediction.confidence}%</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <SeverityIndicator severity={prediction.severity} />
              <VerificationIndicator status={prediction.verification_status} />
            </div>
          </div>

          <div className="flex flex-col items-center p-3 rounded-xl border border-sr-border bg-sr-surface-alt shrink-0">
            {qrDataUrl && (
              <div className="p-1.5 rounded-lg bg-white">
                <img src={qrDataUrl} alt={`QR Code for ${passport.passport_code}`} className="w-28 h-28" />
              </div>
            )}
            <span className="mt-1.5 text-[11px] font-mono text-sr-muted">{passport.passport_code}</span>
          </div>
        </div>

        {/* QR Sharing Bar */}
        {!shareToken && (
          <div className="p-3.5 rounded-lg bg-sr-surface-alt border border-sr-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-sr-muted">
              <Share2 className="w-4 h-4 text-sr-accent-ink shrink-0" />
              <span>
                {passport.is_public_share
                  ? 'Anyone with this QR link can view this crop report (personal notes are hidden).'
                  : 'This passport is currently private. Click "Private (Enable QR Sharing)" above to share via QR link.'}
              </span>
            </div>
            {passport.is_public_share === 1 && (
              <button
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-sr-surface text-sr-text border border-sr-border rounded-lg hover:bg-sr-accent-soft transition-colors shrink-0 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-sr-accent-ink" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Link Copied' : 'Copy Share Link'}</span>
              </button>
            )}
          </div>
        )}

        {/* Primary Images */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-sr-muted mb-1.5">{t('scan.originalPhoto')}</p>
            <div className="h-56 rounded-lg border border-sr-border bg-sr-surface-alt overflow-hidden">
              <img src={prediction.original_image_path} alt="Original plant" className="w-full h-full object-contain" />
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-sr-muted mb-1.5">
              {t('scan.highlightedPhoto')} ({prediction.affected_area_pct}% {t('common.area')})
            </p>
            <div className="h-56 rounded-lg border border-sr-border bg-sr-surface-alt overflow-hidden">
              <img src={prediction.processed_image_path} alt="Highlighted infected leaf regions" className="w-full h-full object-contain" />
            </div>
          </div>
        </div>

        {/* Multi-Image Thumbnails if >1 */}
        {screeningImages.length > 1 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-sr-text">
              {t('scan.secPerImage')} ({screeningImages.length})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {screeningImages.map((img) => (
                <div key={img.id} className="p-2 rounded-lg border border-sr-border bg-sr-surface-alt space-y-1 text-[11px]">
                  <img src={img.processed_path || img.original_path} alt={img.detected_disease} className="w-full h-24 object-contain bg-sr-input rounded" />
                  <p className="font-medium text-sr-text truncate">{IMAGE_ROLE_LABELS[img.image_role]?.[lang] || img.image_role}</p>
                  <p className="text-sr-muted truncate">{translateDisease(img.detected_disease, lang)} ({img.confidence}%)</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reported Symptoms & Duration */}
        {(parsedSymptoms.length > 0 || prediction.symptom_onset_value) && (
          <div className="p-4 rounded-lg border border-sr-border bg-sr-surface-alt space-y-1.5 text-xs">
            {parsedSymptoms.length > 0 && (
              <p className="text-sr-text">
                <strong>{t('scan.symptomsTitle')}: </strong>
                {parsedSymptoms
                  .map((id) => SYMPTOM_CHECKLIST_ITEMS.find((s) => s.id === id)?.labels[lang] || id)
                  .join(', ')}
              </p>
            )}
            {prediction.symptom_onset_value && (
              <p className="text-sr-muted">
                <strong>{t('scan.durationEstimatedNote')}: </strong>
                {prediction.symptom_onset_value} {prediction.symptom_onset_unit || 'days'}
              </p>
            )}
          </div>
        )}

        {/* Causes & Solutions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
          <div className="p-4 rounded-lg border border-sr-border bg-sr-surface-alt space-y-2">
            <h2 className="text-sm font-semibold text-sr-text">{t('scan.secWhatCaused')}</h2>
            <p className="text-xs leading-relaxed text-sr-muted">{locGuidance.summary}</p>
            <p className="text-xs leading-relaxed text-sr-muted">{locGuidance.causes}</p>
          </div>
          <div className="p-4 rounded-lg border border-sr-border bg-sr-surface-alt space-y-2">
            <h2 className="text-sm font-semibold text-sr-text">{t('scan.secWhatToDo')}</h2>
            <p className="text-xs leading-relaxed text-sr-text">{locGuidance.todo}</p>
            <p className="text-xs leading-relaxed text-sr-muted">{locGuidance.prevent}</p>
            <p className="text-[11px] text-sr-accent-ink">{locGuidance.referenceSource}</p>
          </div>
        </div>

        {/* Soil Observation Block */}
        {soilRecord && (
          <div className="p-4 rounded-lg border border-sr-border bg-sr-surface-alt space-y-2 text-xs">
            <h3 className="font-semibold text-sr-text">{t('scan.secSoil')}</h3>
            {soilRecord.observed_color && (
              <p className="text-sr-muted">
                {translateSoilObservation(soilRecord.observed_color, lang)} ·{' '}
                {translateSoilObservation(soilRecord.observed_moisture, lang)} ·{' '}
                {translateSoilObservation(soilRecord.observed_texture, lang)}
              </p>
            )}
            {(soilRecord.manual_moisture || soilRecord.manual_ph || soilRecord.manual_soil_type) && (
              <p className="text-sr-text">
                {[soilRecord.manual_soil_type, soilRecord.manual_moisture, soilRecord.manual_ph ? `pH ${soilRecord.manual_ph}` : '', soilRecord.manual_fertility]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>
        )}

        {weather && (
          <div className="p-4 rounded-lg border border-sr-border bg-sr-surface flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <span className="font-semibold text-sr-text">
                {t('scan.secWeather')} ({weather.location_name}):{' '}
              </span>
              <span className="text-sr-muted font-mono tabular-nums">
                {weather.temperature_c}°C · {weather.humidity_pct}% RH · {weather.rainfall_mm} mm
              </span>
            </div>
            <span className="font-semibold text-sr-accent-ink">{translateRisk(weather.risk_level, lang)}</span>
          </div>
        )}

        {/* Historical Comparison */}
        {history.length > 1 && (
          <div className="pt-4 border-t border-sr-border">
            <h2 className="text-sm font-semibold text-sr-text mb-2.5">{t('monitoring.title')}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-sr-surface-alt text-sr-muted border-b border-sr-border">
                  <tr>
                    <th className="py-2 px-3">ID</th>
                    <th className="py-2 px-3">{t('common.date')}</th>
                    <th className="py-2 px-3 text-right">{t('common.area')}</th>
                    <th className="py-2 px-3">{t('common.severity')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sr-border">
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="py-2 px-3 font-mono">#{h.id}</td>
                      <td className="py-2 px-3 font-mono tabular-nums">{h.created_at.slice(0, 16)}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums">{h.affected_area_pct}%</td>
                      <td className="py-2 px-3">{h.severity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
