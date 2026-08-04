export type Language = 'en' | 'ko';

export interface TranslationDictionary {
  brandSubtitle: string;
  heroTitle: string;
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
  trackBTitle: string;
  actionButton: string;
  processingMsg: string;
  footerRights: string;
}

export const translations: Record<Language, TranslationDictionary> = {
  en: {
    brandSubtitle: "Date Fix",
    heroTitle: "File Date Fixer",
    uploadTitle: "Files",
    clearAll: "Clear",
    dragDropText: "Drop files here or click to upload",
    dragDropSub: "All formats supported",
    dateSettingTitle: "New Date & Time",
    presetNow: "Now",
    presetYesterday: "Yesterday",
    preset1WeekAgo: "-1 Wk",
    preset1MonthAgo: "-1 Mo",
    preset1YearAgo: "-1 Yr",
    trackATitle: "⚡ File Date (OS)",
    trackBTitle: "✨ HWP / PPT (Pro)",
    actionButton: "Apply & Download ZIP",
    processingMsg: "Processing...",
    footerRights: "© 2026 NewFileDate."
  },
  ko: {
    brandSubtitle: "날짜 수정 툴",
    heroTitle: "파일 날짜 변경",
    uploadTitle: "파일 선택",
    clearAll: "비우기",
    dragDropText: "파일 드래그 또는 클릭하여 선택",
    dragDropSub: "모든 파일 지원",
    dateSettingTitle: "바꿀 날짜 지정",
    presetNow: "지금",
    presetYesterday: "어제",
    preset1WeekAgo: "-1주일",
    preset1MonthAgo: "-1개월",
    preset1YearAgo: "-1년",
    trackATitle: "⚡ 일반 파일 날짜 (OS)",
    trackBTitle: "✨ HWP / PPT 작성일 (Pro)",
    actionButton: "날짜 변경 및 다운로드",
    processingMsg: "처리 중...",
    footerRights: "© 2026 NewFileDate."
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
