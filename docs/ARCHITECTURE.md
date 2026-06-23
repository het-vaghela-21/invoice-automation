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
                       │ Tesseract.js │         │  Regex baseline   │      │ PO match scoring │
                       │ pdf-parse    │         │  + ML overlay     │      │ + ML vendor match│
                       └──────────────┘         └────────┬─────────┘      │ + anomaly score  │
                                                         │                 │ Duplicate detect │
                                                         │                 └────────┬─────────┘
                                          ┌──────────────▼──────────────┐          │
                                          │  Python FastAPI ML service    │◀─────────┘
                                          │  (:8000, OPTIONAL sidecar)     │  HTTP via mlClient.js
                                          │  NER · confidence · match ·    │  (8s timeout, regex
                                          │  anomaly — falls back if down  │   fallback on failure)
                                          └────────────────────────────────┘
                                                       │
                                              ┌─────────▼─────────┐
                                              │      MongoDB        │
                                              │  Users / Vendors /   │
                                              │  PurchaseOrders /    │
                                              │  Invoices            │
                                              └──────────────────────┘
```

The backend is a single Express app (`backend/server.js`). OCR, extraction, and validation are plain Node modules under `backend/src/services/`, called inside the request/response cycle of the invoice controller. There's no job queue; OCR runs while the user waits (the UI shows a spinner during `POST /api/invoices/:id/ocr`).

There is **one optional sidecar**: a Python FastAPI ML microservice (`ml-service/`, port 8000) that the Node backend calls over HTTP via `ml-service/mlClient.js` to augment extraction, vendor matching, and add anomaly scoring (§14). It is optional at runtime — every ML call is wrapped in try/catch with an 8s timeout, and any failure falls back to the in-process regex/substring logic, so the system is fully functional whether or not the ML service is running.

In dev, Vite proxies `/api` and `/uploads` to `localhost:5000` (`frontend/vite.config.js`), so the frontend never hardcodes a backend origin.

## 2. Request lifecycle — uploading and processing an invoice

This is the core flow of the app, spanning multiple user actions (each is a separate HTTP call, not one pipeline):

```
1. POST /api/invoices              (multipart upload)
     → multer saves file to backend/uploads/
     → SHA-256 hash computed over file bytes
     → Invoice doc created, status = "uploaded"
     → optional purchaseOrderId manually links the invoice up front — this
       is an override for edge cases, not the expected path; see §6a

2. POST /api/invoices/:id/ocr       (user clicks "Start OCR")
     → ocrService.extractText() dispatches by mimetype:
         application/pdf      → pdf-parse (reads embedded text layer)
         image/jpeg|png|tiff  → Tesseract.js (WASM OCR)
     → extractionService.extractInvoiceData(text) runs ~10 regex extractors
     → if no PO was linked at upload, the extracted PO number is looked up
       against every PO in the system and auto-linked if found — see §6a
     → checkDuplicate() re-runs against the hash + invoice number
     → status = "ocr_extracted"

3. PATCH /api/invoices/:id/fields   (user corrects a field, optional, repeatable)
     → diffs incoming values against baseline (extracted ∪ previously verified)
     → every changed key is appended to invoice.fieldChanges (full audit trail)
     → userVerifiedData is merged (verified values always win over OCR values)
     → status = "pending_review"

4. POST /api/invoices/:id/match     (user clicks "Submit for Matching")
     → merges userVerifiedData over extractedData → verifiedData
     → if still no PO linked, makes one more auto-link attempt using the
       (possibly user-corrected) PO number — see §6a
     → re-runs duplicate check (so a deleted duplicate doesn't permanently block)
     → if invoice.purchaseOrder is set: validationService.validateAgainstPO()
       scores vendor name, PO number, totals, currency, subtotal, line item count,
       *and* the PO's own status (a non-"approved" PO forces review — §6a)
     → if no PO linked: falls back to a fuzzy vendor-name-only check
     → duplicate hit forces status to "review_required" regardless of score
     → status = "passed" | "review_required"
     → if status is "passed", the matched PO is immediately set to "closed" — §6a

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

**Observed flakiness on Windows dev machines:** `pdf-parse` occasionally throws `bad XRef entry` (or, less often, a different parser error) on a `pdfkit`-generated PDF that parses fine moments later with no code or file changes — almost certainly antivirus/Windows Defender real-time scanning transiently locking a freshly-written file before the read completes, not a bug in this codebase. It self-resolves on retry (`POST /:id/ocr` is safe to re-run — see the status guard in `triggerOCR`) and wasn't observed at all in the project's day-to-day demo usage, only when scripting upload-then-immediately-OCR with no human delay in between. Not something this project's code can fix; worth knowing about if you hit it while testing.

## 5. Extraction layer (`backend/src/services/extractionService.js`)

A regex-based field extractor that is **optionally augmented by the ML service** (see §14). Each field has its own extractor function (`extractInvoiceNumber`, `extractVendorName`, `extractGSTNumber`, `extractPONumber`, `extractDates`, `extractCurrency`, `extractAmounts`, `extractLineItems`, `extractBankAccount`), each returning `{ value, confidence }`.

`extractInvoiceData(rawText, filePath)` is **async**: it runs all the regex extractors first to build a complete baseline, then calls `applyMLExtraction()`. This sends the original PDF file to the ML `POST /extract` endpoint (LayoutLMv3 + EasyOCR — see §14) and **fills in fields that regex left empty**. ML does **not** overwrite a field regex already extracted — testing on real invoices showed the current model predicts label-keyword tokens ("Invoice", "Date:") rather than value tokens ("INV-2026-0042", "June 8 2026"), so regex wins where it finds a value and ML supplements where it doesn't. Fields ML never touches (`subTotal`, `tax`, `dueDate`, `currency`, `lineItems`) always stay regex-driven. If the ML service is unreachable the overlay is caught and skipped; the pure regex result is the floor.

A handful of regex design decisions matter here because they were the source of real bugs during development:

- **Vendor name capture uses `[ \t]`, not `\s`.** `\s` matches newlines, so a greedy character class right after "Vendor:" would swallow the next line (the street address) into the vendor name. Restricting to space/tab keeps the capture on one line.
- **Amount patterns skip any prefix with `[^0-9\n]*` rather than an explicit currency symbol class.** PDF text extraction can mangle currency glyphs (e.g. a `₹` rendered through a font without that glyph can decode as a stray character like `¹`), so matching "anything that isn't a digit or newline" between the label and the number is more robust than enumerating `[$€£₹]`.
- **Currency detection checks symbols first, then an explicit `Currency: XXX` label, then a whitelist of ISO codes (`USD|EUR|GBP|INR|JPY|CAD|AUD|CHF|CNY`) — never a generic `[A-Z]{3}` pattern.** A generic 3-letter-uppercase pattern matches words like "TAX" inside "TAX INVOICE" headers, which silently produced bogus currencies.
- **Tax amount extraction requires a word boundary around `tax|vat|gst|hst` and a literal colon before the number** (`\b(?:tax|vat|gst|hst)\b[^:\n]*:\s*[^0-9\n]*(\d...)`). Without the `\b`, `gst` matches inside `GSTIN`, and the regex would capture the GSTIN's embedded state code as the tax amount instead of the real tax line.
- **The "From:" vendor-name pattern's stop-words are wrapped in `\b` boundaries** (`(?:\n|\b(?:ltd|llc|inc|corp|co\.)\b)`). Without them, a name like "TechCorp" gets truncated to "Tech" — the lazy capture stops as soon as it finds "corp" *anywhere*, including embedded inside a larger word, not just as a standalone suffix like "Acme Corp". Caught by the test in `__tests__/extractionService.test.js`, not by manual testing — see §10.

`overallConfidence` and `extractedFieldCount` are computed only from four "key fields" (invoice number, vendor name, invoice date, total amount) — these drive the confidence dots shown in the UI, not every extracted field.

## 6. Validation / matching layer (`backend/src/services/validationService.js`)

`validateAgainstPO(verifiedData, purchaseOrder, vendor, options = {})` is a deterministic point-scoring function, not a fuzzy ML matcher. It stays **pure and synchronous** (which is why its unit tests need no async/mocking): the only ML touch-point is the optional `options.mlVendorMatch` boolean, computed by the async caller (`submitMatching`) and passed in. That hint can only *upgrade* a vendor non-match into a match (rescuing e.g. "TechCorp" vs "Technology Corporation"); it never downgrades a substring match, so a flaky/false ML negative can't wrongly flag a legitimate vendor. With no `options` argument the behaviour is identical to before.

| Check | Points | Pass condition |
|---|---|---|
| Vendor name | 20 | normalized substring/equality match against PO's vendor, **or** ML semantic match (§14) |
| PO number | 20 | normalized exact match |
| Total amount | 25 | within 5% tolerance of PO total |
| Currency | 10 | exact match (or absent, given benefit of the doubt) |
| Subtotal | 10 | within 5% tolerance |
| Line item content | 15 | description + price match per item (see §6b) |

`matchScore = min(100, sum of points earned)`. A missing field earns partial credit (so an invoice that simply didn't extract a subtotal isn't punished as hard as one with a *wrong* subtotal). Any **high-severity** discrepancy (vendor mismatch, PO mismatch, total off by >10%, missing total, unauthorized line item) or a score under 60 forces `review_required` instead of `passed`.

### 6b. Line item content matching

The line item check has been upgraded from a simple count comparison to full content matching. For each invoice line item, the algorithm finds the best-matching PO line item using a combined similarity score:

```
itemSimilarity = 0.6 × Jaccard(description words) + 0.4 × amountSim(unitPrice)
```

Pairs are assigned greedily from highest to lowest similarity (minimum threshold: 0.30 combined, 0.25 description). The result drives both the score contribution and the discrepancies:

| Scenario | Severity |
|---|---|
| Invoice item with no match in PO | **HIGH** (unauthorized charge) |
| Invoice qty > PO qty on matched item | **HIGH** (over-billing) |
| Invoice unit price > PO price + 5% | **HIGH** (price manipulation) |
| PO item missing from invoice | **MEDIUM** (partial delivery) |
| Invoice qty < PO qty | **MEDIUM** (under-delivery) |
| Invoice unit price below PO (discount) | **LOW** |

The structured result (`lineItemMatches`, `unmatchedInvoiceItems`) is stored on `validationResult` so the frontend can render a colour-coded side-by-side comparison table, not just a flat discrepancy string. Full algorithm design: [`docs/PLAN_LINE_ITEM_MATCHING.md`](./PLAN_LINE_ITEM_MATCHING.md).

The line-item description similarity here still uses local Jaccard. The ML `POST /match` endpoint (now live) is currently used only for the top-level vendor-name match (§14); swapping Jaccard for its cosine similarity would be the same one-helper change, with the rest of the matching algorithm unchanged.

If the invoice has no linked PO, matching falls back to a much looser check: does the extracted vendor name fuzzy-match any active vendor in the system at all? Score is binary (80 if yes, 40 if no).

**Duplicate detection** (`computeFileHash` + `checkDuplicate`) is independent of PO matching and runs every time `submitMatching` is called (not just once at OCR time), specifically so that deleting a duplicate later doesn't leave a stale block in place. It matches on SHA-256 file hash OR exact invoice number, excluding the invoice's own ID. A duplicate hit overrides everything else and forces `review_required`, even if the PO match was perfect.

### 6a. Bulk-friendly PO matching: auto-detect on extraction, auto-close on pass

The original design required a human to manually pick the PO at upload time — workable for a handful of invoices, not for a real AP inbox receiving them in bulk. Two pieces close that gap:

**Auto-detect.** `validationService.findPurchaseOrderByNumber(poNumberRaw)` looks up a PO purely from the PO number text OCR already extracted — no manual selection needed for the normal case. It tries a case-insensitive exact match first, then falls back to a normalized comparison (strips punctuation/spacing) to absorb minor OCR noise like `"PO 2026 00001"` vs `"PO-2026-00001"`. It's called from two places, each a safety net for the other:

- `invoiceController.triggerOCR`, right after extraction — the primary path. Only runs `if (!invoice.purchaseOrder && extractedData.poNumber?.value)`: a PO chosen manually at upload always wins and is never overwritten here.
- `invoiceController.submitMatching`, right before scoring — a second chance using whatever's in the verified/extracted PO number *at that point*, which covers a human correcting a misread PO number during review before a PO ever got linked at OCR time.

Critically, **the lookup searches every PO status, not just `approved`** — `draft`, `closed`, and `cancelled` POs are all matchable by number. If it only matched `approved` POs, an invoice referencing an already-closed one would find nothing and silently fall through to the much more lenient fuzzy-vendor-only path, which is exactly the failure mode this feature exists to prevent (see below). Returning the closed PO so it can be flagged is the safer behavior than pretending it doesn't exist.

**The PO-status discrepancy.** `validateAgainstPO` checks `purchaseOrder.status` before anything else: if it isn't `"approved"`, that's an automatic high-severity discrepancy (`{ field: 'poStatus', expected: 'approved', actual: purchaseOrder.status }`), which forces `review_required` regardless of how well everything else matches. This is what makes auto-detecting against non-approved POs safe rather than reckless — a `draft` PO means spending was never approved in the first place, and a `closed`/`cancelled` one means a prior invoice already used it up.

**Auto-close on pass.** The moment `submitMatching` produces a `"passed"` result with a linked PO, `invoiceController.submitMatching` immediately sets that PO's `status` to `"closed"` (a plain `PurchaseOrder.findByIdAndUpdate`, not part of the invoice's own save). This is the other half of the safety net: a PO can only reach `"passed"` while it's still `"approved"` (the discrepancy check above guarantees that), so by the time matching is closing it, it's never closing a PO that was draft/already-closed/cancelled. The net effect: **a second invoice can never silently pass against a PO a prior invoice already closed** — it gets auto-linked (so the connection is visible), scored normally everywhere else, and then stopped cold by the PO-status discrepancy with a clear, specific reason instead of a generic "review me."

This composes with the existing SHA-256/invoice-number duplicate check rather than replacing it — that catches literally-duplicate files or invoice numbers; this catches a *different*, *new* invoice that happens to reference a PO that's already been fulfilled (e.g. a vendor re-billing the same PO, or a corrected invoice arriving after the original was already approved and paid).

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

Enforced server-side via an `authorize(...roles)` middleware applied per-route (e.g. `backend/src/routes/vendorRoutes.js`) — a `403` comes back from the API regardless of what the UI shows. The frontend mirrors the same rules in `frontend/src/utils/permissions.js` purely so it can hide/disable actions a user can't perform, rather than letting them submit a form that 403s. **Self-registration always creates an `accountant` account** — `role` in the `POST /api/auth/register` body is intentionally ignored server-side (`authController.register`), closing what would otherwise be a privilege-escalation hole (anyone could otherwise register themselves as `admin`).

**There is exactly one admin, by design — not "an admin role anyone can hold."** `admin@company.com` is provisioned directly via `backend/src/utils/seed-test.js`, not through the public registration endpoint, and `PATCH /api/users/:id/role` (admin-only, `backend/src/controllers/userController.js`) refuses two things to keep that invariant intact: it rejects `role: "admin"` outright at the validator (`backend/src/validators/userValidators.js` only allows `accountant`/`viewer`), and it refuses to touch a user whose *current* role is already `admin` — so the admin can manage everyone else's role but can't be reassigned or accidentally lock themselves out. The frontend's Team & Roles page (`frontend/src/pages/Users.jsx`, admin-only route) is where this happens: every new self-registered user shows up there as an `accountant`, and the admin demotes anyone who should be read-only to `viewer` with a dropdown.

## 8. Pluggable ML extraction — the seam and what's in it now

`extractionService.js` is designed as a drop-in-replaceable module: `extractInvoiceData()` overlays ML output on the regex baseline without the controller knowing or caring. The seam is `applyMLExtraction(base, rawText, filePath)` — swap what it calls and everything else stays the same.

**What's in the seam today:** LayoutLMv3 (see §14). The previous occupant was a spaCy NER model; it has been fully replaced. Testing on the project's invoices showed the current LayoutLMv3 weights predict label-keyword positions rather than value spans ("Invoice" instead of "INV-2026-0042"), so the overlay is conservative — ML only fills fields regex left empty, never overwrites a clean regex hit. If a future fine-tuned model produces better span boundaries, the only change needed is in `ml-service/main.py`; the Node side is model-agnostic.

## 9. PDF annotation overlay (`frontend/src/components/PDFAnnotationViewer.jsx`)

The `InvoiceDetail` split view (shown for `ocr_extracted`, `pending_review`, and `review_required` statuses) renders the source PDF on the left with extracted field values highlighted directly on it, so a reviewer can cross-reference what the system extracted against exactly where it appears in the document.

**How it works:**

- `react-pdf` (pdf.js wrapper) renders the PDF page-by-page to a `<canvas>` element and overlays a transparent text layer above it. The text layer positions individual text items at their exact on-page coordinates — this is what makes text selection and search possible in any PDF viewer.
- `customTextRenderer` intercepts each text item before it's placed in the layer and returns HTML. Matched values are wrapped in `<mark>` elements with a semi-transparent (`rgba(..., 0.30)`) background so the canvas text underneath remains legible while the highlight is visible.
- The matching is a multi-variant substring search: for each field (vendorName, invoiceNumber, totalAmount, invoiceDate, poNumber, gstNumber, bankAccount), the extracted value and its numeric variants (comma-formatted, fixed-decimal) are compiled into regex patterns that run against each text item string. Multiple fields can match the same text item — the first match wins to avoid overlapping marks.
- Overlapping matches within a single text item are handled by a sorted, cursor-advancing merge: scan left to right, skip any match that starts before the current write cursor, emit plain escaped HTML between matches and marked HTML for each match.

**Colour palette** — each field gets a distinct hue, shown in a chip legend above the PDF:

| Field | Chip bg (legend) | Mark bg (in-PDF) |
|---|---|---|
| Vendor | amber `#fef9c3` | `rgba(202,138,4, 0.30)` |
| Invoice # | blue `#dbeafe` | `rgba(59,130,246, 0.30)` |
| Total | green `#dcfce7` | `rgba(22,163,74, 0.30)` |
| Date | purple `#f3e8ff` | `rgba(147,51,234, 0.30)` |
| PO # | orange `#ffedd5` | `rgba(234,88,12, 0.30)` |
| GST/Tax | teal `#ccfbf1` | `rgba(13,148,136, 0.30)` |
| Bank Acct | pink `#fce7f3` | `rgba(219,39,119, 0.30)` |

Legend chips are only rendered for fields where the extracted value is non-null. Clicking a chip isolates that field's highlight (all others dim to 25% opacity); clicking again restores all highlights. A "Show all" button resets from isolated mode.

**Width tracking:** a `ResizeObserver` on the scroll container feeds the `<Page width={containerWidth}>` prop so pages fill the available space exactly — no fixed pixel width, responsive to the split-view's flex layout.

**Graceful fallback:** for image invoices (JPEG/PNG) or when `extractedData` has no non-null values, the component renders a plain `<img>` or an empty placeholder respectively.

**pdf.js worker:** configured via `new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url)` (Vite-compatible local worker, no CDN dependency).

## 10. Frontend architecture

- **Routing** (`frontend/src/App.jsx`): a flat `react-router-dom` v6 tree. `PrivateRoute` wraps every authenticated page in `Layout` and redirects to `/login` if `useAuth().user` is null. The `/` route is special-cased (`HomeRoute`): logged-out visitors see the public `Landing` page, logged-in users see `Dashboard` — both at the same URL.
- **Auth state** (`frontend/src/context/AuthContext.jsx`): a single React context backed by `localStorage`, no Redux/Zustand. `login`/`register` call the API, persist the token+user, and set state; route guards react to that state automatically.
- **API client** (`frontend/src/services/api.js`): one axios instance per concern (`authAPI`, `vendorAPI`, `poAPI`, `invoiceAPI`, `dashboardAPI`), all thin wrappers over a shared `axios.create({ baseURL: '/api' })` instance with the auth/401 interceptors described above.
- **Design system**: "Ink & Ledger" — a deliberately non-default Tailwind theme (`frontend/tailwind.config.js`) using a deep forest-green `ink` palette, warm `amber` accents, and an `ivory` neutral scale, paired with Fraunces (serif display), Plus Jakarta Sans (body), and JetBrains Mono (numeric/code values). Shared component classes (`btn-primary`, `btn-secondary`, `card`, `input`, status badges) live in `frontend/src/index.css` so every page composes the same primitives instead of redefining button styles inline.
- **Pages map 1:1 to backend resources**: `Dashboard`, `Vendors` / `VendorDetail`, `PurchaseOrders` / `PurchaseOrderDetail` / `NewPurchaseOrder`, `Invoices` / `InvoiceDetail`, `UploadInvoice`, plus `Landing`, `Login`, `Register`, `ForgotPassword`, `ResetPassword`. (`InvoiceList.jsx` and `InvoiceUpload.jsx` exist in the tree but are superseded by `Invoices.jsx`/`UploadInvoice.jsx` and are not routed — dead files left from an earlier iteration.)
- **InvoiceDetail** is the most stateful page: it renders a different layout per invoice status (centered "start OCR" card for `uploaded`, a split file-preview/editable-fields view for `ocr_extracted | pending_review | review_required`, and read-only result views for `passed | rejected`), and tracks unsaved field edits locally (`editedFields`, `changedKeys`) before they're pushed to the backend. Every action surfaces a toast (`react-hot-toast`, configured in `main.jsx`) in addition to the inline error banner, and destructive actions (vendor/invoice delete) go through `ConfirmDialog` rather than the browser's native `confirm()`.
- **VendorDetail** (`GET /vendors/:id/summary`) is a read-only drill-down: a vendor's full PO + invoice history, rolled-up total PO value / total invoiced, and a flagged-invoice count — without it, a vendor was just a name on a card grid with no way to see what's actually been ordered or billed from them.

## 11. Data layer

MongoDB via Mongoose, four collections — see [DATA_MODELS.md](./DATA_MODELS.md) for full schemas. No separate caching layer; every list endpoint does plain `find()` + `countDocuments()` pagination. Indexes exist on `Invoice.uploadedFile.hash`, `Invoice.status + createdAt`, `Invoice.vendor`, and a text index on `Vendor.name + email`.

CSV export (`GET /invoices/export`, `GET /purchase-orders/export`) reuses the same query filters as the paginated list endpoints but returns every matching row, built with a small in-house CSV helper (`backend/src/utils/csv.js`) rather than a dependency — the escaping rules for a CSV cell are a handful of lines, not worth a package for this scale of export.

## 12. Input validation

`express-validator` rule chains (`backend/src/validators/*.js`) run per-route, ahead of the controller, via a shared `handleValidation` middleware (`backend/src/middleware/validate.js`) that collects every failing field into one `400` response: `{ success: false, message, errors: [{ field, message }] }`. This replaces what used to be raw Mongoose `ValidationError`/`CastError` text reaching the client. Validated: registration/login/password-reset payloads, vendor create/update, PO create/update (line item quantities/prices, tax rate range), and the invoice field-update body shape. Multipart upload validation (`purchaseOrderId` on invoice upload) runs *after* `multer`, since `req.body` for a multipart request isn't populated until multer has parsed it.

## 13. Tests

`backend/src/services/__tests__/` — Jest, pure-function unit tests, no DB or HTTP server needed (`cd backend && npm test`). Covers `extractionService.js` (regression tests for every real extraction bug found during development, including one the test suite itself caught while being written — see §5's note on the `\b` boundary fix) and `validationService.js` (the PO match-scoring formula's point allocations and severity thresholds). The extraction tests `jest.mock` the ML client so they exercise the regex path deterministically (and `await` the now-async `extractInvoiceData`) — they never touch the network regardless of whether the ML service is up; the validation tests need no mocking because `validateAgainstPO` stayed pure (§14). Intentionally does not cover `checkDuplicate` (DB-dependent) or the controllers (would need an HTTP/DB integration harness) — out of scope for the time available; see [SETUP.md §6](./SETUP.md#6-run-tests).

## 14. AI/ML layer (integrated, optional at runtime)

A Python FastAPI microservice (`ml-service/`) augments the regex extraction layer and adds two capabilities that can't be expressed as heuristic rules (anomaly detection, semantic vendor matching). It is **wired into the pipeline today**, but **optional at runtime**: the Node backend calls it over HTTP through `backend/src/services/mlClient.js` (axios), and **every call is best-effort** — on any error the caller falls back to the in-process regex/substring logic. `ML_SERVICE_URL` (default `http://localhost:8000`) configures the target.

### Service (`ml-service/main.py`)

All models load once at startup (the binaries are not committed — `ml-service/.gitignore`). Endpoints:

| Endpoint | Model | Input | Returns |
|---|---|---|---|
| `GET /health` | — | — | `{ status, models_loaded }` |
| `POST /extract` | LayoutLMv3 + EasyOCR | PDF or image file (multipart) | `{ grouped, word_count, entity_count }` — `grouped` maps entity labels (`VENDOR`, `INV_NUM`, `AMOUNT`, `INV_DATE`, `PO_NUM`, `GST_NUM`, `BANK_ACC`, `ITEM_*`) to values |
| `POST /confidence` | MLP classifier (scikit-learn) | Field feature vector (JSON) | `{ confidence, confidence_pct }` |
| `POST /match` | Sentence-transformers | `{ name1, name2 }` (JSON) | `{ similarity, is_match, name1, name2 }` (cosine similarity, `is_match` at ≥ 0.5) |
| `POST /anomaly` | Isolation Forest (scikit-learn) | Feature vector (JSON) | `{ anomaly_score, risk_level }` (`low`/`medium`/`high`) |

### The extraction pipeline: LayoutLMv3 + EasyOCR

`/extract` replaced a spaCy NER model with a layout-aware transformer. The pipeline:

1. **EasyOCR** reads the PDF page (after poppler converts it to an image at 150 DPI) and returns word-level bounding boxes.
2. Bounding boxes are normalized to 0–1000 (LayoutLMv3's expected coordinate space).
3. **LayoutLMv3ForTokenClassification** runs token classification over the 23-label BIO scheme (`O` + `B/I-ENTITY` for 11 entity types). Model weights live in `ml-service/layoutlmv3_invoice/`.
4. The BIO sequence is decoded first-span-per-entity: only the **first** consecutive B→I span for each entity type is kept. This avoids the noise of fusing multiple spans across the whole document into one concatenated string.

**Current model quality.** The shipped weights perform well on entity *detection* (correct entity types are found) but predict label-keyword tokens ("Invoice", "Date:") as span starts rather than the actual value tokens ("INV-2026-0042", "June 8 2026"). This is a training-data alignment issue — the model likely learned spans that include the field label. As a result, the Node-side `applyMLExtraction()` is configured conservatively: **ML only fills in fields that regex left empty**; it does not overwrite clean regex extractions. Latency on CPU is 5–35 s depending on document complexity (60 s client timeout in `mlClient.js`).

**To improve:** fine-tune the LayoutLMv3 weights on the project's own invoices with span annotations that start at the value, not the label. The pipeline code in `main.py` and the Node overlay in `extractionService.js` do not need to change — only the model weights need updating.

### How each endpoint is wired into Node

- **`/extract` + `/confidence`** — `extractionService.extractInvoiceData(rawText, filePath)` (§5). Regex runs first and builds the baseline; `applyMLExtraction()` sends the original PDF file as multipart and overlays ML values only where regex found nothing. Confidence for ML-filled fields comes from `/confidence`. The `filePath` is threaded from `invoiceProcessor.runOCR()` through the extraction call so LayoutLMv3 can use the original file (not just its text).
- **`/match`** — `invoiceProcessor.runMatching()` calls `/match` with the verified vendor name vs the PO's vendor name and passes the boolean into `validateAgainstPO(..., { mlVendorMatch })` (§6). It can only rescue a missed substring match, never break one.
- **`/anomaly`** — also in `runMatching()`, after the verdict is set. Derives history-based features from the vendor's prior invoices (amount z-score, 30-day frequency, days-since-last, amount-to-PO ratio, per-line-item amount, round-number flag), calls `/anomaly`, and writes `anomalyScore` + `riskLevel` onto the Invoice. Purely informational — does **not** change the `passed`/`review_required` verdict. If the service is down, `riskLevel` is set to `"unknown"`.

### Design choices

- **`validateAgainstPO` stayed pure & synchronous.** All ML side-effects live in the async processor; the validator receives only an optional boolean hint. Its 15-case unit suite needed no changes and no network mocking.
- **`extractInvoiceData` is async** and its tests mock `mlClient` to exercise the regex path deterministically, independent of whether the ML service is running (§13).
- **Graceful degradation is the contract.** Model binaries are not in the repo; a fresh clone runs on regex alone. Every ML call has a try/catch; the system is fully functional without the ML service.

Startup order and the full fallback table: [`RUNNING.md`](../RUNNING.md).

## 15. Known limitations (by design, not oversight)

- OCR runs synchronously in the request — fine for the current single-instance, low-volume use case, but it would need to move to a background job/queue (e.g. BullMQ) before handling concurrent large-volume uploads.
- No scanned-PDF → image fallback (see §4).
- Regex extraction is heuristic; it's accurate for clean, labeled invoices but will degrade on unusual layouts. The ML service (§14) uses LayoutLMv3 for layout-aware extraction when running, but model binaries aren't committed, so a fresh clone runs on regex alone. Current LayoutLMv3 weights tag label keywords instead of value spans on this project's invoices — regex remains the primary extractor; ML fills gaps only. Fine-tuning on domain-specific annotated data is the path to improving ML extraction quality (§8).
- No real email delivery for password resets — the link is returned directly in the API response outside production (see §7). Swap in a mailer (nodemailer + any SMTP provider) before this goes near real users.
- Uploaded files are stored on local disk (`backend/uploads/`), not object storage — fine for a single backend instance, not for horizontal scaling.
- Test coverage is limited to the pure extraction/validation logic (§12) — no integration tests against a real DB/HTTP layer yet.
