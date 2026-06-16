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
{ "name": "Jane Doe", "email": "jane@company.com", "password": "secret123", "role": "accountant" }
```
`role` is optional — defaults to `accountant`. Allowed values: `admin`, `accountant`, `viewer` (role is stored but not yet enforced on any route).

Response `201`:
```json
{
  "success": true,
  "token": "eyJhbGciOi...",
  "user": { "id": "...", "name": "Jane Doe", "email": "jane@company.com", "role": "accountant" }
}
```

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

---

## Vendors

### `GET /api/vendors`
Query params: `search` (full-text on name/email), `status` (`active`|`inactive`), `page`, `limit` (default 20).

Response `200`:
```json
{ "success": true, "data": [ /* Vendor[] */ ], "total": 3, "page": 1, "pages": 1 }
```

### `GET /api/vendors/:id`
Returns a single vendor or `404`.

### `POST /api/vendors`
Body — see [DATA_MODELS.md](./DATA_MODELS.md#vendor) for the full shape. Minimum required: `name`, `email`.
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
`requiredFields` drives which fields are shown as "required" (and validated more strictly in the UI) when reviewing an invoice tied to this vendor. Response `201` with the created vendor.

### `PUT /api/vendors/:id`
Same body shape as create, partial updates allowed. Runs schema validators. `404` if not found.

### `DELETE /api/vendors/:id`
`{ "success": true, "message": "Vendor deleted" }`. Does **not** cascade-delete related POs/invoices — they keep a now-dangling `vendor` reference.

---

## Purchase Orders

### `GET /api/purchase-orders`
Query params: `vendor` (ObjectId), `status` (`draft`|`approved`|`closed`|`cancelled`), `page`, `limit`.

### `GET /api/purchase-orders/:id`
Populates `vendor`.

### `POST /api/purchase-orders`
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
The server computes `subTotal`, `tax` (from `taxRate`), `totalAmount`, and each line item's `totalPrice` — don't send those, they're derived. `poNumber` is auto-generated (`PO-<year>-<00001>`) if omitted. Response `201`.

### `PUT /api/purchase-orders/:id`
Partial update, runs validators. Note: unlike create, this does **not** recompute totals from `lineItems`/`taxRate` if you send them — it's a direct `findByIdAndUpdate`.

---

## Invoices

### `GET /api/invoices`
Query params: `status`, `vendor`, `purchaseOrder`, `page`, `limit` (default 20). List items omit `ocrText` and `processingLog` for payload size; fetch a single invoice for those.

### `GET /api/invoices/:id`
Full invoice document — `extractedData`, `userVerifiedData`, `fieldChanges` (with `changedBy` populated), `validationResult`, `processingLog`, populated `vendor` and `purchaseOrder.vendor`.

### `POST /api/invoices` — upload
`multipart/form-data`:
| field | required | notes |
|---|---|---|
| `invoice` | yes | the file — PDF, JPG, or PNG, max 10 MB |
| `purchaseOrderId` | no | links the invoice to a PO (and its vendor) up front |

No OCR runs here — the invoice is created with `status: "uploaded"` and a SHA-256 hash of the file is stored. Response `201` with the created invoice. `400` if no file or wrong mimetype (multer's `fileFilter` rejects anything except `application/pdf`, `image/jpeg`, `image/jpg`, `image/png`).

### `POST /api/invoices/:id/ocr` — run OCR + extraction
No body. Only valid when `status` is `uploaded` or `ocr_extracted` (re-runnable). Runs `pdf-parse` or `Tesseract.js` depending on mimetype, then the regex extractors, then a duplicate check. On success, `status → ocr_extracted` and the populated invoice is returned. `500` with `{"message":"OCR processing failed","error":"..."}` if the OCR engine throws (also logged into `processingLog`).

### `PATCH /api/invoices/:id/fields` — save user-verified field values
```json
{ "fields": { "vendorName": "Acme Supplies Pvt Ltd", "totalAmount": 56640 } }
```
Only valid when `status` is `ocr_extracted`, `pending_review`, or `review_required`. Diffs each key against the current baseline (verified value if present, else the OCR-extracted value) and appends an entry to `fieldChanges` for anything that actually changed (full before/after + who + when). `status → pending_review`. Returns the populated invoice.

### `POST /api/invoices/:id/match` — run PO matching
No body. Only valid in the same three statuses as above. Merges `userVerifiedData` over `extractedData`, re-runs the duplicate check, and:
- if a PO is linked → scores against it (see [ARCHITECTURE.md §6](./ARCHITECTURE.md#6-validation--matching-layer-backendsrcservicesvalidationservicejs))
- if no PO is linked → loose fuzzy vendor-name check only
- a duplicate hit always forces `review_required`

`status → passed | review_required`. Returns the populated invoice including `validationResult: { status, matchScore, discrepancies[], duplicateCheck }`.

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

## Error reference

| Status | Cause |
|---|---|
| 400 | Missing required body field, Mongoose validation error, invalid action for current invoice status, duplicate-key on a unique field (e.g. email) |
| 401 | No token, invalid/expired token, bad login credentials |
| 403 | Role not authorized (middleware exists, not currently applied to any route) |
| 404 | Resource not found by ID |
| 500 | Unhandled error (OCR engine failure, DB connection issue, etc.) — includes `stack` only when `NODE_ENV=development` |
