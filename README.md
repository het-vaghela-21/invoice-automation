# Ledger — Invoice Automation System

A production-ready, full-stack invoice processing system. Upload a vendor invoice (PDF/JPG/PNG), run OCR + layout-aware ML extraction, review and correct extracted fields, then validate against a linked Purchase Order with a transparent point-scored match — producing a **pass / review / reject verdict** with a full audit trail of every action.

Built on the MERN stack (MongoDB, Express, React, Node.js) with a self-hosted Python FastAPI ML microservice and a complete scalability infrastructure layer — all free, no paid cloud services required.

---

## Table of Contents

- [What it does](#what-it-does)
- [Feature list](#feature-list)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Project structure](#project-structure)
- [Architecture at a glance](#architecture-at-a-glance)
- [The invoice lifecycle](#the-invoice-lifecycle)
- [AI/ML layer](#aiml-layer)
- [Scalability](#scalability)
- [API summary](#api-summary)
- [Known limitations](#known-limitations)
- [Documentation](#documentation)

---

## What it does

1. **Upload** a vendor invoice (PDF, JPG, or PNG) — drag-and-drop, 10 MB limit, no manual PO selection needed.
2. **Run OCR** — `pdf-parse` for text-layer PDFs, `Tesseract.js` (in-process WASM) for images.
3. **Extract fields** — invoice number, vendor name, GST/tax ID, PO number, dates, amounts, currency, bank account, and line items, each with a confidence score. Regex baseline is augmented by LayoutLMv3 + EasyOCR when the ML service is running.
4. **Auto-link the PO** — the PO number read by OCR is looked up against every purchase order and linked automatically; no manual lookup needed.
5. **Review and correct** — a human checks extracted fields side-by-side against the original document with colour-coded highlights. Every correction is logged (old value → new value → who → when).
6. **Match against the PO** — a deterministic point-scored comparison (vendor name, PO number, total, currency, subtotal, line item content, PO approval status) plus SHA-256 duplicate detection produces a match score and `passed` / `review_required` verdict. A passing invoice immediately closes its PO so it can never be matched twice.
7. **Audit** — every action is appended to a per-invoice processing log with timestamps.

---

## Feature list

**Invoice processing**
- Drag-and-drop upload (PDF/JPG/PNG, max 10 MB)
- In-process OCR — no external API or paid service required
- Per-field confidence scores on all extracted values
- Inline field correction with a complete change-history audit trail
- Transparent, point-based PO match scoring with itemised discrepancies
- Automatic PO detection from the invoice's own PO number (OCR result)
- Auto-closing POs on a passing match — a PO can never be matched twice
- SHA-256 file hash + invoice number duplicate detection (checked at every match run)
- Anomaly / fraud risk scoring (low / medium / high) against vendor spend history
- CSV export for invoices and purchase orders (respects active filters)

**Vendor and PO management**
- Vendor management with per-vendor configurable required fields (e.g. GSTIN for Indian vendors)
- Vendor drill-down — full PO + invoice history, total spend, flagged-invoice count
- Purchase orders with line items, auto-generated PO numbers, server-computed totals
- Line item content matching — Jaccard similarity on descriptions + unit price comparison

**Auth and roles**
- JWT authentication with self-serve forgot/reset password
- Role-based access control: **Admin / Accountant / Viewer**, enforced server-side
- Admin-only Team & Roles page to manage user roles

**UI**
- Responsive design, works on mobile
- PDF annotation overlay — extracted fields highlighted directly on the rendered document
- Dashboard with status breakdown charts and recent activity
- Toast notifications and confirm dialogs for all destructive actions
- Public marketing landing page for logged-out visitors

**Scalability (production-ready)**
- BullMQ + Redis job queue — OCR and matching offloaded to background workers; API returns in milliseconds
- PM2 cluster mode — one Node process per CPU core, zero-downtime reloads
- Nginx reverse proxy — TLS, gzip, static caching, security headers, upload size enforcement
- MinIO file storage — S3-compatible self-hosted object store; works across multiple machines
- Gunicorn multi-worker ML service — configurable worker count for parallel ML inference
- Rate limiting — 10 uploads/min and 200 API requests/min per IP, configurable
- MongoDB connection pooling — configurable `maxPoolSize`
- Optimised queries — lean projections, compound indexes, `.lean()` on list endpoints
- Graceful degradation at every layer — Redis, ML service, and MinIO are all optional; the system falls back automatically and logs clearly

**Tests and tooling**
- 30 Jest unit tests (extraction regex + PO match scoring) — no DB or network required
- Load seed script (1k users, 50 vendors, 2k POs, 5k invoices, ~10 s)
- Stress seed script (12 invoices covering all 6 statuses + edge cases)
- Performance benchmarks documented with baseline numbers (most endpoints < 70 ms at 5k invoices)

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router v6, Tailwind CSS, Recharts, react-pdf, react-dropzone |
| Backend | Node.js, Express, Mongoose |
| Database | MongoDB |
| OCR | Tesseract.js (images, WASM in-process), pdf-parse (PDFs with text layer) |
| Job queue | BullMQ + Redis (optional; degrades to inline processing) |
| ML service | Python FastAPI + Gunicorn, LayoutLMv3 + EasyOCR (extraction), sentence-transformers (vendor matching), scikit-learn Isolation Forest (anomaly), MLP (confidence) |
| File storage | Local disk (default) or MinIO self-hosted S3-compatible object store |
| Auth | JWT (`jsonwebtoken`) + bcrypt |
| File upload | Multer |
| Rate limiting | express-rate-limit |
| Process manager | PM2 (cluster mode) |
| Reverse proxy | Nginx |
| Input validation | express-validator |

---

## Quick start

> **Prerequisites:** Node.js 18+, MongoDB 6+, npm. Python + pip only needed for the ML service (optional).

```bash
# 1. Clone and install
git clone https://github.com/het-vaghela-21/invoice-automation.git
cd invoice-automation

cd backend && npm install
cd ../frontend && npm install

# 2. Configure
cd ../backend
cp .env.example .env
# Open .env and set JWT_SECRET to any long random string. Everything else has sensible defaults.

# 3. Seed demo data (requires MongoDB running on localhost:27017)
node src/utils/seed-test.js

# 4. Start (two terminals)
npm run dev                       # Terminal 1 — backend → http://localhost:5000
cd ../frontend && npm run dev     # Terminal 2 — frontend → http://localhost:5173
```

Open **http://localhost:5173** and log in:

| Role | Email | Password |
|---|---|---|
| Admin | `admin@company.com` | `admin123` |
| Accountant | `accountant@company.com` | `accountant123` |
| Viewer | `viewer@company.com` | `viewer123` |

**Optional — ML service** (layout-aware extraction, semantic vendor matching, anomaly scoring). Start *before* the backend; if it isn't running, the backend silently falls back to regex/substring logic:

```bash
cd ml-service
pip install -r requirements.txt
# Place trained model files in ml-service/models/ and ml-service/layoutlmv3_invoice/
uvicorn main:app --host 0.0.0.0 --port 8000
```

Full startup instructions, optional services (Redis, MinIO), and production setup: [`RUNNING.md`](RUNNING.md) and [`deploy/README.md`](deploy/README.md).

---

## Project structure

```
invoice-automation/
├── backend/
│   ├── server.js                        # Express app entry point
│   ├── ecosystem.config.js              # PM2 cluster + worker config
│   ├── src/
│   │   ├── controllers/                 # invoiceController, vendorController, etc.
│   │   ├── models/                      # Mongoose schemas (User, Vendor, PurchaseOrder, Invoice)
│   │   ├── routes/                      # Route definitions mounted in server.js
│   │   ├── middleware/                  # JWT auth + RBAC, validation, multer, error handler
│   │   ├── validators/                  # express-validator rule chains
│   │   ├── services/
│   │   │   ├── ocrService.js            # Tesseract.js / pdf-parse dispatch
│   │   │   ├── extractionService.js     # Regex extraction + LayoutLMv3 ML overlay
│   │   │   ├── validationService.js     # PO match scoring + duplicate detection
│   │   │   ├── invoiceProcessor.js      # runOCR() + runMatching() — shared by queue and inline paths
│   │   │   ├── storageService.js        # File storage abstraction (local disk or MinIO)
│   │   │   ├── mlClient.js              # Axios client for the ML service (circuit breaker, timeouts)
│   │   │   └── __tests__/              # Jest unit tests (30 tests)
│   │   ├── config/
│   │   │   └── queue.js                 # BullMQ + Redis queue setup (optional)
│   │   ├── workers/
│   │   │   ├── invoiceWorker.js         # BullMQ worker (OCR + matching jobs)
│   │   │   └── start.js                 # Standalone worker entrypoint: npm run worker
│   │   └── utils/
│   │       ├── csv.js                   # CSV export builder
│   │       ├── seed-test.js             # Demo dataset seed (recommended)
│   │       ├── seed-load.js             # High-volume seed (1k users, 5k invoices)
│   │       └── seed-stress.js           # 12-invoice edge-case stress dataset
│   └── uploads/                         # Uploaded files (local disk mode)
├── frontend/
│   ├── src/
│   │   ├── pages/                       # Dashboard, Vendors, PurchaseOrders, Invoices,
│   │   │                                #   InvoiceDetail, UploadInvoice, Users, Landing,
│   │   │                                #   Login, Register, ForgotPassword, ResetPassword
│   │   ├── components/                  # Layout, PDFAnnotationViewer, Modal, ConfirmDialog
│   │   ├── context/AuthContext.jsx      # Auth state (localStorage-backed)
│   │   ├── services/api.js              # Axios wrappers + pollJob() helper
│   │   └── utils/                       # permissions (RBAC rules), motion (transitions)
│   └── vite.config.js                   # Dev proxy: /api, /uploads → localhost:5000
├── ml-service/                          # Optional Python FastAPI ML service (port 8000)
│   ├── main.py                          # /health /extract /anomaly /match /confidence
│   ├── label_map.json                   # 23-label BIO map for LayoutLMv3
│   ├── layoutlmv3_invoice/              # LayoutLMv3 config + tokenizer (weights excluded)
│   ├── requirements.txt
│   └── models/                          # Trained model binaries — NOT committed
├── deploy/
│   ├── nginx/invoice-automation.conf    # Nginx reverse proxy config
│   └── README.md                        # Production topology + MinIO setup guide
├── docs/
│   ├── ARCHITECTURE.md                  # System design, state machine, extraction/matching internals
│   ├── API.md                           # Full endpoint reference with examples
│   ├── DATA_MODELS.md                   # Mongoose schema reference
│   ├── SETUP.md                         # Install, configure, run, troubleshoot
│   ├── PERFORMANCE_BENCHMARKS.md        # Baseline benchmarks at 5k invoices
│   └── PLAN_LINE_ITEM_MATCHING.md       # Line item matching algorithm design
├── RUNNING.md                           # All services startup order + fallback behaviour
└── README.md                            # This file
```

---

## Architecture at a glance

```
                         ┌─────────────────────────────┐
                         │         Nginx :443           │
                         │  TLS · gzip · static cache   │
                         └──────────────┬──────────────┘
              /  /assets/               │  /api/         /uploads/
        ┌───────────────┐     ┌─────────┴─────────┐
        │ React build   │     │  Node API (PM2)   │
        │ frontend/dist │     │  cluster, :5000   │
        └───────────────┘     └─────────┬─────────┘
                                        │ enqueue job
                              ┌─────────▼─────────┐
                              │  Redis (BullMQ)   │
                              └─────────┬─────────┘
                                        │ drain jobs
                    ┌───────────────────▼───────────────────┐
                    │          BullMQ Workers (PM2)         │
                    │    runOCR()  /  runMatching()         │
                    └───────────────────┬───────────────────┘
                                        │
               ┌────────────────────────┼────────────────────┐
               │                        │                    │
       ┌───────▼──────┐       ┌─────────▼────────┐  ┌───────▼──────┐
       │ Python ML    │       │    MongoDB        │  │  MinIO /     │
       │ Gunicorn     │       │    :27017         │  │  local disk  │
       │ :8000        │       │                  │  │  (uploads)   │
       └──────────────┘       └──────────────────┘  └──────────────┘
```

**Graceful degradation at every layer:**

| Service | If unavailable |
|---|---|
| Redis / BullMQ | OCR + matching run inline in the API process (original behaviour) |
| ML service | Extraction falls back to regex; vendor matching uses substring; anomaly score = "unknown" |
| MinIO | File storage falls back to local disk |

---

## The invoice lifecycle

```
upload ──▶ uploaded ──▶ ocr_extracted ──▶ pending_review ──▶ passed
                                                         ↘
                                                    review_required ⇄ (re-match after fix)
any state ──────────────────────────────────────────────────────────▶ rejected
```

Each transition is a **distinct user-triggered action** — the user stays in control at every step and can re-run OCR or re-submit for matching after fixing a discrepancy. A `passed` or `rejected` invoice is locked against further edits.

Full state machine details: [`docs/ARCHITECTURE.md §3`](docs/ARCHITECTURE.md#3-invoice-state-machine).

---

## AI/ML layer

A Python FastAPI microservice (`ml-service/`) serves four ML capabilities. It is **integrated into the pipeline but optional at runtime** — every Node call is wrapped in try/catch with timeouts, and a circuit breaker short-circuits instantly for 30 s after a connectivity failure so OCR never stalls waiting for a dead service.

| Endpoint | Model | Role in the pipeline |
|---|---|---|
| `POST /extract` | LayoutLMv3 + EasyOCR | Sends the original PDF file; fills fields regex left empty (layout-aware, 60 s timeout) |
| `POST /confidence` | MLP (scikit-learn) | Per-field confidence score for ML-extracted fields |
| `POST /match` | Sentence-transformers | Semantic vendor-name match — rescues fuzzy matches substring logic misses |
| `POST /anomaly` | Isolation Forest (scikit-learn) | Risk score against vendor spend history (informational; doesn't change the verdict) |

For production throughput, start with Gunicorn:
```bash
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

---

## Scalability

The system is designed to handle thousands of invoices simultaneously without paid cloud services:

| Component | Mechanism | Config |
|---|---|---|
| API throughput | PM2 cluster mode (one process per CPU core) | `ecosystem.config.js` |
| OCR/matching throughput | BullMQ workers (concurrency + multiple worker processes) | `WORKER_CONCURRENCY`, `npm run worker` |
| ML throughput | Gunicorn multi-worker | `-w <n>` |
| File storage across hosts | MinIO object store | `STORAGE_BACKEND=minio` |
| Request rate limiting | express-rate-limit | `RATE_LIMIT_UPLOAD`, `RATE_LIMIT_API` |
| MongoDB | Connection pool + compound indexes | `MONGO_POOL_SIZE` |
| Entry point | Nginx reverse proxy | `deploy/nginx/invoice-automation.conf` |

All scalability features degrade gracefully — you can run the entire system as a single Node process with local disk storage and no Redis, and it works correctly. Add layers as your volume grows.

Full production setup: [`deploy/README.md`](deploy/README.md) · Full startup guide: [`RUNNING.md`](RUNNING.md).

---

## API summary

| Resource | Endpoints |
|---|---|
| Auth | `POST /api/auth/register` · `POST /api/auth/login` · `GET /api/auth/me` · `POST /api/auth/forgot-password` · `POST /api/auth/reset-password/:token` |
| Vendors | `GET /POST /api/vendors` · `GET /PUT /DELETE /api/vendors/:id` · `GET /api/vendors/:id/summary` |
| Purchase Orders | `GET /POST /api/purchase-orders` · `GET /PUT /api/purchase-orders/:id` · `GET /api/purchase-orders/export` |
| Invoices | `GET /POST /api/invoices` · `GET /DELETE /api/invoices/:id` · `POST /api/invoices/:id/ocr` · `PATCH /api/invoices/:id/fields` · `POST /api/invoices/:id/match` · `POST /api/invoices/:id/reject` · `GET /api/invoices/export` · `GET /api/invoices/jobs/:jobId` |
| Dashboard | `GET /api/dashboard/stats` |
| Users (admin only) | `GET /api/users` · `PATCH /api/users/:id/role` |

Writes need `accountant` or `admin`; deletes need `admin`; reads need any authenticated role.

Full request/response examples: [`docs/API.md`](docs/API.md).

---

## Known limitations

- **Scanned PDFs** (image-only, no text layer) return empty OCR text — `pdf-parse` only reads embedded text; there is no PDF-to-image rasterization step feeding Tesseract for this case.
- **LayoutLMv3 model quality** — the shipped weights tag label-keyword tokens ("Invoice", "Date:") rather than value tokens ("INV-2026-0042"), so ML extraction is conservative (fills gaps only). Fine-tuning on annotated domain data is the path to making ML the primary extractor.
- **No real email delivery** — the password reset link is returned directly in the API response outside `NODE_ENV=production`. Swap in nodemailer + any SMTP provider before going near real users.
- **Test coverage** — 30 unit tests cover the pure extraction/matching logic. No integration tests against a live DB/HTTP layer yet.
- **Single admin account** — by design. `admin@company.com` is provisioned via the seed script; the `admin` role cannot be assigned through the API.

---

## Documentation

| File | Contents |
|---|---|
| [`RUNNING.md`](RUNNING.md) | All services, startup order, dev vs production commands, fallback behaviour tables |
| [`deploy/README.md`](deploy/README.md) | Production topology diagram, MinIO setup, Nginx install, scaling levers |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Request lifecycle, state machine, extraction/matching internals, ML integration design |
| [`docs/API.md`](docs/API.md) | Full endpoint reference with request/response examples |
| [`docs/DATA_MODELS.md`](docs/DATA_MODELS.md) | Mongoose schema reference |
| [`docs/SETUP.md`](docs/SETUP.md) | Prerequisites, environment variables, seed scripts, troubleshooting |
| [`docs/PERFORMANCE_BENCHMARKS.md`](docs/PERFORMANCE_BENCHMARKS.md) | Baseline benchmarks at 5k invoices, root-cause analysis, optimisation log |
