# Architecture

This document explains how Ledger is put together internally: the request lifecycle, the invoice state machine, the OCR/extraction pipeline, the matching algorithm, and the frontend structure. For "how do I run this", see [SETUP.md](./SETUP.md). For endpoint contracts, see [API.md](./API.md).

## 1. System overview

```
┌─────────────────────────┐          ┌──────────────────────────────┐
│        Frontend          │  HTTPS   │            Backend             │
│  React 18 + Vite + Tailwind ───────▶│   Express REST API (Node.js)   │
│  (localhost:5173 in dev) │  JSON    │      (localhost:5000)          │
└─────────────────────────┘          └───────────────┬────────────────┘
                                                       │
                              ┌────────────────────────┼────────────────────────┐
                              │                         │                         │
                       ┌──────▼──────┐         ┌────────▼────────┐      ┌────────▼────────┐
                       │  OCR layer   │         │ Extraction layer │      │ Validation layer │
                       │ Tesseract.js │         │  Regex / heuristic│      │ PO match scoring │
                       │ pdf-parse    │         │  field parser     │      │ Duplicate detect │
                       └──────────────┘         └──────────────────┘      └──────────────────┘
                                                       │
                                              ┌─────────▼─────────┐
                                              │      MongoDB        │
                                              │  Users / Vendors /   │
                                              │  PurchaseOrders /    │
                                              │  Invoices            │
                                              └──────────────────────┘
```

The backend is a single Express app (`backend/server.js`) — no separate microservices. OCR, extraction, and validation are plain Node modules under `backend/src/services/`, called synchronously inside the request/response cycle of the invoice controller. There's no job queue; OCR runs while the user waits (the UI shows a spinner during `POST /api/invoices/:id/ocr`).

In dev, Vite proxies `/api` and `/uploads` to `localhost:5000` (`frontend/vite.config.js`), so the frontend never hardcodes a backend origin.

## 2. Request lifecycle — uploading and processing an invoice

This is the core flow of the app, spanning multiple user actions (each is a separate HTTP call, not one pipeline):

```
1. POST /api/invoices              (multipart upload)
     → multer saves file to backend/uploads/
     → SHA-256 hash computed over file bytes
     → Invoice doc created, status = "uploaded"
     → optional purchaseOrderId links the invoice to a vendor up front

2. POST /api/invoices/:id/ocr       (user clicks "Start OCR")
     → ocrService.extractText() dispatches by mimetype:
         application/pdf      → pdf-parse (reads embedded text layer)
         image/jpeg|png|tiff  → Tesseract.js (WASM OCR)
     → extractionService.extractInvoiceData(text) runs ~10 regex extractors
     → checkDuplicate() re-runs against the hash + invoice number
     → status = "ocr_extracted"

3. PATCH /api/invoices/:id/fields   (user corrects a field, optional, repeatable)
     → diffs incoming values against baseline (extracted ∪ previously verified)
     → every changed key is appended to invoice.fieldChanges (full audit trail)
     → userVerifiedData is merged (verified values always win over OCR values)
     → status = "pending_review"

4. POST /api/invoices/:id/match     (user clicks "Submit for Matching")
     → merges userVerifiedData over extractedData → verifiedData
     → re-runs duplicate check (so a deleted duplicate doesn't permanently block)
     → if invoice.purchaseOrder is set: validationService.validateAgainstPO()
       scores vendor name, PO number, totals, currency, subtotal, line item count
     → if no PO linked: falls back to a fuzzy vendor-name-only check
     → duplicate hit forces status to "review_required" regardless of score
     → status = "passed" | "review_required"

5. POST /api/invoices/:id/reject    (user manually rejects, any stage)
     → status = "rejected", reason logged
```

Every step appends a `processingLog` entry (`{ action, details, status, timestamp }`) — this is what powers the "Processing Log" panel in `InvoiceDetail.jsx` and gives a full audit trail without a separate logging service.

## 3. Invoice state machine

```
            upload                 OCR              fields saved        match run
 (none) ──────────────▶ uploaded ──────────▶ ocr_extracted ──────────▶ pending_review
                                       │                                       │
                                       │ (user edits fields                    │ match run
                                       │  again after OCR)                     ▼
                                       └───────────────────────────▶  passed | review_required
                                                                                │
                                                                  re-submit ────┘ (loops back
                                                                  for matching)   to itself)

 any state ─────────────────────────── reject ──────────────────────────▶ rejected
```

States live on `Invoice.status` (`backend/src/models/Invoice.js`):

| Status | Meaning | Who can edit fields | Can re-run match |
|---|---|---|---|
| `uploaded` | File stored, no OCR yet | — | — |
| `ocr_extracted` | OCR + regex extraction done | ✅ | ✅ |
| `pending_review` | User has saved at least one field edit | ✅ | ✅ |
| `review_required` | Matching ran, score too low or high-severity discrepancy found | ✅ | ✅ (re-run after fixing) |
| `passed` | Matching ran, score ≥ 60 and no high-severity discrepancy | ❌ | — |
| `rejected` | User manually rejected | ❌ | — |

`updateFields` and `submitMatching` both guard with an allow-list of statuses (`['ocr_extracted', 'pending_review', 'review_required']`) so a `passed`/`rejected` invoice is effectively locked.

## 4. OCR layer (`backend/src/services/ocrService.js`)

Two extractors behind one dispatch function (`extractText`):

- **PDF** → `pdf-parse` reads the embedded text layer directly. No image rendering, no OCR engine — this only works for PDFs that were generated with real text (not scanned images saved as PDF). Confidence is heuristically set to 90 if more than 50 chars come back, else 40.
- **Image** (`jpeg`/`jpg`/`png`/`tiff`) → `Tesseract.js`, which runs a WASM OCR engine entirely in the Node process — no external OCR service or API key required. Confidence comes straight from Tesseract's own score.

**Known gap, called out in code comments:** a scanned PDF (image embedded in a PDF wrapper, no text layer) is not handled — `pdf-parse` returns near-empty text and there's no PDF→image rasterization step to hand off to Tesseract. The fix is a small addition (e.g. `pdf-to-img` + Tesseract), not an architecture change.

## 5. Extraction layer (`backend/src/services/extractionService.js`)

A pure-function, regex-based field extractor — no ML model is wired in yet (see §13). Each field has its own extractor function (`extractInvoiceNumber`, `extractVendorName`, `extractGSTNumber`, `extractPONumber`, `extractDates`, `extractCurrency`, `extractAmounts`, `extractLineItems`, `extractBankAccount`), each returning `{ value, confidence }`. A handful of design decisions matter here because they were the source of real bugs during development:

- **Vendor name capture uses `[ \t]`, not `\s`.** `\s` matches newlines, so a greedy character class right after "Vendor:" would swallow the next line (the street address) into the vendor name. Restricting to space/tab keeps the capture on one line.
- **Amount patterns skip any prefix with `[^0-9\n]*` rather than an explicit currency symbol class.** PDF text extraction can mangle currency glyphs (e.g. a `₹` rendered through a font without that glyph can decode as a stray character like `¹`), so matching "anything that isn't a digit or newline" between the label and the number is more robust than enumerating `[$€£₹]`.
- **Currency detection checks symbols first, then an explicit `Currency: XXX` label, then a whitelist of ISO codes (`USD|EUR|GBP|INR|JPY|CAD|AUD|CHF|CNY`) — never a generic `[A-Z]{3}` pattern.** A generic 3-letter-uppercase pattern matches words like "TAX" inside "TAX INVOICE" headers, which silently produced bogus currencies.
- **Tax amount extraction requires a word boundary around `tax|vat|gst|hst` and a literal colon before the number** (`\b(?:tax|vat|gst|hst)\b[^:\n]*:\s*[^0-9\n]*(\d...)`). Without the `\b`, `gst` matches inside `GSTIN`, and the regex would capture the GSTIN's embedded state code as the tax amount instead of the real tax line.
- **The "From:" vendor-name pattern's stop-words are wrapped in `\b` boundaries** (`(?:\n|\b(?:ltd|llc|inc|corp|co\.)\b)`). Without them, a name like "TechCorp" gets truncated to "Tech" — the lazy capture stops as soon as it finds "corp" *anywhere*, including embedded inside a larger word, not just as a standalone suffix like "Acme Corp". Caught by the test in `__tests__/extractionService.test.js`, not by manual testing — see §10.

`overallConfidence` and `extractedFieldCount` are computed only from four "key fields" (invoice number, vendor name, invoice date, total amount) — these drive the confidence dots shown in the UI, not every extracted field.

## 6. Validation / matching layer (`backend/src/services/validationService.js`)

`validateAgainstPO(verifiedData, purchaseOrder, vendor)` is a deterministic point-scoring function, not a fuzzy ML matcher:

| Check | Points | Pass condition |
|---|---|---|
| Vendor name | 20 | normalized substring/equality match against PO's vendor |
| PO number | 25 | normalized exact match |
| Total amount | 30 | within 5% tolerance of PO total |
| Currency | 10 | exact match (or absent, given benefit of the doubt) |
| Subtotal | 10 | within 5% tolerance |
| Line item count | 5 | exact count match |

`matchScore = min(100, sum of points earned)`. A missing field earns partial credit (so an invoice that simply didn't extract a subtotal isn't punished as hard as one with a *wrong* subtotal). Any **high-severity** discrepancy (vendor mismatch, PO mismatch, total off by >10%, missing total) or a score under 60 forces `review_required` instead of `passed`.

If the invoice has no linked PO, matching falls back to a much looser check: does the extracted vendor name fuzzy-match any active vendor in the system at all? Score is binary (80 if yes, 40 if no).

**Duplicate detection** (`computeFileHash` + `checkDuplicate`) is independent of PO matching and runs every time `submitMatching` is called (not just once at OCR time), specifically so that deleting a duplicate later doesn't leave a stale block in place. It matches on SHA-256 file hash OR exact invoice number, excluding the invoice's own ID. A duplicate hit overrides everything else and forces `review_required`, even if the PO match was perfect.

## 7. Auth & roles

Stateless JWT auth (`backend/src/middleware/auth.js`):

- `POST /api/auth/register` / `/login` issue a signed JWT (`jsonwebtoken`, `JWT_EXPIRES_IN`, default 7d) containing only `{ id }`.
- Passwords are hashed with `bcryptjs` (12 rounds) in a Mongoose `pre('save')` hook on `User`; the field has `select: false` so it never comes back in a normal query.
- `protect` middleware reads `Authorization: Bearer <token>`, verifies it, and loads the user fresh from the DB on every request (so a deleted user is immediately locked out, not just an unauthenticated request).
- The frontend stores `token` + `user` in `localStorage` (`AuthContext.jsx`) and attaches the token via an axios request interceptor (`frontend/src/services/api.js`). A response interceptor catches any `401` globally and force-logs-out + redirects to `/login` — so token expiry is handled in one place rather than per-page.
- **Password reset** (`POST /api/auth/forgot-password`, `POST /api/auth/reset-password/:token`): a SHA-256-hashed, 1-hour-expiry token stored on the user document. No SMTP service is wired up, so outside `NODE_ENV=production` the raw reset link is returned directly in the response (and logged server-side) so the demo doesn't need a mail server — see the comments in `authController.forgotPassword` for exactly where to swap in a real mailer. The endpoint always returns the same generic message whether or not the email exists, so it can't be used to enumerate registered accounts.

**Roles** (`admin | accountant | viewer`) are enforced, not just modeled:

| Role | Can read | Can write (vendors/POs/invoices) | Can delete |
|---|---|---|---|
| `viewer` | ✅ | ❌ | ❌ |
| `accountant` | ✅ | ✅ | ❌ |
| `admin` | ✅ | ✅ | ✅ (vendors, invoices) |

Enforced server-side via an `authorize(...roles)` middleware applied per-route (e.g. `backend/src/routes/vendorRoutes.js`) — a `403` comes back from the API regardless of what the UI shows. The frontend mirrors the same rules in `frontend/src/utils/permissions.js` purely so it can hide/disable actions a user can't perform, rather than letting them submit a form that 403s. **Self-registration always creates an `accountant` account** — `role` in the `POST /api/auth/register` body is intentionally ignored server-side (`authController.register`), closing what would otherwise be a privilege-escalation hole (anyone could otherwise register themselves as `admin`). `admin`/`viewer` accounts are provisioned directly via `backend/src/utils/seed-test.js`, not through the public endpoint.

## 8. Designed extension point: pluggable ML extraction

`extractionService.js` is intentionally a drop-in-replaceable module. The regex extractor can be swapped for a real model (e.g. LayoutLMv3, which understands document layout, not just text) without touching the controller:

```
POST /api/ml/extract
Body:     { text: string, fileBase64?: string }
Response: { fields: ExtractedData }   // same shape extractInvoiceData() returns today
```

As long as the replacement returns the same `{ value, confidence }`-shaped field map, `invoiceController.triggerOCR` doesn't need to change.

## 9. Frontend architecture

- **Routing** (`frontend/src/App.jsx`): a flat `react-router-dom` v6 tree. `PrivateRoute` wraps every authenticated page in `Layout` and redirects to `/login` if `useAuth().user` is null. The `/` route is special-cased (`HomeRoute`): logged-out visitors see the public `Landing` page, logged-in users see `Dashboard` — both at the same URL.
- **Auth state** (`frontend/src/context/AuthContext.jsx`): a single React context backed by `localStorage`, no Redux/Zustand. `login`/`register` call the API, persist the token+user, and set state; route guards react to that state automatically.
- **API client** (`frontend/src/services/api.js`): one axios instance per concern (`authAPI`, `vendorAPI`, `poAPI`, `invoiceAPI`, `dashboardAPI`), all thin wrappers over a shared `axios.create({ baseURL: '/api' })` instance with the auth/401 interceptors described above.
- **Design system**: "Ink & Ledger" — a deliberately non-default Tailwind theme (`frontend/tailwind.config.js`) using a deep forest-green `ink` palette, warm `amber` accents, and an `ivory` neutral scale, paired with Fraunces (serif display), Plus Jakarta Sans (body), and JetBrains Mono (numeric/code values). Shared component classes (`btn-primary`, `btn-secondary`, `card`, `input`, status badges) live in `frontend/src/index.css` so every page composes the same primitives instead of redefining button styles inline.
- **Pages map 1:1 to backend resources**: `Dashboard`, `Vendors` / `VendorDetail`, `PurchaseOrders` / `PurchaseOrderDetail` / `NewPurchaseOrder`, `Invoices` / `InvoiceDetail`, `UploadInvoice`, plus `Landing`, `Login`, `Register`, `ForgotPassword`, `ResetPassword`. (`InvoiceList.jsx` and `InvoiceUpload.jsx` exist in the tree but are superseded by `Invoices.jsx`/`UploadInvoice.jsx` and are not routed — dead files left from an earlier iteration.)
- **InvoiceDetail** is the most stateful page: it renders a different layout per invoice status (centered "start OCR" card for `uploaded`, a split file-preview/editable-fields view for `ocr_extracted | pending_review | review_required`, and read-only result views for `passed | rejected`), and tracks unsaved field edits locally (`editedFields`, `changedKeys`) before they're pushed to the backend. Every action surfaces a toast (`react-hot-toast`, configured in `main.jsx`) in addition to the inline error banner, and destructive actions (vendor/invoice delete) go through `ConfirmDialog` rather than the browser's native `confirm()`.
- **VendorDetail** (`GET /vendors/:id/summary`) is a read-only drill-down: a vendor's full PO + invoice history, rolled-up total PO value / total invoiced, and a flagged-invoice count — without it, a vendor was just a name on a card grid with no way to see what's actually been ordered or billed from them.

## 10. Data layer

MongoDB via Mongoose, four collections — see [DATA_MODELS.md](./DATA_MODELS.md) for full schemas. No separate caching layer; every list endpoint does plain `find()` + `countDocuments()` pagination. Indexes exist on `Invoice.uploadedFile.hash`, `Invoice.status + createdAt`, `Invoice.vendor`, and a text index on `Vendor.name + email`.

CSV export (`GET /invoices/export`, `GET /purchase-orders/export`) reuses the same query filters as the paginated list endpoints but returns every matching row, built with a small in-house CSV helper (`backend/src/utils/csv.js`) rather than a dependency — the escaping rules for a CSV cell are a handful of lines, not worth a package for this scale of export.

## 11. Input validation

`express-validator` rule chains (`backend/src/validators/*.js`) run per-route, ahead of the controller, via a shared `handleValidation` middleware (`backend/src/middleware/validate.js`) that collects every failing field into one `400` response: `{ success: false, message, errors: [{ field, message }] }`. This replaces what used to be raw Mongoose `ValidationError`/`CastError` text reaching the client. Validated: registration/login/password-reset payloads, vendor create/update, PO create/update (line item quantities/prices, tax rate range), and the invoice field-update body shape. Multipart upload validation (`purchaseOrderId` on invoice upload) runs *after* `multer`, since `req.body` for a multipart request isn't populated until multer has parsed it.

## 12. Tests

`backend/src/services/__tests__/` — Jest, pure-function unit tests, no DB or HTTP server needed (`cd backend && npm test`). Covers `extractionService.js` (regression tests for every real extraction bug found during development, including one the test suite itself caught while being written — see §5's note on the `\b` boundary fix) and `validationService.js` (the PO match-scoring formula's point allocations and severity thresholds). Intentionally does not cover `checkDuplicate` (DB-dependent) or the controllers (would need an HTTP/DB integration harness) — out of scope for the time available; see [SETUP.md §6](./SETUP.md#6-run-tests).

## 13. Designed extension point: pluggable ML extraction

`extractionService.js` is intentionally a drop-in-replaceable module. The regex extractor can be swapped for a real model (e.g. LayoutLMv3, which understands document layout, not just text) without touching the controller:

```
POST /api/ml/extract
Body:     { text: string, fileBase64?: string }
Response: { fields: ExtractedData }   // same shape extractInvoiceData() returns today
```

As long as the replacement returns the same `{ value, confidence }`-shaped field map, `invoiceController.triggerOCR` doesn't need to change.

## 14. Known limitations (by design, not oversight)

- OCR runs synchronously in the request — fine for the current single-instance, low-volume use case, but it would need to move to a background job/queue (e.g. BullMQ) before handling concurrent large-volume uploads.
- No scanned-PDF → image fallback (see §4).
- Regex extraction is heuristic; it's accurate for clean, labeled invoices but will degrade on unusual layouts. This is the documented seam for plugging in LayoutLMv3 or a similar model (§13).
- No real email delivery for password resets — the link is returned directly in the API response outside production (see §7). Swap in a mailer (nodemailer + any SMTP provider) before this goes near real users.
- Uploaded files are stored on local disk (`backend/uploads/`), not object storage — fine for a single backend instance, not for horizontal scaling.
- Test coverage is limited to the pure extraction/validation logic (§12) — no integration tests against a real DB/HTTP layer yet.
