import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ShieldCheck } from 'lucide-react';
import { translateCrop, translateDisease } from '../i18n/domainTranslations';
import type { LanguageCode, OutbreakCluster, OutbreakReport } from '../types';

interface OutbreakMapPageProps {
  refreshSignal?: number;
}

export function OutbreakMapPage({ refreshSignal = 0 }: OutbreakMapPageProps) {
  const { t, i18n } = useTranslation();
  const lang = (['en', 'hi', 'kn'].includes(i18n.language) ? i18n.language : 'en') as LanguageCode;

  const [cropFilter, setCropFilter] = useState('All');
  const [diseaseFilter, setDiseaseFilter] = useState('All');
  const [daysFilter, setDaysFilter] = useState('0');
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const [reports, setReports] = useState<OutbreakReport[]>([]);
  const [clusters, setClusters] = useState<OutbreakCluster[]>([]);
  const [loading, setLoading] = useState(true);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  async function loadOutbreaks() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        crop: cropFilter,
        disease: diseaseFilter,
        days: daysFilter,
        verifiedOnly: String(verifiedOnly),
      });
      const resp = await fetch(`/api/outbreaks?${params.toString()}`);
      const json = await resp.json();
      setReports(json.reports || []);
      setClusters(json.clusters || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOutbreaks();
  }, [cropFilter, diseaseFilter, daysFilter, verifiedOnly, refreshSignal]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapInstanceRef.current) return;

    const map = L.map(container).setView([20.5, 75.5], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = group;

    const invalidateTimer = window.setTimeout(() => map.invalidateSize(), 200);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          map.invalidateSize();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(container);

    return () => {
      window.clearTimeout(invalidateTimer);
      observer.disconnect();
      map.remove();
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    if (reports.length === 0) return;

    const bounds: L.LatLngExpression[] = [];

    for (const c of clusters) {
      if (c.count >= 2) {
        L.circle([c.lat, c.lng], {
          radius: 14000,
          color: '#B91C1C',
          weight: 1.5,
          fillColor: '#B91C1C',
          fillOpacity: 0.12,
        })
          .bindPopup(
            `<strong>Cluster: ${c.regionLabel}</strong><br/>${translateCrop(c.crop, lang)} — ${translateDisease(
              c.disease,
              lang
            )}<br/>Reports: ${c.count} (Verified: ${c.verifiedCount})`
          )
          .addTo(group);
      }
    }

    for (const r of reports) {
      bounds.push([r.approx_lat, r.approx_lng]);
      const color = r.severity === 'High' ? '#B91C1C' : r.severity === 'Medium' ? '#D97706' : '#285C3A';
      L.circleMarker([r.approx_lat, r.approx_lng], {
        radius: 8,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.75,
      })
        .bindPopup(
          `<strong>${translateCrop(r.crop, lang)} — ${translateDisease(r.disease, lang)}</strong><br/>` +
            `${r.region_label}<br/>` +
            `Severity: ${r.severity}<br/>` +
            `${r.verified ? 'Expert Verified' : 'Submitted Screening'}<br/>` +
            `${r.reported_at.slice(0, 10)}`
        )
        .addTo(group);
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 9);
    } else if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 11 });
    }
  }, [reports, clusters, lang]);

  return (
    <section
      id="outbreak-map"
      className="bg-sr-canvas-alt text-sr-text py-20 sm:py-24 border-b border-sr-border scroll-mt-16 transition-colors"
    >
      <div className="max-w-[1160px] mx-auto px-5 sm:px-8 space-y-6">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.16em] text-sr-accent-ink">
            03 · {t('nav.map')}
          </p>
          <h2 className="font-editorial mt-2 text-[clamp(1.9rem,3.4vw,2.75rem)] font-semibold leading-[1.1] text-sr-text">
            {t('mapPage.title')}
          </h2>
          <p className="mt-2 text-sm text-sr-muted">{t('mapPage.subtitle')}</p>
        </div>

        {/* Filters */}
        <div className="p-4 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass flex flex-wrap items-center gap-3">
          <select
            value={cropFilter}
            onChange={(e) => setCropFilter(e.target.value)}
            aria-label={t('common.crop')}
            className="px-3 py-2 text-xs rounded-lg border border-sr-border bg-sr-input text-sr-text"
          >
            <option value="All">{t('common.allCrops')}</option>
            {['Tomato', 'Potato', 'Maize', 'Rice', 'Apple', 'Grape', 'Pepper', 'Cotton', 'Wheat'].map((c) => (
              <option key={c} value={c}>
                {translateCrop(c, lang)}
              </option>
            ))}
          </select>

          <select
            value={diseaseFilter}
            onChange={(e) => setDiseaseFilter(e.target.value)}
            aria-label={t('common.disease')}
            className="px-3 py-2 text-xs rounded-lg border border-sr-border bg-sr-input text-sr-text"
          >
            <option value="All">{t('common.allDiseases')}</option>
            {[
              'Early Blight',
              'Late Blight',
              'Septoria Leaf Spot',
              'Yellow Leaf Curl Virus',
              'Northern Leaf Blight',
              'Common Rust',
              'Rice Blast',
              'Powdery Mildew',
            ].map((d) => (
              <option key={d} value={d}>
                {translateDisease(d, lang)}
              </option>
            ))}
          </select>

          <select
            value={daysFilter}
            onChange={(e) => setDaysFilter(e.target.value)}
            aria-label={t('common.date')}
            className="px-3 py-2 text-xs rounded-lg border border-sr-border bg-sr-input text-sr-text"
          >
            <option value="0">All Dates</option>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
          </select>

          <label className="inline-flex items-center gap-2 text-xs text-sr-text ml-1 cursor-pointer">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
              className="rounded border-sr-border accent-sr-accent"
            />
            <span>{t('mapPage.verifiedOnly')}</span>
          </label>

          <span className="ml-auto text-xs font-mono tabular-nums text-sr-muted">
            {loading
              ? t('common.loading')
              : `${reports.length} ${reports.length === 1 ? t('home.reportSingular') : t('home.reportPlural')}`}
          </span>
        </div>

        {/* Privacy Notice */}
        <div className="px-4 py-3 rounded-xl border border-sr-border bg-sr-surface sr-surface-glass flex items-center gap-2.5 text-xs text-sr-muted">
          <ShieldCheck className="w-4 h-4 text-sr-accent-ink shrink-0" />
          <span>{t('mapPage.privacyNote')}</span>
        </div>

        {/* Interactive Leaflet Map */}
        <div className="rounded-xl border border-sr-border bg-sr-surface overflow-hidden relative">
          <div ref={mapContainerRef} className="w-full h-[420px]" />
          {!loading && reports.length === 0 && (
            <div className="absolute inset-0 bg-sr-surface/90 backdrop-blur-xs flex items-center justify-center p-6 text-center z-[500]">
              <div>
                <p className="text-sm font-semibold text-sr-text">{t('home.emptyOutbreak')}</p>
              </div>
            </div>
          )}
        </div>

        {/* Cluster Frequency Table */}
        {clusters.length > 0 && (
          <div className="rounded-xl border border-sr-border bg-sr-surface sr-surface-glass overflow-hidden">
            <div className="px-5 py-3.5 border-b border-sr-border">
              <h3 className="text-sm font-semibold text-sr-text">{t('mapPage.clusterTable')}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-sr-surface-alt text-sr-muted border-b border-sr-border">
                  <tr>
                    <th className="py-2.5 px-4">{t('common.location')}</th>
                    <th className="py-2.5 px-4">{t('common.crop')}</th>
                    <th className="py-2.5 px-4">{t('common.disease')}</th>
                    <th className="py-2.5 px-4 text-right">Count</th>
                    <th className="py-2.5 px-4 text-right">Verified</th>
                    <th className="py-2.5 px-4">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sr-border">
                  {clusters.map((c, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 px-4 font-medium text-sr-text">{c.regionLabel}</td>
                      <td className="py-2.5 px-4">{translateCrop(c.crop, lang)}</td>
                      <td className="py-2.5 px-4">{translateDisease(c.disease, lang)}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold tabular-nums">{c.count}</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums">{c.verifiedCount}</td>
                      <td className="py-2.5 px-4">
                        {c.count >= 2 ? (
                          <span className="font-semibold text-sr-danger">Recurring Cluster</span>
                        ) : (
                          <span className="text-sr-muted">Single Report</span>
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
    </section>
  );
}
