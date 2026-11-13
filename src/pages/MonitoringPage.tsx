import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CloudRain,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Lock,
  Plus,
  QrCode,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { PlantImageUploader, type UploadedPlantPhoto } from '../components/PlantImageUploader';
import { PlotlyChart } from '../components/PlotlyChart';
import { SeverityIndicator, VerificationIndicator } from '../components/StatusText';
import { getLocalizedGuidance, translateCrop, translateDisease, translateRisk } from '../i18n/domainTranslations';
import { useTheme } from '../theme';
import type {
  AuthUser,
  DiseaseLibraryEntry,
  LanguageCode,
  PageId,
  PlantRecord,
  PredictionRecord,
  ProgressionEntry,
  SavedWeatherRecord,
  TreatmentRecord,
} from '../types';

interface MonitoringPageProps {
  authUser: AuthUser | null;
  refreshSignal: number;
  preferredPlantId?: number | null;
  onRequireAuth: () => void;
  onScrollTo: (sectionId: PageId) => void;
  onOpenResult: (predictionId: number) => void;
  onOpenPassport: (passportCode: string) => void;
}

interface PlantProgressionPayload {
  plant: PlantRecord;
  scans: PredictionRecord[];
  overallTrend: 'Improving' | 'Spreading' | 'Relatively Unchanged' | 'Insufficient Data';
  netChangePct: number;
  guidance: DiseaseLibraryEntry | null;
  latestWeather: SavedWeatherRecord | null;
  treatments: TreatmentRecord[];
  timeline: ProgressionEntry[];
}

export function MonitoringPage({
  authUser,
  refreshSignal,
  preferredPlantId,
  onRequireAuth,
  onScrollTo,
  onOpenResult,
  onOpenPassport,
}: MonitoringPageProps) {
  const { t, i18n } = useTranslation();
  const [theme] = useTheme();
  const lang = (['en', 'hi', 'kn'].includes(i18n.language) ? i18n.language : 'en') as LanguageCode;

  const [stats, setStats] = useState({
    totalScreenings: 0,
    healthyPredictions: 0,
    diseaseDetections: 0,
    casesRequiringReview: 0,
  });
  const [recentPredictions, setRecentPredictions] = useState<PredictionRecord[]>([]);
  const [plants, setPlants] = useState<PlantRecord[]>([]);
  const [selectedPlantId, setSelectedPlantId] = useState<number | null>(null);
  const [progression, setProgression] = useState<PlantProgressionPayload | null>(null);

  // Create new plant
  const [newCrop, setNewCrop] = useState('Tomato');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newRegion, setNewRegion] = useState('');
  const [creatingPlant, setCreatingPlant] = useState(false);

  // Follow-up uploader reusing shared component
  const [followUpPhotos, setFollowUpPhotos] = useState<UploadedPlantPhoto[]>([]);
  const [uploadingFollowUp, setUploadingFollowUp] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  // Treatment recording form
  const [medicineName, setMedicineName] = useState('');
  const [activeIngredient, setActiveIngredient] = useState('');
  const [dosageApplied, setDosageApplied] = useState('');
  const [applicationDate, setApplicationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [daysUsed, setDaysUsed] = useState('1');
  const [treatmentObs, setTreatmentObs] = useState('');
  const [treatmentNotes, setTreatmentNotes] = useState('');
  const [savingTreatment, setSavingTreatment] = useState(false);

  // Day-by-day timeline add/edit
  const [newDayNum, setNewDayNum] = useState('');
  const [newDayStatus, setNewDayStatus] = useState<'Planned' | 'Ongoing' | 'Completed' | 'Paused'>('Ongoing');
  const [newDaySymptoms, setNewDaySymptoms] = useState('');
  const [newDayActual, setNewDayActual] = useState('');
  const [savingDay, setSavingDay] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);
  const [editActualOutcome, setEditActualOutcome] = useState('');
  const [editStatus, setEditStatus] = useState<'Planned' | 'Ongoing' | 'Completed' | 'Paused'>('Ongoing');

  // AI-Projected Recovery Illustration state
  const [recoveryInfo, setRecoveryInfo] = useState<{
    available: boolean;
    uncertain: boolean;
    diagnosedContext?: string;
    reason: string;
  } | null>(null);
  const [checkingRecovery, setCheckingRecovery] = useState(false);

  function authHeaders(extra?: Record<string, string>) {
    const token = localStorage.getItem('agriguard_token') || '';
    return {
      ...(extra || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async function loadDashboardAndPlants(preferId?: number | null) {
    if (!authUser) {
      setPlants([]);
      setRecentPredictions([]);
      setProgression(null);
      setSelectedPlantId(null);
      return;
    }
    try {
      const [dashResp, plantsResp, predsResp] = await Promise.all([
        fetch('/api/dashboard', { credentials: 'include', headers: authHeaders() }),
        fetch('/api/plants', { credentials: 'include', headers: authHeaders() }),
        fetch('/api/predictions', { credentials: 'include', headers: authHeaders() }),
      ]);
      if (dashResp.ok) {
        const d = await dashResp.json();
        setStats(
          d.stats || { totalScreenings: 0, healthyPredictions: 0, diseaseDetections: 0, casesRequiringReview: 0 }
        );
      }
      if (predsResp.ok) {
        const p = await predsResp.json();
        setRecentPredictions(p.predictions || []);
      }
      if (plantsResp.ok) {
        const pl = await plantsResp.json();
        const list: PlantRecord[] = pl.plants || [];
        setPlants(list);
        if (preferId && list.some((item) => item.id === preferId)) {
          setSelectedPlantId(preferId);
        } else if (list.length > 0 && (!selectedPlantId || !list.some((item) => item.id === selectedPlantId))) {
          setSelectedPlantId(list[0].id);
        } else if (list.length === 0) {
          setSelectedPlantId(null);
          setProgression(null);
        }
      }
    } catch {
      // transient network failure handled gracefully
    }
  }

  async function loadProgression(id: number) {
    if (!authUser) return;
    setRecoveryInfo(null);
    const resp = await fetch(`/api/plants/${id}/progression`, {
      credentials: 'include',
      headers: authHeaders(),
    });
    if (resp.ok) {
      setProgression(await resp.json());
    }
  }

  useEffect(() => {
    loadDashboardAndPlants(preferredPlantId);
  }, [authUser, refreshSignal, preferredPlantId]);

  useEffect(() => {
    if (selectedPlantId && authUser) {
      loadProgression(selectedPlantId);
    } else {
      setProgression(null);
    }
  }, [selectedPlantId, authUser, refreshSignal]);

  async function handleCreatePlant(e: React.FormEvent) {
    e.preventDefault();
    if (!newFieldLabel.trim() || !authUser) return;
    setCreatingPlant(true);
    setErrorMsg('');
    try {
      const resp = await fetch('/api/plants', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          crop: newCrop,
          fieldLabel: newFieldLabel,
          regionLabel: newRegion || authUser.region || '',
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setErrorMsg(json.error || 'Could not create plant record.');
        return;
      }
      setNewFieldLabel('');
      setNewRegion('');
      await loadDashboardAndPlants(json.plant.id);
    } finally {
      setCreatingPlant(false);
    }
  }

  async function handleAnalyzeFollowUp() {
    if (!selectedPlantId || followUpPhotos.length === 0 || !progression) return;
    setUploadingFollowUp(true);
    setErrorMsg('');
    setStatusMsg('');
    try {
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          images: followUpPhotos.map((img) => ({
            imageBase64: img.dataUrl,
            filename: img.filename,
            role: img.role,
          })),
          cropHint: progression.plant.crop,
          plantId: selectedPlantId,
          regionLabel: progression.plant.region_label,
          notes: `Follow-up scan for ${progression.plant.plant_code}`,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setErrorMsg(json.error || 'Follow-up image could not be analyzed.');
        return;
      }
      setFollowUpPhotos([]);
      setStatusMsg(t('monitoring.followUpSaved'));
      await loadDashboardAndPlants(selectedPlantId);
      await loadProgression(selectedPlantId);
    } finally {
      setUploadingFollowUp(false);
    }
  }

  async function handleSaveTreatment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPlantId || !medicineName.trim()) return;
    setSavingTreatment(true);
    setErrorMsg('');
    setStatusMsg('');
    const scans = progression?.scans || [];
    const latestId = scans.length > 0 ? scans[scans.length - 1].id : null;
    try {
      const resp = await fetch(`/api/plants/${selectedPlantId}/treatments`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          predictionId: latestId,
          medicineName,
          activeIngredient,
          dosageApplied,
          applicationDate,
          daysUsed: Number(daysUsed) || 1,
          observations: treatmentObs,
          notes: treatmentNotes,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setErrorMsg(json.error || 'Could not save treatment record.');
        return;
      }
      setMedicineName('');
      setActiveIngredient('');
      setDosageApplied('');
      setTreatmentObs('');
      setTreatmentNotes('');
      setStatusMsg(t('monitoring.treatmentSaved'));
      await loadProgression(selectedPlantId);
    } finally {
      setSavingTreatment(false);
    }
  }

  async function handleAddDayEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPlantId) return;
    setSavingDay(true);
    setErrorMsg('');
    try {
      const nextDay =
        Number(newDayNum) || ((progression?.timeline?.length || 0) > 0 ? Math.max(...progression!.timeline.map((t) => t.day_number)) + 1 : 1);
      const resp = await fetch(`/api/plants/${selectedPlantId}/progression-entries`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          dayNumber: nextDay,
          treatmentStatus: newDayStatus,
          observedSymptoms: newDaySymptoms,
          actualOutcome: newDayActual,
          expectedOutcome: 'Monitor leaf area stabilization and halt of new chlorotic halos.',
        }),
      });
      if (resp.ok) {
        setNewDayNum('');
        setNewDaySymptoms('');
        setNewDayActual('');
        await loadProgression(selectedPlantId);
      }
    } finally {
      setSavingDay(false);
    }
  }

  async function handleUpdateDayEntry(entryId: number) {
    if (!selectedPlantId) return;
    const resp = await fetch(`/api/plants/${selectedPlantId}/progression-entries/${entryId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        treatmentStatus: editStatus,
        actualOutcome: editActualOutcome,
      }),
    });
    if (resp.ok) {
      setEditingEntryId(null);
      await loadProgression(selectedPlantId);
    }
  }

  async function handleCheckRecoveryProjection() {
    if (!selectedPlantId) return;
    setCheckingRecovery(true);
    try {
      const resp = await fetch(`/api/plants/${selectedPlantId}/recovery-projection`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
      });
      if (resp.ok) {
        setRecoveryInfo(await resp.json());
      }
    } finally {
      setCheckingRecovery(false);
    }
  }

  function exportUserCsv() {
    if (recentPredictions.length === 0) return;
    const headers = ['ID', 'Date', 'Crop', 'Disease', 'Confidence', 'AffectedArea%', 'Severity', 'Status', 'Region', 'Passport'];
    const rows = recentPredictions.map((r) => [
      r.id,
      r.created_at,
      r.verified_crop || r.crop,
      r.verified_disease || r.predicted_disease,
      r.confidence,
      r.affected_area_pct,
      r.severity,
      r.verification_status,
      `"${(r.region_label || '').replace(/"/g, '""')}"`,
      r.passport_code || '',
    ]);
    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sasyaraksha_plant_history_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const scans = progression?.scans || [];
  const prevScan = scans.length >= 2 ? scans[scans.length - 2] : null;
  const latestScan = scans.length >= 1 ? scans[scans.length - 1] : null;
  const latestEffectiveDisease = latestScan ? latestScan.verified_disease || latestScan.predicted_disease : '';
  const latestUncertain = latestScan ? latestScan.uncertain === 1 : false;
  const latestGuidance = progression?.guidance || null;
  const localizedGuidance =
    latestScan && latestEffectiveDisease
      ? getLocalizedGuidance(
          latestGuidance,
          latestScan.verified_crop || latestScan.crop,
          latestEffectiveDisease,
          latestScan.condition_category || 'fungal',
          lang
        )
      : null;

  const trendAccent = theme === 'light' ? '#285C3A' : theme === 'dark' ? '#FB923C' : '#34D399';

  return (
    <section
      id="plant-monitoring"
      className="bg-sr-canvas text-sr-text py-20 sm:py-24 border-b border-sr-border scroll-mt-16 transition-colors"
    >
      <div className="max-w-[1160px] mx-auto px-5 sm:px-8 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-[0.16em] text-sr-accent-ink">
              02 · {t('nav.monitoring')}
            </p>
            <h2 className="font-editorial mt-2 text-[clamp(1.9rem,3.4vw,2.75rem)] font-semibold leading-[1.1] text-sr-text">
              {t('monitoring.title')}
            </h2>
            <p className="mt-2 text-sm text-sr-muted">{t('monitoring.subtitle')}</p>
          </div>

          {authUser && recentPredictions.length > 0 && (
            <button
              type="button"
              onClick={exportUserCsv}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-sr-text bg-sr-surface-alt border border-sr-border rounded-lg hover:bg-sr-accent-soft transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t('history.exportCsv')}</span>
            </button>
          )}
        </div>

        {/* Unauthenticated Gate */}
        {!authUser ? (
          <div className="p-10 rounded-2xl border border-sr-border bg-sr-surface-alt sr-surface-glass text-center space-y-4">
            <div className="w-11 h-11 rounded-xl bg-sr-surface border border-sr-border text-sr-accent-ink flex items-center justify-center mx-auto">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-sr-text">{t('monitoring.authGateTitle')}</h3>
            <p className="text-xs text-sr-muted max-w-md mx-auto leading-relaxed">
              {t('monitoring.authGateDesc')}
            </p>
            <button
              type="button"
              onClick={onRequireAuth}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover transition-colors cursor-pointer"
            >
              <span>{t('auth.signInButton')}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Authenticated User's Isolated Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: t('dashboard.totalScreenings'), val: stats.totalScreenings },
                { label: t('dashboard.healthyPredictions'), val: stats.healthyPredictions },
                { label: t('dashboard.diseaseDetections'), val: stats.diseaseDetections },
                { label: t('dashboard.pendingReview'), val: stats.casesRequiringReview },
              ].map((kpi) => (
                <div key={kpi.label} className="p-4 rounded-xl border border-sr-border bg-sr-surface-alt sr-surface-glass">
                  <p className="text-xs text-sr-muted">{kpi.label}</p>
                  <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-sr-text">{kpi.val}</p>
                </div>
              ))}
            </div>

            {plants.length === 0 ? (
              <div className="p-10 rounded-2xl border border-sr-border bg-sr-surface-alt sr-surface-glass text-center space-y-4">
                <h3 className="text-base font-bold text-sr-text">{t('monitoring.noPlantsTitle')}</h3>
                <p className="text-xs text-sr-muted max-w-md mx-auto">{t('monitoring.noPlantsDesc')}</p>
                <button
                  type="button"
                  onClick={() => onScrollTo('scan-plant')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover transition-colors cursor-pointer"
                >
                  <span>{t('nav.detect')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Sidebar: Plant Selector + Create New Plant */}
                <div className="lg:col-span-4 space-y-5">
                  <div className="p-5 rounded-xl border border-sr-border bg-sr-surface-alt sr-surface-glass space-y-3">
                    <h3 className="text-sm font-semibold text-sr-text">{t('monitoring.trackedPlants')}</h3>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {plants.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedPlantId(p.id)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                            selectedPlantId === p.id
                              ? 'border-sr-accent bg-sr-surface shadow-xs'
                              : 'border-sr-border bg-sr-surface/70 hover:bg-sr-surface'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono font-semibold text-sr-text">{p.plant_code}</span>
                            <span className="font-mono tabular-nums text-sr-muted">{p.scan_count} scans</span>
                          </div>
                          <p className="mt-1 text-xs font-medium text-sr-text truncate">
                            {translateCrop(p.crop, lang)} — {p.field_label}
                          </p>
                          {p.latest_affected_pct !== null && (
                            <p className="mt-0.5 text-[11px] text-sr-muted font-mono tabular-nums">
                              {p.latest_affected_pct}% ({p.latest_severity})
                              {p.latest_disease ? ` · ${translateDisease(p.latest_disease, lang)}` : ''}
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <form onSubmit={handleCreatePlant} className="p-5 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-3">
                    <h3 className="text-sm font-semibold text-sr-text">{t('monitoring.createPlant')}</h3>
                    <div>
                      <label className="block text-xs text-sr-muted mb-1">{t('common.crop')}</label>
                      <select
                        value={newCrop}
                        onChange={(e) => setNewCrop(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-sr-border bg-sr-input text-sr-text"
                      >
                        {['Tomato', 'Potato', 'Maize', 'Rice', 'Apple', 'Grape', 'Pepper'].map((c) => (
                          <option key={c} value={c}>
                            {translateCrop(c, lang)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-sr-muted mb-1">{t('monitoring.fieldLabel')}</label>
                      <input
                        type="text"
                        required
                        value={newFieldLabel}
                        onChange={(e) => setNewFieldLabel(e.target.value)}
                        placeholder="e.g., East Plot · Row 2 Plant 5"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-sr-border bg-sr-input text-sr-text"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-sr-muted mb-1">{t('common.location')}</label>
                      <input
                        type="text"
                        value={newRegion}
                        onChange={(e) => setNewRegion(e.target.value)}
                        placeholder="e.g., Mandya / Nashik"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-sr-border bg-sr-input text-sr-text"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={creatingPlant}
                      className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-4 text-xs font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{creatingPlant ? t('common.loading') : t('monitoring.createBtn')}</span>
                    </button>
                  </form>
                </div>

                {/* Right Detail Workspace */}
                <div className="lg:col-span-8 space-y-5">
                  {progression && (
                    <>
                      {/* Active Plant Summary & Shared Follow-Up Uploader */}
                      <div className="p-6 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                            <p className="text-xs font-mono text-sr-muted">{progression.plant.plant_code}</p>
                            <h3 className="text-lg font-bold text-sr-text">
                              {translateCrop(progression.plant.crop, lang)} — {progression.plant.field_label}
                            </h3>
                            {latestScan && (
                              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-sr-muted">
                                <span>
                                  {translateDisease(latestEffectiveDisease, lang)} (
                                  <strong className="font-mono text-sr-text">{latestScan.confidence}%</strong>)
                                </span>
                                <VerificationIndicator status={latestScan.verification_status} />
                              </div>
                            )}
                          </div>

                          <div className="px-3.5 py-2 rounded-lg border border-sr-border bg-sr-surface-alt flex items-center gap-2 text-xs font-semibold shrink-0">
                            {progression.overallTrend === 'Improving' && (
                              <>
                                <ArrowDownRight className="w-4 h-4 text-sr-ok" />
                                <span className="text-sr-ok">Improving ({progression.netChangePct}%)</span>
                              </>
                            )}
                            {progression.overallTrend === 'Spreading' && (
                              <>
                                <ArrowUpRight className="w-4 h-4 text-sr-danger" />
                                <span className="text-sr-danger">Spreading (+{progression.netChangePct}%)</span>
                              </>
                            )}
                            {progression.overallTrend === 'Relatively Unchanged' && (
                              <>
                                <ArrowRight className="w-4 h-4 text-sr-warn" />
                                <span className="text-sr-warn">
                                  Unchanged ({progression.netChangePct > 0 ? '+' : ''}
                                  {progression.netChangePct}%)
                                </span>
                              </>
                            )}
                            {progression.overallTrend === 'Insufficient Data' && (
                              <span className="text-sr-muted">{t('monitoring.needMoreScans')}</span>
                            )}
                          </div>
                        </div>

                        {/* Reused Shared PlantImageUploader for Follow-Up Images */}
                        <div className="pt-4 border-t border-sr-border space-y-3">
                          <p className="text-xs font-semibold text-sr-text">{t('monitoring.uploadFollowUp')}</p>
                          <PlantImageUploader images={followUpPhotos} onChange={setFollowUpPhotos} compact />
                          {followUpPhotos.length > 0 && (
                            <button
                              type="button"
                              onClick={handleAnalyzeFollowUp}
                              disabled={uploadingFollowUp}
                              className="w-full py-2.5 px-4 text-xs font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover disabled:opacity-50 transition-colors cursor-pointer"
                            >
                              {uploadingFollowUp ? t('common.loading') : t('monitoring.analyzeFollowUp')}
                            </button>
                          )}
                        </div>

                        {errorMsg && <p className="text-xs text-sr-danger">{errorMsg}</p>}
                        {statusMsg && <p className="text-xs font-medium text-sr-ok">{statusMsg}</p>}
                      </div>

                      {/* Follow-Up Image Comparison & Spread Chart */}
                      {scans.length > 0 && (
                        <div className="p-5 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-4">
                          <h3 className="text-sm font-semibold text-sr-text">{t('monitoring.spreadTrendTitle')}</h3>
                          <PlotlyChart
                            height={220}
                            data={[
                              {
                                type: 'scatter',
                                mode: 'lines+markers',
                                x: scans.map((s, idx) => `#${idx + 1} (${s.created_at.slice(0, 10)})`),
                                y: scans.map((s) => s.affected_area_pct),
                                line: { color: trendAccent, width: 2.5 },
                                marker: { color: trendAccent, size: 8 },
                              },
                            ]}
                            layout={{
                              yaxis: { title: { text: '%' }, rangemode: 'tozero' },
                            }}
                          />

                          {prevScan && latestScan ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-sr-border">
                              {[
                                { title: t('monitoring.previousScan'), scan: prevScan },
                                { title: t('monitoring.latestScan'), scan: latestScan },
                              ].map((item) => (
                                <div key={item.scan.id} className="p-3.5 rounded-lg border border-sr-border bg-sr-surface-alt space-y-2">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-sr-text">{item.title}</span>
                                    <span className="font-mono tabular-nums text-sr-muted">
                                      {item.scan.created_at.slice(0, 16)}
                                    </span>
                                  </div>
                                  <div className="h-44 rounded-lg overflow-hidden border border-sr-border bg-sr-input">
                                    <img
                                      src={item.scan.processed_image_path}
                                      alt={`${item.title} lesion mask`}
                                      className="w-full h-full object-contain"
                                    />
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <SeverityIndicator severity={item.scan.severity} />
                                    <span className="font-mono font-semibold tabular-nums text-sr-text">
                                      {item.scan.affected_area_pct}% ·{' '}
                                      {translateDisease(item.scan.verified_disease || item.scan.predicted_disease, lang)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            latestScan && (
                              <p className="text-xs text-sr-muted">
                                {t('monitoring.baselineNote', { pct: latestScan.affected_area_pct })}
                              </p>
                            )
                          )}
                        </div>
                      )}

                      {/* Verified Treatment Plan + AI Recovery Projection Check */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="p-5 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-3">
                          <h3 className="text-sm font-bold text-sr-text">{t('monitoring.treatmentPlanTitle')}</h3>
                          {!latestScan || !localizedGuidance ? (
                            <p className="text-xs text-sr-muted">{t('monitoring.noScanForTreatment')}</p>
                          ) : latestUncertain ? (
                            <p className="text-xs text-sr-warn bg-sr-warn-bg border border-sr-warn-border p-3 rounded-lg">
                              {t('scan.noChemicalOnUncertain')}
                            </p>
                          ) : (
                            <div className="text-xs space-y-2 text-sr-text">
                              <p>{localizedGuidance.todo}</p>
                              {latestGuidance?.recommended_treatment && latestEffectiveDisease !== 'Healthy' && (
                                <div className="p-3 rounded-lg bg-sr-surface-alt border border-sr-border space-y-1">
                                  <p>
                                    <strong>{t('scan.treatmentMedicine')}:</strong>{' '}
                                    {latestGuidance.pesticide_or_medicine || '—'}
                                  </p>
                                  <p>
                                    <strong>{t('scan.treatmentIngredient')}:</strong>{' '}
                                    {latestGuidance.active_ingredient || '—'}
                                  </p>
                                  <p>
                                    <strong>{t('scan.treatmentDosage')}:</strong>{' '}
                                    {latestGuidance.dosage_instructions || '—'}
                                  </p>
                                  <p>
                                    <strong>{t('scan.treatmentDuration')}:</strong>{' '}
                                    {latestGuidance.treatment_duration || '—'} ({latestGuidance.application_frequency})
                                  </p>
                                </div>
                              )}
                              <a
                                href={localizedGuidance.referenceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-sr-accent-ink font-medium hover:underline"
                              >
                                <span>{localizedGuidance.referenceSource}</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          )}
                        </div>

                        <div className="p-5 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-3 flex flex-col justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-sr-accent-ink" />
                              <h3 className="text-sm font-bold text-sr-text">{t('monitoring.recoveryTitle')}</h3>
                            </div>
                            <p className="text-xs text-sr-muted leading-relaxed">{t('monitoring.recoveryDesc')}</p>
                            {recoveryInfo && (
                              <div className="p-3 rounded-lg bg-sr-surface-alt border border-sr-border text-xs space-y-1">
                                {recoveryInfo.diagnosedContext && (
                                  <p className="font-semibold text-sr-text">{recoveryInfo.diagnosedContext}</p>
                                )}
                                <p className={recoveryInfo.uncertain ? 'text-sr-warn' : 'text-sr-muted'}>
                                  {recoveryInfo.reason}
                                </p>
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={handleCheckRecoveryProjection}
                            disabled={checkingRecovery}
                            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-sr-accent-ink bg-sr-accent-soft border border-sr-accent-border rounded-lg hover:opacity-90 cursor-pointer"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span>{checkingRecovery ? t('common.loading') : t('monitoring.recoveryBtn')}</span>
                          </button>
                        </div>
                      </div>

                      {/* Record Medicine / Pesticide Applied Form */}
                      <form onSubmit={handleSaveTreatment} className="p-5 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-4">
                        <h3 className="text-sm font-bold text-sr-text">{t('monitoring.recordTreatmentTitle')}</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                          <div>
                            <label className="block text-sr-muted mb-1">{t('monitoring.medicineLabel')}</label>
                            <input
                              type="text"
                              required
                              value={medicineName}
                              onChange={(e) => setMedicineName(e.target.value)}
                              placeholder="e.g., Mancozeb 75% WP"
                              className="w-full px-3 py-2 rounded-lg border border-sr-border bg-sr-input text-sr-text"
                            />
                          </div>
                          <div>
                            <label className="block text-sr-muted mb-1">{t('scan.treatmentIngredient')}</label>
                            <input
                              type="text"
                              value={activeIngredient}
                              onChange={(e) => setActiveIngredient(e.target.value)}
                              placeholder="e.g., Mancozeb"
                              className="w-full px-3 py-2 rounded-lg border border-sr-border bg-sr-input text-sr-text"
                            />
                          </div>
                          <div>
                            <label className="block text-sr-muted mb-1">{t('monitoring.dosageAppliedLabel')}</label>
                            <input
                              type="text"
                              value={dosageApplied}
                              onChange={(e) => setDosageApplied(e.target.value)}
                              placeholder="e.g., 2 g / litre"
                              className="w-full px-3 py-2 rounded-lg border border-sr-border bg-sr-input text-sr-text"
                            />
                          </div>
                          <div>
                            <label className="block text-sr-muted mb-1">{t('monitoring.applicationDateLabel')}</label>
                            <input
                              type="date"
                              required
                              value={applicationDate}
                              onChange={(e) => setApplicationDate(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-sr-border bg-sr-input text-sr-text"
                            />
                          </div>
                          <div>
                            <label className="block text-sr-muted mb-1">{t('monitoring.daysUsedLabel')}</label>
                            <input
                              type="number"
                              min="1"
                              max="365"
                              value={daysUsed}
                              onChange={(e) => setDaysUsed(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-sr-border bg-sr-input text-sr-text"
                            />
                          </div>
                          <div>
                            <label className="block text-sr-muted mb-1">{t('monitoring.observationsLabel')}</label>
                            <input
                              type="text"
                              value={treatmentObs}
                              onChange={(e) => setTreatmentObs(e.target.value)}
                              placeholder="e.g., Sprayed on lower leaves at dusk"
                              className="w-full px-3 py-2 rounded-lg border border-sr-border bg-sr-input text-sr-text"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                          <input
                            type="text"
                            value={treatmentNotes}
                            onChange={(e) => setTreatmentNotes(e.target.value)}
                            placeholder={t('monitoring.treatmentNotesPlaceholder')}
                            className="flex-1 px-3 py-2 text-xs rounded-lg border border-sr-border bg-sr-input text-sr-text"
                          />
                          <button
                            type="submit"
                            disabled={savingTreatment}
                            className="px-5 py-2 text-xs font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover transition-colors whitespace-nowrap cursor-pointer"
                          >
                            {savingTreatment ? t('common.loading') : t('monitoring.saveTreatmentBtn')}
                          </button>
                        </div>

                        {progression.treatments.length > 0 && (
                          <div className="pt-3 border-t border-sr-border overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-sr-surface-alt text-sr-muted border-b border-sr-border">
                                <tr>
                                  <th className="py-2 px-3">{t('common.date')}</th>
                                  <th className="py-2 px-3">{t('monitoring.medicineLabel')}</th>
                                  <th className="py-2 px-3">{t('monitoring.dosageAppliedLabel')}</th>
                                  <th className="py-2 px-3">{t('monitoring.daysUsedLabel')}</th>
                                  <th className="py-2 px-3">{t('monitoring.observationsLabel')}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-sr-border">
                                {progression.treatments.map((tr) => (
                                  <tr key={tr.id}>
                                    <td className="py-2 px-3 font-mono tabular-nums">{tr.application_date}</td>
                                    <td className="py-2 px-3 font-medium">
                                      {tr.medicine_name}
                                      {tr.active_ingredient ? ` (${tr.active_ingredient})` : ''}
                                    </td>
                                    <td className="py-2 px-3">{tr.dosage_applied || '—'}</td>
                                    <td className="py-2 px-3 font-mono tabular-nums">{tr.days_used}</td>
                                    <td className="py-2 px-3 text-sr-muted">{tr.observations || tr.notes || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </form>

                      {/* Day-by-Day Progress Tracker */}
                      <div className="p-5 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-sr-text">{t('monitoring.dayTrackerTitle')}</h3>
                          {progression.latestWeather && (
                            <span className="inline-flex items-center gap-1.5 text-xs text-sr-accent-ink">
                              <CloudRain className="w-3.5 h-3.5" />
                              <span>
                                {progression.latestWeather.location_name}: {progression.latestWeather.temperature_c}°C ·{' '}
                                {progression.latestWeather.humidity_pct}% RH ·{' '}
                                {translateRisk(progression.latestWeather.risk_level, lang)}
                              </span>
                            </span>
                          )}
                        </div>

                        {progression.timeline.length === 0 ? (
                          <p className="text-xs text-sr-muted">{t('monitoring.noTimelineEntries')}</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-sr-surface-alt text-sr-muted border-b border-sr-border">
                                <tr>
                                  <th className="py-2 px-2.5">Day</th>
                                  <th className="py-2 px-2.5">{t('common.status')}</th>
                                  <th className="py-2 px-2.5">{t('monitoring.medicineLabel')}</th>
                                  <th className="py-2 px-2.5">{t('monitoring.observedSymptomsCol')}</th>
                                  <th className="py-2 px-2.5">{t('monitoring.expectedVsActualCol')}</th>
                                  <th className="py-2 px-2.5">{t('common.actions')}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-sr-border">
                                {progression.timeline.map((entry) => (
                                  <tr key={entry.id}>
                                    <td className="py-2.5 px-2.5 font-mono font-semibold tabular-nums">
                                      Day {entry.day_number}
                                      <div className="text-[11px] font-normal text-sr-muted">
                                        {entry.application_date}
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-2.5 font-medium">
                                      {editingEntryId === entry.id ? (
                                        <select
                                          value={editStatus}
                                          onChange={(e) =>
                                            setEditStatus(
                                              e.target.value as 'Planned' | 'Ongoing' | 'Completed' | 'Paused'
                                            )
                                          }
                                          className="px-2 py-1 text-xs rounded border border-sr-border bg-sr-input text-sr-text"
                                        >
                                          <option value="Planned">Planned</option>
                                          <option value="Ongoing">Ongoing</option>
                                          <option value="Completed">Completed</option>
                                          <option value="Paused">Paused</option>
                                        </select>
                                      ) : (
                                        entry.treatment_status
                                      )}
                                    </td>
                                    <td className="py-2.5 px-2.5">{entry.medicine_applied || '—'}</td>
                                    <td className="py-2.5 px-2.5 text-sr-muted">
                                      {entry.observed_symptoms || entry.disease_progression}
                                    </td>
                                    <td className="py-2.5 px-2.5 space-y-1">
                                      <p className="text-sr-muted">
                                        <strong>Expected:</strong> {entry.expected_outcome || '—'}
                                      </p>
                                      {editingEntryId === entry.id ? (
                                        <input
                                          type="text"
                                          value={editActualOutcome}
                                          onChange={(e) => setEditActualOutcome(e.target.value)}
                                          className="w-full px-2 py-1 text-xs rounded border border-sr-border bg-sr-input text-sr-text"
                                        />
                                      ) : (
                                        <p className="text-sr-text">
                                          <strong>Actual:</strong> {entry.actual_outcome || '—'}
                                        </p>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-2.5 whitespace-nowrap">
                                      {editingEntryId === entry.id ? (
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateDayEntry(entry.id)}
                                          className="px-2.5 py-1 text-xs font-semibold text-sr-accent-text bg-sr-accent rounded cursor-pointer"
                                        >
                                          {t('common.save')}
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingEntryId(entry.id);
                                            setEditStatus(entry.treatment_status);
                                            setEditActualOutcome(entry.actual_outcome || '');
                                          }}
                                          className="text-sr-accent-ink font-semibold hover:underline cursor-pointer"
                                        >
                                          Update
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        <form onSubmit={handleAddDayEntry} className="pt-3 border-t border-sr-border grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs">
                          <input
                            type="number"
                            min="1"
                            max="365"
                            value={newDayNum}
                            onChange={(e) => setNewDayNum(e.target.value)}
                            placeholder="Day #"
                            className="sm:col-span-2 px-2.5 py-2 rounded-lg border border-sr-border bg-sr-input text-sr-text"
                          />
                          <select
                            value={newDayStatus}
                            onChange={(e) =>
                              setNewDayStatus(e.target.value as 'Planned' | 'Ongoing' | 'Completed' | 'Paused')
                            }
                            className="sm:col-span-2 px-2.5 py-2 rounded-lg border border-sr-border bg-sr-input text-sr-text"
                          >
                            <option value="Ongoing">Ongoing</option>
                            <option value="Planned">Planned</option>
                            <option value="Completed">Completed</option>
                            <option value="Paused">Paused</option>
                          </select>
                          <input
                            type="text"
                            value={newDaySymptoms}
                            onChange={(e) => setNewDaySymptoms(e.target.value)}
                            placeholder="Observed symptoms today..."
                            className="sm:col-span-3 px-2.5 py-2 rounded-lg border border-sr-border bg-sr-input text-sr-text"
                          />
                          <input
                            type="text"
                            required
                            value={newDayActual}
                            onChange={(e) => setNewDayActual(e.target.value)}
                            placeholder="Actual observed outcome..."
                            className="sm:col-span-3 px-2.5 py-2 rounded-lg border border-sr-border bg-sr-input text-sr-text"
                          />
                          <button
                            type="submit"
                            disabled={savingDay}
                            className="sm:col-span-2 px-3 py-2 font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover transition-colors cursor-pointer"
                          >
                            {savingDay ? '...' : t('monitoring.addDayBtn')}
                          </button>
                        </form>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Authenticated User's Complete Screening Records Table */}
            {recentPredictions.length > 0 && (
              <div className="rounded-xl border border-sr-border bg-sr-surface sr-surface-glass overflow-hidden">
                <div className="px-5 py-3.5 border-b border-sr-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-sr-accent-ink" />
                    <h3 className="text-sm font-bold text-sr-text">{t('monitoring.savedReportsTitle')}</h3>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-sr-muted">
                    {recentPredictions.length} records
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-sr-surface-alt text-sr-muted border-b border-sr-border">
                      <tr>
                        <th className="py-2.5 px-4">{t('common.date')}</th>
                        <th className="py-2.5 px-4">{t('common.crop')} &amp; {t('common.disease')}</th>
                        <th className="py-2.5 px-4 text-right">{t('common.confidence')}</th>
                        <th className="py-2.5 px-4">{t('common.severity')}</th>
                        <th className="py-2.5 px-4">{t('common.status')}</th>
                        <th className="py-2.5 px-4 text-right">{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sr-border">
                      {recentPredictions.slice(0, 12).map((row) => (
                        <tr key={row.id} className="hover:bg-sr-surface-alt/60 transition-colors">
                          <td className="py-2.5 px-4 font-mono tabular-nums text-sr-muted">
                            {row.created_at.slice(0, 16)}
                          </td>
                          <td className="py-2.5 px-4 font-medium text-sr-text">
                            {translateCrop(row.verified_crop || row.crop, lang)} —{' '}
                            {translateDisease(row.verified_disease || row.predicted_disease, lang)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums">{row.confidence}%</td>
                          <td className="py-2.5 px-4">
                            <SeverityIndicator severity={row.severity} />
                          </td>
                          <td className="py-2.5 px-4">
                            <VerificationIndicator status={row.verification_status} />
                          </td>
                          <td className="py-2.5 px-4 text-right whitespace-nowrap space-x-2">
                            <button
                              type="button"
                              onClick={() => onOpenResult(row.id)}
                              className="px-2.5 py-1 text-xs font-semibold text-sr-accent-ink bg-sr-accent-soft border border-sr-accent-border rounded hover:opacity-90 cursor-pointer"
                            >
                              {t('home.resultBtn')}
                            </button>
                            {row.passport_code && (
                              <button
                                type="button"
                                onClick={() => onOpenPassport(row.passport_code!)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-sr-text border border-sr-border rounded hover:bg-sr-surface-alt cursor-pointer"
                              >
                                <QrCode className="w-3 h-3" />
                                <span>{row.passport_code}</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
