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
  CheckCircle2
} from 'lucide-react';
import { 
  formatForDateTimeInput, 
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasExceededServerlessLimit = trackMode === 'B' && files.some(f => f.size > VERCEL_MAX_PAYLOAD_BYTES);

  const rawDate = new Date(targetDateTimeStr);
  const dateWithSecs = new Date(rawDate);
  dateWithSecs.setSeconds(selectedSecond);
  const finalSnappedDate = clampDate(snapToEvenSeconds(dateWithSecs));

  // Language Switch Handler with GA4 Event
  const toggleLanguage = () => {
    const nextLang = lang === 'en' ? 'ko' : 'en';
    setLang(nextLang);
    trackGAEvent('language_switch', { lang: nextLang });
  };

  // Quick Preset Helper Functions with GA4 Event
  const applyPreset = (presetType: 'now' | 'yesterday' | 'week' | 'month' | 'year') => {
    trackGAEvent('preset_click', { preset: presetType });
    const now = new Date();
    if (presetType === 'now') {
      setTargetDateTimeStr(formatForDateTimeInput(now));
      setSelectedSecond(now.getSeconds());
    } else if (presetType === 'yesterday') {
      now.setDate(now.getDate() - 1);
      setTargetDateTimeStr(formatForDateTimeInput(now));
    } else if (presetType === 'week') {
      now.setDate(now.getDate() - 7);
      setTargetDateTimeStr(formatForDateTimeInput(now));
    } else if (presetType === 'month') {
      now.setMonth(now.getMonth() - 1);
      setTargetDateTimeStr(formatForDateTimeInput(now));
    } else if (presetType === 'year') {
      now.setFullYear(now.getFullYear() - 1);
      setTargetDateTimeStr(formatForDateTimeInput(now));
    }
  };

  // Mode Toggle Handler with GA4 Event
  const selectMode = (mode: 'A' | 'B') => {
    setTrackMode(mode);
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
  };

  const addFiles = (newFiles: File[]) => {
    trackGAEvent('file_upload', { count: newFiles.length });
    const items: FileItem[] = newFiles.map((file) => ({
      id: Math.random().toString(36).substring(2, 9),
      file,
      name: file.name,
      size: file.size,
      type: file.name.split('.').pop()?.toUpperCase() || 'FILE'
    }));
    setFiles((prev) => [...prev, ...items]);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearAllFiles = () => {
    setFiles([]);
  };

  const handleExecute = async () => {
    if (files.length === 0) return;

    trackGAEvent('date_change_execute', {
      mode: trackMode,
      file_count: files.length,
      target_date: finalSnappedDate.toISOString()
    });

    if (trackMode === 'B' && hasExceededServerlessLimit) {
      const oversized = files.filter(f => f.size > VERCEL_MAX_PAYLOAD_BYTES);
      const msg = lang === 'ko'
        ? `[서버 업로드 용량 제한 경고]\n\nVercel 서버리스 호스팅 환경 제약으로 Track B(문서 내부 수정)는 파일당 최대 4.5MB까지만 지원됩니다.\n\n초과된 파일: ${oversized.map(f => `${f.name} (${(f.size/1024/1024).toFixed(1)}MB)`).join(', ')}\n\n100% 대용량 지원 및 브라우저 로컬 처리를 원하시면 'Track A (빠른 파일 날짜 변경)'를 선택해 주세요!`
        : `[Serverless Payload Limit Warning]\n\nTrack B supports max 4.5MB per file on Vercel host.\n\nOversized files: ${oversized.map(f => `${f.name} (${(f.size/1024/1024).toFixed(1)}MB)`).join(', ')}\n\nPlease select 'Track A (Fast Local Change)' for unlimited local processing!`;
      alert(msg);
      return;
    }

    setIsProcessing(true);
    setIsCompleted(false);
    setProgress(5);

    try {
      const formattedIso = finalSnappedDate.toISOString();

      if (trackMode === 'A') {
        setStatusMessage(t.processingMsg);
        const rawFileList = files.map((f) => f.file);
        
        const zipBlob = await processTrackALocal(rawFileList, finalSnappedDate, (pct) => {
          setProgress(pct);
        });

        setProgress(100);
        setIsCompleted(true);
        setStatusMessage(t.completeMsg);
        
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NewFileDate_${finalSnappedDate.getFullYear()}${(finalSnappedDate.getMonth()+1).toString().padStart(2,'0')}${finalSnappedDate.getDate().toString().padStart(2,'0')}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        setStatusMessage(t.processingMsg);
        setProgress(20);

        const formData = new FormData();
        formData.append('target_time', formattedIso);
        files.forEach((item) => {
          formData.append('files', item.file);
        });

        const response = await fetch('/api/process-metadata', {
          method: 'POST',
          body: formData,
        });

        setProgress(80);

        if (!response.ok) {
          if (response.status === 413) {
            throw new Error(
              lang === 'ko'
                ? 'Vercel 서버리스 업로드 용량 제한 (4.5MB)을 초과했습니다. 대용량 파일은 OS 날짜 변경을 이용해 주세요!'
                : 'File size exceeds Vercel Serverless limit (4.5MB). Please use OS File Date mode for larger files!'
            );
          }
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson.detail || `Server processing failed (${response.status})`);
        }

        const blob = await response.blob();
        setProgress(100);
        setIsCompleted(true);
        setStatusMessage(t.completeMsg);

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NewFileDate_Pro_Archived.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || err);
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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'var(--bg-main)' }}>
      
      {/* 1. Header */}
      <header role="banner" style={{ height: '48px', borderBottom: '2px solid #09090b', background: '#ffffff', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <div style={{ maxWidth: '1100px', width: '100%', margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img 
              src="/logo.png" 
              alt="NewFileDate Logo" 
              style={{ width: '22px', height: '22px', objectFit: 'contain' }} 
            />
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
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px 12px', overflowY: 'auto' }}>
        
        {/* Left Side Ad Space Placeholder */}
        <aside style={{ flex: 1, maxWidth: '240px', height: '100%', display: 'none' }} className="ad-container-left" />

        {/* Single Center 1-Column App Container (Max-Width 460px) */}
        <main id="main-content" role="main" style={{ width: '100%', maxWidth: '460px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          
          {/* Compact Main Title with Inline Icon */}
          <h1 id="hero-heading" style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.03em', textAlign: 'center', color: '#09090b', margin: 0, fontFamily: "'Space Grotesk', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <img src="/logo.png" alt="Logo" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
            {t.heroTitle}
          </h1>

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

            {/* Drag & Drop Zone */}
            <div 
              className={`drop-zone ${dragActive ? 'active' : ''}`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
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

            {/* Uploaded Files List */}
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

          {/* SECTION 2: Target Date Picker & Presets (Dimmed when no files) */}
          <article className="glass-panel" style={{ padding: '12px 14px' }}>
            <div style={{ opacity: isFormDimmed ? 0.45 : 1, pointerEvents: isFormDimmed ? 'none' : 'auto', transition: 'opacity 0.2s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h2 style={{ fontSize: '0.85rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', color: '#09090b', margin: 0 }}>
                  <Calendar style={{ width: '15px', height: '15px', color: '#2563eb' }} />
                  {t.dateSettingTitle}
                </h2>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Clickable Date Picker Input */}
                <input 
                  id="datetime-input"
                  type="datetime-local" 
                  min={MIN_DATE_STR}
                  max={MAX_DATE_STR}
                  value={targetDateTimeStr}
                  onChange={(e) => setTargetDateTimeStr(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    background: '#ffffff',
                    border: '2px solid #09090b',
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

                {/* Compact One-Click Presets */}
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => applyPreset('now')} style={{ flex: 1, padding: '5px 2px', background: '#ffffff', border: '1.5px solid #09090b', borderRadius: '6px', color: '#09090b', fontSize: '0.68rem', cursor: 'pointer', fontWeight: 800, boxShadow: '2px 2px 0px #09090b' }}>
                    {t.presetNow}
                  </button>
                  <button onClick={() => applyPreset('yesterday')} style={{ flex: 1, padding: '5px 2px', background: '#ffffff', border: '1.5px solid #09090b', borderRadius: '6px', color: '#09090b', fontSize: '0.68rem', cursor: 'pointer', fontWeight: 800, boxShadow: '2px 2px 0px #09090b' }}>
                    {t.presetYesterday}
                  </button>
                  <button onClick={() => applyPreset('week')} style={{ flex: 1, padding: '5px 2px', background: '#ffffff', border: '1.5px solid #09090b', borderRadius: '6px', color: '#09090b', fontSize: '0.68rem', cursor: 'pointer', fontWeight: 800, boxShadow: '2px 2px 0px #09090b' }}>
                    {t.preset1WeekAgo}
                  </button>
                  <button onClick={() => applyPreset('month')} style={{ flex: 1, padding: '5px 2px', background: '#ffffff', border: '1.5px solid #09090b', borderRadius: '6px', color: '#09090b', fontSize: '0.68rem', cursor: 'pointer', fontWeight: 800, boxShadow: '2px 2px 0px #09090b' }}>
                    {t.preset1MonthAgo}
                  </button>
                  <button onClick={() => applyPreset('year')} style={{ flex: 1, padding: '5px 2px', background: '#ffffff', border: '1.5px solid #09090b', borderRadius: '6px', color: '#09090b', fontSize: '0.68rem', cursor: 'pointer', fontWeight: 800, boxShadow: '2px 2px 0px #09090b' }}>
                    {t.preset1YearAgo}
                  </button>
                </div>

                {/* Seconds Slider & Timestamp Preview */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', border: '1.5px solid #09090b', borderRadius: '6px', boxShadow: '2px 2px 0px #09090b', padding: '6px 8px' }}>
                  <input 
                    id="seconds-slider"
                    type="range" 
                    min={0}
                    max={58}
                    step={2}
                    value={selectedSecond}
                    onChange={(e) => setSelectedSecond(parseInt(e.target.value))}
                    style={{ flex: 1, accentColor: '#2563eb', cursor: 'pointer' }}
                  />
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: '#09090b', whiteSpace: 'nowrap' }}>
                    {finalSnappedDate.toLocaleDateString()} {finalSnappedDate.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </div>
          </article>

          {/* SECTION 3: Mode Selector & Execute Button (Dimmed when no files) */}
          <section className="glass-panel" style={{ padding: '12px 14px' }}>
            <div style={{ opacity: isFormDimmed ? 0.45 : 1, pointerEvents: isFormDimmed ? 'none' : 'auto', transition: 'opacity 0.2s ease' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '6px' }}>
                <button
                  onClick={() => selectMode('A')}
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

              {/* Sub-description for selected track */}
              <p style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600, textAlign: 'center', marginBottom: '10px' }}>
                {trackMode === 'A' ? t.trackADesc : t.trackBDesc}
              </p>

              {/* Oversized Serverless Warning Tooltip */}
              {hasExceededServerlessLimit && (
                <div style={{ marginBottom: '10px', padding: '6px 8px', background: '#fee2e2', border: '1.5px solid #09090b', borderRadius: '6px', boxShadow: '2px 2px 0px #09090b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle style={{ color: '#dc2626', width: '14px', height: '14px', flexShrink: 0 }} />
                  <p style={{ fontSize: '0.68rem', color: '#991b1b', margin: 0, fontWeight: 700 }}>
                    Track B는 4.5MB 이하만 가능합니다. 대용량은 OS 날짜 변경을 선택해 주세요!
                  </p>
                </div>
              )}
            </div>

            {/* Action Button */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
              <button 
                className={trackMode === 'B' ? 'btn-pro' : 'btn-primary'}
                onClick={handleExecute}
                disabled={files.length === 0 || isProcessing}
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

              {/* Progress Bar */}
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

        </main>

        {/* Right Side Ad Space Placeholder */}
        <aside style={{ flex: 1, maxWidth: '240px', height: '100%', display: 'none' }} className="ad-container-right" />

      </div>

      {/* 3. Minimal Footer */}
      <footer role="contentinfo" style={{ height: '34px', borderTop: '2px solid #09090b', background: '#ffffff', flexShrink: 0, textAlign: 'center', color: '#64748b', fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>{t.footerRights}</p>
      </footer>
    </div>
  );
}
export default App;
