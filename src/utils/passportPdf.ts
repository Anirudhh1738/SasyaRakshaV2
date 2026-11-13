import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type { DiseaseLibraryEntry, FieldPassportRecord, LanguageCode, PredictionRecord, SavedWeatherRecord } from '../types';
import {
  getLocalizedGuidance,
  translateCrop,
  translateDisease,
  translateRisk,
  translateSeverity,
  translateVerification,
} from '../i18n/domainTranslations';

async function imageUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const token = localStorage.getItem('agriguard_token');
    const resp = await fetch(url, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateQrDataUrl(text: string): Promise<string> {
  return await QRCode.toDataURL(text, {
    width: 240,
    margin: 1,
    color: { dark: '#242824', light: '#FFFFFF' },
  });
}

function renderUnicodeTextBlockToDataUrl(lines: Array<{ text: string; bold?: boolean; size?: number; color?: string }>): {
  dataUrl: string;
  heightMm: number;
} {
  const canvasWidth = 1120;
  const paddingX = 24;
  const paddingY = 16;

  const measureCanvas = document.createElement('canvas');
  const mctx = measureCanvas.getContext('2d')!;
  const wrapped: Array<{ text: string; bold: boolean; size: number; color: string; lineHeight: number }> = [];

  for (const item of lines) {
    const size = item.size || 24;
    const bold = Boolean(item.bold);
    const color = item.color || '#242824';
    mctx.font = `${bold ? 'bold ' : ''}${size}px "Noto Sans Devanagari", "Noto Sans Kannada", "DM Sans", sans-serif`;

    const words = item.text.split(/\s+/);
    let current = '';
    for (const w of words) {
      const test = current ? `${current} ${w}` : w;
      if (mctx.measureText(test).width > canvasWidth - paddingX * 2 && current) {
        wrapped.push({ text: current, bold, size, color, lineHeight: Math.round(size * 1.45) });
        current = w;
      } else {
        current = test;
      }
    }
    if (current) {
      wrapped.push({ text: current, bold, size, color, lineHeight: Math.round(size * 1.45) });
    }
  }

  const totalHeight = Math.max(80, paddingY * 2 + wrapped.reduce((s, l) => s + l.lineHeight, 0));
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasWidth, totalHeight);

  let y = paddingY;
  for (const l of wrapped) {
    ctx.font = `${l.bold ? 'bold ' : ''}${l.size}px "Noto Sans Devanagari", "Noto Sans Kannada", "DM Sans", sans-serif`;
    ctx.fillStyle = l.color;
    ctx.textBaseline = 'top';
    ctx.fillText(l.text, paddingX, y);
    y += l.lineHeight;
  }

  const heightMm = (totalHeight / canvasWidth) * 182;
  return { dataUrl: canvas.toDataURL('image/png'), heightMm };
}

export async function downloadFieldPassportPdf(params: {
  passport: FieldPassportRecord;
  prediction: PredictionRecord;
  guidance: DiseaseLibraryEntry | null;
  weather: SavedWeatherRecord | null;
  shareUrl: string;
  language?: LanguageCode;
}) {
  const { passport, prediction, guidance, weather, shareUrl, language = 'en' } = params;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const rawCrop = prediction.verified_crop || prediction.crop;
  const rawDisease = prediction.verified_disease || prediction.predicted_disease;

  const crop = translateCrop(rawCrop, language);
  const disease = translateDisease(rawDisease, language);
  const severityLabel = translateSeverity(prediction.severity, language);
  const verificationLabel = translateVerification(prediction.verification_status, language);
  const locGuidance = getLocalizedGuidance(
    guidance,
    rawCrop,
    rawDisease,
    prediction.condition_category || 'fungal',
    language
  );

  doc.setFillColor(40, 92, 58);
  doc.rect(0, 0, 210, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('SasyaRaksha — Digital Field Passport', 14, 12);
  doc.setFontSize(10);
  doc.text(`Passport ID: ${passport.passport_code}   |   Date: ${prediction.created_at.slice(0, 16)}`, 14, 19);

  const qrData = await generateQrDataUrl(shareUrl);
  doc.addImage(qrData, 'PNG', 164, 30, 32, 32);
  doc.setTextColor(119, 125, 117);
  doc.setFontSize(7.5);
  doc.text('Scan to verify', 171, 65);

  let y = 32;

  if (language === 'en') {
    doc.setTextColor(36, 40, 36);
    doc.setFontSize(13);
    doc.text(`${crop} — ${disease}`, 14, 36);
    doc.setFontSize(10);
    doc.text(`Status: ${rawDisease === 'Healthy' ? 'Healthy' : 'Condition Flagged'}   |   Confidence: ${prediction.confidence}%`, 14, 43);
    doc.text(
      `Severity: ${severityLabel} (${prediction.affected_area_pct}% leaf area)   |   Review: ${verificationLabel}`,
      14,
      50
    );
    doc.text(`Location: ${prediction.region_label || 'Not specified'}`, 14, 57);
    y = 70;
  } else {
    const headerLines = [
      { text: `${crop} — ${disease}`, bold: true, size: 30, color: '#242824' },
      { text: `${severityLabel} (${prediction.affected_area_pct}%) | ${prediction.confidence}% | ${verificationLabel}`, size: 22, color: '#285C3A' },
      { text: `${prediction.region_label || ''}`, size: 20, color: '#777D75' },
    ];
    const renderedHeader = renderUnicodeTextBlockToDataUrl(headerLines);
    doc.addImage(renderedHeader.dataUrl, 'PNG', 14, 29, 146, Math.min(34, renderedHeader.heightMm * 0.8));
    y = 70;
  }

  const origImg = await imageUrlToDataUrl(prediction.original_image_path);
  const procImg = await imageUrlToDataUrl(prediction.processed_image_path);
  if (origImg) {
    doc.setFontSize(9);
    doc.setTextColor(36, 40, 36);
    doc.text('Original Plant Photo', 14, y);
    doc.addImage(origImg, 'PNG', 14, y + 2, 78, 50);
  }
  if (procImg) {
    doc.setFontSize(9);
    doc.setTextColor(36, 40, 36);
    doc.text('Highlighted Affected Areas', 102, y);
    doc.addImage(procImg, 'PNG', 102, y + 2, 78, 50);
  }
  y += 58;

  if (language === 'en') {
    const writeSection = (title: string, body: string) => {
      if (y > 256) {
        doc.addPage();
        y = 18;
      }
      doc.setTextColor(40, 92, 58);
      doc.setFontSize(11);
      doc.text(title, 14, y);
      y += 5;
      doc.setTextColor(36, 40, 36);
      doc.setFontSize(9.5);
      const lines = doc.splitTextToSize(body, 180) as string[];
      doc.text(lines, 14, y);
      y += lines.length * 4.6 + 5;
    };

    writeSection('What Happened', locGuidance.summary);
    writeSection('Likely Causes', locGuidance.causes);
    writeSection('Recommended Care & Prevention', `${locGuidance.todo} ${locGuidance.prevent}`);
    if (guidance && prediction.uncertain !== 1 && rawDisease !== 'Healthy' && guidance.recommended_treatment) {
      const medInfo = [
        guidance.recommended_treatment,
        guidance.pesticide_or_medicine ? `Medicine: ${guidance.pesticide_or_medicine}` : '',
        guidance.active_ingredient ? `Active Ingredient: ${guidance.active_ingredient}` : '',
        guidance.dosage_instructions ? `Dosage: ${guidance.dosage_instructions}` : '',
        guidance.application_frequency ? `Frequency: ${guidance.application_frequency}` : '',
        guidance.safety_precautions ? `Safety: ${guidance.safety_precautions}` : '',
      ]
        .filter(Boolean)
        .join(' | ');
      writeSection('Verified Treatment Guidance', medInfo);
    }
    writeSection('Verified Reference Source', `${locGuidance.referenceSource} (${locGuidance.referenceUrl})`);
    if (weather) {
      writeSection(
        'Weather Risk Snapshot',
        `Location: ${weather.location_name}${weather.time_period ? ` (${weather.time_period})` : ''} | Temp: ${weather.temperature_c}°C | Humidity: ${weather.humidity_pct}% | Rain: ${weather.rainfall_mm} mm | Risk: ${translateRisk(weather.risk_level, 'en')}`
      );
    }
  } else {
    const bodyLines: Array<{ text: string; bold?: boolean; size?: number; color?: string }> = [
      {
        text: language === 'hi' ? 'सारांश और कारण' : 'ಸಾರಾಂಶ ಮತ್ತು ಕಾರಣ',
        bold: true,
        size: 26,
        color: '#285C3A',
      },
      { text: `${locGuidance.summary} ${locGuidance.causes}`, size: 22 },
      {
        text: language === 'hi' ? 'सुझाए गए कदम और रोकथाम' : 'ಶಿಫಾರಸು ಮಾಡಿದ ಕ್ರಮಗಳು ಮತ್ತು ತಡೆಗಟ್ಟುವಿಕೆ',
        bold: true,
        size: 26,
        color: '#285C3A',
      },
      { text: `${locGuidance.todo} ${locGuidance.prevent}`, size: 22 },
      {
        text: `${locGuidance.referenceSource}`,
        size: 19,
        color: '#777D75',
      },
    ];
    if (weather) {
      bodyLines.push({
        text: `${weather.location_name}: ${weather.temperature_c}°C | ${weather.humidity_pct}% | ${weather.rainfall_mm} mm | ${translateRisk(weather.risk_level, language)}`,
        bold: true,
        size: 21,
        color: '#285C3A',
      });
    }
    const block = renderUnicodeTextBlockToDataUrl(bodyLines);
    if (y + block.heightMm > 275) {
      doc.addPage();
      y = 16;
    }
    doc.addImage(block.dataUrl, 'PNG', 14, y, 182, Math.min(140, block.heightMm));
  }

  doc.setTextColor(119, 125, 117);
  doc.setFontSize(8);
  const disclaimerLines = doc.splitTextToSize(
    'Disclaimer: Automated screening and visual severity estimates are decision-support tools and do not replace advice from a qualified agricultural specialist.',
    180
  ) as string[];
  doc.text(disclaimerLines, 14, 282);

  doc.save(`${passport.passport_code}_${language}.pdf`);
}
