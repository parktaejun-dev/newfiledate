export type Language = 'en' | 'ko';

export interface TranslationDictionary {
  brandSubtitle: string;
  badgeFree: string;
  badgePro: string;
  heroBadge: string;
  heroHeadline1: string;
  heroHeadline2: string;
  heroSubtitle: string;
  uploadTitle: string;
  clearAll: string;
  dragDropText: string;
  dragDropSub: string;
  largeWarningTitle: string;
  largeWarningMsg: string;
  dateSettingTitle: string;
  dateLabel: string;
  dateClampingSub: string;
  secondsLabel: string;
  previewTitle: string;
  modeTitle: string;
  trackABadge: string;
  trackATitle: string;
  trackADesc: string;
  trackAInfo: string;
  trackBBadge: string;
  trackBTitle: string;
  trackBDesc: string;
  trackBInfo: string;
  actionButtonTrackA: string;
  actionButtonTrackB: string;
  processingMsg: string;
  footerRights: string;
  footerSub: string;
}

export const translations: Record<Language, TranslationDictionary> = {
  en: {
    brandSubtitle: "Online File Date & Timestamp Editor",
    badgeFree: "100% Free & Local Privacy",
    badgePro: "Pro Deep Metadata Standardizer",
    heroBadge: "NewFileTime Web Alternative · No Install",
    heroHeadline1: "Change File Modified Date & Creation Date,",
    heroHeadline2: "Instant Online File Timestamp Editor.",
    heroSubtitle: "Easily modify file timestamps in your browser (Track A) or standardize internal document metadata for HWP, PPTX, and DOCX files (Track B).",
    uploadTitle: "Select Files to Edit Date",
    clearAll: "Clear All",
    dragDropText: "Drag & drop files here or click to browse",
    dragDropSub: "Supports all file formats (ZIP, Images, HWP, PPTX, DOCX, etc.)",
    largeWarningTitle: "Large File Warning:",
    largeWarningMsg: "Files larger than 1GB may take longer to process in browser memory.",
    dateSettingTitle: "Target Date & Time Settings",
    dateLabel: "Select Target Date & Time",
    dateClampingSub: "* Allowed range clamping: 1980-01-01 to 2107-12-31",
    secondsLabel: "Seconds Selection (DOS 2-second snap)",
    previewTitle: "Final Applied Timestamp Preview",
    modeTitle: "Select Processing Mode",
    trackABadge: "Track A · Free Local",
    trackATitle: "Fast File Date Change (Local Browser)",
    trackADesc: "Overwrites file modified timestamps 100% locally in browser memory using JSZip. Zero server upload, complete privacy.",
    trackAInfo: "Modifies file 'Date Modified'. Seconds are snapped to 2-second intervals per ZIP specification.",
    trackBBadge: "Track B · Pro Deep Metadata",
    trackBTitle: "Deep Document Internal Metadata Change (Pro)",
    trackBDesc: "Overwrites hidden internal 'Creation Date' and 'Last Saved Date' inside HWP, PPTX, and DOCX files.",
    trackBInfo: "Standardizes hidden document properties for official submissions and corporate archives.",
    actionButtonTrackA: "Change File Date & Download ZIP",
    actionButtonTrackB: "Change Document Created Date & Download ZIP",
    processingMsg: "Processing files in progress...",
    footerRights: "© 2026 NewFileDate. All rights reserved.",
    footerSub: "NewFileDate - Online File Date & Timestamp Editor"
  },
  ko: {
    brandSubtitle: "무설치 파일 날짜 변경 & HWP·PPTX 메타데이터 툴",
    badgeFree: "100% 무료 로컬 처리",
    badgePro: "HWP·PPTX 만든 날짜 변경",
    heroBadge: "NewFileTime 완벽 대체 · 무설치 웹 에디션",
    heroHeadline1: "파일 수정한 날짜 & 문서 만든 날짜,",
    heroHeadline2: "NewFileDate로 클릭 한 번에 변경하세요.",
    heroSubtitle: "파일 이동으로 꼬여버린 수정한 날짜 변경부터 HWP 한글, PPTX, DOCX 문서 내부의 '문서 만든 날짜'까지 프로그램 설치 없이 온라인에서 빠르게 일괄 수정합니다.",
    uploadTitle: "변경할 파일 선택",
    clearAll: "전체 삭제",
    dragDropText: "날짜를 바꿀 파일을 드래그하거나 클릭하여 선택",
    dragDropSub: "HWP, PPTX, DOCX, ZIP, 사진, 이미지 등 모든 파일 지원",
    largeWarningTitle: "대용량 경고:",
    largeWarningMsg: "1GB 이상 파일 처리 시 브라우저 메모리 환경에 따라 처리 시간이 길어질 수 있습니다.",
    dateSettingTitle: "변경할 목표 날짜 및 시간 지정",
    dateLabel: "변경할 날짜 및 시간 선택",
    dateClampingSub: "* 선택 가능 범위: 1980년 1월 1일 ~ 2107년 12월 31일",
    secondsLabel: "초 단위 지정 (DOS 2초 간격 스냅)",
    previewTitle: "최종 적용 날짜 및 시간 미리보기",
    modeTitle: "날짜 변경 방식 선택 (무료 OS 변경 vs HWP/PPTX 만든 날짜 수정)",
    trackABadge: "Track A · 무설치 로컬",
    trackATitle: "빠른 파일 날짜 변경 (수정한 날짜 덮어쓰기)",
    trackADesc: "서버로 파일을 보낼 필요 없이 브라우저에서 파일의 수정한 날짜를 즉시 바꿔 ZIP 파일로 다운로드합니다. 100% 비밀보장.",
    trackAInfo: "'수정한 날짜'가 변경되며, ZIP 포맷 규격상 초 단위는 2초 간격으로 지정됩니다.",
    trackBBadge: "Track B · 문서 내부 수정 Pro",
    trackBTitle: "문서 내부 '문서 만든 날짜'까지 완전 변경 (Pro)",
    trackBDesc: "HWP 한글 문서, PPTX, DOCX 내부 속성에 숨겨진 '문서 만든 날짜'와 저장 날짜까지 한 번에 일괄 수정합니다.",
    trackBInfo: "중구난방 산출물의 내부 생성일/작성일을 완전히 표준화합니다.",
    actionButtonTrackA: "파일 날짜 변경 및 ZIP 다운로드",
    actionButtonTrackB: "HWP·PPTX 만든 날짜 변경 및 ZIP 다운로드",
    processingMsg: "파일 처리 진행 중...",
    footerRights: "© 2026 NewFileDate. All rights reserved.",
    footerSub: "NewFileDate - Online File Date & Timestamp Editor"
  }
};

/**
 * Detect user browser default language (defaults to 'en' unless 'ko' is detected)
 */
export function detectDefaultLanguage(): Language {
  if (typeof window !== 'undefined' && window.navigator) {
    const lang = window.navigator.language.toLowerCase();
    if (lang.startsWith('ko')) {
      return 'ko';
    }
  }
  return 'en';
}
