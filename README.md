# Ledger — Invoice Automation System

A full-stack invoice processing system that takes a vendor invoice (PDF/JPG/PNG), runs OCR + field extraction, lets a human verify/correct the extracted fields, then validates it against a linked Purchase Order with a transparent, point-scored match — producing a pass/review/reject verdict with a full audit trail of every change.

Built as a MERN-stack application (MongoDB, Express, React, Node) with an in-process OCR pipeline (no external OCR API or paid service required), an interactive PDF annotation viewer that highlights extracted fields directly on the source document, and an **optional Python FastAPI ML microservice** (`ml-service/`) that augments extraction, vendor matching, and adds anomaly detection — wired in so the Node backend automatically falls back to its built-in regex/heuristic logic whenever the ML service isn't running, so the system works with or without it.

> 📐 Want the deep dive? See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the request lifecycle, state machine, and the actual design decisions (and bugs) behind the extraction regexes and matching algorithm. See [`docs/API.md`](docs/API.md) for the full endpoint reference, [`docs/DATA_MODELS.md`](docs/DATA_MODELS.md) for schemas, and [`docs/SETUP.md`](docs/SETUP.md) for a complete local setup + troubleshooting guide.

---

## What it does

1. **Upload** a vendor invoice (PDF, JPG, or PNG) — no manual PO selection needed, so this works for invoices arriving in bulk.
2. **Run OCR** — `pdf-parse` for PDFs with an embedded text layer, `Tesseract.js` (in-process WASM OCR) for images.
3. **Extract fields** — invoice number, vendor name, GST/tax ID, PO number, dates, amounts, currency, bank account, and line items, each with a confidence score, via a heuristic regex extraction layer.
4. **Auto-match the PO** — the PO number OCR just read is looked up against every purchase order in the system and linked automatically; a manual override is only needed if extraction fails or misreads it.
5. **Review & correct** — a human checks the extracted fields side-by-side against the original document and fixes anything OCR got wrong. Every correction is logged (old value → new value → who → when).
6. **Match against the PO** — a deterministic point-scored comparison (vendor name, PO number, total, currency, subtotal, line item content, and the PO's own approval status) plus SHA-256-based duplicate detection produces a match score and a `passed` / `review_required` verdict, with itemized discrepancies. A passing invoice immediately closes its PO so it can never be matched twice.
7. **Audit** — every action (upload, OCR run, auto-match, field edit, match run, rejection) is appended to a per-invoice processing log.

## Feature list

- 🔐 JWT auth — register/login, plus self-serve forgot/reset password
- 🔑 **Role-based access** — admin / accountant / viewer, enforced server-side (not just hidden in the UI). A single fixed admin account assigns Accountant/Viewer to everyone who registers, from a Team & Roles page
- 🏢 **Vendor management** with per-vendor configurable "required fields" — different vendors can demand different invoice fields (e.g. GSTIN for Indian vendors, bank account for others)
- 🔎 **Vendor drill-down** — full PO + invoice history, total spend, and flagged-invoice count per vendor
- 📄 **Purchase orders** with line items, auto-generated PO numbers (`PO-2026-00001`), server-computed subtotal/tax/total
- 📤 **Drag-and-drop invoice upload** (PDF/JPG/PNG, 10 MB limit) — no manual PO selection needed, built for bulk
- 🔍 **In-process OCR** — no external API keys, no paid OCR service
- 🧠 **Field extraction** with per-field confidence scores — regex/heuristic baseline, transparently upgraded per-field by a trained spaCy NER model + learned confidence scorer when the ML service is running
- 🤖 **Optional ML microservice** (`ml-service/`, Python FastAPI) — spaCy NER extraction, sentence-transformer semantic vendor matching, Isolation Forest anomaly scoring, and a learned confidence model. Every call is best-effort with automatic fallback to the built-in regex/substring logic, so the app runs fine with the ML service off
- 🚨 **Anomaly / fraud signal** — each matched invoice gets a `riskLevel` (low/medium/high) scored against the vendor's own spend history (informational; doesn't override the match verdict)
- 🔗 **Automatic PO matching** — the PO number on the invoice is read by OCR and linked to the matching purchase order automatically; manual selection is only an optional override for edge cases
- ✏️ **Inline field correction** with a complete change-history audit trail
- ✅ **PO matching engine** — transparent point-based scoring, configurable tolerance (5% on amounts), severity-tagged discrepancies
- 🔒 **Auto-closing POs** — a PO is closed the instant an invoice passes against it, so a second invoice can never silently match (and pass) against an already-fulfilled PO
- 🧬 **Duplicate detection** — SHA-256 file hash + invoice number, re-checked on every match run
- 📥 **CSV export** for invoices and purchase orders (respects active filters)
- 🛡️ **Server-side input validation** with field-level error messages (`express-validator`)
- 📊 **Dashboard** — status breakdown, recent activity, charts
- 📱 **Responsive UI** — works down to mobile, with a dedicated marketing landing page for logged-out visitors, toast notifications, and confirm dialogs instead of native browser popups
- 📎 **PDF annotation overlay** — extracted fields are highlighted directly on the rendered PDF using colour-coded marks (amber for vendor, blue for invoice number, green for total, etc.). A clickable legend lets reviewers isolate individual field highlights. Powered by react-pdf (pdf.js) with a custom text renderer.
- 🧪 **Unit tests** for the extraction and PO-matching logic (`cd backend && npm test`)

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router v6, Tailwind CSS, Recharts, react-dropzone, GSAP, react-pdf |
| Backend | Node.js, Express, Mongoose |
| Database | MongoDB |
| OCR | Tesseract.js (images, WASM), pdf-parse (PDFs with text layer) |
| ML service (optional) | Python, FastAPI, Uvicorn, spaCy (NER), sentence-transformers, scikit-learn (Isolation Forest, MLP), called from Node via axios |
| Auth | JWT (`jsonwebtoken`) + bcrypt password hashing |
| File upload | Multer |

## Architecture at a glance

```
React (Vite, :5173) ──/api──▶ Express (:5000) ──▶ MongoDB
                                  │
                    ┌─────────────┼─────────────┐
              OCR layer    Extraction layer   Validation layer
          Tesseract.js /   regex baseline      PO match scoring
            pdf-parse      + ML overlay        + line item match
                               │                + ML vendor match
                               │                + anomaly scoring
                               ▼                + duplicate check
                     Python FastAPI (:8000)   ← optional ML service
                     NER · Confidence · Anomaly · Embeddings
                     (backend falls back to regex/substring if down)
```

Full breakdown — including the invoice state machine, the exact regex extraction strategy (and the real bugs that shaped it), and the point-scoring formula for PO matching — is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Project structure

```
invoice-automation/
├── backend/
│   ├── server.js                  # Express app entry point
│   ├── src/
│   │   ├── controllers/           # Request handlers (auth, user, vendor, PO, invoice, dashboard)
│   │   ├── models/                # Mongoose schemas (User, Vendor, PurchaseOrder, Invoice)
│   │   ├── routes/                # Route definitions, mounted in server.js
│   │   ├── middleware/             # JWT auth guard + RBAC, validation, multer upload, error handler
│   │   ├── validators/             # express-validator rule chains (auth, user, vendor, PO, invoice)
│   │   ├── services/
│   │   │   ├── ocrService.js          # Tesseract.js / pdf-parse dispatch
│   │   │   ├── extractionService.js   # Regex extraction + ML overlay (async)
│   │   │   ├── __tests__/             # Jest unit tests (extraction + matching)
│   │   │   └── validationService.js   # PO match scoring (+ optional ML vendor-match hint) + duplicate detection
│   │   └── utils/
│   │       ├── csv.js                 # Minimal CSV builder (export endpoints)
│   │       ├── seed.js                # Minimal seed
│   │       └── seed-test.js           # Full demo dataset (recommended)
│   └── uploads/                    # Uploaded invoice files (local disk)
├── frontend/
│   ├── src/
│   │   ├── pages/                  # Landing, Login, Register, Forgot/ResetPassword, Dashboard,
│   │   │                           #  Vendors(+Detail), PurchaseOrders(+Detail/New), Invoices(+Detail),
│   │   │                           #  UploadInvoice, Users (admin-only Team & Roles page)
│   │   ├── components/             # Layout (sidebar/nav), Modal, ConfirmDialog, PDFAnnotationViewer
│   │   ├── context/AuthContext.jsx # Auth state, localStorage-backed
│   │   ├── services/api.js         # Axios instance + per-resource API wrappers
│   │   └── utils/                  # helpers, permissions (RBAC UI rules), motion (page transitions)
│   └── vite.config.js              # Dev proxy: /api, /uploads → localhost:5000
├── ml-service/                     # Optional Python FastAPI ML microservice (:8000)
│   ├── main.py                     # /health /extract /anomaly /match /confidence
│   ├── mlClient.js                 # Node client the backend imports (axios, 8s timeout, graceful fallback)
│   ├── requirements.txt
│   ├── .gitignore                  # keeps trained model binaries (models/) out of git
│   └── models/                     # trained models — NOT committed; placed here locally
├── RUNNING.md                      # 3-process startup order + ML fallback behaviour
└── docs/
    ├── ARCHITECTURE.md             # System design, state machine, extraction/matching internals
    ├── API.md                      # Full endpoint reference
    ├── DATA_MODELS.md              # Mongoose schema reference
    └── SETUP.md                    # Install, configure, run, troubleshoot
```

## Quick start

```bash
# 1. Install
cd backend && npm install
cd ../frontend && npm install

# 2. Configure
cd ../backend && cp .env.example .env   # edit JWT_SECRET / MONGODB_URI as needed

# 3. Make sure MongoDB is running, then seed demo data
node src/utils/seed-test.js

# 4. Run (two terminals)
npm run dev                 # backend → http://localhost:5000
cd ../frontend && npm run dev   # frontend → http://localhost:5173
```

**Optional — ML microservice** (for trained extraction, semantic vendor matching, and anomaly scoring). Start it *before* the backend; if it's not running, the backend silently falls back to regex/substring logic:

```bash
cd ml-service           # requires the trained models under ml-service/models/
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000   # → http://localhost:8000/health
```

Full startup order and the exact fallback behaviour: [`RUNNING.md`](RUNNING.md).

**Demo logins** (one per role):

| Role | Email | Password |
|---|---|---|
| Admin | `admin@company.com` | `admin123` |
| Accountant | `accountant@company.com` | `accountant123` |
| Viewer | `viewer@company.com` | `viewer123` |

Full prerequisites, environment variable reference, and troubleshooting: [`docs/SETUP.md`](docs/SETUP.md).

## API summary

| Resource | Endpoints |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password/:token` |
| Vendors | `GET/POST /api/vendors`, `GET/PUT/DELETE /api/vendors/:id`, `GET /api/vendors/:id/summary` |
| Purchase Orders | `GET/POST /api/purchase-orders`, `GET/PUT /api/purchase-orders/:id`, `GET /api/purchase-orders/export` |
| Invoices | `GET/POST /api/invoices`, `GET/DELETE /api/invoices/:id`, `POST /api/invoices/:id/ocr`, `PATCH /api/invoices/:id/fields`, `POST /api/invoices/:id/match`, `POST /api/invoices/:id/reject`, `GET /api/invoices/export` |
| Dashboard | `GET /api/dashboard/stats` |
| Users (admin-only) | `GET /api/users`, `PATCH /api/users/:id/role` |

Writes are role-gated (`accountant`/`admin`); deletes are `admin`-only; everything else just needs to be logged in. See [`docs/ARCHITECTURE.md §7`](docs/ARCHITECTURE.md#7-auth--roles).

Full request/response examples and error codes: [`docs/API.md`](docs/API.md).

## The invoice lifecycle

```
uploaded → ocr_extracted → pending_review → review_required ⇄ (re-match)
                                          ↘                  ↘
                                           passed             rejected (from any state)
```

Each transition is a distinct user-triggered action (upload → start OCR → save corrected fields → submit for matching), not an automatic pipeline — the user stays in control at every step, and can re-run OCR or re-submit for matching after fixing a discrepancy. Details: [`docs/ARCHITECTURE.md §3`](docs/ARCHITECTURE.md#3-invoice-state-machine).

## AI/ML layer (integrated, optional at runtime)

A Python FastAPI microservice (`ml-service/`) sits alongside the Node.js backend and serves four ML capabilities over HTTP. It's **integrated and wired into the pipeline**, but **optional at runtime** — every call from Node is wrapped in try/catch with an 8s timeout, and on any failure the backend transparently falls back to its built-in regex/substring logic.

| Endpoint | Model | How it's used in the Node pipeline |
|---|---|---|
| `POST /extract` | spaCy NER | In `extractionService.extractInvoiceData` — regex runs first, then ML-extracted fields are **overlaid per-field** (ML wins where it returns a value; regex stays the fallback for everything else) |
| `POST /confidence` | MLP classifier (scikit-learn) | Supplies the learned confidence score for each ML-extracted field, replacing the hardcoded regex confidences for those fields |
| `POST /match` | Sentence-transformers | In `invoiceController.submitMatching` — a semantic vendor-name match that can **rescue** a real match `validateAgainstPO`'s substring comparison missed (it never breaks an existing match) |
| `POST /anomaly` | Isolation Forest (scikit-learn) | In `submitMatching` — scores the invoice against the vendor's own spend history and writes `anomalyScore` + `riskLevel` to the Invoice (informational; doesn't change the verdict) |

**How the wiring degrades:**

| Capability | ML service up | ML service down (fallback) |
|---|---|---|
| Field extraction | spaCy NER + learned confidence, overlaid on regex | regex extraction only |
| Vendor matching | semantic similarity rescues fuzzy matches | substring matching only |
| Anomaly scoring | Isolation Forest risk level | `riskLevel: "unknown"`, no score |

The integration was kept deliberately seam-friendly: `extractInvoiceData()` is the single extraction entry point, and `validateAgainstPO()` stays a pure, unit-tested function that only receives an optional ML hint — so the ML side-effects live entirely in the async controller. Trained model binaries are not committed (see `ml-service/.gitignore`); place them under `ml-service/models/`. Background design specs: `docs/PLAN_LINE_ITEM_MATCHING.md`, `ML_BRIEFING_FOR_CLAUDE_WEB.md`.

## Known limitations

- OCR runs synchronously within the request — fine at current scale, would need a job queue for high-volume concurrent processing.
- No scanned-PDF (image-only) → OCR fallback yet; only PDFs with an embedded text layer extract text via `pdf-parse`.
- With the ML service off, field extraction is regex/heuristic-based — accurate on clean, labeled invoices, degrades on unusual layouts. With it on, the spaCy NER model overlays the regex result; its accuracy depends on the trained models you place in `ml-service/models/` (not committed to this repo).
- Auto-detecting the PO depends on OCR reading the PO number correctly off the document; if it can't, the invoice falls back to fuzzy-vendor-only match and a human can link the right PO during review.
- No real email delivery for password resets — the reset link is returned directly by the API outside production.
- Uploaded files live on local disk, not object storage.
- Test coverage is limited to the pure extraction/matching logic — no integration tests against a live DB/HTTP layer yet.

## Contributing / extending

- Swap or tune the extraction engine: `extractInvoiceData()` in `backend/src/services/extractionService.js` is the single entry point. It already overlays the ML `/extract` result on the regex baseline (`applyMLExtraction`) — adjust the `ML_FIELD_MAP` (NER label → field) there to match your trained model's labels, or replace the ML call entirely. Anything returning the same `{ value, confidence }` shape drops in without touching the controller.
- Point the backend at a remote ML service: set `ML_SERVICE_URL` (and optionally `ML_SERVICE_TIMEOUT_MS`) in `backend/.env`. With it unset or unreachable, the backend runs on regex/substring logic.
- Add a new invoice field: extend `extractedData` in `Invoice.js`, add an extractor in `extractionService.js`, add it to `FIELD_META` in `frontend/src/pages/InvoiceDetail.jsx`, and (optionally) make it selectable in a vendor's `requiredFields`.
- Enforce RBAC: the `authorize(...roles)` middleware already exists in `backend/src/middleware/auth.js` — apply it to the routes that need it.
