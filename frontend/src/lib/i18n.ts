export type Language = 'en' | 'ko';

export interface TranslationDictionary {
  brandSubtitle: string;
  heroTitle: string;
  privacyGuarantee: string;
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
}

export const translations: Record<Language, TranslationDictionary> = {
  en: {
    brandSubtitle: "Date Fix",
    heroTitle: "File Date Fixer",
    privacyGuarantee: "🔒 100% Secure & Private: Zero Server Uploads · Local Browser Only",
    uploadTitle: "1. Select Files",
    clearAll: "Clear",
    dragDropText: "Drop files here or click to upload",
    dragDropSub: "Batch multi-photo EXIF & OS date modification",
    dateSettingTitle: "2. Set Target Timestamp",
    presetNow: "Now",
    presetYesterday: "Yesterday",
    preset1WeekAgo: "-1 Wk",
    preset1MonthAgo: "-1 Mo",
    preset1YearAgo: "-1 Yr",
    trackATitle: "⚡ File Date (OS)",
    trackADesc: "Batch modifies OS file dates & Image EXIF photo timestamps",
    trackBTitle: "✨ HWP / PPT (Pro)",
    trackBDesc: "Modifies document creation date inside metadata",
    actionButton: "Apply Date & Download ZIP",
    completeMsg: "Completed!",
    processingMsg: "Processing...",
    footerRights: "© 2026 NewFileDate. 100% Local Browser Processing & Zero Server Storage."
  },
  ko: {
    brandSubtitle: "날짜 수정 툴",
    heroTitle: "파일 날짜 변경",
    privacyGuarantee: "🔒 100% 보안: 서버 업로드 및 저장 NO · 브라우저 로컬에서 안전 처리",
    uploadTitle: "1. 파일 선택",
    clearAll: "비우기",
    dragDropText: "파일 드래그 또는 클릭하여 선택",
    dragDropSub: "사진 여러 장 일괄 선택 & EXIF 촬영일자 동시 변경 지원",
    dateSettingTitle: "2. 바꿀 날짜 지정",
    presetNow: "지금",
    presetYesterday: "어제",
    preset1WeekAgo: "-1주일",
    preset1MonthAgo: "-1개월",
    preset1YearAgo: "-1년",
    trackATitle: "⚡ 일반 파일 날짜 (OS)",
    trackADesc: "모든 파일 생성/수정일 + 사진 EXIF 촬영일 변경",
    trackBTitle: "✨ HWP / PPT 작성일 (Pro)",
    trackBDesc: "문서 내부 메타데이터 작성일자 변경",
    actionButton: "날짜 변경 및 다운로드",
    completeMsg: "완료 되었습니다!",
    processingMsg: "처리 중...",
    footerRights: "© 2026 NewFileDate. 100% 로컬 메모리 처리로 서버에 데이터가 저장되지 않습니다."
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
