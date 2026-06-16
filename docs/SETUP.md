# Setup Guide

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 18+ (tested on 22) | both frontend and backend |
| MongoDB | 6+ | local install or Atlas connection string |
| npm | bundled with Node | |

No Python, Docker, or external OCR API keys required — OCR runs in-process via Tesseract.js (WASM) and pdf-parse.

## 1. Clone & install

```bash
git clone https://github.com/het-vaghela-21/invoice-automation.git
cd invoice-automation

cd backend && npm install
cd ../frontend && npm install
```

## 2. Configure environment variables

```bash
cd backend
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | Backend HTTP port |
| `NODE_ENV` | `development` | `production` suppresses stack traces in error responses |
| `MONGODB_URI` | `mongodb://localhost:27017/invoice-automation` | Local Mongo or Atlas SRV string |
| `JWT_SECRET` | — | **Change this.** Any long random string. Tokens are signed with it. |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `FRONTEND_URL` | `http://localhost:5173` | Used for the CORS `origin` allow-list |

The frontend needs no `.env` — in dev, Vite proxies `/api` and `/uploads` to `http://localhost:5000` (`frontend/vite.config.js`); in production, the frontend is expected to be served from the same origin as the API (or behind a reverse proxy that routes `/api` and `/uploads` to the backend).

## 3. Start MongoDB

Any of:
- **Local install, default port**: just have `mongod` running (`mongodb://localhost:27017`).
- **Local install, custom data directory** (useful on Windows if the default drive has permission issues):
  ```bash
  mongod --dbpath "D:\invoice-automation\mongodb-data" --port 27017
  ```
- **MongoDB Atlas**: set `MONGODB_URI` to your cluster's SRV connection string — no local Mongo needed.

## 4. Seed sample data

Two seed scripts exist:

```bash
cd backend
node src/utils/seed-test.js   # recommended — full demo dataset (see below)
# or
npm run seed                  # node src/utils/seed.js — minimal seed
```

`seed-test.js` wipes Users/Vendors/PurchaseOrders/Invoices and creates:
- 1 admin user — **`admin@company.com` / `admin123`**
- 3 vendors with different `requiredFields` configurations (Acme Supplies — GST/India, TechCorp Solutions — USD, Global Services LLC — bank details)
- 9 purchase orders (3 per vendor)
- 5 invoices, one at each pipeline stage (`uploaded`, `ocr_extracted`, `pending_review`, `passed`, `review_required`) so the UI is populated end-to-end without manually walking every invoice through the pipeline yourself
- Synthetic PDF files generated with `pdfkit` and written to `backend/uploads/`

Re-run it any time to reset to a clean known state — it's destructive (`deleteMany({})` on all four collections) by design, so don't run it against a database with real data you want to keep.

## 5. Run the app

Two terminals:

```bash
# Terminal 1 — backend (http://localhost:5000)
cd backend
npm run dev        # nodemon, restarts on file change
# or: npm start     # plain node, no reload

# Terminal 2 — frontend (http://localhost:5173)
cd frontend
npm run dev
```

Open `http://localhost:5173` and log in with `admin@company.com` / `admin123`.

## 6. Run tests

```bash
cd backend
npm test
```

Covers `extractionService.js` (the regex field extractors — including regression tests for the real bugs documented in [ARCHITECTURE.md §5](./ARCHITECTURE.md#5-extraction-layer-backendsrcservicesextractionservicejs)) and `validationService.js` (the PO match-scoring algorithm). Both are pure functions with no DB dependency, so the suite runs in under a second with no MongoDB connection required.

## 7. Production build

```bash
cd frontend
npm run build       # outputs frontend/dist
npm run preview     # optional local sanity check of the build
```

Serve `frontend/dist` as static files (any static host or behind the same reverse proxy as the API), and run the backend with `NODE_ENV=production npm start`. There's no built-in process manager config (PM2/systemd) — bring your own for production process supervision.

## Troubleshooting

**`MongoDB connection error` / `MongoServerSelectionError`**
Mongo isn't running or `MONGODB_URI` is wrong. Confirm `mongod` is up and reachable on the host/port in your `.env`.

**`Error: Cannot find module '.../src/index.js'`**
The backend entry point is `server.js`, not `src/index.js`. Run `node server.js` (or `npm run dev`/`npm start`, which already point at the right file).

**Port already in use (5000 or 5173)**
Something else (often a previous unkilled dev server) is bound to the port.
```powershell
Stop-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess -Force
```
(swap `5000` for `5173` for the frontend)

**Login fails with "Invalid credentials" even with the documented demo password**
The `users` collection is empty — run a seed script (§4). This is the most common cause after a fresh Mongo data directory or a `deleteMany` reset.

**Currency/amount shows up wrong after OCR on a custom test invoice**
The regex extractors expect ASCII-renderable currency markers. If you're generating test PDFs with `pdfkit` and the default Helvetica font, avoid `₹` — it isn't in the WinAnsi encoding and gets mangled into garbage glyphs. Use `Rs.` instead, or embed a Unicode-capable font. See `backend/src/utils/seed-test.js` for a working example.

**Scanned PDF (image-only, no text layer) returns empty OCR text**
Expected limitation, not a bug — see [ARCHITECTURE.md §4](./ARCHITECTURE.md#4-ocr-layer-backendsrcservicesocrservicejs). `pdf-parse` only reads embedded text; there's no PDF-to-image rasterization step feeding into Tesseract yet.
