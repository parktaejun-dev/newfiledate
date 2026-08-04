import React, { useState, useRef } from 'react';
import { 
  Clock, 
  UploadCloud, 
  FileText, 
  AlertTriangle, 
  Download, 
  X, 
  Calendar,
  HardDrive,
  Globe
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
  const [progress, setProgress] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const hasExceededServerlessLimit = trackMode === 'B' && files.some(f => f.size > VERCEL_MAX_PAYLOAD_BYTES);

  const rawDate = new Date(targetDateTimeStr);
  const dateWithSecs = new Date(rawDate);
  dateWithSecs.setSeconds(selectedSecond);
  const finalSnappedDate = clampDate(snapToEvenSeconds(dateWithSecs));

  // Quick Preset Helper Functions
  const applyPreset = (presetType: 'now' | 'yesterday' | 'week' | 'month' | 'year') => {
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

    if (trackMode === 'B' && hasExceededServerlessLimit) {
      const oversized = files.filter(f => f.size > VERCEL_MAX_PAYLOAD_BYTES);
      const msg = lang === 'ko'
        ? `[서버 업로드 용량 제한 경고]\n\nVercel 서버리스 호스팅 환경 제약으로 Track B(문서 내부 수정)는 파일당 최대 4.5MB까지만 지원됩니다.\n\n초과된 파일: ${oversized.map(f => `${f.name} (${(f.size/1024/1024).toFixed(1)}MB)`).join(', ')}\n\n100% 대용량 지원 및 브라우저 로컬 처리를 원하시면 'Track A (빠른 파일 날짜 변경)'를 선택해 주세요!`
        : `[Serverless Payload Limit Warning]\n\nTrack B supports max 4.5MB per file on Vercel host.\n\nOversized files: ${oversized.map(f => `${f.name} (${(f.size/1024/1024).toFixed(1)}MB)`).join(', ')}\n\nPlease select 'Track A (Fast Local Change)' for unlimited local processing!`;
      alert(msg);
      return;
    }

    setIsProcessing(true);
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
        setStatusMessage('Complete!');
        
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
                ? 'Vercel 서버리스 업로드 용량 제한 (4.5MB)을 초과했습니다 (413 Payload Too Large). 대용량 파일은 Track A (빠른 파일 날짜 변경)를 이용해 주세요!'
                : 'File size exceeds Vercel Serverless limit (4.5MB max for Track B). Please use Track A for files larger than 4.5MB!'
            );
          }
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson.detail || `Server processing failed (${response.status})`);
        }

        const blob = await response.blob();
        setProgress(100);
        setStatusMessage('Complete!');

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
        setProgress(0);
        setStatusMessage('');
      }, 1500);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header Navigation */}
      <header role="banner" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(11, 15, 25, 0.8)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', padding: '8px', borderRadius: '10px', display: 'flex' }}>
              <Clock style={{ width: '20px', height: '20px', color: '#fff' }} />
            </div>
            <span style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.02em', color: '#fff' }}>
              NewFileDate
            </span>
          </div>

          {/* Language Switcher */}
          <button 
            onClick={() => setLang(lang === 'en' ? 'ko' : 'en')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(31, 41, 55, 0.6)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '6px 12px',
              color: '#9ca3af',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            aria-label="Language selector"
          >
            <Globe style={{ width: '14px', height: '14px', color: '#818cf8' }} />
            {lang === 'en' ? 'EN | 한국어' : 'KO | English'}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main id="main-content" role="main" style={{ flex: 1, maxWidth: '1000px', width: '100%', margin: '0 auto', padding: '36px 24px' }}>
        
        {/* Hero Section */}
        <section aria-labelledby="hero-heading" style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 id="hero-heading" style={{ fontSize: '2.1rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '8px', color: '#f9fafb' }}>
            {t.heroTitle}
          </h1>
          <p style={{ color: '#9ca3af', fontSize: '0.95rem' }}>
            {t.heroSubtitle}
          </p>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Top Panel: File Upload & High-Visibility Date Picker */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            
            {/* Left Card: File Uploader (STEP 1) */}
            <article className="glass-panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h2 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', color: '#818cf8' }}>
                  <UploadCloud style={{ width: '18px', height: '18px' }} />
                  {t.uploadTitle}
                </h2>
                {files.length > 0 && (
                  <button 
                    onClick={clearAllFiles} 
                    aria-label={t.clearAll}
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
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
                style={{ padding: '30px 16px', textAlign: 'center', cursor: 'pointer', position: 'relative' }}
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
                <HardDrive style={{ width: '24px', height: '24px', color: '#818cf8', margin: '0 auto 8px auto', display: 'block' }} />
                <p style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '2px', color: '#e5e7eb' }}>
                  {t.dragDropText}
                </p>
                <p style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                  {t.dragDropSub}
                </p>
              </div>

              {/* Uploaded Files List */}
              {files.length > 0 && (
                <div style={{ marginTop: '12px', maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {files.map((item) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(31, 41, 55, 0.5)', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <FileText style={{ width: '14px', height: '14px', color: '#9ca3af', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.8rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: item.size > VERCEL_MAX_PAYLOAD_BYTES && trackMode === 'B' ? '#ef4444' : '#6b7280' }}>
                          {(item.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                        <button 
                          onClick={(e) => { e.stopPropagation(); removeFile(item.id); }} 
                          aria-label={`${item.name} remove`}
                          style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex' }}
                        >
                          <X style={{ width: '14px', height: '14px' }} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>

            {/* Right Card: High-Visibility Target Date Picker & Presets (STEP 2) */}
            <article className="glass-panel" style={{ padding: '20px', border: '1.5px solid rgba(99, 102, 241, 0.4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <h2 style={{ fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', color: '#818cf8' }}>
                  <Calendar style={{ width: '18px', height: '18px' }} />
                  {t.dateSettingTitle}
                </h2>
                <span style={{ fontSize: '0.7rem', color: '#818cf8', background: 'rgba(99, 102, 241, 0.15)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                  {userTimeZone}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                
                {/* Prominent Date Input with Glowing Clickable Border */}
                <div>
                  <label htmlFor="datetime-input" style={{ fontSize: '0.8rem', color: '#d1d5db', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                    {t.dateLabel}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      id="datetime-input"
                      type="datetime-local" 
                      min={MIN_DATE_STR}
                      max={MAX_DATE_STR}
                      value={targetDateTimeStr}
                      onChange={(e) => setTargetDateTimeStr(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        background: 'rgba(99, 102, 241, 0.12)',
                        border: '2px solid #6366f1',
                        borderRadius: 'var(--radius-md)',
                        color: '#ffffff',
                        fontSize: '1.1rem',
                        fontWeight: 700,
                        fontFamily: 'inherit',
                        outline: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 0 12px rgba(99, 102, 241, 0.25)',
                        transition: 'all 0.2s ease'
                      }}
                    />
                  </div>
                </div>

                {/* One-Click Quick Date Presets */}
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                    {t.quickPresetsLabel}
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    <button onClick={() => applyPreset('now')} style={{ padding: '4px 10px', background: 'rgba(31, 41, 55, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#f3f4f6', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
                      {t.presetNow}
                    </button>
                    <button onClick={() => applyPreset('yesterday')} style={{ padding: '4px 10px', background: 'rgba(31, 41, 55, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#f3f4f6', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
                      {t.presetYesterday}
                    </button>
                    <button onClick={() => applyPreset('week')} style={{ padding: '4px 10px', background: 'rgba(31, 41, 55, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#f3f4f6', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
                      {t.preset1WeekAgo}
                    </button>
                    <button onClick={() => applyPreset('month')} style={{ padding: '4px 10px', background: 'rgba(31, 41, 55, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#f3f4f6', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
                      {t.preset1MonthAgo}
                    </button>
                    <button onClick={() => applyPreset('year')} style={{ padding: '4px 10px', background: 'rgba(31, 41, 55, 0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#f3f4f6', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
                      {t.preset1YearAgo}
                    </button>
                  </div>
                </div>

                {/* Compact Seconds Slider */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label htmlFor="seconds-slider" style={{ fontSize: '0.75rem', color: '#9ca3af', fontWeight: 500 }}>
                      {t.secondsLabel}
                    </label>
                    <span style={{ fontSize: '0.8rem', color: '#818cf8', fontWeight: 700, fontFamily: 'monospace' }}>
                      {String(selectedSecond).padStart(2, '0')} s
                    </span>
                  </div>
                  <input 
                    id="seconds-slider"
                    type="range" 
                    min={0}
                    max={58}
                    step={2}
                    value={selectedSecond}
                    onChange={(e) => setSelectedSecond(parseInt(e.target.value))}
                    style={{ width: '100%', accentColor: '#6366f1', cursor: 'pointer' }}
                  />
                </div>

                {/* Realtime Final Applied Timestamp Preview */}
                <div style={{ background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: 'var(--radius-md)', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.7rem', color: '#818cf8', fontWeight: 600 }}>
                    {t.previewTitle}
                  </span>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: '#f3f4f6' }}>
                    {finalSnappedDate.toLocaleDateString()} {finalSnappedDate.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </article>

          </div>

          {/* Mode Selector Segmented Tabs (STEP 3) */}
          <section className="glass-panel" style={{ padding: '16px 20px' }}>
            <h2 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#9ca3af', marginBottom: '12px', textAlign: 'center' }}>
              {t.modeTitle}
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <button
                onClick={() => setTrackMode('A')}
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: trackMode === 'A' ? '2px solid #6366f1' : '1px solid var(--border-color)',
                  background: trackMode === 'A' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(31, 41, 55, 0.4)',
                  color: trackMode === 'A' ? '#fff' : '#9ca3af',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s ease'
                }}
              >
                {t.trackATitle}
              </button>

              <button
                onClick={() => setTrackMode('B')}
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: trackMode === 'B' ? '2px solid #f59e0b' : '1px solid var(--border-color)',
                  background: trackMode === 'B' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(31, 41, 55, 0.4)',
                  color: trackMode === 'B' ? '#fbbf24' : '#9ca3af',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'all 0.2s ease'
                }}
              >
                {t.trackBTitle}
              </button>
            </div>

            {/* Oversized Serverless Warning Tooltip */}
            {hasExceededServerlessLimit && (
              <div style={{ marginBottom: '16px', padding: '8px 12px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle style={{ color: '#ef4444', width: '16px', height: '16px', flexShrink: 0 }} />
                <p style={{ fontSize: '0.75rem', color: '#fca5a5', margin: 0 }}>
                  Track B는 4.5MB 이하 파일만 업로드 가능합니다. 대용량 파일은 ⚡ 빠른 날짜 변경(Track A)을 선택해 주세요!
                </p>
              </div>
            )}

            {/* Main Action Button */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
              <button 
                className={trackMode === 'B' ? 'btn-pro' : 'btn-primary'}
                onClick={handleExecute}
                disabled={files.length === 0 || isProcessing}
                style={{ width: '100%', maxWidth: '380px', fontSize: '1rem', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                aria-label={trackMode === 'A' ? t.actionButtonTrackA : t.actionButtonTrackB}
              >
                {isProcessing ? (
                  <>{t.processingMsg} ({progress}%)...</>
                ) : (
                  <>
                    <Download style={{ width: '18px', height: '18px' }} />
                    {trackMode === 'A' ? t.actionButtonTrackA : t.actionButtonTrackB}
                  </>
                )}
              </button>

              {/* Progress Bar */}
              {isProcessing && (
                <div style={{ width: '100%', maxWidth: '400px', marginTop: '8px' }}>
                  <div style={{ background: 'rgba(255, 255, 255, 0.1)', borderRadius: '9999px', height: '6px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        height: '100%', 
                        width: `${progress}%`, 
                        background: trackMode === 'B' ? 'linear-gradient(90deg, #f59e0b, #d97706)' : 'linear-gradient(90deg, #6366f1, #818cf8)',
                        transition: 'width 0.3s ease'
                      }} 
                    />
                  </div>
                  <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#9ca3af', marginTop: '4px' }}>
                    {statusMessage}
                  </p>
                </div>
              )}
            </div>

          </section>

        </div>
      </main>

      {/* Footer */}
      <footer role="contentinfo" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '0.75rem' }}>
        <p>{t.footerRights}</p>
      </footer>
    </div>
  );
}
export default App;
