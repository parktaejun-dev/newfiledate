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
  quickPresetsLabel: string;
  presetNow: string;
  presetYesterday: string;
  preset1WeekAgo: string;
  preset1MonthAgo: string;
  preset1YearAgo: string;
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
    uploadTitle: "STEP 1. Select Files",
    clearAll: "Clear",
    dragDropText: "Drag & drop files here, or click to browse",
    dragDropSub: "Supports all formats (ZIP, Images, HWP, PPTX, DOCX)",
    dateSettingTitle: "STEP 2. Set Target Date & Time",
    dateLabel: "📅 Click below to pick date & time",
    quickPresetsLabel: "Quick Presets:",
    presetNow: "Now",
    presetYesterday: "Yesterday",
    preset1WeekAgo: "1 Wk Ago",
    preset1MonthAgo: "1 Mo Ago",
    preset1YearAgo: "1 Yr Ago",
    secondsLabel: "Seconds",
    previewTitle: "Timestamp Preview",
    modeTitle: "STEP 3. Select Mode",
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
    uploadTitle: "STEP 1. 파일 선택",
    clearAll: "전체 삭제",
    dragDropText: "파일을 드래그하거나 클릭하여 선택",
    dragDropSub: "모든 파일 지원 (HWP, PPTX, DOCX, ZIP, 이미지 등)",
    dateSettingTitle: "STEP 2. 바꿀 날짜 & 시간 선택",
    dateLabel: "📅 클릭하여 원하는 날짜와 시간을 지정하세요",
    quickPresetsLabel: "원클릭 빠른 선택:",
    presetNow: "⏱️ 지금",
    presetYesterday: "📅 어제",
    preset1WeekAgo: "⏪ 1주일 전",
    preset1MonthAgo: "🗓️ 1달 전",
    preset1YearAgo: "🔮 1년 전",
    secondsLabel: "초 단위 지정",
    previewTitle: "적용될 최종 날짜 미리보기",
    modeTitle: "STEP 3. 방식 선택 및 다운로드",
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
