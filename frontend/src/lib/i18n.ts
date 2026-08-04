export type Language = 'en' | 'ko';

export interface TranslationDictionary {
  brandSubtitle: string;
  heroTitle: string;
  heroSubtitle: string;
  uploadTitle: string;
  clearAll: string;
  dragDropText: string;
  dragDropSub: string;
  dateSettingTitle: string;
  dateLabel: string;
  secondsLabel: string;
  previewTitle: string;
  modeTitle: string;
  trackATitle: string;
  trackBTitle: string;
  actionButtonTrackA: string;
  actionButtonTrackB: string;
  processingMsg: string;
  footerRights: string;
}

export const translations: Record<Language, TranslationDictionary> = {
  en: {
    brandSubtitle: "File Timestamp Editor",
    heroTitle: "Change File Dates Instantly",
    heroSubtitle: "Modify file timestamps and internal document creation dates right in your browser.",
    uploadTitle: "Select Files",
    clearAll: "Clear",
    dragDropText: "Drag & drop files here, or click to browse",
    dragDropSub: "Supports all formats (ZIP, Images, HWP, PPTX, DOCX)",
    dateSettingTitle: "Target Date & Time",
    dateLabel: "Select Date & Time",
    secondsLabel: "Seconds",
    previewTitle: "Timestamp Preview",
    modeTitle: "Processing Mode",
    trackATitle: "⚡ Fast File Date Change (Local)",
    trackBTitle: "✨ Document Internal Date Change (HWP/PPT)",
    actionButtonTrackA: "Change Date & Download ZIP",
    actionButtonTrackB: "Change Created Date & Download ZIP",
    processingMsg: "Processing...",
    footerRights: "© 2026 NewFileDate. All rights reserved."
  },
  ko: {
    brandSubtitle: "파일 날짜 변경 툴",
    heroTitle: "파일 날짜를 클릭 한 번에 변경하세요",
    heroSubtitle: "파일 수정한 날짜 및 HWP·PPTX 문서 작성일을 무설치로 일괄 수정합니다.",
    uploadTitle: "파일 선택",
    clearAll: "전체 삭제",
    dragDropText: "파일을 드래그하거나 클릭하여 선택",
    dragDropSub: "모든 파일 지원 (HWP, PPTX, DOCX, ZIP, 이미지 등)",
    dateSettingTitle: "목표 날짜 및 시간",
    dateLabel: "날짜 및 시간 선택",
    secondsLabel: "초 단위",
    previewTitle: "적용 날짜 미리보기",
    modeTitle: "변경 방식",
    trackATitle: "⚡ 빠른 파일 날짜 변경 (로컬)",
    trackBTitle: "✨ 문서 내부 작성일 변경 (HWP/PPT)",
    actionButtonTrackA: "파일 날짜 변경 및 다운로드",
    actionButtonTrackB: "문서 만든 날짜 변경 및 다운로드",
    processingMsg: "처리 중...",
    footerRights: "© 2026 NewFileDate. All rights reserved."
  }
};

export function detectDefaultLanguage(): Language {
  if (typeof window !== 'undefined' && window.navigator) {
    const lang = window.navigator.language.toLowerCase();
    if (lang.startsWith('ko')) {
      return 'ko';
    }
  }
  return 'en';
}
