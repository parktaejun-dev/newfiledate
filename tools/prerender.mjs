#!/usr/bin/env node
/**
 * Inject a build-time rendered copy of the app into dist/index.html (Korean)
 * and dist/en/index.html (English) so crawlers and no-JS visitors receive
 * real content instead of an empty <div id="root">.
 *
 * The client bundle still mounts on #root and removes #ssr-fallback
 * (see src/main.tsx), so interactive users see no duplication.
 *
 * Also injects a FAQPage JSON-LD block generated from the same translation
 * strings, and rewrites head meta for the English page.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'frontend/dist');
const SSR_ENTRY = resolve(ROOT, 'frontend/dist-ssr/entry-server.js');

const { render, faqJsonLd } = await import(pathToFileURL(SSR_ENTRY).href);

const EN_META = {
  title: 'NewFileDate | Change File Dates & Photo EXIF / HWP Document Dates',
  description:
    'Free no-install file date changer. Standard mode runs entirely in your browser — files never leave your device. Change created/modified dates, photo EXIF capture dates, and HWP·PPTX document creation dates.',
  ogTitle: 'NewFileDate | File Date Changer & EXIF Capture Date Editor',
  ogDescription:
    'No-install web tool. Standard file-date changes run entirely in your browser. Batch edit created/modified dates, photo EXIF capture dates, and HWP/PPTX document dates.',
};

const BASE = 'https://www.newfiledate.com';

function mustReplace(html, find, replace, label) {
  const found = find instanceof RegExp ? find.test(html) : html.includes(find);
  if (!found) {
    throw new Error(`prerender: expected markup not found (${label}): ${String(find).slice(0, 80)}`);
  }
  return html.replace(find, replace);
}

function injectPage(html, lang, appHtml) {
  html = mustReplace(
    html,
    '<div id="root"></div>',
    `<div id="root"></div>\n    <div id="ssr-fallback" lang="${lang}">${appHtml}</div>`,
    'root'
  );
  const ld = `<script type="application/ld+json">\n    ${faqJsonLd(lang)}\n    </script>`;
  return mustReplace(html, '</head>', `    ${ld}\n  </head>`, 'head');
}

let indexHtml = readFileSync(resolve(DIST, 'index.html'), 'utf8');

// Korean page — the primary locale the document already declares.
writeFileSync(resolve(DIST, 'index.html'), injectPage(indexHtml, 'ko', render('ko')));

// English page at /en/ — same document with head meta rewritten.
let en = injectPage(indexHtml, 'en', render('en'));
en = mustReplace(en, '<html lang="ko">', '<html lang="en">', 'html lang');
en = mustReplace(
  en,
  /<title>[^<]*<\/title>/,
  `<title>${EN_META.title}</title>`,
  'title'
);
en = mustReplace(
  en,
  /<meta name="title" content="[^"]*" \/>/,
  `<meta name="title" content="${EN_META.title}" />`,
  'meta title'
);
en = mustReplace(
  en,
  /<meta name="description" content="[^"]*" \/>/,
  `<meta name="description" content="${EN_META.description}" />`,
  'meta description'
);
en = mustReplace(
  en,
  '<meta property="og:url" content="https://www.newfiledate.com/" />',
  '<meta property="og:url" content="https://www.newfiledate.com/en/" />',
  'og:url'
);
en = mustReplace(
  en,
  /<meta property="og:title" content="[^"]*" \/>/,
  `<meta property="og:title" content="${EN_META.ogTitle}" />`,
  'og:title'
);
en = mustReplace(
  en,
  /<meta property="og:description" content="[^"]*" \/>/,
  `<meta property="og:description" content="${EN_META.ogDescription}" />`,
  'og:description'
);
en = mustReplace(
  en,
  '<meta property="og:locale" content="ko_KR" />',
  '<meta property="og:locale" content="en_US" />',
  'og:locale'
);
en = mustReplace(
  en,
  '<meta property="twitter:url" content="https://www.newfiledate.com/" />',
  '<meta property="twitter:url" content="https://www.newfiledate.com/en/" />',
  'twitter:url'
);
en = mustReplace(
  en,
  `<link rel="canonical" href="${BASE}/" />`,
  `<link rel="canonical" href="${BASE}/en/" />`,
  'canonical'
);
// The WebApplication JSON-LD description is Korean; swap it for English so the
// structured data matches the page language.
en = mustReplace(
  en,
  '"description": "무설치 웹 전용 파일 날짜 변경 도구. 파일 생성일/수정한 날짜 변경, 사진 EXIF 촬영일자 및 HWP 한글, PPTX 문서 내부의 작성일 일괄 수정."',
  `"description": "${EN_META.description}"`,
  'ld description'
);

mkdirSync(resolve(DIST, 'en'), { recursive: true });
writeFileSync(resolve(DIST, 'en/index.html'), en);

console.log('✓ Prerendered ko → dist/index.html, en → dist/en/index.html');
