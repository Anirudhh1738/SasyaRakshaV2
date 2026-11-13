# SasyaRaksha Deployment & Setup Guide
**Windows + VS Code · Supabase PostgreSQL · Supabase Storage (`agriguard-images`) · Render Free**

Follow every step below in exact order. No prior cloud deployment experience is needed.

---

## Step 1: Prepare Your Computer (Windows + VS Code)

1. Install **Node.js 22 LTS** from [https://nodejs.org](https://nodejs.org) (verify with `node -v` in VS Code Terminal).
2. Extract the SasyaRaksha project folder anywhere convenient (for example `C:\Projects\SasyaRaksha`).
3. Open **VS Code** → **File → Open Folder** → select the extracted `SasyaRaksha` folder.
4. Open the integrated terminal (**Ctrl + `** or **Terminal → New Terminal**, PowerShell recommended).
5. Install npm dependencies:
   ```powershell
   npm install
   ```

---

## Step 2: Create a Free Supabase Project & Database Tables

1. Go to [https://supabase.com](https://supabase.com) and sign in (GitHub sign-in works well).
2. Click **New Project**:
   - Choose a Project Name (e.g., `sasyaraksha`).
   - Create a strong **Database Password** (save it in a safe password manager; avoid `@`, `#`, `?`, `/` characters if possible so URL encoding isn't needed).
   - Pick the region closest to you (e.g., Mumbai `ap-south-1`).
   - Wait ~2 minutes for the database to finish provisioning.
3. Open **SQL Editor** in the left sidebar → click **New Query**.
4. In VS Code, open `supabase/01_create_tables.sql`, press **Ctrl+A** then **Ctrl+C**.
5. Paste into the Supabase SQL Editor and click **Run** (or press **Ctrl+Enter**).
   - You should see `Success. No rows returned`. All 18 tables, indexes, and Row Level Security protections are now created.
   - *(If you are upgrading an existing older database instead of a fresh project, also run `supabase/02_alter_existing_tables.sql` in SQL Editor.)*

---

## Step 3: Get the Correct Supabase `DATABASE_URL` (Session Pooler vs Direct)

**Important for Render Free:** Render Free instances use IPv4 networking. Supabase's *Direct Connection* (`db.<ref>.supabase.co:5432`) is often IPv6-only and can fail with `ENETUNREACH` or timeout errors on Render Free. Always use **Session Pooler**!

1. In Supabase Dashboard, click the **Connect** button at the top of your project.
2. Under **Connection String**, choose:
   - **Type:** `URI`
   - **Source:** `Primary Database`
   - **Method:** **Session pooler** (port `5432`, host looks like `aws-0-ap-south-1.pooler.supabase.com`)
3. Copy the URI and replace `[YOUR-PASSWORD]` with your Supabase Database Password:
   ```text
   postgresql://postgres.YOUR_PROJECT_REF:YOUR_DB_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
   ```

---

## Step 4: Create Private Supabase Storage Bucket (`agriguard-images`)

1. In Supabase left sidebar, click **Storage** → **New bucket**.
2. Set **Name** to:
   ```text
   agriguard-images
   ```
3. **Leave "Public bucket" OFF (unchecked)** — SasyaRaksha uses a **private** bucket and serves images securely through authenticated backend endpoints and short-lived signed URLs.
4. Click **Create bucket**.
5. Now go to **Project Settings** (gear icon at bottom-left) → **API** (or **Data API / API Keys**):
   - Copy **Project URL** (`https://YOUR_PROJECT_REF.supabase.co`) → this is `SUPABASE_URL`.
   - Copy **`service_role` secret key** → this is `SUPABASE_SERVICE_ROLE_KEY`.
   - **Security rule:** Never place `SUPABASE_SERVICE_ROLE_KEY` in `src/` or any `VITE_*` variable. Keep it only in `.env` (local) and Render Environment Variables (production).

---

## Step 5: Configure Local `.env` & Verify Locally

1. In VS Code Terminal, create `.env` from `.env.example`:
   ```powershell
   Copy-Item .env.example .env
   ```
2. Open `.env` and fill in your values:
   ```env
   PORT="3000"
   NODE_ENV="development"
   APP_URL="http://localhost:3000"

   DATABASE_URL="postgresql://postgres.YOUR_PROJECT_REF:YOUR_DB_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres"

   SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
   SUPABASE_SERVICE_ROLE_KEY="YOUR_SUPABASE_SERVICE_ROLE_KEY"
   SUPABASE_STORAGE_BUCKET="agriguard-images"

   SESSION_SECRET="replace-with-a-long-random-64-char-secret-string"
   ```
   *(You can generate a strong `SESSION_SECRET` in PowerShell with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)*.

3. **(Optional) Migrate Existing SQLite Data & Local Images:**  
   If you have an older `agriguard.db` file and `uploads/` folder from an earlier version:
   ```powershell
   # Optional dry run first to inspect row/image counts:
   npx tsx scripts/migrate_sqlite_to_supabase.ts --sqlite ./agriguard.db --dry-run

   # Run actual migration + upload local plant/soil/processed images to Supabase Storage:
   npx tsx scripts/migrate_sqlite_to_supabase.ts --sqlite ./agriguard.db --upload-images
   ```
   The script automatically creates a timestamped `.bak` copy of your `.db` file, inserts tables in foreign-key order safely (`ON CONFLICT DO NOTHING`), resets PostgreSQL ID sequences, and uploads local images cleanly.

4. **(Optional) Create Admin & Expert Accounts:**
   ```powershell
   npx tsx scripts/create_expert.ts admin@myfarm.org StrongAdminPass123 "System Admin" admin
   npx tsx scripts/create_expert.ts expert@myfarm.org StrongExpertPass123 "Dr. Agronomist" expert
   ```

5. Start the app locally:
   ```powershell
   npm run dev
   ```
   Visit `http://localhost:3000` and verify `http://localhost:3000/api/health` shows:
   - `"databaseConnected": true`
   - `"storage": { "configured": true, "bucket": "agriguard-images", "reachable": true, "mode": "supabase-private" }`

6. Run type-check & production build check:
   ```powershell
   npm run lint
   npm run build
   ```

---

## Step 6: Push Code to GitHub (Safely Without Secrets)

1. Verify `.gitignore` ignores `.env`, `node_modules/`, `dist/`, `*.db`, `*.bak`, and `uploads/`.
2. Commit and push your repository to GitHub (do **not** commit `.env`):
   ```powershell
   git init
   git add .
   git commit -m "Migrate SasyaRaksha to Supabase PostgreSQL + Private Storage"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/sasyaraksha.git
   git push -u origin main
   ```

---

## Step 7: Deploy on Render Free

### Option A: One-Click Blueprint (`render.yaml`)
1. Go to [https://dashboard.render.com](https://dashboard.render.com) → **New + → Blueprint**.
2. Connect your GitHub repository (`render.yaml` is automatically detected).
3. Fill in the prompted `sync: false` environment variables:
   - `DATABASE_URL` (your Supabase **Session Pooler** URI)
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_URL` (set to your Render URL, e.g., `https://sasyaraksha.onrender.com`, right after the first service URL is created)
   - Optional: `GEMINI_API_KEY` or `PYTHON_AI_URL`
4. Click **Apply**.

### Option B: Manual Web Service
1. Render Dashboard → **New + → Web Service** → connect your GitHub repo.
2. Configure:
   - **Runtime:** `Node`
   - **Branch:** `main`
   - **Plan:** `Free`
   - **Build Command:** `npm install --include=dev && npm run build`
   - **Start Command:** `npm run start`
   - **Health Check Path:** `/api/health`
3. Add **Environment Variables**:
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = *(Supabase Session Pooler URI)*
   - `SUPABASE_URL` = *(Supabase Project URL)*
   - `SUPABASE_SERVICE_ROLE_KEY` = *(Supabase Service Role key)*
   - `SUPABASE_STORAGE_BUCKET` = `agriguard-images`
   - `SESSION_SECRET` = *(64+ char random string)*
   - `APP_URL` = `https://YOUR-SERVICE-NAME.onrender.com`
4. Click **Create Web Service**.

### Post-Deploy Verification
- Open `https://YOUR-SERVICE-NAME.onrender.com/api/health` and confirm `status: "ok"`, `databaseConnected: true`, and `storage.reachable: true`.
- Sign in / register a test farmer account, upload a leaf photo in **Scan Plant**, refresh the page, and reopen the report from **Plant Monitoring** or **Field Passport** to confirm both PostgreSQL persistence and private Supabase Storage image loading work end-to-end.

---

## Troubleshooting Checklist

| Symptom | Cause | Fix |
|---|---|---|
| `ENETUNREACH` or DB connection timeout on Render | Using Supabase Direct host (`db.*.supabase.co`) over IPv4 | Switch `DATABASE_URL` to Supabase **Session Pooler** (`aws-0-*.pooler.supabase.com:5432`) |
| `SELF_SIGNED_CERT_IN_CHAIN` or SSL error | Local SSL verification rejection | Ensure `DATABASE_SSL` is not set to `false` for Supabase; `server/db.ts` auto-enables `{ rejectUnauthorized: false }` for Supabase hosts |
| Uploaded images return `404` or `500` in production | Missing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, or bucket name mismatch | Confirm private bucket is named `agriguard-images` (`SUPABASE_STORAGE_BUCKET=agriguard-images`) and service role key is valid |
| Build fails on Render (`vite: not found` or `tsx: not found`) | `NODE_ENV=production` skips `devDependencies` if plain `npm install` runs | Use `npm install --include=dev && npm run build` (already set in `render.yaml`) |
| CORS error after deploy | `APP_URL` mismatch | Set `APP_URL` to your exact `https://...onrender.com` URL without trailing slash |
| First page load after idle takes 30–50s on Render Free | Normal Render Free cold-start spin-down | Wait ~40s on initial wake-up; subsequent requests are fast |
