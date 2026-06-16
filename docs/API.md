# API Reference

Base URL (dev): `http://localhost:5000/api` (frontend talks to it through the Vite proxy at `/api`).

All responses are JSON and follow one of two shapes:

```jsonc
// success
{ "success": true, "data": { ... }, /* list endpoints also include */ "total": 0, "page": 1, "pages": 0 }

// error
{ "success": false, "message": "Human-readable error", /* dev only */ "stack": "..." }
```

## Authentication

Every route except `POST /auth/register` and `POST /auth/login` requires:

```
Authorization: Bearer <jwt>
```

Missing/invalid/expired tokens return `401`. The frontend automatically clears local storage and redirects to `/login` on any global `401`.

---

## Auth

### `POST /api/auth/register`
Create a user account and receive a token immediately (no email verification step).

Request body:
```json
{ "name": "Jane Doe", "email": "jane@company.com", "password": "secret123" }
```
Validated: `name` required, `email` required + valid format, `password` ≥ 6 chars. Every self-registered account is created with `role: "accountant"` — **a `role` field in the request body is silently ignored**, not honored. (`admin`/`viewer` accounts are seeded directly, not created through this endpoint — see [ARCHITECTURE.md §7](./ARCHITECTURE.md#7-auth--roles).)

Response `201`:
```json
{
  "success": true,
  "token": "eyJhbGciOi...",
  "user": { "id": "...", "name": "Jane Doe", "email": "jane@company.com", "role": "accountant" }
}
```
`400` on validation failure: `{ "success": false, "message": "...", "errors": [{ "field": "email", "message": "Must be a valid email address" }] }`.

### `POST /api/auth/login`
```json
{ "email": "admin@company.com", "password": "admin123" }
```
Response `200`: same shape as register. `401` with `{"message":"Invalid credentials"}` on bad email/password.

### `GET /api/auth/me`
Requires auth. Returns the currently authenticated user (no password field).
```json
{ "success": true, "user": { "_id": "...", "name": "...", "email": "...", "role": "..." } }
```

### `POST /api/auth/forgot-password`
```json
{ "email": "admin@company.com" }
```
Always responds `200` with the same generic message, whether or not the email is registered (prevents account enumeration):
```json
{ "success": true, "message": "If that email is registered, a password reset link has been generated." }
```
Outside `NODE_ENV=production`, a `resetUrl` field is also included in the response (no SMTP service is configured for this project — see [ARCHITECTURE.md §7](./ARCHITECTURE.md#7-auth--roles)). The same link is logged server-side regardless of environment.

### `POST /api/auth/reset-password/:token`
`:token` is the raw token from the `resetUrl` (not the hash stored in the DB).
```json
{ "password": "newSecret123" }
```
`400` with `{"message":"Reset link is invalid or has expired"}` if the token doesn't match, is already used, or is past its 1-hour expiry. On success, behaves like login/register — returns a token and auto-signs the user in:
```json
{ "success": true, "token": "...", "user": { "id": "...", "name": "...", "email": "...", "role": "..." } }
```

---

## Vendors

Reads need any authenticated role. `POST`/`PUT` need `accountant` or `admin`. `DELETE` is `admin`-only — see [ARCHITECTURE.md §7](./ARCHITECTURE.md#7-auth--roles).

### `GET /api/vendors`
Query params: `search` (full-text on name/email), `status` (`active`|`inactive`), `page`, `limit` (default 20).

Response `200`:
```json
{ "success": true, "data": [ /* Vendor[] */ ], "total": 3, "page": 1, "pages": 1 }
```

### `GET /api/vendors/:id`
Returns a single vendor or `404`.

### `GET /api/vendors/:id/summary`
Drill-down view powering the Vendor Detail page — the vendor plus its full PO/invoice history and rolled-up totals:
```json
{
  "success": true,
  "data": {
    "vendor": { /* Vendor */ },
    "purchaseOrders": [ /* PurchaseOrder[], newest first */ ],
    "invoices": [ /* Invoice[] (no ocrText/processingLog/fieldChanges), newest first */ ],
    "stats": {
      "totalPOs": 3, "totalInvoices": 2,
      "totalPOValue": 32145.75, "totalInvoiced": 26105,
      "flaggedInvoices": 1,
      "statusBreakdown": [ { "_id": "passed", "count": 1 }, ... ]
    }
  }
}
```
`totalPOValue` sums `PurchaseOrder.totalAmount`; `totalInvoiced` sums each invoice's verified (or else extracted) `totalAmount`; `flaggedInvoices` counts invoices in `review_required` or `rejected`.

### `POST /api/vendors`
Body — see [DATA_MODELS.md](./DATA_MODELS.md#vendor) for the full shape. Validated: `name` and `email` required (`email` must be a valid address), `status` if present must be `active`/`inactive`.
```json
{
  "name": "Acme Supplies Pvt Ltd",
  "email": "billing@acmesupplies.in",
  "taxId": "27AABCA1234A1Z5",
  "paymentTerms": "Net 30",
  "requiredFields": [
    { "fieldKey": "vendorName", "fieldLabel": "Vendor Name" },
    { "fieldKey": "totalAmount", "fieldLabel": "Total Amount" }
  ]
}
```
`requiredFields` drives which fields are shown as "required" (and validated more strictly in the UI) when reviewing an invoice tied to this vendor. Response `201` with the created vendor. `400` on validation failure (same `errors[]` shape as auth).

### `PUT /api/vendors/:id`
Same body shape and validation as create, partial updates allowed. `404` if not found.

### `DELETE /api/vendors/:id`
`{ "success": true, "message": "Vendor deleted" }`. Does **not** cascade-delete related POs/invoices — they keep a now-dangling `vendor` reference.

---

## Purchase Orders

Reads need any authenticated role. `POST`/`PUT` need `accountant` or `admin`. Note that `status` can also change as a *side effect* of `POST /api/invoices/:id/match` — a PO automatically flips to `"closed"` the moment an invoice passes against it, with no separate PO API call involved (see [ARCHITECTURE.md §6a](./ARCHITECTURE.md#6a-bulk-friendly-po-matching-auto-detect-on-extraction-auto-close-on-pass)).

### `GET /api/purchase-orders`
Query params: `vendor` (ObjectId), `status` (`draft`|`approved`|`closed`|`cancelled`), `page`, `limit`.

### `GET /api/purchase-orders/export`
Same filters as the list endpoint (`vendor`, `status`), no pagination — returns every matching row. Response is `text/csv` with a `Content-Disposition: attachment` header (PO number, vendor, dates, line item count, subtotal/tax/total, currency, status, created date).

### `GET /api/purchase-orders/:id`
Populates `vendor`.

### `POST /api/purchase-orders`
Validated: `vendor` required + must be a valid ObjectId, `lineItems` must be a non-empty array with a `description`, `quantity` (> 0), and `unitPrice` (≥ 0) per item, `taxRate` (if present) 0–100, `currency` (if present) exactly 3 letters, `status` (if present) one of the enum values.
```json
{
  "vendor": "<vendorId>",
  "issueDate": "2026-01-15",
  "expectedDelivery": "2026-02-01",
  "currency": "INR",
  "taxRate": 18,
  "status": "approved",
  "lineItems": [
    { "description": "Widgets", "quantity": 100, "unitPrice": 400 }
  ]
}
```
The server computes `subTotal`, `tax` (from `taxRate`), `totalAmount`, and each line item's `totalPrice` — don't send those, they're derived. `poNumber` is auto-generated (`PO-<year>-<00001>`) if omitted. Response `201`. `400` on validation failure.

### `PUT /api/purchase-orders/:id`
Partial update — same field rules as create but every field is optional (only validated when present). Note: unlike create, this does **not** recompute totals from `lineItems`/`taxRate` if you send them — it's a direct `findByIdAndUpdate`.

---

## Invoices

Reads need any authenticated role. Upload/OCR/field-edit/match/reject need `accountant` or `admin`. `DELETE` is `admin`-only.

### `GET /api/invoices`
Query params: `status`, `vendor`, `purchaseOrder`, `page`, `limit` (default 20). List items omit `ocrText` and `processingLog` for payload size; fetch a single invoice for those.

### `GET /api/invoices/export`
Same filters as the list endpoint (`status`, `vendor`, `purchaseOrder`), no pagination — returns every matching row as `text/csv` with a `Content-Disposition: attachment` header (invoice number, vendor, PO number, total amount, currency, status, match score, discrepancy count, filename, upload date). Uses verified values where present, falling back to the OCR-extracted value.

### `GET /api/invoices/:id`
Full invoice document — `extractedData`, `userVerifiedData`, `fieldChanges` (with `changedBy` populated), `validationResult`, `processingLog`, populated `vendor` and `purchaseOrder.vendor`.

### `POST /api/invoices` — upload
`multipart/form-data`:
| field | required | notes |
|---|---|---|
| `invoice` | yes | the file — PDF, JPG, or PNG, max 10 MB |
| `purchaseOrderId` | no | **manual override, not the expected path.** Bulk/normal usage: omit this — the PO is detected automatically from the invoice's own PO number once OCR runs (see the `/ocr` endpoint below and [ARCHITECTURE.md §6a](./ARCHITECTURE.md#6a-bulk-friendly-po-matching-auto-detect-on-extraction-auto-close-on-pass)). Only set this when the invoice doesn't print a PO number, or extraction is expected to misread it. If set, it always wins — auto-detection never overwrites a manually-chosen PO. |

No OCR runs here — the invoice is created with `status: "uploaded"` and a SHA-256 hash of the file is stored. Response `201` with the created invoice. `400` if no file or wrong mimetype (multer's `fileFilter` rejects anything except `application/pdf`, `image/jpeg`, `image/jpg`, `image/png`).

### `POST /api/invoices/:id/ocr` — run OCR + extraction
No body. Only valid when `status` is `uploaded` or `ocr_extracted` (re-runnable). Runs `pdf-parse` or `Tesseract.js` depending on mimetype, then the regex extractors, then a duplicate check. On success, `status → ocr_extracted` and the populated invoice is returned. `500` with `{"message":"OCR processing failed","error":"..."}` if the OCR engine throws (also logged into `processingLog`).

**If no PO was linked at upload**, this is also where auto-detection happens: the PO number extraction just found is looked up against every PO in the system (any status — not just `approved`, so an invoice referencing an already-closed PO still gets linked rather than silently falling through to a looser fallback) and linked automatically if found. Check `data.purchaseOrder` in the response, or `processingLog` for a `"PO Auto-Matched"` (success) or `"PO Auto-Match Failed"` (warning — no PO with that number exists) entry.

### `PATCH /api/invoices/:id/fields` — save user-verified field values
```json
{ "fields": { "vendorName": "Acme Supplies Pvt Ltd", "totalAmount": 56640 } }
```
Only valid when `status` is `ocr_extracted`, `pending_review`, or `review_required`. `fields` is validated as required and must be a non-empty object — `{}` or a missing `fields` key returns `400`. Diffs each key against the current baseline (verified value if present, else the OCR-extracted value) and appends an entry to `fieldChanges` for anything that actually changed (full before/after + who + when). `status → pending_review`. Returns the populated invoice.

### `POST /api/invoices/:id/match` — run PO matching
No body. Only valid in the same three statuses as above. Merges `userVerifiedData` over `extractedData`, and:
- **if still no PO is linked**, makes one more auto-detection attempt using the verified PO number (covers a user correcting a misread PO number during review before a PO was ever auto-linked at OCR time)
- re-runs the duplicate check
- if a PO is linked (whether from upload, OCR auto-detect, or the line above) → scores against it, including a check that the PO's own `status` is `"approved"` (see [ARCHITECTURE.md §6a](./ARCHITECTURE.md#6a-bulk-friendly-po-matching-auto-detect-on-extraction-auto-close-on-pass)) — a `draft`/`closed`/`cancelled` PO is an automatic high-severity discrepancy, forcing review regardless of how well everything else matches
- if no PO is linked at all → loose fuzzy vendor-name check only
- a duplicate hit always forces `review_required`

`status → passed | review_required`. Returns the populated invoice including `validationResult: { status, matchScore, discrepancies[], duplicateCheck }`.

**If the result is `"passed"` and a PO was matched, that PO's `status` is immediately set to `"closed"`** — so it can never be matched (and silently passed) by a second invoice. A `poStatus` discrepancy is exactly what catches that second invoice: see ARCHITECTURE.md §6a for the full reasoning.

### `POST /api/invoices/:id/reject`
```json
{ "reason": "Wrong PO attached" }
```
`reason` optional. Works from any status. `status → rejected`.

### `DELETE /api/invoices/:id`
`{ "success": true, "message": "Invoice deleted" }`. Does not delete the file from `backend/uploads/`.

---

## Dashboard

### `GET /api/dashboard/stats`
```json
{
  "success": true,
  "data": {
    "invoices": {
      "total": 5, "passed": 1, "rejected": 0,
      "reviewRequired": 1, "pendingReview": 1, "ocrExtracted": 1,
      "inProgress": 3, "uploaded": 1
    },
    "vendors": 3,
    "purchaseOrders": 9,
    "recentInvoices": [ /* last 5, populated vendor + PO */ ],
    "statusBreakdown": [ { "_id": "passed", "count": 1 }, ... ]
  }
}
```

---

## Users (admin-only)

Every route below requires the `admin` role — there is exactly one fixed admin account in this system (`admin@company.com`, provisioned via `seed-test.js`), so these are the admin's tools for managing everyone else. See [ARCHITECTURE.md §7](./ARCHITECTURE.md#7-auth--roles).

### `GET /api/users`
Lists every user, newest first.
```json
{ "success": true, "data": [ { "_id": "...", "name": "...", "email": "...", "role": "accountant", "createdAt": "..." }, ... ] }
```

### `PATCH /api/users/:id/role`
```json
{ "role": "viewer" }
```
`role` must be `"accountant"` or `"viewer"` — **`"admin"` is rejected by validation**, and a `400` is returned if the target user already has the `admin` role (the admin account's role can never be changed through this endpoint, by design, not just by convention). Response `200` with the updated user.

---

## Error reference

| Status | Cause |
|---|---|
| 400 | `express-validator` rejection (see `errors[]` in the response body), Mongoose validation error, invalid action for current invoice status, duplicate-key on a unique field (e.g. email), expired/invalid password-reset token |
| 401 | No token, invalid/expired token, bad login credentials |
| 403 | Role not authorized for this action — e.g. a `viewer` attempting any write, or a non-`admin` attempting a delete |
| 404 | Resource not found by ID |
| 500 | Unhandled error (OCR engine failure, DB connection issue, etc.) — includes `stack` only when `NODE_ENV=development` |
