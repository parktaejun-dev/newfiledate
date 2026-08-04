import React, { useState, useRef } from 'react';
import { 
  Clock, 
  UploadCloud, 
  FileText, 
  AlertTriangle, 
  Zap, 
  ShieldCheck, 
  Sparkles, 
  Download, 
  X, 
  Info,
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
  const totalSizeBytes = files.reduce((acc, f) => acc + f.size, 0);
  const isLargeSize = totalSizeBytes > 1024 * 1024 * 1024; // > 1GB

  const rawDate = new Date(targetDateTimeStr);
  const dateWithSecs = new Date(rawDate);
  dateWithSecs.setSeconds(selectedSecond);
  const finalSnappedDate = clampDate(snapToEvenSeconds(dateWithSecs));

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
        setStatusMessage('Complete! Downloading ZIP archive...');
        
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NewFileDate_TrackA_${finalSnappedDate.getFullYear()}${(finalSnappedDate.getMonth()+1).toString().padStart(2,'0')}${finalSnappedDate.getDate().toString().padStart(2,'0')}.zip`;
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
          const errJson = await response.json().catch(() => ({}));
          throw new Error(errJson.detail || `Server processing failed (${response.status})`);
        }

        const blob = await response.blob();
        setProgress(100);
        setStatusMessage('Complete! Downloading ZIP archive...');

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
      alert(`Processing Error: ${err.message || err}`);
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
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', padding: '10px', borderRadius: '12px', display: 'flex', boxShadow: '0 0 16px rgba(99, 102, 241, 0.4)' }}>
              <Clock style={{ width: '24px', height: '24px', color: '#fff' }} />
            </div>
            <div>
              <span style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #fff 0%, #9ca3af 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', display: 'block' }}>
                NewFileDate
              </span>
              <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>{t.brandSubtitle}</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="badge-free" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ShieldCheck style={{ width: '12px', height: '12px' }} /> {t.badgeFree}
            </span>
            <span className="badge-pro" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Sparkles style={{ width: '12px', height: '12px' }} /> {t.badgePro}
            </span>

            {/* Language Switcher */}
            <button 
              onClick={() => setLang(lang === 'en' ? 'ko' : 'en')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(31, 41, 55, 0.8)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '6px 10px',
                color: '#f9fafb',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              aria-label="Language selector"
            >
              <Globe style={{ width: '14px', height: '14px', color: '#818cf8' }} />
              {lang === 'en' ? 'EN | 한국어' : 'KO | English'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main id="main-content" role="main" style={{ flex: 1, maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '40px 24px' }}>
        
        {/* SEO Intent H1 & Hero Section */}
        <section aria-labelledby="hero-heading" style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '9999px', fontSize: '0.8rem', color: '#818cf8', marginBottom: '16px', fontWeight: 600 }}>
            <Sparkles style={{ width: '14px', height: '14px' }} />
            {t.heroBadge}
          </div>

          <h1 id="hero-heading" style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '12px', lineHeight: 1.2 }}>
            {t.heroHeadline1}<br />
            <span style={{ background: 'linear-gradient(135deg, #818cf8 0%, #c084fc 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {t.heroHeadline2}
            </span>
          </h1>
          <p style={{ color: '#9ca3af', fontSize: '1.05rem', maxWidth: '680px', margin: '0 auto' }}>
            {t.heroSubtitle}
          </p>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '32px' }}>
          
          {/* Top Panel: File Upload & Date Picker Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px' }}>
            
            {/* Left Card: File Uploader */}
            <article className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <UploadCloud style={{ color: '#818cf8', width: '20px', height: '20px' }} />
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
                style={{ padding: '36px 20px', textAlign: 'center', cursor: 'pointer', position: 'relative' }}
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
                <div style={{ width: '48px', height: '48px', background: 'rgba(99, 102, 241, 0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px auto' }}>
                  <HardDrive style={{ width: '24px', height: '24px', color: '#818cf8' }} />
                </div>
                <p style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '4px' }}>
                  {t.dragDropText}
                </p>
                <p style={{ color: '#6b7280', fontSize: '0.8rem' }}>
                  {t.dragDropSub}
                </p>
              </div>

              {/* Large File Size Warning Tooltip */}
              {isLargeSize && (
                <div style={{ marginTop: '12px', padding: '10px 14px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <AlertTriangle style={{ color: '#f59e0b', width: '18px', height: '18px', flexShrink: 0 }} />
                  <p style={{ fontSize: '0.8rem', color: '#fbbf24', margin: 0 }}>
                    <strong>{t.largeWarningTitle}</strong> {t.largeWarningMsg}
                  </p>
                </div>
              )}

              {/* Uploaded Files List */}
              {files.length > 0 && (
                <div style={{ marginTop: '16px', maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {files.map((item) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(31, 41, 55, 0.5)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                        <FileText style={{ width: '16px', height: '16px', color: '#9ca3af', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.85rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.name}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          {(item.size / 1024 / 1024).toFixed(2)} MB
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

            {/* Right Card: Target Date & Time Settings */}
            <article className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Calendar style={{ color: '#818cf8', width: '20px', height: '20px' }} />
                {t.dateSettingTitle}
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label htmlFor="datetime-input" style={{ fontSize: '0.85rem', color: '#9ca3af', fontWeight: 500 }}>
                      {t.dateLabel}
                    </label>
                    <span style={{ fontSize: '0.75rem', color: '#6366f1', background: 'rgba(99, 102, 241, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                      {userTimeZone}
                    </span>
                  </div>
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
                      background: 'rgba(15, 23, 42, 0.8)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      color: '#fff',
                      fontSize: '1rem',
                      fontFamily: 'inherit',
                      outline: 'none'
                    }}
                  />
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', display: 'block' }}>
                    {t.dateClampingSub}
                  </span>
                </div>

                {/* 2-second snap slider/select */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label htmlFor="seconds-slider" style={{ fontSize: '0.85rem', color: '#9ca3af', fontWeight: 500 }}>
                      {t.secondsLabel}
                    </label>
                    <span style={{ fontSize: '0.85rem', color: '#6366f1', fontWeight: 700, fontFamily: 'monospace' }}>
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

                {/* Realtime Snapped Time Preview Badge */}
                <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: 'var(--radius-md)', padding: '12px 16px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#818cf8', display: 'block', marginBottom: '2px', fontWeight: 600 }}>
                    {t.previewTitle}
                  </span>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: '#f3f4f6' }}>
                    {finalSnappedDate.toLocaleDateString()} {finalSnappedDate.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </article>

          </div>

          {/* Processing Mode Selector: Track A vs Track B */}
          <section className="glass-panel" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap style={{ color: '#f59e0b', width: '20px', height: '20px' }} />
              {t.modeTitle}
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              
              {/* Track A Option Card */}
              <div 
                onClick={() => setTrackMode('A')}
                style={{
                  padding: '20px',
                  borderRadius: 'var(--radius-md)',
                  border: trackMode === 'A' ? '2px solid #6366f1' : '1px solid var(--border-color)',
                  background: trackMode === 'A' ? 'rgba(99, 102, 241, 0.12)' : 'rgba(31, 41, 55, 0.4)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease-in-out'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="badge-free">{t.trackABadge}</span>
                  <input type="radio" name="track-mode" aria-label={t.trackATitle} checked={trackMode === 'A'} onChange={() => setTrackMode('A')} style={{ accentColor: '#6366f1' }} />
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '6px' }}>
                  {t.trackATitle}
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#9ca3af', lineHeight: 1.4 }}>
                  {t.trackADesc}
                </p>
                <div style={{ marginTop: '12px', padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '0.75rem', color: '#6b7280', display: 'flex', gap: '6px' }}>
                  <Info style={{ width: '14px', height: '14px', flexShrink: 0, marginTop: '2px' }} />
                  <span>{t.trackAInfo}</span>
                </div>
              </div>

              {/* Track B Option Card */}
              <div 
                onClick={() => setTrackMode('B')}
                style={{
                  padding: '20px',
                  borderRadius: 'var(--radius-md)',
                  border: trackMode === 'B' ? '2px solid #f59e0b' : '1px solid var(--border-color)',
                  background: trackMode === 'B' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(31, 41, 55, 0.4)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease-in-out'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="badge-pro">{t.trackBBadge}</span>
                  <input type="radio" name="track-mode" aria-label={t.trackBTitle} checked={trackMode === 'B'} onChange={() => setTrackMode('B')} style={{ accentColor: '#f59e0b' }} />
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '6px', color: '#fbbf24' }}>
                  {t.trackBTitle}
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#9ca3af', lineHeight: 1.4 }}>
                  {t.trackBDesc}
                </p>
                <div style={{ marginTop: '12px', padding: '8px 10px', background: 'rgba(245, 158, 11, 0.08)', borderRadius: '6px', fontSize: '0.75rem', color: '#f59e0b', display: 'flex', gap: '6px' }}>
                  <Sparkles style={{ width: '14px', height: '14px', flexShrink: 0, marginTop: '2px' }} />
                  <span>{t.trackBInfo}</span>
                </div>
              </div>

            </div>

            {/* Action & Progress Bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
              <button 
                className={trackMode === 'B' ? 'btn-pro' : 'btn-primary'}
                onClick={handleExecute}
                disabled={files.length === 0 || isProcessing}
                style={{ width: '100%', maxWidth: '400px', fontSize: '1.05rem' }}
                aria-label={trackMode === 'A' ? t.actionButtonTrackA : t.actionButtonTrackB}
              >
                {isProcessing ? (
                  <>{t.processingMsg} ({progress}%)...</>
                ) : (
                  <>
                    <Download style={{ width: '20px', height: '20px' }} />
                    {trackMode === 'A' ? t.actionButtonTrackA : t.actionButtonTrackB}
                  </>
                )}
              </button>

              {/* Progress Bar */}
              {isProcessing && (
                <div style={{ width: '100%', maxWidth: '500px', marginTop: '12px' }}>
                  <div style={{ background: 'rgba(255, 255, 255, 0.1)', borderRadius: '9999px', height: '8px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        height: '100%', 
                        width: `${progress}%`, 
                        background: trackMode === 'B' ? 'linear-gradient(90deg, #f59e0b, #d97706)' : 'linear-gradient(90deg, #6366f1, #818cf8)',
                        transition: 'width 0.3s ease'
                      }} 
                    />
                  </div>
                  <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#9ca3af', marginTop: '8px' }}>
                    {statusMessage}
                  </p>
                </div>
              )}
            </div>

          </section>

        </div>
      </main>

      {/* Footer */}
      <footer role="contentinfo" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', padding: '24px', textAlign: 'center', color: '#6b7280', fontSize: '0.8rem' }}>
        <p>{t.footerRights}</p>
        <p style={{ marginTop: '4px' }}>{t.footerSub}</p>
      </footer>
    </div>
  );
}
export default App;
