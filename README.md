# Ledger — Invoice Automation System

A full-stack invoice processing system that takes a vendor invoice (PDF/JPG/PNG), runs OCR + field extraction, lets a human verify/correct the extracted fields, then validates it against a linked Purchase Order with a transparent, point-scored match — producing a pass/review/reject verdict with a full audit trail of every change.

Built as a MERN-stack application (MongoDB, Express, React, Node) with an in-process OCR pipeline (no external OCR API or paid service required) and a regex-based extraction layer designed to be swapped for a real document-understanding model (LayoutLMv3 or similar) later without touching the rest of the system.

> 📐 Want the deep dive? See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the request lifecycle, state machine, and the actual design decisions (and bugs) behind the extraction regexes and matching algorithm. See [`docs/API.md`](docs/API.md) for the full endpoint reference, [`docs/DATA_MODELS.md`](docs/DATA_MODELS.md) for schemas, and [`docs/SETUP.md`](docs/SETUP.md) for a complete local setup + troubleshooting guide.

---

## What it does

1. **Upload** a vendor invoice (PDF, JPG, or PNG), optionally linked to a Purchase Order.
2. **Run OCR** — `pdf-parse` for PDFs with an embedded text layer, `Tesseract.js` (in-process WASM OCR) for images.
3. **Extract fields** — invoice number, vendor name, GST/tax ID, PO number, dates, amounts, currency, bank account, and line items, each with a confidence score, via a heuristic regex extraction layer.
4. **Review & correct** — a human checks the extracted fields side-by-side against the original document and fixes anything OCR got wrong. Every correction is logged (old value → new value → who → when).
5. **Match against the PO** — a deterministic point-scored comparison (vendor name, PO number, total, currency, subtotal, line item count) plus SHA-256-based duplicate detection produces a match score and a `passed` / `review_required` verdict, with itemized discrepancies.
6. **Audit** — every action (upload, OCR run, field edit, match run, rejection) is appended to a per-invoice processing log.

## Feature list

- 🔐 JWT auth — register/login, plus self-serve forgot/reset password
- 🔑 **Role-based access** — admin / accountant / viewer, enforced server-side (not just hidden in the UI). A single fixed admin account assigns Accountant/Viewer to everyone who registers, from a Team & Roles page
- 🏢 **Vendor management** with per-vendor configurable "required fields" — different vendors can demand different invoice fields (e.g. GSTIN for Indian vendors, bank account for others)
- 🔎 **Vendor drill-down** — full PO + invoice history, total spend, and flagged-invoice count per vendor
- 📄 **Purchase orders** with line items, auto-generated PO numbers (`PO-2026-00001`), server-computed subtotal/tax/total
- 📤 **Drag-and-drop invoice upload** (PDF/JPG/PNG, 10 MB limit)
- 🔍 **In-process OCR** — no external API keys, no paid OCR service
- 🧠 **Heuristic field extraction** with per-field confidence scores
- ✏️ **Inline field correction** with a complete change-history audit trail
- ✅ **PO matching engine** — transparent point-based scoring, configurable tolerance (5% on amounts), severity-tagged discrepancies
- 🧬 **Duplicate detection** — SHA-256 file hash + invoice number, re-checked on every match run
- 📥 **CSV export** for invoices and purchase orders (respects active filters)
- 🛡️ **Server-side input validation** with field-level error messages (`express-validator`)
- 📊 **Dashboard** — status breakdown, recent activity, charts
- 📱 **Responsive UI** — works down to mobile, with a dedicated marketing landing page for logged-out visitors, toast notifications, and confirm dialogs instead of native browser popups
- 🧪 **Unit tests** for the extraction and PO-matching logic (`cd backend && npm test`)

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router v6, Tailwind CSS, Recharts, react-dropzone, GSAP |
| Backend | Node.js, Express, Mongoose |
| Database | MongoDB |
| OCR | Tesseract.js (images, WASM), pdf-parse (PDFs with text layer) |
| Auth | JWT (`jsonwebtoken`) + bcrypt password hashing |
| File upload | Multer |

## Architecture at a glance

```
React (Vite, :5173) ──/api──▶ Express (:5000) ──▶ MongoDB
                                  │
                    ┌─────────────┼─────────────┐
              OCR layer    Extraction layer   Validation layer
          Tesseract.js /   regex field         PO match scoring
            pdf-parse       parsers            + duplicate check
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
│   │   │   ├── extractionService.js   # Regex field extraction
│   │   │   ├── __tests__/             # Jest unit tests (extraction + matching)
│   │   │   └── validationService.js   # PO match scoring + duplicate detection
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
│   │   ├── components/             # Layout (sidebar/nav), Modal, ConfirmDialog
│   │   ├── context/AuthContext.jsx # Auth state, localStorage-backed
│   │   ├── services/api.js         # Axios instance + per-resource API wrappers
│   │   └── utils/                  # helpers, permissions (RBAC UI rules), motion (page transitions)
│   └── vite.config.js              # Dev proxy: /api, /uploads → localhost:5000
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

## Known limitations

- OCR runs synchronously within the request — fine at current scale, would need a job queue for high-volume concurrent processing.
- No scanned-PDF (image-only) → OCR fallback yet; only PDFs with an embedded text layer extract text via `pdf-parse`.
- Field extraction is regex/heuristic-based — accurate on clean, labeled invoices, degrades on unusual layouts. This is the intentional seam for plugging in a real model (see "Designed extension point" in `docs/ARCHITECTURE.md`).
- No real email delivery for password resets — the reset link is returned directly by the API outside production, since no SMTP service is configured for this demo.
- Uploaded files live on local disk, not object storage.
- Test coverage is limited to the pure extraction/matching logic — no integration tests against a live DB/HTTP layer yet.

## Contributing / extending

- Swap the extraction engine: implement the same `{ value, confidence }` shape as `extractInvoiceData()` in `backend/src/services/extractionService.js` and call it from `invoiceController.triggerOCR` — nothing else needs to change.
- Add a new invoice field: extend `extractedData` in `Invoice.js`, add an extractor in `extractionService.js`, add it to `FIELD_META` in `frontend/src/pages/InvoiceDetail.jsx`, and (optionally) make it selectable in a vendor's `requiredFields`.
- Enforce RBAC: the `authorize(...roles)` middleware already exists in `backend/src/middleware/auth.js` — apply it to the routes that need it.
