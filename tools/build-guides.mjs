#!/usr/bin/env node
/**
 * Generate the static intent-landing pages (/q/<slug>/ and /en/q/<slug>/)
 * plus the XML sitemap, from frontend/content/guides.json.
 *
 * One search question = one page. Each page leads with a direct answer,
 * then evidence (steps/tables), a visible FAQ that mirrors its FAQPage
 * JSON-LD, related-question links, and a link back to the tool at /.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'frontend/dist');
const CONTENT = resolve(ROOT, 'frontend/content/guides.json');
const BASE = 'https://www.newfiledate.com';
const LANGS = ['ko', 'en'];

const data = JSON.parse(readFileSync(CONTENT, 'utf8'));

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const langPrefix = (lang) => (lang === 'en' ? '/en' : '');
const homeUrl = (lang) => `${BASE}${langPrefix(lang)}/`;
const guideUrl = (lang, slug) => `${BASE}${langPrefix(lang)}/q/${slug}/`;
const indexUrl = (lang) => `${BASE}${langPrefix(lang)}/q/`;

const slugs = Object.keys(data.guides);

const STYLE = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Space Grotesk', system-ui, -apple-system, sans-serif;
    background: #ffffff; color: #09090b; line-height: 1.6;
    background-image: linear-gradient(to right, #f1f5f9 1px, transparent 1px),
      linear-gradient(to bottom, #f1f5f9 1px, transparent 1px);
    background-size: 24px 24px;
  }
  .wrap { max-width: 720px; margin: 0 auto; padding: 0 16px 48px; }
  header.bar {
    border-bottom: 2px solid #09090b; background: #fff;
    padding: 10px 16px; display: flex; align-items: center; gap: 8px;
    font-weight: 800; font-size: 1.05rem; letter-spacing: -0.03em;
  }
  header.bar .logo {
    background: #09090b; color: #fff; border-radius: 5px;
    padding: 4px 6px; font-size: 0.8rem; text-decoration: none;
  }
  header.bar a.brand { color: #09090b; text-decoration: none; }
  nav.crumb { font-size: 0.75rem; color: #64748b; font-weight: 700; margin: 14px 0 6px; }
  nav.crumb a { color: #2563eb; text-decoration: none; }
  h1 { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.03em; margin: 4px 0 12px; }
  .answer {
    background: #ecfdf5; border: 2px solid #09090b; border-radius: 8px;
    box-shadow: 3px 3px 0 #09090b; padding: 12px 14px;
    font-size: 0.95rem; font-weight: 700; margin-bottom: 14px;
  }
  .answer .lbl { font-size: 0.68rem; color: #059669; display: block; margin-bottom: 2px; letter-spacing: 0.04em; }
  a.cta {
    display: block; text-align: center; text-decoration: none;
    background: #2563eb; color: #fff; border: 2px solid #09090b;
    border-radius: 8px; box-shadow: 3px 3px 0 #09090b;
    font-weight: 800; font-size: 0.95rem; padding: 10px 14px; margin-bottom: 8px;
  }
  .cta-sub { text-align: center; font-size: 0.72rem; color: #64748b; font-weight: 700; margin-bottom: 24px; }
  section { margin-bottom: 22px; }
  h2 { font-size: 1.05rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 8px; }
  section p { font-size: 0.88rem; color: #334155; margin-bottom: 8px; }
  ol.steps { padding-left: 20px; font-size: 0.88rem; color: #334155; }
  ol.steps li { margin-bottom: 5px; }
  table {
    width: 100%; border-collapse: collapse; font-size: 0.8rem;
    border: 2px solid #09090b; background: #fff; box-shadow: 3px 3px 0 #09090b;
  }
  th, td { border: 1.5px solid #09090b; padding: 7px 9px; text-align: left; }
  th { background: #f1f5f9; font-weight: 800; }
  details {
    background: #fff; border: 1.5px solid #09090b; border-radius: 6px;
    box-shadow: 2px 2px 0 #09090b; padding: 8px 10px; margin-bottom: 6px;
  }
  summary { font-weight: 800; font-size: 0.85rem; cursor: pointer; }
  details p { font-size: 0.8rem; color: #475569; margin-top: 6px; }
  ul.related { list-style: none; display: flex; flex-direction: column; gap: 6px; }
  ul.related a {
    display: block; background: #fff; border: 1.5px solid #09090b; border-radius: 6px;
    box-shadow: 2px 2px 0 #09090b; padding: 8px 10px; font-size: 0.85rem;
    font-weight: 700; color: #2563eb; text-decoration: none;
  }
  .meta-date { font-size: 0.72rem; color: #94a3b8; font-weight: 700; margin-top: 28px; }
  footer.bar {
    border-top: 2px solid #09090b; background: #fff; margin-top: 40px;
    padding: 10px 16px; font-size: 0.72rem; font-weight: 700; color: #64748b;
    display: flex; gap: 12px; justify-content: center;
  }
  footer.bar a { color: #2563eb; text-decoration: none; font-weight: 800; }
`;

function headTags({ title, desc, koUrl, enUrl, lang, ld }) {
  const canonical = lang === 'en' ? enUrl : koUrl;
  return `<!doctype html>
<html lang="${data.labels[lang].htmlLang}">
<head>
  <meta charset="UTF-8" />
  <link rel="shortcut icon" href="/favicon.ico" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonical}" />
  <link rel="alternate" hreflang="ko" href="${koUrl}" />
  <link rel="alternate" hreflang="en" href="${enUrl}" />
  <link rel="alternate" hreflang="x-default" href="${koUrl}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:site_name" content="NewFileDate" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
  <style>${STYLE}</style>
  <script type="application/ld+json">
${ld}
  </script>
</head>`;
}

function chrome({ lang, inner }) {
  const L = data.labels[lang];
  const prefix = langPrefix(lang);
  return `${inner}
<footer class="bar">
  <a href="${prefix}/">${L.brand}</a>
  <a href="${indexUrl(lang)}">${L.guides}</a>
  <a href="/privacy.html?lang=${lang}">${L.privacy}</a>
</footer>`;
}

function headerBar(lang) {
  const L = data.labels[lang];
  return `<header class="bar"><span class="logo">🕘</span><a class="brand" href="${langPrefix(lang)}/">${L.brand}</a><span style="font-size:0.72rem;color:#64748b;font-weight:700">${L.tagline}</span></header>`;
}

function renderSections(sections) {
  return (sections ?? [])
    .map((s) => {
      let out = `<section><h2>${esc(s.h)}</h2>`;
      for (const p of s.paras ?? []) out += `<p>${esc(p)}</p>`;
      if (s.list?.length) {
        out += '<ol class="steps">' + s.list.map((i) => `<li>${esc(i)}</li>`).join('') + '</ol>';
      }
      if (s.table) {
        out += '<table><thead><tr>' + s.table.head.map((h) => `<th>${esc(h)}</th>`).join('') + '</tr></thead><tbody>';
        for (const row of s.table.rows) out += '<tr>' + row.map((c) => `<td>${esc(c)}</td>`).join('') + '</tr>';
        out += '</tbody></table>';
      }
      return out + '</section>';
    })
    .join('\n');
}

function faqLd(faq) {
  return {
    '@type': 'FAQPage',
    mainEntity: (faq ?? []).map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

function breadcrumbLd(lang, items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

let pageCount = 0;

function writePage(relPath, html) {
  const out = join(DIST, relPath);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  pageCount++;
}

// ---------- guide pages ----------
for (const slug of slugs) {
  const guide = data.guides[slug];
  for (const lang of LANGS) {
    const g = guide[lang];
    if (!g) continue;
    const L = data.labels[lang];
    const canonical = guideUrl(lang, slug);
    const ld = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        faqLd(g.faq),
        breadcrumbLd(lang, [
          { name: L.home, url: homeUrl(lang) },
          { name: L.guides, url: indexUrl(lang) },
          { name: g.q, url: canonical },
        ]),
      ],
    }, null, 2);

    const faqHtml = (g.faq ?? [])
      .map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`)
      .join('\n');
    const relatedHtml = (g.related ?? [])
      .filter((r) => data.guides[r]?.[lang])
      .map((r) => `<li><a href="${guideUrl(lang, r)}">${esc(data.guides[r][lang].q)}</a></li>`)
      .join('');

    const body = `<body>
${headerBar(lang)}
<div class="wrap">
  <nav class="crumb"><a href="${langPrefix(lang)}/">${L.home}</a> › <a href="${indexUrl(lang)}">${L.guides}</a> › ${esc(g.q)}</nav>
  <h1>${esc(g.q)}</h1>
  <div class="answer"><span class="lbl">${L.answerLabel}</span>${esc(g.answer)}</div>
  <a class="cta" href="${langPrefix(lang)}/">${L.cta} →</a>
  <p class="cta-sub">${L.ctaSub}</p>
  ${renderSections(g.sections)}
  ${faqHtml ? `<section><h2>${L.faq}</h2>${faqHtml}</section>` : ''}
  ${relatedHtml ? `<section><h2>${L.related}</h2><ul class="related">${relatedHtml}</ul></section>` : ''}
  <p class="meta-date">${L.updatedLabel}: ${guide.updated}</p>
</div>`;

    writePage(
      join(langPrefix(lang).slice(1), 'q', slug, 'index.html'),
      `${headTags({ title: `${g.q} — NewFileDate`, desc: g.desc, koUrl: guideUrl('ko', slug), enUrl: guideUrl('en', slug), lang, ld })}\n${chrome({ lang, inner: body })}\n</body>\n</html>\n`
    );
  }
}

// ---------- guide index pages ----------
for (const lang of LANGS) {
  const L = data.labels[lang];
  const canonical = indexUrl(lang);
  const items = slugs
    .filter((s) => data.guides[s][lang])
    .map((s) => `<li><a href="${guideUrl(lang, s)}">${esc(data.guides[s][lang].q)}</a></li>`)
    .join('');
  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        itemListElement: slugs
          .filter((s) => data.guides[s][lang])
          .map((s, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: data.guides[s][lang].q,
            url: guideUrl(lang, s),
          })),
      },
      breadcrumbLd(lang, [
        { name: L.home, url: homeUrl(lang) },
        { name: L.guides, url: canonical },
      ]),
    ],
  }, null, 2);
  const body = `<body>
${headerBar(lang)}
<div class="wrap">
  <nav class="crumb"><a href="${langPrefix(lang)}/">${L.home}</a> › ${L.guides}</nav>
  <h1>${L.indexH1}</h1>
  <p style="font-size:0.85rem;color:#475569;margin-bottom:16px">${esc(L.guidesDesc)}</p>
  <ul class="related">${items}</ul>
</div>`;
  writePage(
    join(langPrefix(lang).slice(1), 'q', 'index.html'),
    `${headTags({ title: `${L.indexH1} — NewFileDate`, desc: L.guidesDesc, koUrl: indexUrl('ko'), enUrl: indexUrl('en'), lang, ld })}\n${chrome({ lang, inner: body })}\n</body>\n</html>\n`
  );
}

// ---------- sitemap ----------
const entries = [
  { loc: `${BASE}/`, lastmod: data.siteUpdated, changefreq: 'weekly', priority: '1.0' },
  { loc: `${BASE}/en/`, lastmod: data.siteUpdated, changefreq: 'weekly', priority: '0.9' },
  { loc: `${BASE}/privacy.html`, lastmod: data.privacyUpdated, changefreq: 'monthly', priority: '0.3' },
  { loc: indexUrl('ko'), lastmod: data.siteUpdated, changefreq: 'weekly', priority: '0.6' },
  { loc: indexUrl('en'), lastmod: data.siteUpdated, changefreq: 'weekly', priority: '0.6' },
];
for (const slug of slugs) {
  for (const lang of LANGS) {
    if (!data.guides[slug][lang]) continue;
    entries.push({
      loc: guideUrl(lang, slug),
      lastmod: data.guides[slug].updated,
      changefreq: 'monthly',
      priority: '0.7',
    });
  }
}

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) => `  <url>
    <loc>${e.loc}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;
writeFileSync(join(DIST, 'sitemap.xml'), sitemap);

console.log(`✓ Generated ${pageCount} guide/index pages + sitemap (${entries.length} URLs)`);
