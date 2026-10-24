#!/usr/bin/env node
/**
 * Verify that every inline <script> in the built HTML is allowlisted by a
 * sha256 hash in the vercel.json Content-Security-Policy.
 *
 * The CSP forbids 'unsafe-inline' for scripts, so an inline block that is not
 * hashed will be silently blocked by the browser at runtime. Editing the
 * JSON-LD in index.html changes its hash, and without this check the breakage
 * would only surface in production. CI runs it after the build.
 *
 * Usage:
 *   node tools/check-csp-hashes.mjs           # verify
 *   node tools/check-csp-hashes.mjs --write   # update vercel.json in place
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = resolve(ROOT, 'frontend/dist');
const VERCEL_PATH = resolve(ROOT, 'vercel.json');

const write = process.argv.includes('--write');

function* walkHtml(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkHtml(p);
    else if (entry.name.endsWith('.html')) yield p;
  }
}

let htmlFiles;
try {
  htmlFiles = [...walkHtml(DIST_DIR)];
} catch {
  console.error(`✗ ${DIST_DIR} not found — run "npm run build" in frontend/ first.`);
  process.exit(1);
}

// Inline blocks only: anything with a src= attribute is covered by host rules.
const expectedMap = new Map();
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const rel = relative(DIST_DIR, file);
  for (const [, attrs, body] of html.matchAll(/<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
    const hash = `sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`;
    if (!expectedMap.has(hash)) expectedMap.set(hash, { attrs: attrs.trim() || '(no attributes)', files: [] });
    expectedMap.get(hash).files.push(rel);
  }
}
const expected = [...expectedMap.entries()].map(([hash, info]) => ({ hash, ...info }));

const vercelRaw = readFileSync(VERCEL_PATH, 'utf8');
const vercel = JSON.parse(vercelRaw);

const cspEntry = vercel.headers
  ?.flatMap((rule) => rule.headers ?? [])
  .find((header) => header.key.toLowerCase() === 'content-security-policy');

if (!cspEntry) {
  console.error('✗ No Content-Security-Policy header found in vercel.json.');
  process.exit(1);
}

if (/script-src[^;]*'unsafe-inline'/.test(cspEntry.value)) {
  console.error("✗ script-src still contains 'unsafe-inline' — hashes provide no protection.");
  process.exit(1);
}

const missing = expected.filter((script) => !cspEntry.value.includes(script.hash));

if (missing.length === 0) {
  console.log(`✓ All ${expected.length} inline script block(s) across ${htmlFiles.length} HTML file(s) are allowlisted by hash.`);
  for (const script of expected) console.log(`    ${script.hash}  ${script.files.join(', ')}`);
  process.exit(0);
}

if (!write) {
  console.error(`✗ ${missing.length} inline script block(s) are NOT allowlisted:\n`);
  for (const script of missing) {
    console.error(`    ${script.files.join(', ')}`);
    console.error(`    needs: ${script.hash}\n`);
  }
  console.error('Run: node tools/check-csp-hashes.mjs --write');
  process.exit(1);
}

// --write: replace the existing hash set in script-src with the current one.
const hashList = expected.map((script) => `'${script.hash}'`).join(' ');
cspEntry.value = cspEntry.value.replace(
  /(script-src\s+)((?:'sha256-[^']+'\s*)*)/,
  (_match, prefix) => `${prefix}${hashList} `
);

writeFileSync(VERCEL_PATH, `${JSON.stringify(vercel, null, 2)}\n`);
console.log(`✓ Updated vercel.json with ${expected.length} hash(es).`);
for (const script of expected) console.log(`    ${script.hash}  ${script.attrs}`);
