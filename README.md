# NewFileDate (Online File Date & Timestamp Editor)

> Change OS file dates, photo EXIF capture dates, and the creation dates stored inside HWP / PPTX / DOCX documents.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF.svg)](https://vite.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg)](https://fastapi.tiangolo.com)

---

## Two processing modes

| | File Date (OS) | HWP / PPT (Pro) |
|---|---|---|
| Where it runs | Your browser | Server |
| File leaves the device | **No** | **Yes** |
| Size limit | None | 4.5 MB per file (host payload cap) |
| Formats | Any | HWP, PPTX, DOCX, JPEG |

**File Date (OS)** builds the ZIP in browser memory with JSZip; nothing is transmitted.
**Pro** must upload the document because the target timestamps live inside the container.
Uploaded files exist only in memory for the duration of the request and are discarded once
the response is written — they are never persisted. The UI states which of the two applies
to the selected mode; see [privacy.html](frontend/public/privacy.html).

---

## Timestamp model

Two different kinds of timestamp are involved, and conflating them shifts every result:

- **Wall clock, no timezone** — ZIP/DOS entry dates and EXIF `DateTimeOriginal`.
  Written exactly as the user picked them.
- **UTC instant** — Windows FILETIME in the HWP summary stream and `dcterms:created`
  / `dcterms:modified` in OOXML.

The client sends the wall clock it displayed plus `tz_offset_minutes`
(the `Date.getTimezoneOffset()` convention), so the server derives both without
assuming any particular timezone.

Other format constraints:

- **DOS second snapping** — ZIP timestamps have two-second resolution, so seconds
  floor to an even value (`00`, `02`, ... `58`).
- **Range clamping** — `1980-01-01` to `2107-12-31`, the representable DOS range.
- **EXIF edits are confined to the APP1 segment**, never applied across the whole
  file, so entropy-coded image data cannot be corrupted.
- A photo carrying no EXIF timestamp is reported as skipped rather than silently
  counted as changed.

---

## Security posture

Track B accepts untrusted files from the public internet. The following are enforced
in `backend/`:

| Control | Where |
|---|---|
| Upload filenames stripped to a safe basename (no traversal) | `metadata_editor.sanitize_filename` |
| Duplicate names suffixed instead of overwritten | `metadata_editor.deduplicate_filename` |
| Decompression-bomb limits (entry count, entry size, total size, ratio) | `metadata_editor._assert_archive_safe` |
| Reads capped independently of self-reported ZIP sizes | `metadata_editor._read_entry_bounded` |
| Per-file / total / count upload limits | `main.py` |
| Extension allowlist | `main.py` |
| CORS restricted to known origins (`ALLOWED_ORIGINS` env var) | `main.py` |
| Generic error bodies; details only to logs | `main.py` |
| Best-effort per-instance rate limit, checked before any file is read | `main.py` |
| CSP (no `script-src 'unsafe-inline'`) and related headers | `vercel.json` |

### Rate limiting

`main.py` enforces 20 requests / 60s per client IP, rejected before any upload is
read. **This is per-instance.** A serverless platform runs many instances
concurrently, so a distributed flood still gets roughly `instances × limit`. It
reduces the cost of a sustained single-source flood; it is not a complete control.

For a real limit, add an edge rule — Vercel dashboard → project → **Firewall** →
*Custom Rules*: match `Path` starts with `/api/`, action **Rate Limit**, e.g. 30
requests per 60s keyed by IP. Edge rules run before the function is invoked, so
blocked requests cost nothing.

### Content Security Policy

`script-src` does **not** include `'unsafe-inline'`. The GA bootstrap lives in
`frontend/public/ga-init.js`, and the one remaining inline block (JSON-LD) is
allowlisted by sha256 hash in `vercel.json`.

Editing that JSON-LD changes its hash and the browser will silently block it, so
the hash is verified in CI:

```bash
cd frontend && npm run build && npm run csp:check   # verify
cd frontend && npm run csp:update                   # rewrite vercel.json
```

`style-src` still allows `'unsafe-inline'`: the UI uses React inline `style`
props, which are governed by that directive.

---

## Quick start

### Frontend
```bash
cd frontend
npm ci
npm run dev        # http://localhost:3000
```

### Backend
```bash
python3 -m venv backend/venv
source backend/venv/bin/activate
pip install -r backend/requirements.txt
python backend/main.py    # http://127.0.0.1:8000
```

### Tests
```bash
cd frontend && npm test          # vitest, jsdom
cd backend  && pytest -q         # pytest
```

### Regenerating the Open Graph image
```bash
pip install -r tools/requirements.txt
python3 tools/make_og_image.py
```

---

## Layout

```
api/index.py             Vercel entrypoint -> backend/main.py
api/requirements.txt     Serverless runtime deps (minimal)
backend/main.py          FastAPI routes, request limits, CORS
backend/metadata_editor.py  Format parsers and safety limits
backend/requirements.txt Dev + test deps
frontend/src/lib/timestamp.ts  Track A archive build, EXIF rewriting
tools/make_og_image.py   Regenerates frontend/public/og-image.png
```

---

## License

[MIT](LICENSE)
