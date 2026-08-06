import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  AlertTriangle,
  Download,
  X,
  Calendar,
  HardDrive,
  Globe,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Info
} from 'lucide-react';
import {
  formatForDateTimeInput,
  formatWallClock,
  getTimezoneOffsetMinutes,
  isValidDate,
  snapToEvenSeconds,
  clampDate,
  processTrackALocal,
  MIN_DATE_STR,
  MAX_DATE_STR
} from './lib/timestamp';
import type { Language } from './lib/i18n';
import {
  translations,
  detectDefaultLanguage
} from './lib/i18n';
import { trackGAEvent } from './lib/ga';

export interface FileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
}

const VERCEL_MAX_PAYLOAD_BYTES = 4.5 * 1024 * 1024; // 4.5 MB Vercel Serverless limit
const TRACK_B_EXTENSIONS = ['hwp', 'pptx', 'docx', 'jpg', 'jpeg'];

function createId(): string {
  // randomUUID avoids the key collisions that Math.random() short ids produced,
  // which could make removing one file drop another.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${performance.now()}`;
}

function extensionOf(name: string): string {
  return name.toLowerCase().split('.').pop() ?? '';
}

export function App() {
  const [lang, setLang] = useState<Language>(detectDefaultLanguage());
  const t = translations[lang];

  const [files, setFiles] = useState<FileItem[]>([]);
  const [targetDateTimeStr, setTargetDateTimeStr] = useState<string>(
    formatForDateTimeInput(new Date())
  );
  const [selectedSecond, setSelectedSecond] = useState<number>(0);
  const [trackMode, setTrackMode] = useState<'A' | 'B'>('A');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [notices, setNotices] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasExceededServerlessLimit =
    trackMode === 'B' && files.some((f) => f.size > VERCEL_MAX_PAYLOAD_BYTES);

  const unsupportedForTrackB =
    trackMode === 'B'
      ? files.filter((f) => !TRACK_B_EXTENSIONS.includes(extensionOf(f.name)))
      : [];

  // A cleared datetime-local input yields '', so every derived value below has
  // to tolerate an Invalid Date rather than assuming a usable timestamp.
  const rawDate = new Date(targetDateTimeStr);
  let finalSnappedDate: Date | null = null;
  if (isValidDate(rawDate)) {
    const withSeconds = new Date(rawDate);
    withSeconds.setSeconds(selectedSecond);
    finalSnappedDate = clampDate(snapToEvenSeconds(withSeconds));
  }
  const dateIsValid = finalSnappedDate !== null;

  const toggleLanguage = () => {
    const nextLang = lang === 'en' ? 'ko' : 'en';
    setLang(nextLang);
    trackGAEvent('language_switch', { lang: nextLang });
  };

  const applyPreset = (presetType: 'now' | 'yesterday' | 'week' | 'month' | 'year') => {
    trackGAEvent('preset_click', { preset: presetType });
    const now = new Date();
    if (presetType === 'now') {
      setTargetDateTimeStr(formatForDateTimeInput(now));
      setSelectedSecond(Math.floor(now.getSeconds() / 2) * 2);
      return;
    }
    if (presetType === 'yesterday') now.setDate(now.getDate() - 1);
    else if (presetType === 'week') now.setDate(now.getDate() - 7);
    else if (presetType === 'month') now.setMonth(now.getMonth() - 1);
    else if (presetType === 'year') now.setFullYear(now.getFullYear() - 1);
    setTargetDateTimeStr(formatForDateTimeInput(now));
  };

  const selectMode = (mode: 'A' | 'B') => {
    setTrackMode(mode);
    setNotices([]);
    trackGAEvent('mode_select', { mode });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(Array.from(e.target.files));
    }
    // Allow re-selecting the same file after it was removed.
    e.target.value = '';
  };

  const addFiles = (newFiles: File[]) => {
    trackGAEvent('file_upload', { count: newFiles.length });
    setNotices([]);
    const items: FileItem[] = newFiles.map((file) => ({
      id: createId(),
      file,
      name: file.name,
      size: file.size,
      type: extensionOf(file.name).toUpperCase() || 'FILE'
    }));
    setFiles((prev) => [...prev, ...items]);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearAllFiles = () => {
    setFiles([]);
    setNotices([]);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleExecute = async () => {
    if (files.length === 0) return;

    if (!finalSnappedDate) {
      alert(t.invalidDateMsg);
      return;
    }
    const targetDate = finalSnappedDate;

    trackGAEvent('date_change_execute', {
      mode: trackMode,
      file_count: files.length,
      target_date: formatWallClock(targetDate)
    });

    if (trackMode === 'B' && unsupportedForTrackB.length > 0) {
      alert(t.unsupportedForTrackB(unsupportedForTrackB.map((f) => f.name)));
      return;
    }

    if (trackMode === 'B' && hasExceededServerlessLimit) {
      const oversized = files.filter((f) => f.size > VERCEL_MAX_PAYLOAD_BYTES);
      const list = oversized
        .map((f) => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)}MB)`)
        .join(', ');
      alert(
        lang === 'ko'
          ? `Pro 모드는 파일당 4.5MB까지 지원합니다.\n\n초과 파일: ${list}\n\n용량 제한이 없는 '일반 파일 날짜(OS)' 모드를 이용해 주세요.`
          : `Pro mode supports up to 4.5MB per file.\n\nOversized: ${list}\n\nUse 'File Date (OS)' mode for unlimited local processing.`
      );
      return;
    }

    setIsProcessing(true);
    setIsCompleted(false);
    setNotices([]);
    setProgress(5);
    setStatusMessage(t.processingMsg);

    try {
      if (trackMode === 'A') {
        const result = await processTrackALocal(
          files.map((f) => f.file),
          targetDate,
          setProgress
        );

        setProgress(100);
        setIsCompleted(true);
        setStatusMessage(t.completeMsg);

        const stamp = `${targetDate.getFullYear()}${String(targetDate.getMonth() + 1).padStart(2, '0')}${String(targetDate.getDate()).padStart(2, '0')}`;
        downloadBlob(result.blob, `NewFileDate_${stamp}.zip`);

        const messages: string[] = [];
        if (result.renamed.length > 0) messages.push(t.renamedMsg(result.renamed));
        const skipped = result.jpegCount - result.exifUpdated;
        if (skipped > 0) messages.push(t.exifSkippedMsg(skipped, result.jpegCount));
        setNotices(messages);
      } else {
        setProgress(20);

        const formData = new FormData();
        formData.append('target_time', formatWallClock(targetDate));
        formData.append('tz_offset_minutes', String(getTimezoneOffsetMinutes(targetDate)));
        files.forEach((item) => formData.append('files', item.file));

        const response = await fetch('/api/process-metadata', {
          method: 'POST',
          body: formData
        });

        setProgress(80);

        if (!response.ok) {
          if (response.status === 413) {
            throw new Error(
              lang === 'ko'
                ? '업로드 용량 제한을 초과했습니다. 대용량 파일은 일반 파일 날짜(OS) 모드를 이용해 주세요.'
                : 'Upload size limit exceeded. Use File Date (OS) mode for larger files.'
            );
          }
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson.detail || t.genericErrorMsg);
        }

        const blob = await response.blob();
        setProgress(100);
        setIsCompleted(true);
        setStatusMessage(t.completeMsg);
        downloadBlob(blob, 'NewFileDate_Pro.zip');
      }
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : t.genericErrorMsg);
    } finally {
      setTimeout(() => {
        setIsProcessing(false);
        setIsCompleted(false);
        setProgress(0);
        setStatusMessage('');
      }, 2500);
    }
  };

  const isFormDimmed = files.length === 0;
  const canExecute = files.length > 0 && dateIsValid && !isProcessing;

  const presetButtonStyle: React.CSSProperties = {
    flex: 1,
    padding: '5px 2px',
    background: '#ffffff',
    border: '1.5px solid #09090b',
    borderRadius: '6px',
    color: '#09090b',
    fontSize: '0.68rem',
    cursor: 'pointer',
    fontWeight: 800,
    boxShadow: '2px 2px 0px #09090b'
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'var(--bg-main)' }}>

      {/* 1. Header */}
      <header role="banner" style={{ height: '44px', borderBottom: '2px solid #09090b', background: '#ffffff', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <div style={{ maxWidth: '1100px', width: '100%', margin: '0 auto', padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ background: '#09090b', padding: '4px', borderRadius: '5px', display: 'flex' }}>
              <Clock style={{ width: '14px', height: '14px', color: '#ffffff' }} />
            </div>
            <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#09090b', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.03em' }}>
              NewFileDate
            </span>
          </div>

          <button
            onClick={toggleLanguage}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: '#ffffff',
              border: '2px solid #09090b',
              borderRadius: '6px',
              padding: '3px 8px',
              color: '#09090b',
              fontSize: '0.72rem',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '2px 2px 0px #09090b'
            }}
            aria-label="Language selector"
          >
            <Globe style={{ width: '12px', height: '12px', color: '#2563eb' }} />
            {lang === 'en' ? 'EN | 한국어' : 'KO | English'}
          </button>
        </div>
      </header>

      {/* 2. Main Centered 1-Column Area with Side Ad Margins */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '6px 12px 12px', overflowY: 'auto' }}>

        <aside style={{ flex: 1, maxWidth: '240px', height: '100%', display: 'none' }} className="ad-container-left" />

        <main id="main-content" role="main" style={{ width: '100%', maxWidth: '460px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

          <h1 id="hero-heading" style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.03em', textAlign: 'center', color: '#09090b', margin: '2px 0 0', fontFamily: "'Space Grotesk', sans-serif" }}>
            {t.heroTitle}
          </h1>

          {/*
            The privacy notice tracks the selected mode. Track A never transmits
            the file; Track B uploads it, so a blanket "no uploads" claim would
            be false half the time.
          */}
          <div
            role="status"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: trackMode === 'A' ? '#ecfdf5' : '#fffbeb',
              border: '1.5px solid #09090b',
              borderRadius: '6px',
              padding: '4px 10px',
              boxShadow: '2px 2px 0px #09090b',
              margin: '2px 0 4px'
            }}
          >
            {trackMode === 'A' ? (
              <ShieldCheck style={{ width: '15px', height: '15px', color: '#059669', flexShrink: 0 }} />
            ) : (
              <AlertTriangle style={{ width: '15px', height: '15px', color: '#b45309', flexShrink: 0 }} />
            )}
            <span style={{ fontSize: '0.70rem', fontWeight: 800, color: trackMode === 'A' ? '#065f46' : '#92400e', letterSpacing: '-0.01em' }}>
              {trackMode === 'A' ? t.privacyLocal : t.privacyUpload}
            </span>
          </div>

          {/* SECTION 1: File Upload Box */}
          <article className="glass-panel" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <h2 style={{ fontSize: '0.85rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', color: '#09090b', margin: 0 }}>
                <UploadCloud style={{ width: '15px', height: '15px', color: '#2563eb' }} />
                {t.uploadTitle}
              </h2>
              {files.length > 0 && (
                <button
                  onClick={clearAllFiles}
                  aria-label={t.clearAll}
                  style={{ background: 'transparent', border: 'none', color: '#dc2626', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 800 }}
                >
                  {t.clearAll} ({files.length})
                </button>
              )}
            </div>

            <div
              className={`drop-zone ${dragActive ? 'active' : ''}`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              style={{ padding: '16px 10px', textAlign: 'center', cursor: 'pointer', position: 'relative' }}
              role="button"
              tabIndex={0}
              aria-label={t.dragDropText}
            >
              <input
                type="file"
                ref={fileInputRef}
                multiple
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
                aria-label="file-input"
              />
              <HardDrive style={{ width: '18px', height: '18px', color: '#2563eb', margin: '0 auto 4px auto', display: 'block' }} />
              <p style={{ fontWeight: 800, fontSize: '0.82rem', marginBottom: '2px', color: '#09090b' }}>
                {t.dragDropText}
              </p>
              <p style={{ color: '#64748b', fontSize: '0.68rem', fontWeight: 600 }}>
                {t.dragDropSub}
              </p>
            </div>

            {files.length > 0 && (
              <div style={{ marginTop: '8px', maxHeight: '100px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {files.map((item) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: '#ffffff', border: '1.5px solid #09090b', borderRadius: '6px', boxShadow: '2px 2px 0px #09090b' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                      <FileText style={{ width: '12px', height: '12px', color: '#2563eb', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#09090b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.name}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: item.size > VERCEL_MAX_PAYLOAD_BYTES && trackMode === 'B' ? '#dc2626' : '#64748b' }}>
                        {(item.size / 1024 / 1024).toFixed(1)}MB
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(item.id); }}
                        aria-label={`${item.name} remove`}
                        style={{ background: 'none', border: 'none', color: '#09090b', cursor: 'pointer', display: 'flex' }}
                      >
                        <X style={{ width: '12px', height: '12px' }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>

          {/* SECTION 2: Target Date Picker & Presets */}
          <article className="glass-panel" style={{ padding: '12px 14px' }}>
            <div style={{ opacity: isFormDimmed ? 0.45 : 1, pointerEvents: isFormDimmed ? 'none' : 'auto', transition: 'opacity 0.2s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h2 style={{ fontSize: '0.85rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', color: '#09090b', margin: 0 }}>
                  <Calendar style={{ width: '15px', height: '15px', color: '#2563eb' }} />
                  {t.dateSettingTitle}
                </h2>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input
                  id="datetime-input"
                  type="datetime-local"
                  min={MIN_DATE_STR}
                  max={MAX_DATE_STR}
                  value={targetDateTimeStr}
                  onChange={(e) => setTargetDateTimeStr(e.target.value)}
                  aria-invalid={!dateIsValid}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: '#ffffff',
                    border: `2px solid ${dateIsValid ? '#09090b' : '#dc2626'}`,
                    borderRadius: 'var(--radius-md)',
                    color: '#09090b',
                    fontSize: '0.95rem',
                    fontWeight: 800,
                    fontFamily: 'inherit',
                    outline: 'none',
                    cursor: 'pointer',
                    boxShadow: '3px 3px 0px #09090b'
                  }}
                />

                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => applyPreset('now')} style={presetButtonStyle}>{t.presetNow}</button>
                  <button onClick={() => applyPreset('yesterday')} style={presetButtonStyle}>{t.presetYesterday}</button>
                  <button onClick={() => applyPreset('week')} style={presetButtonStyle}>{t.preset1WeekAgo}</button>
                  <button onClick={() => applyPreset('month')} style={presetButtonStyle}>{t.preset1MonthAgo}</button>
                  <button onClick={() => applyPreset('year')} style={presetButtonStyle}>{t.preset1YearAgo}</button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', border: '1.5px solid #09090b', borderRadius: '6px', boxShadow: '2px 2px 0px #09090b', padding: '6px 8px' }}>
                  <input
                    id="seconds-slider"
                    type="range"
                    min={0}
                    max={58}
                    step={2}
                    value={selectedSecond}
                    onChange={(e) => setSelectedSecond(parseInt(e.target.value, 10))}
                    aria-label="seconds"
                    style={{ flex: 1, accentColor: '#2563eb', cursor: 'pointer' }}
                  />
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: dateIsValid ? '#09090b' : '#dc2626', whiteSpace: 'nowrap' }}>
                    {finalSnappedDate
                      ? `${finalSnappedDate.toLocaleDateString()} ${finalSnappedDate.toLocaleTimeString()}`
                      : t.invalidDateMsg}
                  </div>
                </div>
              </div>
            </div>
          </article>

          {/* SECTION 3: Mode Selector & Execute Button */}
          <section className="glass-panel" style={{ padding: '12px 14px' }}>
            <div style={{ opacity: isFormDimmed ? 0.45 : 1, pointerEvents: isFormDimmed ? 'none' : 'auto', transition: 'opacity 0.2s ease' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '6px' }}>
                <button
                  onClick={() => selectMode('A')}
                  aria-pressed={trackMode === 'A'}
                  style={{
                    padding: '8px 6px',
                    borderRadius: 'var(--radius-md)',
                    border: '2px solid #09090b',
                    background: trackMode === 'A' ? '#2563eb' : '#ffffff',
                    color: trackMode === 'A' ? '#ffffff' : '#09090b',
                    fontWeight: 800,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    textAlign: 'center',
                    boxShadow: trackMode === 'A' ? '3px 3px 0px #09090b' : '2px 2px 0px #09090b',
                    transition: 'all 0.1s ease'
                  }}
                >
                  {t.trackATitle}
                </button>

                <button
                  onClick={() => selectMode('B')}
                  aria-pressed={trackMode === 'B'}
                  style={{
                    padding: '8px 6px',
                    borderRadius: 'var(--radius-md)',
                    border: '2px solid #09090b',
                    background: trackMode === 'B' ? '#ea580c' : '#ffffff',
                    color: trackMode === 'B' ? '#ffffff' : '#09090b',
                    fontWeight: 800,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    textAlign: 'center',
                    boxShadow: trackMode === 'B' ? '3px 3px 0px #09090b' : '2px 2px 0px #09090b',
                    transition: 'all 0.1s ease'
                  }}
                >
                  {t.trackBTitle}
                </button>
              </div>

              <p style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600, textAlign: 'center', marginBottom: '10px' }}>
                {trackMode === 'A' ? t.trackADesc : t.trackBDesc}
              </p>

              {(hasExceededServerlessLimit || unsupportedForTrackB.length > 0) && (
                <div style={{ marginBottom: '10px', padding: '6px 8px', background: '#fee2e2', border: '1.5px solid #09090b', borderRadius: '6px', boxShadow: '2px 2px 0px #09090b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle style={{ color: '#dc2626', width: '14px', height: '14px', flexShrink: 0 }} />
                  <p style={{ fontSize: '0.68rem', color: '#991b1b', margin: 0, fontWeight: 700 }}>
                    {unsupportedForTrackB.length > 0
                      ? t.unsupportedForTrackB(unsupportedForTrackB.map((f) => f.name))
                      : lang === 'ko'
                        ? 'Pro 모드는 파일당 4.5MB까지 지원합니다. 대용량은 일반 파일 날짜(OS) 모드를 이용해 주세요.'
                        : 'Pro mode supports up to 4.5MB per file. Use File Date (OS) mode for larger files.'}
                  </p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
              <button
                className={trackMode === 'B' ? 'btn-pro' : 'btn-primary'}
                onClick={handleExecute}
                disabled={!canExecute}
                style={{ width: '100%', fontSize: '0.9rem', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                aria-label={t.actionButton}
              >
                {isCompleted ? (
                  <>
                    <CheckCircle2 style={{ width: '16px', height: '16px', color: '#ffffff' }} />
                    {t.completeMsg}
                  </>
                ) : isProcessing ? (
                  <>{statusMessage || t.processingMsg} ({progress}%)...</>
                ) : (
                  <>
                    <Download style={{ width: '15px', height: '15px' }} />
                    {t.actionButton}
                  </>
                )}
              </button>

              {isProcessing && (
                <div style={{ width: '100%', marginTop: '6px' }}>
                  <div style={{ background: '#e2e8f0', border: '1.5px solid #09090b', borderRadius: '9999px', height: '8px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${progress}%`,
                        background: trackMode === 'B' ? '#ea580c' : '#2563eb',
                        transition: 'width 0.3s ease'
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Post-run notices: renamed collisions and photos without EXIF dates */}
          {notices.length > 0 && (
            <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {notices.map((notice) => (
                <div key={notice} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', padding: '6px 8px', background: '#eff6ff', border: '1.5px solid #09090b', borderRadius: '6px', boxShadow: '2px 2px 0px #09090b' }}>
                  <Info style={{ color: '#2563eb', width: '14px', height: '14px', flexShrink: 0, marginTop: '1px' }} />
                  <p style={{ fontSize: '0.68rem', color: '#1e3a8a', margin: 0, fontWeight: 700 }}>{notice}</p>
                </div>
              ))}
            </div>
          )}

        </main>

        <aside style={{ flex: 1, maxWidth: '240px', height: '100%', display: 'none' }} className="ad-container-right" />

      </div>

      {/* 3. Minimal Footer */}
      <footer role="contentinfo" style={{ minHeight: '34px', borderTop: '2px solid #09090b', background: '#ffffff', flexShrink: 0, textAlign: 'center', color: '#64748b', fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '4px 8px' }}>
        <span>{t.footerRights}</span>
        <a href={`/privacy.html?lang=${lang}`} style={{ color: '#2563eb', fontWeight: 800 }}>{t.privacyPolicy}</a>
      </footer>
    </div>
  );
}
export default App;
