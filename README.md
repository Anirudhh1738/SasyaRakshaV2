# SasyaRaksha — Smart Plant Health, Multi-Image Crop & Soil Inspection System

**Problem Statement:** PS 01 — AI-Powered Smart Agriculture Disease Detection System  
**Production Stack:** React 19 + Vite + Express (Node.js) · Supabase PostgreSQL (`pg`) · Supabase Private Storage (`agriguard-images`) · Open-Meteo & OpenStreetMap · Render Free  

---

## Core Features

1. **Multi-Image & Multi-Angle Plant Disease Screening (`#scan-plant`)**:
   - Upload 1–8 plant photos (`Multiple Images`) or structured `Front View`, `Back View`, and `Close-up of Diseased Area` angles (`Individual Views`), plus live camera capture.
   - Automatic image quality validation, multi-image symptom consistency checking, lesion segmentation overlays (chlorosis + necrosis + affected leaf area %), and confidence scoring.
   - Simple explanations, root causes, and ICAR / TNAU / FAO / IRRI / USDA verified prevention & management treatments.
   - Optional soil photo inspection, symptom checklist, onset duration, and automatic Open-Meteo weather disease risk calculation.
2. **QR / PDF Field Passports & Complete History Reopening**:
   - Every screening saves a full persistent record in PostgreSQL and uploads original + lesion-highlighted images to private Supabase Storage (`agriguard-images`).
   - Clicking any saved report reopens the exact Combined Field Screening Result or shareable QR/PDF Field Passport.
3. **Plant Monitoring & Day-by-Day Recovery (`#plant-monitoring`)**:
   - Per-farmer isolated plant progression records, side-by-side scan comparison, Plotly spread charts, treatment application logs, and daily recovery tracking.
4. **Regional Outbreak Map & Role-Based Expert/Admin Portal (`#outbreak-map`, `#expert-portal`)**:
   - Privacy-rounded (~5 km) geographical outbreak clusters on Leaflet/OpenStreetMap.
   - Isolated Expert/Admin authentication, privacy-scrubbed verification queue, user role management, PostgreSQL JSON snapshot exports, and security audit logs.
5. **Multilingual & 3-Theme UI**:
   - Full **English**, **हिंदी**, and **ಕನ್ನಡ** translations with `Light`, `Dark`, and `AgriGlow` themes.

---

## Architecture Overview

- **Active Runtime (`server.ts`)**: Single Node.js + Express server serving both the `/api/*` backend and built Vite React frontend (`dist/`).
- **Database (`server/db.ts`)**: Asynchronous `pg` connection pool targeting **Supabase PostgreSQL** (`DATABASE_URL`), initialized with 18 normalized tables (`supabase/01_create_tables.sql`).
- **Private Image Storage (`server/storage.ts`)**: Stores uploaded leaf/soil photos and processed overlay PNGs in a **private** Supabase Storage bucket (`agriguard-images`), served safely through `/api/uploads/...` and signed URLs (`/api/uploads/signed-url`).
- **Optional Python AI Server (`python_backend/`)**: Stateless FastAPI PyTorch MobileNetV3 HTTP microservice (`PYTHON_AI_URL`). Falls back cleanly to built-in Jimp CV analysis (`server/vision.ts`) when not running.
- **Standalone Python API (`backend/`)**: Also updated to PostgreSQL (`DATABASE_URL` via SQLAlchemy + `psycopg`) for environments using the Python service directly.

---

## Quick Start (Windows / VS Code + Supabase + Render)

For complete beginner-friendly screenshots/click-by-click instructions (Windows PowerShell, VS Code, Supabase SQL Editor, Session Pooler vs Direct Connection, Storage bucket setup, SQLite migration, and Render Free deployment), see **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)**.

### Summary Commands

```powershell
# 1. Install dependencies
npm install

# 2. Configure .env from template (add Supabase DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET)
Copy-Item .env.example .env

# 3. Run supabase/01_create_tables.sql in Supabase SQL Editor (once)

# 4. Optional: Migrate existing SQLite database & local uploads/ images into Supabase
npx tsx scripts/migrate_sqlite_to_supabase.ts --sqlite ./agriguard.db --upload-images

# 5. Optional: Create an Expert or Admin account
npx tsx scripts/create_expert.ts admin@myfarm.org ChooseAStrongPassword "Admin User" admin
npx tsx scripts/create_expert.ts expert@myfarm.org ChooseAStrongPassword "Dr. Pathologist" expert

# 6. Run locally (port 3000)
npm run dev

# 7. Type-check and build for production
npm run lint
npm run build
```

Open `http://localhost:3000` in your browser.
