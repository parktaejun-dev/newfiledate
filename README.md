# NewFileDate (Online File Date & Timestamp Editor)

> **Online File Date & Timestamp Editor with HWP / PPTX / DOCX Deep Metadata Standardization**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18+-61DAFB.svg)](https://reactjs.org)
[![Vite](https://img.shields.io/badge/Vite-5+-646CFF.svg)](https://vitejs.dev)

**NewFileDate** is a web-based utility designed to solve lost file modified timestamps during cloud sync/transfers and standardize internal document metadata (creation dates, modified dates) inside HWP (OLE), PPTX, and DOCX files.

---

## ✨ Features

- **Track A (100% Free & Local Privacy)**:
  - Overwrites OS file modified timestamps directly in browser memory using **JSZip**.
  - **Zero Server Uploads**: Complete privacy for sensitive personal or corporate files.
  - **DOS Timestamp Snapping**: Snaps seconds to 2-second even intervals (`00`, `02`, `04` ... `58`) per ZIP specification.
  - **Date Clamping**: Restricts dates within `1980-01-01` to `2107-12-31`.

- **Track B (Pro Deep Document Metadata Standardizer)**:
  - **HWP (OLE Compound Storage)**: Parses and in-place overwrites `\x05HwpSummaryInformation` stream Property IDs 11 (Last Printed), 12 (Created Date), and 13 (Last Saved Date) 64-bit Windows FILETIME values.
  - **OOXML (DOCX / PPTX)**: Updates Dublin Core metadata (`dcterms:created`, `dcterms:modified`) inside `docProps/core.xml`.
  - **ZIP Packaging**: Retains modified OS timestamps on extraction.

- **Internationalization (i18n)**:
  - Automatic browser language detection (`en` English default, `ko` Korean support).
  - Instant header language switcher toggle (`EN | KO`).

- **Deployable Anywhere**:
  - One-click deployment on **Vercel** via Static Host + Python Serverless Function (`api/index.py`).

---

## 🛠️ Architecture & Tech Stack

- **Frontend**: React, TypeScript, Vite, Tailwind CSS, JSZip, Lucide Icons
- **Backend**: FastAPI, `olefile>=0.47`, `python-docx`, `python-pptx`, Uvicorn, Pytest
- **Deployment**: Vercel (`vercel.json`)

---

## 🚀 Quick Start (Local Development)

### 1. Clone & Install Frontend
```bash
cd frontend
npm install
npm run dev
```

### 2. Setup Backend Virtual Environment
```bash
python3 -m venv backend/venv
source backend/venv/bin/activate
pip install -r backend/requirements.txt
python backend/main.py
```

### 3. Run Tests
```bash
./backend/venv/bin/pytest backend/test_backend.py -v
```

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
