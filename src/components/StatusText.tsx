import { AlertCircle, CheckCircle2, Clock, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { translateSeverity, translateVerification } from '../i18n/domainTranslations';
import type { LanguageCode } from '../types';

export function SeverityIndicator({ severity }: { severity: string }) {
  const { i18n } = useTranslation();
  const lang = (i18n.language as LanguageCode) || 'en';
  const label = translateSeverity(severity, lang);

  if (severity === 'High') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sr-danger">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  if (severity === 'Medium') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sr-warn">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  if (severity === 'Low') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sr-ok">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sr-ok">
      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function VerificationIndicator({ status }: { status: string }) {
  const { i18n } = useTranslation();
  const lang = (i18n.language as LanguageCode) || 'en';
  const label = translateVerification(status, lang);

  if (status === 'confirmed' || status === 'corrected') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sr-ok">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sr-danger">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sr-muted">
      <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
