import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Plus, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { IMAGE_ROLE_LABELS } from '../i18n/domainTranslations';
import type { IndividualViewSlot, LanguageCode, PlantImageRole } from '../types';

export interface UploadedPlantPhoto {
  id: string;
  dataUrl: string;
  filename: string;
  role: PlantImageRole;
  viewSlot?: IndividualViewSlot;
}

interface PlantImageUploaderProps {
  images: UploadedPlantPhoto[];
  onChange: (next: UploadedPlantPhoto[]) => void;
  compact?: boolean;
  maxImages?: number;
}

const VIEW_SLOTS: Array<{
  slot: IndividualViewSlot;
  titleKey: string;
  hintKey: string;
  defaultRole: PlantImageRole;
}> = [
  {
    slot: 'front',
    titleKey: 'scan.viewFront',
    hintKey: 'scan.viewFrontHint',
    defaultRole: 'multiple_leaves',
  },
  {
    slot: 'back',
    titleKey: 'scan.viewBack',
    hintKey: 'scan.viewBackHint',
    defaultRole: 'underside_leaf',
  },
  {
    slot: 'closeup',
    titleKey: 'scan.viewCloseup',
    hintKey: 'scan.viewCloseupHint',
    defaultRole: 'closeup_leaf',
  },
];

const ACCEPTED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export function PlantImageUploader({
  images,
  onChange,
  compact = false,
  maxImages = 8,
}: PlantImageUploaderProps) {
  const { t, i18n } = useTranslation();
  const lang = (['en', 'hi', 'kn'].includes(i18n.language) ? i18n.language : 'en') as LanguageCode;

  const [mode, setMode] = useState<'multiple' | 'views'>('multiple');
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState('');

  // Camera state with preview + retake before adding
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [capturedPreview, setCapturedPreview] = useState<string>('');
  const [cameraTargetSlot, setCameraTargetSlot] = useState<IndividualViewSlot | null>(null);

  const multiInputRef = useRef<HTMLInputElement | null>(null);
  const slotInputRefs = useRef<Record<IndividualViewSlot, HTMLInputElement | null>>({
    front: null,
    back: null,
    closeup: null,
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  function stopCameraStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    }
  }

  useEffect(() => {
    return () => stopCameraStream();
  }, []);

  function readImageFiles(fileList: FileList | null, targetSlot?: IndividualViewSlot) {
    if (!fileList || fileList.length === 0) return;
    setFileError('');

    const files = Array.from(fileList);
    if (targetSlot) {
      const file = files[0];
      if (!ACCEPTED_MIME.includes(file.type.toLowerCase())) {
        setFileError(t('scan.invalidFormatError'));
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setFileError(t('scan.maxSizeError'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const slotDef = VIEW_SLOTS.find((s) => s.slot === targetSlot)!;
          const filtered = images.filter((img) => img.viewSlot !== targetSlot);
          onChange([
            ...filtered,
            {
              id: `${Date.now()}_${targetSlot}`,
              dataUrl: reader.result,
              filename: file.name,
              role: slotDef.defaultRole,
              viewSlot: targetSlot,
            },
          ]);
        }
      };
      reader.readAsDataURL(file);
      return;
    }

    const remaining = Math.max(0, maxImages - images.length);
    const chosen = files.slice(0, remaining);
    if (files.length > remaining && remaining > 0) {
      setFileError(t('scan.maxImagesReached', { max: maxImages }));
    }

    const pending: UploadedPlantPhoto[] = [];
    let processed = 0;

    for (const file of chosen) {
      if (!ACCEPTED_MIME.includes(file.type.toLowerCase())) {
        setFileError(t('scan.invalidFormatError'));
        processed++;
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        setFileError(t('scan.maxSizeError'));
        processed++;
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          pending.push({
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            dataUrl: reader.result,
            filename: file.name,
            role: images.length + pending.length === 0 ? 'closeup_leaf' : 'multiple_leaves',
          });
        }
        processed++;
        if (processed === chosen.length && pending.length > 0) {
          onChange([...images, ...pending].slice(0, maxImages));
        }
      };
      reader.onerror = () => {
        processed++;
      };
      reader.readAsDataURL(file);
    }
  }

  async function openCamera(slot: IndividualViewSlot | null = null) {
    setCameraTargetSlot(slot);
    setCapturedPreview('');
    setCameraError('');
    setCameraOpen(true);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(t('scan.cameraUnsupported'));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setCameraError(t('scan.cameraBlocked'));
    }
  }

  function closeCamera() {
    stopCameraStream();
    setCapturedPreview('');
    setCameraOpen(false);
  }

  function captureSnapshot() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturedPreview(canvas.toDataURL('image/jpeg', 0.92));
    stopCameraStream();
  }

  function retakeSnapshot() {
    openCamera(cameraTargetSlot);
  }

  function confirmCapturedPhoto() {
    if (!capturedPreview) return;
    const slot = cameraTargetSlot;
    const slotDef = slot ? VIEW_SLOTS.find((s) => s.slot === slot) : null;
    const nextPhoto: UploadedPlantPhoto = {
      id: `${Date.now()}_cam`,
      dataUrl: capturedPreview,
      filename: `camera_${slot || 'plant'}_${Date.now()}.jpg`,
      role: slotDef ? slotDef.defaultRole : images.length === 0 ? 'closeup_leaf' : 'multiple_leaves',
      viewSlot: slot || undefined,
    };

    if (slot) {
      const filtered = images.filter((img) => img.viewSlot !== slot);
      onChange([...filtered, nextPhoto]);
    } else {
      onChange([...images, nextPhoto].slice(0, maxImages));
    }
    closeCamera();
  }

  const slotCount = VIEW_SLOTS.filter((s) => images.some((i) => i.viewSlot === s.slot)).length;

  return (
    <div className="space-y-4">
      {/* Segmented Option Switcher (Option A: Multiple Images vs Option B: Individual Views) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex items-center p-1 rounded-lg bg-sr-surface-alt border border-sr-border"
          role="tablist"
          aria-label="Upload mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'multiple'}
            onClick={() => setMode('multiple')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === 'multiple'
                ? 'bg-sr-surface text-sr-accent-ink shadow-xs border border-sr-border/70'
                : 'text-sr-muted hover:text-sr-text'
            }`}
          >
            {t('scan.optionMultiple')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'views'}
            onClick={() => setMode('views')}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === 'views'
                ? 'bg-sr-surface text-sr-accent-ink shadow-xs border border-sr-border/70'
                : 'text-sr-muted hover:text-sr-text'
            }`}
          >
            {t('scan.optionViews')}
          </button>
        </div>

        <button
          type="button"
          onClick={() => openCamera(mode === 'views' ? 'closeup' : null)}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-sr-text bg-sr-surface border border-sr-border rounded-lg hover:bg-sr-accent-soft transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Camera className="w-3.5 h-3.5 text-sr-accent-ink" />
          <span>{t('scan.useCamera')}</span>
        </button>
      </div>

      {fileError && (
        <div className="p-3 rounded-lg border border-sr-danger-border bg-sr-danger-bg text-xs text-sr-danger">
          {fileError}
        </div>
      )}

      {/* Hidden Multi-Image Input */}
      <input
        ref={multiInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          readImageFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {mode === 'multiple' ? (
        <div className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              readImageFiles(e.dataTransfer.files);
            }}
            className={`rounded-xl border border-dashed transition-colors text-center ${
              compact ? 'p-5' : 'p-7'
            } ${isDragging ? 'border-sr-accent bg-sr-accent-soft' : 'border-sr-border-strong bg-sr-surface-alt'}`}
          >
            <Upload className="w-6 h-6 text-sr-accent-ink mx-auto" />
            <p className="mt-2.5 text-sm font-semibold text-sr-text">{t('scan.dropzoneTitle')}</p>
            <p className="mt-1 text-xs text-sr-muted">{t('scan.dropzoneHint')}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2.5">
              <button
                type="button"
                onClick={() => multiInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t('scan.addPhotos')}</span>
              </button>
              <button
                type="button"
                onClick={() => openCamera(null)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-sr-text bg-sr-surface border border-sr-border rounded-lg hover:bg-sr-accent-soft transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 text-sr-accent-ink" />
                <span>{t('scan.useCamera')}</span>
              </button>
            </div>
          </div>

          {images.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {images.map((img) => (
                <div key={img.id} className="rounded-lg border border-sr-border bg-sr-surface-alt overflow-hidden">
                  <div className="h-36 bg-sr-input flex items-center justify-center overflow-hidden">
                    <img src={img.dataUrl} alt={img.filename} className="w-full h-full object-contain" />
                  </div>
                  <div className="p-2.5 border-t border-sr-border space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium text-sr-text">{img.filename}</span>
                      <button
                        type="button"
                        onClick={() => onChange(images.filter((p) => p.id !== img.id))}
                        className="text-sr-danger inline-flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{t('scan.remove')}</span>
                      </button>
                    </div>
                    <select
                      value={img.role}
                      onChange={(e) =>
                        onChange(
                          images.map((p) => (p.id === img.id ? { ...p, role: e.target.value as PlantImageRole } : p))
                        )
                      }
                      aria-label={t('scan.photoRole')}
                      className="w-full px-2 py-1 text-xs rounded border border-sr-border bg-sr-input text-sr-text"
                    >
                      {(Object.keys(IMAGE_ROLE_LABELS) as PlantImageRole[]).map((r) => (
                        <option key={r} value={r}>
                          {IMAGE_ROLE_LABELS[r][lang]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {VIEW_SLOTS.map((slotDef) => {
              const existing = images.find((img) => img.viewSlot === slotDef.slot);
              return (
                <div
                  key={slotDef.slot}
                  className="rounded-xl border border-sr-border bg-sr-surface-alt p-3.5 flex flex-col justify-between gap-3"
                >
                  <div>
                    <p className="text-xs font-bold text-sr-text">{t(slotDef.titleKey)}</p>
                    <p className="text-[11px] text-sr-muted mt-0.5">{t(slotDef.hintKey)}</p>
                  </div>

                  <input
                    ref={(el) => {
                      slotInputRefs.current[slotDef.slot] = el;
                    }}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      readImageFiles(e.target.files, slotDef.slot);
                      e.target.value = '';
                    }}
                  />

                  {existing ? (
                    <div className="space-y-2">
                      <div className="h-36 rounded-lg bg-sr-input border border-sr-border overflow-hidden flex items-center justify-center">
                        <img src={existing.dataUrl} alt={t(slotDef.titleKey)} className="w-full h-full object-contain" />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => slotInputRefs.current[slotDef.slot]?.click()}
                          className="text-sr-accent-ink font-semibold hover:underline cursor-pointer"
                        >
                          {t('scan.replaceView')}
                        </button>
                        <button
                          type="button"
                          onClick={() => onChange(images.filter((i) => i.id !== existing.id))}
                          className="text-sr-danger inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{t('scan.remove')}</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="h-36 rounded-lg border border-dashed border-sr-border-strong bg-sr-input flex flex-col items-center justify-center gap-2 p-3 text-center">
                      <button
                        type="button"
                        onClick={() => slotInputRefs.current[slotDef.slot]?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{t('scan.selectPhoto')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openCamera(slotDef.slot)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-sr-accent-ink hover:underline cursor-pointer"
                      >
                        <Camera className="w-3 h-3" />
                        <span>{t('scan.captureSlot')}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {slotCount > 0 && slotCount < 3 && (
            <p className="text-xs text-sr-muted bg-sr-surface-alt border border-sr-border rounded-lg px-3.5 py-2.5">
              {t('scan.partialUploadHint', { count: slotCount })}
            </p>
          )}
        </div>
      )}

      {/* Camera Capture & Preview/Retake Modal */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl bg-sr-surface sr-surface-glass border border-sr-border overflow-hidden shadow-xl">
            <div className="px-5 py-3.5 border-b border-sr-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-sr-text">
                {t('scan.cameraTitle')}
                {cameraTargetSlot ? ` · ${t(`scan.view${cameraTargetSlot.charAt(0).toUpperCase() + cameraTargetSlot.slice(1)}`)}` : ''}
              </h3>
              <button
                type="button"
                onClick={closeCamera}
                className="p-1 text-sr-muted hover:text-sr-text cursor-pointer"
                aria-label="Close camera"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-sr-surface-alt">
              {cameraError ? (
                <div className="py-10 px-4 text-center space-y-2">
                  <p className="text-sm font-medium text-sr-danger">{cameraError}</p>
                </div>
              ) : capturedPreview ? (
                <img
                  src={capturedPreview}
                  alt="Captured plant preview"
                  className="w-full rounded-lg bg-black max-h-[340px] object-contain"
                />
              ) : (
                <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg bg-black max-h-[340px]" />
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-sr-border flex flex-wrap justify-end gap-2.5">
              <button
                type="button"
                onClick={closeCamera}
                className="px-4 py-2 text-xs font-semibold text-sr-text border border-sr-border rounded-lg hover:bg-sr-surface-alt cursor-pointer"
              >
                {t('scan.cancel')}
              </button>

              {!cameraError && !capturedPreview && (
                <button
                  type="button"
                  onClick={captureSnapshot}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{t('scan.captureBtn')}</span>
                </button>
              )}

              {capturedPreview && (
                <>
                  <button
                    type="button"
                    onClick={retakeSnapshot}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-sr-text bg-sr-surface border border-sr-border rounded-lg hover:bg-sr-surface-alt cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{t('scan.retakeBtn')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={confirmCapturedPhoto}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-sr-accent-text bg-sr-accent rounded-lg hover:bg-sr-accent-hover cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{t('scan.addCapturedBtn')}</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
