# Running the system

The app has **three** processes. The ML microservice is optional at runtime —
if it isn't running, the Node backend automatically falls back to its built-in
regex extraction and substring vendor matching, so the system still works. Start
the ML service first if you want ML-powered extraction, semantic vendor matching,
and anomaly scoring.

## 1. Python ML microservice (port 8000)

Requires the trained models to be present under `ml-service/models/`
(`ner_model/`, `anomaly_model.joblib`, `anomaly_scaler.joblib`,
`embedding_model/`, `confidence_model.joblib`, `confidence_scaler.joblib`).
These are **not** committed to the repo — see `ml-service/.gitignore`.

```bash
cd ml-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Verify it's up: `curl http://localhost:8000/health` → `{"status":"ok","models_loaded":4}`

## 2. Node.js backend (port 5000)

```bash
cd backend
npm install            # installs axios (new) + existing deps
npm start              # or: npm run dev   (nodemon)
```

The backend reads `ML_SERVICE_URL` from `backend/.env`
(defaults to `http://localhost:8000`). With the ML service down you'll see
log lines like `ML service unavailable, falling back to regex extraction` —
that's expected and harmless.

## 3. Frontend (port 5173)

```bash
cd frontend
npm install
npm run dev
```

## How the ML integration degrades gracefully

| Capability         | With ML service              | Without ML service (fallback)        |
| ------------------ | ---------------------------- | ------------------------------------ |
| Field extraction   | spaCy NER + learned confidence, overlaid on regex | regex extraction only |
| Vendor matching    | semantic similarity rescues fuzzy matches | substring matching only |
| Anomaly scoring    | Isolation Forest risk level  | `riskLevel: "unknown"`, no score     |

Every ML call is wrapped in try/catch with an 8s timeout
(`ML_SERVICE_TIMEOUT_MS`), so a slow or absent ML service never blocks the
invoice pipeline.
