# Plan: Line Item Cross-Verification Against Purchase Orders

**Status:** Planned — implementation not started  
**Prerequisite:** NER model (ML service Feature 1) recommended but not required — the matching logic works on whatever is in `extractedData.lineItems`, regardless of whether those items came from the regex extractor or the NER model.

---

## 1. What exists today and why it is insufficient

### Current state

`validationService.validateAgainstPO()` includes this check:

```js
// Line Items Count (5 pts)
const extractedLineItems = verifiedData.lineItems || [];
const expectedLineItems  = purchaseOrder?.lineItems || [];
if (extractedLineItems.length > 0 && expectedLineItems.length > 0) {
  if (extractedLineItems.length === expectedLineItems.length) {
    scorePoints += 5;
  } else {
    discrepancies.push({ field: 'lineItemCount', expected: expectedLineItems.length, actual: extractedLineItems.length, severity: 'low' });
  }
} else {
  scorePoints += 3;
}
```

This is the **entirety** of current line item validation. It checks only whether the count of extracted items equals the count of PO items. It awards 5 points — 5% of the total score. It ignores descriptions entirely, ignores individual quantities and prices, and cannot detect:

- An invoice billing for a completely different item than what was ordered (e.g., "GPU Cluster" instead of "Office Chair")
- Unit price manipulation on matched items (e.g., charging $1,500 per chair instead of $1,200)
- An extra line item on the invoice for a service not in the PO
- Quantity inflation on a matched item

A vendor could substitute any goods they like and the system would never flag it, as long as they submit the same number of line items.

### What the NER model adds

The NER model (ML service Feature 1) will produce cleaner, more structured line item extractions than the current regex. The regex `extractLineItems()` requires items to appear on one line in exactly the format `description qty @unitPrice totalPrice`. The NER model understands item boundaries and label semantics from context. Both produce the same `{ description, quantity, unitPrice, totalPrice }` shape — the matching logic below is agnostic to which extractor produced the data.

---

## 2. Goal

For every invoice that has a linked Purchase Order, compare each extracted line item against the PO's line items and:

1. Flag any invoice item that does not correspond to an item in the PO (unauthorized charge)
2. Flag any PO item that is missing from the invoice (possible partial delivery)
3. Flag quantity inflation on a matched item (over-billing)
4. Flag unit price discrepancies on a matched item (price manipulation)
5. Feed the result into the existing discrepancy/severity pipeline so it routes to `review_required` when appropriate
6. Store a structured comparison result (`lineItemMatches`) so the UI can render a side-by-side table instead of just a list of discrepancy strings

---

## 3. Algorithm design

### 3a. Description similarity — Jaccard word overlap

PDF text and PO descriptions often don't match character-for-character:
- "Dell PowerEdge R740 Server" (PO) vs "Dell PowerEdge R740" (OCR extraction, trailing word dropped)
- "Ergonomic Office Chair" (PO) vs "Ergonomic Chair" (NER extraction, one word lost)
- "AWS EC2 Reserved Instance - 1 Year" (PO) vs "AWS EC2 Reserved Instance 1Yr" (OCR artifact)

Exact string matching fails all of these. The solution: Jaccard similarity on normalized word sets.

```
normalize(s):
  lowercase → remove punctuation → split on whitespace → remove stop words (a, an, the, of, for, -)

Jaccard(A, B) = |words(normalize(A)) ∩ words(normalize(B))|
               ─────────────────────────────────────────────
                |words(normalize(A)) ∪ words(normalize(B))|
```

Examples:
- "Dell PowerEdge R740 Server" vs "Dell PowerEdge R740" → {dell, poweredge, r740} ∩ {dell, poweredge, r740, server} = 3/4 = **0.75** ✅
- "Office Chair" vs "Standing Desk" → {office, chair} ∩ {standing, desk} = 0/4 = **0.0** ✅
- "AWS EC2 Reserved Instance 1 Year" vs "AWS EC2 Reserved Instance 1Yr" → 4/5 = **0.80** ✅

When the ML service is running, this function can be swapped for cosine similarity of sentence embeddings from `POST /match` on the ML service — the rest of the algorithm does not change.

### 3b. Amount similarity

```
amountSim(invoice, po):
  if both null → 0.5 (inconclusive, don't penalise)
  diff% = |invoice - po| / max(invoice, po) * 100
  if diff% ≤ 5%  → 1.0  (within tolerance)
  if diff% ≤ 15% → 0.5  (suspicious)
  otherwise       → 0.0  (mismatch)
```

### 3c. Combined item similarity

```
itemSimilarity(invItem, poItem):
  descSim   = Jaccard(invItem.description, poItem.description)
  priceSim  = amountSim(invItem.unitPrice, poItem.unitPrice)
  combined  = 0.6 × descSim + 0.4 × priceSim
```

Description gets 60% weight, price gets 40%, because descriptions are the primary identity of a line item and prices can legitimately fluctuate within tolerance.

**Minimum threshold for a candidate match:** `combined > 0.30` AND `descSim > 0.25`  
The `descSim > 0.25` guard prevents two completely unrelated items with coincidentally similar prices from being matched on price alone.

### 3d. Bipartite greedy matching

1. Compute `itemSimilarity` for every (invoice item, PO item) pair → similarity matrix
2. Sort all pairs by similarity descending
3. Greedily assign pairs: assign the highest-scoring pair, mark both items as "used", continue down the list
4. Any invoice item with no assigned PO item → `unmatchedInvoiceItems`
5. Any PO item with no assigned invoice item → `po_item_missing` status

This is O(n×m) in the similarity matrix and O((n×m) log(n×m)) for the sort — completely fine for invoice line items which are almost always under 20 rows.

---

## 4. Severity rules

| Scenario | Severity | Rationale |
|---|---|---|
| Invoice item with no match in PO | **HIGH** | Charging for unauthorized goods/services |
| Invoice qty > PO qty on a matched item | **HIGH** | Over-billing / quantity inflation fraud |
| Invoice unit price > PO unit price + 5% | **HIGH** | Price manipulation |
| Invoice unit price < PO unit price (vendor discount) | **LOW** | Acceptable — vendor gave a better price |
| Invoice qty < PO qty (short delivery) | **MEDIUM** | Partial delivery — needs human decision |
| PO item not present in invoice at all | **MEDIUM** | Partial delivery or item not yet invoiced |
| Description mismatch but price/qty matches | **MEDIUM** | Possibly different product name for same item |

---

## 5. Score redistribution

The current point totals are:

| Check | Points |
|---|---|
| Vendor Name | 20 |
| PO Number | 25 |
| Total Amount | 30 |
| Currency | 10 |
| SubTotal | 10 |
| Line Item Count | 5 |
| **Total** | **100** |

The new totals (line item count check is replaced by content match, redistributed weight):

| Check | Points | Change |
|---|---|---|
| Vendor Name | 20 | — |
| PO Number | 20 | −5 |
| Total Amount | 25 | −5 |
| Currency | 10 | — |
| SubTotal | 10 | — |
| Line Item Content Match | 15 | +10 (was 5 for count only) |
| **Total** | **100** | — |

**Line item content scoring detail:**

- Both sides have no items: **5 pts** (same as old partial-credit path — no extraction, no PO items, still scored)
- Invoice has no items, PO has items: **2 pts** + MEDIUM severity per missing PO item (OCR limitation, not fraud — but still flagged)
- Items extracted and all match (similarity > 0.6): **15 pts**
- Partial match: `(matchedCount / poItemCount) × 15` pts, rounded
- Any unmatched invoice item: **0 pts contribution** from that item + HIGH severity discrepancy

The existing threshold logic is unchanged: `hasHighSeverity || matchScore < 60 → review_required`.

---

## 6. New data stored on the Invoice

### 6a. Schema additions to `Invoice.js`

Add to the `validationResult` sub-schema:

```js
lineItemMatches: [{
  // PO side
  poDescription: String,
  poQuantity:    Number,
  poUnitPrice:   Number,
  poTotalPrice:  Number,
  // Matched invoice side (null = PO item not found on invoice)
  invoiceDescription: String,
  invoiceQuantity:    Number,
  invoiceUnitPrice:   Number,
  invoiceTotalPrice:  Number,
  // Match quality
  similarity:  Number,   // 0–1, the combined similarity score
  status: {
    type: String,
    enum: ['matched', 'qty_mismatch', 'price_mismatch', 'description_mismatch', 'po_item_missing']
  }
}],
unmatchedInvoiceItems: [{
  description: String,
  quantity:    Number,
  unitPrice:   Number,
  totalPrice:  Number
}]
```

`lineItemMatches` covers PO-side view (one entry per PO item, with the matched invoice item or null).  
`unmatchedInvoiceItems` covers the invoice-side residual (items on the invoice that have no PO counterpart at all).

### 6b. Discrepancies produced (for the existing UI)

The existing `discrepancies[]` array keeps working as before — line item issues are added as entries there too, so they show up in the existing review banner:

```js
// For each unmatched invoice item:
{ field: 'lineItem', expected: 'Item in PO', actual: item.description, severity: 'high' }

// For each quantity-inflated item:
{ field: 'lineItem', expected: `${poItem.description}: qty ${po.quantity}`, actual: `qty ${inv.quantity}`, severity: 'high' }

// For each price-manipulated item:
{ field: 'lineItem', expected: `${po.unitPrice} per unit`, actual: `${inv.unitPrice} per unit`, severity: 'high' }

// For each PO item missing from invoice:
{ field: 'lineItem', expected: poItem.description, actual: 'Not billed', severity: 'medium' }
```

The `DISCREPANCY_LABELS` in `InvoiceDetail.jsx` gets `lineItem: 'Line Item'` so the existing discrepancy display works automatically.

---

## 7. Files to change

### Backend

**`backend/src/models/Invoice.js`**  
Add `lineItemMatches` and `unmatchedInvoiceItems` to the `validationResult` sub-schema (see §6a).  
No migration needed — Mongoose adds new optional fields gracefully on next read; existing documents simply won't have these fields until they are re-matched.

**`backend/src/services/validationService.js`**  
Three additions, zero deletions of existing functions:
1. `function normalizeWords(str)` — tokenise + stop-word removal for Jaccard
2. `function matchLineItems(invoiceItems, poItems)` — full bipartite matching, returns `{ lineItemMatches, unmatchedInvoiceItems, pointsEarned, discrepancies }`
3. Update `validateAgainstPO` — replace the 5-line `lineItemCount` block (currently lines 183–190) with a call to `matchLineItems`, merge its discrepancies and points into the running total

**`backend/src/utils/seed-test.js`**  
Two changes to make the feature demonstrable immediately:
- Invoice 3 (Global → PO-GLOB-001, `pending_review`): set `extractedData.lineItems` to the 3 items that match the PO. Currently it has `lineItems: []`, so the feature would do nothing on it.
- Invoice 5 (TechCorp → PO-TECH-002, `review_required`): add an extra unauthorized line item ("Adobe Acrobat DC Pro - 5 Seats") to `extractedData.lineItems` that does not exist in PO-TECH-002. This demonstrates the HIGH severity detection path alongside the existing amount discrepancy.

**`backend/src/services/__tests__/validationService.test.js`** *(new file)*  
Unit tests for:
- Perfect match (all items match, full points)
- Partial match (2/3 items match, proportional points)
- Unauthorized invoice item (HIGH severity)
- Quantity inflation (HIGH severity)
- Price manipulation (HIGH severity)
- Empty line items on both sides (partial credit, no discrepancies)
- Empty invoice items, PO has items (MEDIUM per missing item)

### Frontend

**`frontend/src/pages/InvoiceDetail.jsx`**  
Add `lineItem: 'Line Item'` to `DISCREPANCY_LABELS` (line 29–34). This is the only change to InvoiceDetail itself — the existing discrepancy renderer handles the rest automatically.

**`frontend/src/components/LineItemComparison.jsx`** *(new file)*  
A dedicated component for the side-by-side line item table. Props: `{ lineItemMatches, unmatchedInvoiceItems }`.  
Renders:
- A table with PO items on the left and matched invoice items on the right
- Green row = matched with no discrepancies
- Amber row = matched but quantity or price differs
- Red right cell = unmatched PO item (nothing was found on the invoice)
- Red bottom section = unmatched invoice items (unauthorized items)
- Summary badge: "3/3 items matched" or "2/3 items matched — 1 unauthorized item"

Shown in two places within `InvoiceDetail.jsx`:
1. Inside the `review_required` banner — between the discrepancy list and the action buttons
2. Inside the `passed` view — in the "Verified Data" card area

---

## 8. What does NOT change

- The PO status check (`poStatus !== 'approved'` → HIGH severity) — untouched
- The fail-closed no-PO path — untouched
- The duplicate detection — untouched
- The total amount / subtotal / currency / vendor / PO number checks — untouched (just slightly different point values)
- The status routing logic (`hasHighSeverity || matchScore < 60 → review_required`) — untouched
- The PO auto-close on pass — untouched
- All existing invoice statuses and state transitions — untouched
- All existing unit tests — they will need point-value updates in assertions that check exact `matchScore` values since we redistributed 5 pts, but no logic changes

---

## 9. NER integration path (when ML service is ready)

The ML service `POST /extract` will return:
```json
{
  "lineItems": [
    { "description": "Dell PowerEdge R740 Server", "quantity": 2, "unitPrice": 4500, "totalPrice": 9000 },
    ...
  ],
  ...other fields...
}
```

`invoiceController.triggerOCR` will call the ML service instead of `extractInvoiceData()` and store the result into `invoice.extractedData`. The line item matching in `validationService` works on `extractedData.lineItems` — it does not care how they were produced. Zero changes needed to the matching logic when the NER model is plugged in.

The same is true for the description similarity function: it currently uses Jaccard word-overlap. When the ML service `/match` endpoint is available, it can optionally call that instead for better handling of abbreviations and synonyms. This can be a feature-flagged swap with a config variable (e.g., `USE_ML_SIMILARITY=true`) — no algorithm restructure needed.

---

## 10. Implementation order

1. **Schema** — add `lineItemMatches` / `unmatchedInvoiceItems` to `Invoice.js` (5 min, no risk)
2. **`matchLineItems` function** — write and unit test in isolation before touching `validateAgainstPO` (primary work, 2–3 hours)
3. **`validateAgainstPO` update** — replace the 5-line count block with the new function call (15 min, low risk)
4. **Backend tests** — write `validationService.test.js` covering all severity paths
5. **Seed update** — add line items to invoice 3, add unauthorized item to invoice 5, reseed
6. **Frontend label** — add `lineItem` to `DISCREPANCY_LABELS` (2 min)
7. **`LineItemComparison` component** — new component, no existing code modified (2–3 hours)
8. **Wire into InvoiceDetail** — import and place in two locations

Steps 1–4 are backend-only and can be done and tested independently of the frontend.  
Steps 6–8 are frontend-only and can be done independently of the backend (using hardcoded mock data for the component first).

---

## 11. Open questions (decide before implementation)

1. **Partial delivery policy:** Should a perfectly-matched invoice where only 2 of 3 PO items appear be able to `pass`, or should missing PO items always force `review_required`? Current plan: MEDIUM severity for missing PO items, which only forces `review_required` if score < 60 — the total amount check would also catch a partial invoice since the amount won't match the full PO total. So in practice, a partial delivery invoice would almost certainly have a totalAmount mismatch AND missing items, both of which would route it to review correctly. No special-casing needed.

2. **Match threshold tuning:** The 0.30 combined / 0.25 description minimum thresholds were chosen based on the seed data. They should be validated against a wider sample of real invoices before considering them final.

3. **ML similarity toggle:** Whether to add a config flag for `USE_ML_SIMILARITY` now (no-op until the service is up) or add it only when the ML service is integrated. Recommendation: add it when integrating.
