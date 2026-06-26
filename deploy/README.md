# Production deployment

This directory holds the infrastructure config for running the system in a
production-style topology — everything self-hosted, no paid cloud services.

```
                         ┌─────────────────────────────┐
                         │          Nginx :443          │
                         │  TLS · gzip · static cache   │
                         └──────────────┬──────────────┘
              /  /assets/               │  /api/            /uploads/
        ┌───────────────┐     ┌─────────┴─────────┐   ┌──────────────┐
        │ React build   │     │  Node API cluster │   │ invoice files│
        │ frontend/dist │     │  (PM2, :5000)     │   │ (disk)       │
        └───────────────┘     └─────────┬─────────┘   └──────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
            ┌───────┴──────┐   ┌────────┴───────┐   ┌───────┴──────┐
            │ BullMQ workers│   │ Python ML svc  │   │   MongoDB    │
            │ (PM2, :—)     │   │ Gunicorn :8000 │   │   :27017     │
            └───────┬──────┘   └────────────────┘   └──────────────┘
                    │
              ┌─────┴─────┐
              │   Redis    │
              │   :6379    │
              └───────────┘
```

Only **Nginx** is exposed to the network. The API, ML service, Redis and
MongoDB all listen on localhost / the private network.

## Bring-up order

1. **MongoDB** — `mongod` (or your replica set; roadmap Step 8)
2. **Redis** — `redis-server` (optional; the queue degrades to inline if absent)
3. **ML service** — `gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 127.0.0.1:8000`
4. **Node API + workers** — `cd backend && pm2 start ecosystem.config.js --env production`
5. **Frontend build** — `cd frontend && npm run build` → emits `frontend/dist`
6. **Nginx** — install `nginx/invoice-automation.conf` (see header in that file)

See the repo-root `RUNNING.md` for the dev (non-Nginx) workflow and for details
on each service's environment variables.

## Files

| File | Purpose |
|---|---|
| `nginx/invoice-automation.conf` | Reverse proxy: serves the React build, proxies `/api` and `/uploads` to the PM2 cluster, terminates TLS, gzip + caching + upload size limit + security headers. |

## Shared file storage (MinIO)

> **TL;DR — you don't need MinIO right now.**
> On a single machine, leave `STORAGE_BACKEND=local` (the default) and ignore
> this section entirely. MinIO only becomes necessary when you run the API and
> workers on **different machines**. It is included in the codebase as a
> ready-to-activate layer for that moment, not as something you need today.

### Why MinIO exists in this project

Every uploaded invoice file is stored somewhere so OCR and the ML extraction
can read it later. In `local` mode that somewhere is `backend/uploads/` on
whatever machine received the upload. That works perfectly when everything
runs on one host:

```
Single machine — local disk is fine
────────────────────────────────────
API receives upload → writes to /uploads/invoice-123.pdf
Worker picks up OCR job → reads /uploads/invoice-123.pdf  ✅
```

The moment you add a second machine — for example, one API server and one or
more dedicated worker servers — local disk breaks silently:

```
Two machines — local disk FAILS
────────────────────────────────────────────────────
Machine A (API)              Machine B (worker)
────────────────             ──────────────────
Receives upload              Picks up OCR job from Redis queue
Writes to its own            Tries to read /uploads/invoice-123.pdf
/uploads/ directory          ❌ File doesn't exist on Machine B
```

MinIO fixes this by giving every process — API servers, OCR workers, ML
extraction calls — one shared bucket they all read from and write to:

```
With MinIO — works across any number of machines
────────────────────────────────────────────────────
Machine A (API)   →  uploads file to MinIO bucket
Machine B (worker) → reads same file from MinIO bucket  ✅
Machine C (worker) → reads same file from MinIO bucket  ✅
```

### When to turn it on

Enable MinIO **only if** you are running workers (`npm run worker` / PM2
`invoice-worker`) on a **different physical or virtual machine** than the API.
If both run on the same host, local disk is simpler, faster, and has no extra
setup cost.

By default the backend stores invoice files on local disk (`STORAGE_BACKEND=local`).
MinIO (self-hosted, S3-compatible, free) gives every process one shared bucket.

### Run MinIO

```bash
# Docker (simplest)
docker run -d --name minio -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  -v /srv/minio-data:/data \
  minio/minio server /data --console-address ":9001"
```

The web console is at `http://localhost:9001`. The S3 API (what the backend
talks to) is on `:9000`.

### Point the backend at it

Set these in `backend/.env` (see `.env.example`) on **every** API and worker host:

```ini
STORAGE_BACKEND=minio
MINIO_ENDPOINT=127.0.0.1     # or the MinIO host's address
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=invoices
```

The backend creates the bucket on startup if it doesn't exist. Uploads stream to
MinIO and the local temp copy is deleted; OCR/ML workers download the object to a
temp file on demand and clean it up afterwards. **Graceful degradation:** if
`STORAGE_BACKEND=minio` but MinIO is unreachable at boot, the backend logs a
warning and falls back to local disk so it still starts.

> Files uploaded while in `local` mode stay readable after switching to `minio`
> (each file records its own backend), but they won't be in the bucket — migrate
> them with `mc cp` if you need every historical file available cluster-wide.

## Scaling levers (all free)

- **More API throughput** → PM2 already runs one process per CPU core
  (`instances: 'max'`). To go multi-machine, add each backend host to the
  `upstream invoice_api` block in the Nginx config.
- **More OCR/ML throughput** → run more BullMQ workers (`pm2 scale
  invoice-worker <n>`) and/or more Gunicorn workers (`-w <n>`).
- **Shared file storage** (needed once workers span machines) → roadmap Step 7
  (MinIO). Until then, keep Nginx + workers + uploads on one host.
- **Database HA** → roadmap Step 8 (MongoDB replica set).
