# Performance Benchmarks

Baseline measurements taken against a local MongoDB instance with a realistic high-volume dataset. Use these numbers to detect regressions and measure the impact of future optimisations.

---

## Benchmark 1 — 2026-06-23

### Dataset

| Collection | Count |
|---|---|
| Users | 1,003 |
| Vendors | 50 |
| Purchase Orders | 2,000 |
| Invoices | 5,000 |

**Invoice breakdown by status:**

| Status | Count |
|---|---|
| passed | 1,502 |
| pending_review | 1,008 |
| review_required | 894 |
| ocr_extracted | 758 |
| uploaded | 508 |
| rejected | 330 |

**Invoice breakdown by risk level:**

| Risk | Count |
|---|---|
| low | 2,842 |
| medium | 1,108 |
| high | 1,050 |

### Environment

| Property | Value |
|---|---|
| OS | Windows 11 Pro 10.0.26200 |
| Database | MongoDB (local, port 27017) |
| Backend | Node.js + Express (port 5000) |
| ML service | Python FastAPI + 4 models (port 8000) |
| Queue | BullMQ + Redis (port 6379) |
| Measurement | 5 sequential runs per endpoint, avg/min/max recorded |
| Tool | PowerShell `Invoke-WebRequest` + `Stopwatch` |

### Results

Each endpoint was hit 5 times sequentially. All timings are end-to-end HTTP round-trip (client → Express → MongoDB → response).

#### Auth

| Endpoint | Avg | Min | Max | Rating |
|---|---|---|---|---|
| `POST /api/auth/login` | 279 ms | 270 ms | 287 ms | OK |
| `GET  /api/auth/me` | 17 ms | 15 ms | 19 ms | FAST |

#### Invoices — list & filter

| Endpoint | Avg | Min | Max | Rating |
|---|---|---|---|---|
| `GET /api/invoices` (default page, limit 20) | 53 ms | 47 ms | 66 ms | FAST |
| `GET /api/invoices?page=2&limit=20` | 50 ms | 47 ms | 56 ms | FAST |
| `GET /api/invoices?page=10&limit=20` | 51 ms | 47 ms | 52 ms | FAST |
| `GET /api/invoices?status=passed` | 55 ms | 45 ms | 63 ms | FAST |
| `GET /api/invoices?status=review_required` | 66 ms | 63 ms | 69 ms | FAST |
| `GET /api/invoices?limit=100` | 200 ms | 186 ms | 207 ms | OK |

#### Invoices — single document

| Endpoint | Avg | Min | Max | Rating |
|---|---|---|---|---|
| `GET /api/invoices/:id` | 23 ms | 22 ms | 29 ms | FAST |

#### Purchase Orders

| Endpoint | Avg | Min | Max | Rating |
|---|---|---|---|---|
| `GET /api/purchase-orders` (default) | 46 ms | 42 ms | 51 ms | FAST |
| `GET /api/purchase-orders?page=5&limit=20` | 52 ms | 49 ms | 55 ms | FAST |
| `GET /api/purchase-orders?status=approved` | 49 ms | 44 ms | 61 ms | FAST |

#### Vendors

| Endpoint | Avg | Min | Max | Rating |
|---|---|---|---|---|
| `GET /api/vendors` | 57 ms | 50 ms | 69 ms | FAST |
| `GET /api/vendors/:id/summary` | 268 ms | 204 ms | 340 ms | OK |

#### Dashboard

| Endpoint | Avg | Min | Max | Rating |
|---|---|---|---|---|
| `GET /api/dashboard/stats` | 44 ms | 39 ms | 49 ms | FAST |

#### Users (admin only)

| Endpoint | Avg | Min | Max | Rating |
|---|---|---|---|---|
| `GET /api/users` (default page) | 322 ms | 311 ms | 331 ms | OK |
| `GET /api/users?page=5&limit=20` | 316 ms | 313 ms | 319 ms | OK |

### Rating scale

| Rating | Range | Meaning |
|---|---|---|
| FAST | < 200 ms | Snappy for any user |
| OK | 200–800 ms | Acceptable; monitor as data grows |
| SLOW | > 800 ms | Needs attention before production |

### Seed performance

The `seed-load.js` script inserted all 8,053 documents in **9.8 seconds** using `insertMany` in batches of 500.

| Phase | Time |
|---|---|
| 1,000 users | 152 ms |
| 50 vendors | 47 ms |
| 2,000 POs | 743 ms |
| 10 PDF templates | ~1 s |
| 5,000 invoices | 7.7 s |
| **Total** | **9.8 s** |

---

## Analysis & Observations

### What is fast and why

- **Paginated list endpoints (50–66 ms):** Mongoose `skip/limit` on an indexed `status` field is O(log n) for the filter and O(page_size) for the fetch. Pages 1, 2, and 10 all return in ~50 ms — consistent regardless of depth.
- **Single document fetch (23 ms):** `_id` lookup is a B-tree scan on the primary index. Instant at any collection size.
- **Dashboard stats (44 ms):** The aggregation pipeline (`$group` on `status`, `$sum` on amounts) runs entirely on the server with no document transfer.
- **Status filter (55–66 ms):** The `status` field has a Mongoose index, so filtering 1,502 `passed` invoices out of 5,000 doesn't require a full collection scan.

### What is slower and why

| Endpoint | Avg | Root cause |
|---|---|---|
| `POST /auth/login` | 279 ms | bcrypt cost factor — intentional, not a bug. bcrypt `saltRounds=10` adds ~250 ms of CPU work per login to resist brute-force. |
| `GET /users` | 322 ms | 1,003 user documents returned without a lean projection. The collection scan is fast; the bottleneck is serialising full Mongoose documents over HTTP. A field projection (`name email role`) would cut this significantly. |
| `GET /vendors/:id/summary` | 268 ms | Aggregates invoices + POs per vendor in a single request. Two separate collection scans joined in Node.js. Will need an index on `(vendor, status)` as invoice volume grows. |
| `GET /invoices?limit=100` | 200 ms | Serialising 100 fully-populated invoices (with `extractedData`, `processingLog`, `validationResult`) per response. Normal paginated usage (limit 20) is 4× faster. |

### Bottlenecks to address before scaling further

1. **`/api/users` projection** — Add `.select('name email role createdAt')` to the users list query. Estimated improvement: 322 ms → ~80 ms.
2. **`/api/vendors/:id/summary` index** — Add a compound index on `{ vendor: 1, status: 1 }` on the Invoice collection. Estimated improvement: 268 ms → ~60 ms.
3. **`/api/invoices?limit=100` projection** — The list endpoint returns the full document including `ocrText` and `processingLog`. A list-specific lean projection would reduce payload size by ~70%.
4. **`POST /auth/login`** — Already optimal. bcrypt cost is a security parameter, not a performance bug. Consider caching the JWT for repeated logins in the same session.

---

## How to reproduce

```bash
# 1. Make sure all services are running (MongoDB, backend, Redis, ML service)

# 2. Seed the load-test dataset
cd backend
node src/utils/seed-load.js

# 3. Run the benchmark (PowerShell)
# Log in and capture a token, then hit each endpoint 5× with Stopwatch timing.
# See the benchmark script inline in this session or recreate it from the
# endpoint list above.
```

To reseed with fresh random data (different invoice distribution), just re-run `seed-load.js` — it wipes and recreates everything.

---

## Future benchmark entries

When a significant optimisation is made (new index, query refactor, caching layer, schema change), add a new dated section below this one with the same table structure. Compare avg times to the baseline above to quantify the improvement.

```
## Benchmark 2 — YYYY-MM-DD

### Change made
<describe what was optimised>

### Dataset
<same or different volume>

### Results
<same table format>

### Delta vs Benchmark 1
| Endpoint | Before | After | Change |
|---|---|---|---|
| ...      | ...    | ...   | ...    |
```
