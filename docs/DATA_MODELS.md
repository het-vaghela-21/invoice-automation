# Data Models

MongoDB collections via Mongoose. Source of truth is `backend/src/models/*.js` — this is a readable summary, not a copy of the code.

## User

`backend/src/models/User.js`

| Field | Type | Notes |
|---|---|---|
| `name` | String | required |
| `email` | String | required, unique, lowercased |
| `password` | String | required, min 6 chars, `select: false` (never returned by default queries), bcrypt-hashed (12 rounds) in a `pre('save')` hook |
| `role` | String | enum `admin`/`accountant`/`viewer`, default `accountant` — enforced server-side via `authorize(...roles)`, see [ARCHITECTURE.md §7](./ARCHITECTURE.md#7-auth--roles) |
| `resetPasswordToken` | String | `select: false`. SHA-256 hash of the raw token sent in a password-reset link; cleared after use or expiry |
| `resetPasswordExpire` | Date | `select: false`. 1 hour after `forgot-password` is requested |
| `createdAt` / `updatedAt` | Date | auto (timestamps) |

Instance method: `comparePassword(candidate)` → bcrypt compare.

## Vendor

`backend/src/models/Vendor.js`

| Field | Type | Notes |
|---|---|---|
| `name` | String | required |
| `email` | String | required, lowercased |
| `phone` | String | |
| `address` | `{ street, city, state, country, zipCode }` | |
| `taxId` | String | GSTIN or equivalent |
| `registrationNumber` | String | |
| `status` | String | enum `active`/`inactive`, default `active` |
| `bankDetails` | `{ accountName, accountNumber, bankName, routingNumber }` | |
| `paymentTerms` | String | default `"Net 30"` |
| `notes` | String | |
| `requiredFields` | `[{ fieldKey, fieldLabel }]` | drives which invoice fields are flagged "required" in the review UI for this vendor |

Text index on `name` + `email` (powers `?search=`).

## PurchaseOrder

`backend/src/models/PurchaseOrder.js`

| Field | Type | Notes |
|---|---|---|
| `poNumber` | String | unique, **auto-generated** as `PO-<year>-<00001>` in a `pre('save')` hook if not provided |
| `vendor` | ObjectId → Vendor | required |
| `issueDate` | Date | default now |
| `expectedDelivery` | Date | |
| `lineItems` | `[{ description, quantity, unitPrice, totalPrice }]` | all required, `totalPrice` computed server-side at create time |
| `subTotal` | Number | required — computed server-side as Σ(quantity × unitPrice) |
| `tax` | Number | default 0 — computed server-side as `subTotal × taxRate / 100` |
| `taxRate` | Number | 0–100, default 0 |
| `totalAmount` | Number | required — computed server-side as `subTotal + tax` |
| `status` | String | enum `draft`/`approved`/`closed`/`cancelled`, default `draft` |
| `currency` | String | default `"USD"` |
| `notes` | String | |
| `createdBy` | ObjectId → User | |

> Totals are only auto-derived on **create**. `PUT` updates write whatever you send as-is (see [API.md](./API.md#put-apipurchase-ordersid)).

## Invoice

`backend/src/models/Invoice.js` — the central, most complex document.

| Field | Type | Notes |
|---|---|---|
| `invoiceNumber` | String | copied from `extractedData.invoiceNumber.value` once OCR runs |
| `vendor` | ObjectId → Vendor | set at upload if a PO was linked |
| `purchaseOrder` | ObjectId → PurchaseOrder | optional — invoices can exist without a PO (fuzzy-match only) |
| `uploadedFile` | `{ filename, originalName, mimetype, path, size, hash }` | `hash` is SHA-256 of the raw bytes, used for duplicate detection |
| `ocrText` | String | raw text returned by the OCR layer |
| `extractedData` | see below | every leaf field is `{ value, confidence }`, written once per OCR run, **never edited directly** |
| `userVerifiedData` | `Mixed` (flat key→value map) | the user-corrected values; always takes priority over `extractedData` during matching |
| `fieldChanges` | `[{ field, oldValue, newValue, changedBy, changedAt }]` | append-only audit trail — one entry per field per save where the value actually changed |
| `validationResult` | `{ status, matchScore, discrepancies[], duplicateCheck }` | written by `submitMatching`; `discrepancies[]` is `{ field, expected, actual, severity }` |
| `status` | String | enum `uploaded`/`ocr_extracted`/`pending_review`/`review_required`/`passed`/`rejected` — see [ARCHITECTURE.md §3](./ARCHITECTURE.md#3-invoice-state-machine) |
| `anomalyScore` | Number | `0`–`1` anomaly score from the ML service's Isolation Forest, set during `submitMatching`; `null` when the ML service was unavailable. Informational only — does not change the pass/review verdict |
| `riskLevel` | String | enum `low`/`medium`/`high`/`unknown`, derived from `anomalyScore` by the ML service; `unknown` when the ML service was unavailable |
| `processingLog` | `[{ timestamp, action, details, status }]` | append-only event log; `status` here is `info`/`success`/`error`/`warning`, distinct from the invoice's own `status` field |
| `createdBy` | ObjectId → User | |

### `extractedData` sub-shape

```
{
  invoiceNumber: { value, confidence },
  vendorName:    { value, confidence },
  gstNumber:     { value, confidence },
  poNumber:      { value, confidence },
  invoiceDate:   { value, confidence },
  dueDate:       { value, confidence },
  lineItems:     [{ description, quantity, unitPrice, totalPrice, confidence }],
  subTotal:      { value, confidence },
  tax:           { value, confidence },
  totalAmount:   { value, confidence },
  currency:      { value, confidence },
  bankAccount:   { value, confidence }
}
```

Note the naming mismatch that the controller bridges deliberately: `extractedData.tax` ↔ flat key `taxAmount` (see `flattenExtracted()` in `invoiceController.js`). If you're querying the DB directly, remember `tax`, not `taxAmount`, is the field name on `extractedData`.

Indexes: `uploadedFile.hash`, `status + createdAt` (compound, for the filtered/sorted list view), `vendor`.

## Entity relationships

```
User ──< createdBy >── PurchaseOrder
User ──< createdBy >── Invoice
User ──< changedBy (per fieldChanges entry) >── Invoice

Vendor ──< vendor >── PurchaseOrder
Vendor ──< vendor (optional) >── Invoice

PurchaseOrder ──< purchaseOrder (optional) >── Invoice
```

An `Invoice` can exist with no `PurchaseOrder` and no `Vendor` at all (uploaded standalone, matched later by fuzzy vendor name only). Deleting a `Vendor` or `PurchaseOrder` does **not** cascade — dependent documents keep a dangling ObjectId reference that simply fails to populate.
