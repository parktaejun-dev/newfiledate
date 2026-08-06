export type Language = 'en' | 'ko';

export interface TranslationDictionary {
  brandSubtitle: string;
  heroTitle: string;
  /** Shown for Track A, which genuinely never transmits the file. */
  privacyLocal: string;
  /** Shown for Track B, which uploads the document for server-side editing. */
  privacyUpload: string;
  privacyPolicy: string;
  uploadTitle: string;
  clearAll: string;
  dragDropText: string;
  dragDropSub: string;
  dateSettingTitle: string;
  presetNow: string;
  presetYesterday: string;
  preset1WeekAgo: string;
  preset1MonthAgo: string;
  preset1YearAgo: string;
  trackATitle: string;
  trackADesc: string;
  trackBTitle: string;
  trackBDesc: string;
  actionButton: string;
  completeMsg: string;
  processingMsg: string;
  footerRights: string;
  invalidDateMsg: string;
  renamedMsg: (names: string[]) => string;
  exifSkippedMsg: (skipped: number, total: number) => string;
  unsupportedForTrackB: (names: string[]) => string;
  genericErrorMsg: string;
}

export const translations: Record<Language, TranslationDictionary> = {
  en: {
    brandSubtitle: 'Date Fix',
    heroTitle: 'File Date Fixer',
    privacyLocal: '🔒 Processed entirely in your browser — this file is never uploaded',
    privacyUpload: '⚠️ Pro mode uploads the document to our server, edits it, and discards it — nothing is stored',
    privacyPolicy: 'Privacy',
    uploadTitle: '1. Select Files',
    clearAll: 'Clear',
    dragDropText: 'Drop files here or click to upload',
    dragDropSub: 'Batch multi-photo EXIF & OS date modification',
    dateSettingTitle: '2. Set Target Timestamp',
    presetNow: 'Now',
    presetYesterday: 'Yesterday',
    preset1WeekAgo: '-1 Wk',
    preset1MonthAgo: '-1 Mo',
    preset1YearAgo: '-1 Yr',
    trackATitle: '⚡ File Date (OS)',
    trackADesc: 'Batch modifies OS file dates & image EXIF photo timestamps, fully in-browser',
    trackBTitle: '✨ HWP / PPT (Pro)',
    trackBDesc: 'Edits the creation date stored inside the document (server-side)',
    actionButton: 'Apply Date & Download ZIP',
    completeMsg: 'Completed!',
    processingMsg: 'Processing...',
    footerRights: '© 2026 NewFileDate',
    invalidDateMsg: 'Please choose a valid target date and time.',
    renamedMsg: (names) =>
      `Some files shared a name and were renamed to avoid overwriting: ${names.join(', ')}`,
    exifSkippedMsg: (skipped, total) =>
      `${skipped} of ${total} photos had no EXIF timestamp to change. Their file dates were still updated.`,
    unsupportedForTrackB: (names) =>
      `Pro mode only supports HWP, PPTX, DOCX and JPEG. Use File Date (OS) mode for: ${names.join(', ')}`,
    genericErrorMsg: 'Processing failed. Please try again.',
  },
  ko: {
    brandSubtitle: '날짜 수정 툴',
    heroTitle: '파일 날짜 변경',
    privacyLocal: '🔒 브라우저 안에서만 처리 — 파일이 서버로 전송되지 않습니다',
    privacyUpload: '⚠️ Pro 모드는 문서를 서버로 전송해 수정 후 즉시 폐기합니다 — 저장하지 않습니다',
    privacyPolicy: '개인정보처리방침',
    uploadTitle: '1. 파일 선택',
    clearAll: '비우기',
    dragDropText: '파일 드래그 또는 클릭하여 선택',
    dragDropSub: '사진 여러 장 일괄 선택 & EXIF 촬영일자 동시 변경 지원',
    dateSettingTitle: '2. 바꿀 날짜 지정',
    presetNow: '지금',
    presetYesterday: '어제',
    preset1WeekAgo: '-1주일',
    preset1MonthAgo: '-1개월',
    preset1YearAgo: '-1년',
    trackATitle: '⚡ 일반 파일 날짜 (OS)',
    trackADesc: '파일 생성/수정일 + 사진 EXIF 촬영일 변경 · 브라우저 내 처리',
    trackBTitle: '✨ HWP / PPT 작성일 (Pro)',
    trackBDesc: '문서 내부 메타데이터 작성일자 변경 · 서버 처리',
    actionButton: '날짜 변경 및 다운로드',
    completeMsg: '완료 되었습니다!',
    processingMsg: '처리 중...',
    footerRights: '© 2026 NewFileDate',
    invalidDateMsg: '올바른 날짜와 시각을 선택해 주세요.',
    renamedMsg: (names) =>
      `이름이 같은 파일이 있어 덮어쓰기를 피하려고 이름을 바꿨습니다: ${names.join(', ')}`,
    exifSkippedMsg: (skipped, total) =>
      `사진 ${total}장 중 ${skipped}장은 EXIF 촬영일자가 없어 변경하지 못했습니다. 파일 날짜는 정상 변경되었습니다.`,
    unsupportedForTrackB: (names) =>
      `Pro 모드는 HWP, PPTX, DOCX, JPEG만 지원합니다. 다음 파일은 '일반 파일 날짜(OS)' 모드를 이용해 주세요: ${names.join(', ')}`,
    genericErrorMsg: '처리에 실패했습니다. 다시 시도해 주세요.',
  },
};

export function detectDefaultLanguage(): Language {
  if (typeof window !== 'undefined' && window.navigator) {
    if (window.navigator.language.toLowerCase().startsWith('ko')) {
      return 'ko';
    }
  }
  return 'en';
}
