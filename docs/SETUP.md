# Setup Guide

For the full startup reference (all services, production commands, fallback behaviour) see [`RUNNING.md`](../RUNNING.md).

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 18+ (tested on 22) | Backend and frontend |
| MongoDB | 6+ | Local install or Atlas connection string |
| npm | Bundled with Node | |
| Python + pip | 3.9+ | Only needed for the ML service (optional) |
| Redis | 7+ | Only needed for the job queue (optional) |
| Poppler | Any | Only needed for the ML service on Windows to convert PDFs to images |

The minimum to run the app is **Node.js + MongoDB**. OCR runs in-process via Tesseract.js and pdf-parse — no external OCR API keys or paid services required.

---

## 1. Clone and install

```bash
git clone https://github.com/het-vaghela-21/invoice-automation.git
cd invoice-automation

cd backend && npm install
cd ../frontend && npm install
```

---

## 2. Configure environment variables

```bash
cd backend
cp .env.example .env
```

Open `.env` and set at minimum:

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | — | **Required — change this.** Any long random string. |
| `MONGODB_URI` | `mongodb://localhost:27017/invoice-automation` | Local Mongo or Atlas SRV string |
| `PORT` | `5000` | Backend HTTP port |
| `NODE_ENV` | `development` | Set to `production` to suppress stack traces in error responses |
| `FRONTEND_URL` | `http://localhost:5173` | CORS allowed origin |
| `ML_SERVICE_URL` | `http://localhost:8000` | Python ML service URL (optional) |
| `ML_SERVICE_TIMEOUT_MS` | `8000` | ML call timeout in ms (except `/extract` which uses 60 s) |

**Optional services** (all have graceful fallback — the app works without them):

| Variable | Default | Description |
|---|---|---|
| `STORAGE_BACKEND` | `local` | `local` = disk; `minio` = MinIO object store |
| `MINIO_ENDPOINT` | `127.0.0.1` | MinIO server host |
| `MINIO_PORT` | `9000` | MinIO S3 API port |
| `MINIO_ACCESS_KEY` | `minioadmin` | MinIO access key |
| `MINIO_SECRET_KEY` | `minioadmin` | MinIO secret key |
| `MINIO_BUCKET` | `invoices` | Bucket name (created automatically on startup) |
| `QUEUE_ENABLED` | `true` | Set to `false` to force inline processing even if Redis is up |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection URL for BullMQ |
| `RUN_WORKER_INLINE` | `false` | `true` runs the BullMQ worker inside the API process (single-machine dev shortcut) |
| `WORKER_CONCURRENCY` | `5` | Jobs a single worker processes concurrently |
| `MONGO_POOL_SIZE` | `100` | MongoDB `maxPoolSize` per process |
| `RATE_LIMIT_UPLOAD` | `10` | Max invoice uploads per IP per minute |
| `RATE_LIMIT_API` | `200` | Max API requests per IP per minute |

The frontend needs no `.env` — in dev, Vite proxies `/api` and `/uploads` to `http://localhost:5000` (`frontend/vite.config.js`). In production, serve the frontend build behind Nginx (see [`deploy/README.md`](../deploy/README.md)).

---

## 3. Start MongoDB

Any of:

```bash
# Local install, default port
mongod

# Local install, custom data directory (useful on Windows)
mongod --dbpath "D:\invoice-automation\mongodb-data" --port 27017
```

Or use **MongoDB Atlas**: set `MONGODB_URI` to your cluster's SRV connection string — no local Mongo needed.

---

## 4. Seed sample data

```bash
cd backend
node src/utils/seed-test.js   # recommended — full demo dataset
# or: npm run seed             # minimal seed (no demo invoices)
```

`seed-test.js` wipes and recreates:
- 1 admin + 1 accountant + 1 viewer user
- 3 vendors with different `requiredFields` configurations
- 9 purchase orders (3 per vendor)
- 5 invoices, one at each pipeline stage (`uploaded`, `ocr_extracted`, `pending_review`, `passed`, `review_required`)
- Synthetic PDF files written to `backend/uploads/`

Re-run any time to reset to a known clean state. **Destructive** — don't run against a database with real data.

For load/stress testing:

```bash
node src/utils/seed-load.js    # 1k users, 50 vendors, 2k POs, 5k invoices (~10 s)
node src/utils/seed-stress.js  # 12 invoices covering all 6 statuses + edge cases
```

---

## 5. Run the app

**Development** (two terminals):

```bash
# Terminal 1 — backend
cd backend
npm run dev        # nodemon, restarts on file change

# Terminal 2 — frontend
cd frontend
npm run dev
```

Open `http://localhost:5173` and log in with `admin@company.com` / `admin123`.

**Optional — ML service** (layout-aware extraction, semantic vendor matching, anomaly scoring):

```bash
cd ml-service
pip install -r requirements.txt
# Place model files in ml-service/models/ and ml-service/layoutlmv3_invoice/
# See RUNNING.md §1 for the full model file list
uvicorn main:app --host 0.0.0.0 --port 8000
```

If the ML service isn't running, the backend logs `ML service unavailable, falling back to regex extraction` and continues normally.

**Optional — Redis + BullMQ worker** (background processing for scale):

```bash
# Start Redis
docker run -p 6379:6379 redis
# or: redis-server

# Start the background worker (separate terminal)
cd backend
npm run worker
```

Without Redis, OCR and matching run synchronously in the API process — identical result, just slower under concurrent load.

Full startup reference for all services: [`RUNNING.md`](../RUNNING.md).

---

## 6. Run tests

```bash
cd backend
npm test
```

30 Jest unit tests covering `extractionService.js` (regex field extractors, including regression tests for real bugs found during development) and `validationService.js` (PO match-scoring formula, severity thresholds). Both are pure functions — the suite runs in under a second with no MongoDB or network connection required.

---

## 7. Production build and deployment

```bash
# Build the frontend
cd frontend
npm run build     # outputs frontend/dist
```

For production, use PM2 to manage the backend and workers, and Nginx as the reverse proxy:

```bash
# Install PM2
npm install -g pm2

# Start API + workers
cd backend
pm2 start ecosystem.config.js --env production

# Nginx
sudo cp deploy/nginx/invoice-automation.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/invoice-automation.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Full production topology, MinIO setup, and scaling guide: [`deploy/README.md`](../deploy/README.md).

---

## Troubleshooting

**`MongoDB connection error` / `MongoServerSelectionError`**
Mongo isn't running or `MONGODB_URI` is wrong. Confirm `mongod` is up and reachable at the configured host/port.

**`Error: Cannot find module '.../src/index.js'`**
The backend entry point is `server.js`, not `src/index.js`. Use `npm run dev` or `npm start` — both point at the correct file.

**Port already in use (5000 or 5173)**
A previous dev server process is still running.
```powershell
# Windows PowerShell
Stop-Process -Id (Get-NetTCPConnection -LocalPort 5000).OwningProcess -Force
```
```bash
# Linux / macOS
lsof -ti :5000 | xargs kill -9
```

**Login fails with "Invalid credentials" even with the documented demo password**
The `users` collection is empty — run `node src/utils/seed-test.js`.

**OCR returns empty text for a PDF**
The PDF is scanned (image-only, no embedded text layer). `pdf-parse` only reads embedded text. See [ARCHITECTURE.md §4](./ARCHITECTURE.md#4-ocr-layer-backendsrcservicesocrservicejs) for the known limitation.

**Currency/amount shows wrong after OCR**
The regex extractors expect ASCII-renderable currency markers. If generating test PDFs with `pdfkit` and the default Helvetica font, avoid `₹` — it isn't in WinAnsi encoding. Use `Rs.` instead, or embed a Unicode font.

**ML service not starting (model files missing)**
The trained model binaries are not committed to the repo. Place them in `ml-service/models/` (anomaly, matching, confidence models) and `ml-service/layoutlmv3_invoice/` (LayoutLMv3 weights). The backend works fine without them — it falls back to regex extraction automatically.

**`[queue] Redis unavailable` in backend logs**
Expected if Redis isn't running. The queue is optional — the backend processes OCR/matching inline and logs this warning on startup. Set `QUEUE_ENABLED=false` in `.env` to suppress the warning.

**Invoice file not found after switching to MinIO**
Files uploaded in `local` mode stay on disk and are readable in `local` mode. After switching to `STORAGE_BACKEND=minio`, new uploads go to MinIO but historical files stay local. Each file records its own storage backend in `uploadedFile.storage`, so both can coexist. To migrate historical files to MinIO, use `mc cp` (MinIO Client).
