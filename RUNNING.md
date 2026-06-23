# Running the system

The app has up to **four** processes, two of which are optional at runtime:

| Process | Port | Required? |
| --- | --- | --- |
| Python ML microservice | 8000 | optional — falls back to regex/substring |
| Node.js API backend | 5000 | required |
| Background worker (BullMQ) | — | optional — falls back to inline processing |
| Frontend (Vite) | 5173 | required (dev) |

The ML microservice is optional: if it isn't running, the Node backend
automatically falls back to its built-in regex extraction and substring vendor
matching. The background worker + Redis are also optional: without them the
backend processes OCR/matching inline on the request (the original behaviour).
Start the ML service first if you want ML-powered extraction, semantic vendor
matching, and anomaly scoring; add Redis + the worker when you need to scale.

## 1. Python ML microservice (port 8000)

Requires the trained models to be present:

- `ml-service/models/` — `anomaly_model.joblib`, `anomaly_scaler.joblib`, `embedding_model/`, `confidence_model.joblib`, `confidence_scaler.joblib`
- `ml-service/layoutlmv3_invoice/` — LayoutLMv3 weights (`config.json`, `model.safetensors`, `tokenizer.json`, `tokenizer_config.json`, `preprocessor_config.json`, `processor_config.json`)
- `ml-service/label_map.json` — 23-label BIO map for LayoutLMv3

These are **not** committed to the repo — see `ml-service/.gitignore`.

Also requires **poppler** for PDF→image conversion. On Windows, install via winget (`oschwartz10612.Poppler`) and set `POPPLER_PATH` in `ml-service/main.py` to the bin directory (default: `D:\poppler\poppler-25.07.0\Library\bin`).

```bash
cd ml-service
pip install -r requirements.txt
```

**Development (single worker):**
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

**Production (multi-worker with Gunicorn):**
```bash
# -w 4 = 4 worker processes; tune to number of CPU cores
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

Each Gunicorn worker loads all four models once at startup (LayoutLMv3 + EasyOCR, anomaly, matching, confidence) and keeps them in memory, so 4 workers → 4× the concurrent ML throughput with no cold-start cost per request. The `lru_cache` on the embedding step means repeated vendor names are encoded once per worker.

**Startup time note:** LayoutLMv3 (125M params) + EasyOCR download their first-run weights and take ~15–30 s to warm up on CPU. The service is ready when `/health` responds.

Verify it's up: `curl http://localhost:8000/health` → `{"status":"ok","models_loaded":4}`

## 2. Node.js backend (port 5000)

**Development (single process):**
```bash
cd backend
npm install
npm run dev   # nodemon hot-reload
```

**Production (PM2 cluster mode):**
```bash
npm install -g pm2
cd backend
npm install
pm2 start ecosystem.config.js --env production

# Common PM2 commands
pm2 status                    # see all processes
pm2 logs invoice-api          # stream API logs
pm2 logs invoice-worker       # stream worker logs
pm2 reload invoice-api        # zero-downtime rolling restart
pm2 stop all                  # stop everything
pm2 startup                   # generate systemd/init script to auto-start on boot
```

`ecosystem.config.js` runs `instances: 'max'` API processes in cluster mode (one per CPU core) behind PM2's built-in load balancer, plus 2 dedicated worker processes. All share the same Redis queue and MongoDB pool.

The backend reads `ML_SERVICE_URL` from `backend/.env`
(defaults to `http://localhost:8000`). With the ML service down you'll see
log lines like `ML service unavailable, falling back to regex extraction` —
that's expected and harmless.

## 3. Background worker + Redis (optional — for scale)

OCR and matching are slow (seconds to tens of seconds each). With Redis running,
the backend pushes that work onto a BullMQ queue and returns instantly (HTTP
`202` + a `jobId`); one or more **worker** processes drain the queue. This is
what lets the system absorb large bursts of uploads without tying up API
connections. Without Redis, the backend processes inline exactly as before — so
this whole section is optional.

```bash
# Start Redis (any one of these)
docker run -p 6379:6379 redis        # Docker
# or: sudo systemctl start redis      # Linux package
# or: redis-server                    # local binary

# Then run one or more workers (separate terminals / machines, same Redis)
cd backend
npm run worker        # or: npm run worker:dev (nodemon)
```

Scale throughput by running more workers, or raise `WORKER_CONCURRENCY` per
worker. All queue settings live in `backend/.env` (see `.env.example`):
`QUEUE_ENABLED`, `REDIS_URL`, `WORKER_CONCURRENCY`, `QUEUE_JOB_ATTEMPTS`,
`MONGO_POOL_SIZE`.

> **Single-machine shortcut:** set `RUN_WORKER_INLINE=true` in `backend/.env`
> and the API process will run a worker itself — you get the queue's benefits
> (instant uploads, retries, burst absorption) without a second process. For
> real scale, run dedicated `npm run worker` processes instead.

If `QUEUE_ENABLED=false` or Redis is unreachable, you'll see
`[queue] Redis unavailable … falling back to inline processing` on startup —
that's expected and the app works normally, just synchronously.

## 4. Frontend (port 5173)

```bash
cd frontend
npm install
npm run dev          # dev server with hot reload (proxies /api to :5000)
npm run build        # production build → frontend/dist (served by Nginx)
```

## 5. Nginx reverse proxy (production)

For production, put Nginx in front of everything: it serves the static React
build, proxies `/api` to the PM2 backend cluster, serves `/uploads` straight off
disk, and handles TLS, gzip, caching, the upload size limit and security
headers. In dev you don't need it — Vite's dev server proxies `/api` itself.

```bash
sudo cp deploy/nginx/invoice-automation.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/invoice-automation.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

The config and the full production topology (bring-up order, scaling levers) are
documented in [`deploy/README.md`](deploy/README.md).

## How the ML integration degrades gracefully

| Capability         | With ML service              | Without ML service (fallback)        |
| ------------------ | ---------------------------- | ------------------------------------ |
| Field extraction   | LayoutLMv3 (layout-aware transformer) fills gaps that regex misses; regex remains primary | regex extraction only |
| Vendor matching    | semantic similarity rescues fuzzy matches | substring matching only |
| Anomaly scoring    | Isolation Forest risk level  | `riskLevel: "unknown"`, no score     |

Every ML call is wrapped in try/catch. The `/extract` call uses a 60 s timeout (LayoutLMv3 on CPU takes 5–35 s per document); all other ML calls use 8 s (`ML_SERVICE_TIMEOUT_MS`). A slow or absent ML service never blocks the invoice pipeline.

## How the queue degrades gracefully

| | With Redis + worker | Without (fallback) |
| --- | --- | --- |
| OCR / matching | enqueued; API returns `202` + `jobId`; worker processes; frontend polls `GET /api/invoices/jobs/:jobId` | processed inline; API returns `200` with the finished invoice |
| Burst of uploads | absorbed by the queue, drained at worker capacity | each request blocks until its own processing finishes |
| Throughput scaling | run more workers / raise `WORKER_CONCURRENCY` | bounded by API process |

The same `runOCR` / `runMatching` logic (`backend/src/services/invoiceProcessor.js`)
runs in both modes, so behaviour is identical — only *where* and *when* it runs
changes.
