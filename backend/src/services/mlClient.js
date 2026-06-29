const axios = require('axios');

const ML_BASE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// Keep ML calls from hanging the OCR/matching flow if the Python service is
// slow or wedged — every call below fails fast and the Node side falls back
// to its regex/substring logic in the caller's catch block.
const TIMEOUT_MS = Number(process.env.ML_SERVICE_TIMEOUT_MS) || 8000;
// LayoutLMv3 + EasyOCR on CPU typically takes 40–90 s per image. Give it
// enough headroom so it can actually complete rather than timing out and
// tripping the circuit breaker. Override with ML_EXTRACT_TIMEOUT_MS in .env.
const EXTRACT_TIMEOUT_MS = Number(process.env.ML_EXTRACT_TIMEOUT_MS) || 180000;

// ── Circuit breaker ──────────────────────────────────────────────────────────
// Without this, when the ML service is down EVERY call waits the full timeout
// before failing. Extraction alone makes ~8 calls, so a single OCR run could
// stall for over a minute waiting on a service that isn't even running. The
// breaker remembers a recent connection failure and short-circuits subsequent
// calls instantly (throwing synchronously) for a cooldown window, so the caller
// falls back to regex immediately. A successful call closes the breaker again.
const BREAKER_COOLDOWN_MS = Number(process.env.ML_BREAKER_COOLDOWN_MS) || 30000;
let breakerOpenUntil = 0;

function breakerIsOpen() {
  return Date.now() < breakerOpenUntil;
}

// "Service down" = couldn't connect or the request timed out, as opposed to the
// service responding with an HTTP error (which means it's up and we shouldn't
// trip the breaker).
function isConnectivityError(err) {
  return (
    err.code === 'ECONNREFUSED' ||
    err.code === 'ECONNABORTED' || // axios timeout
    err.code === 'ENOTFOUND' ||
    err.code === 'ECONNRESET' ||
    !err.response
  );
}

async function call(fn) {
  if (breakerIsOpen()) {
    throw new Error('ML service circuit open — skipping call (recent failure)');
  }
  try {
    const result = await fn();
    breakerOpenUntil = 0; // success → close the breaker
    return result;
  } catch (err) {
    if (isConnectivityError(err)) breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
    throw err;
  }
}

const mlClient = {
  async extract(filePath) {
    const FormData = require('form-data');
    const fs = require('fs');
    const path = require('path');
    return call(async () => {
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath), path.basename(filePath));
      const res = await axios.post(`${ML_BASE_URL}/extract`, form, {
        headers: form.getHeaders(),
        timeout: EXTRACT_TIMEOUT_MS,
      });
      return res.data;
    });
  },
  async anomaly(features) {
    return call(async () => {
      const res = await axios.post(`${ML_BASE_URL}/anomaly`, features, { timeout: TIMEOUT_MS });
      return res.data;
    });
  },
  async match(name1, name2) {
    return call(async () => {
      const res = await axios.post(`${ML_BASE_URL}/match`, { name1, name2 }, { timeout: TIMEOUT_MS });
      return res.data;
    });
  },
  async confidence(features) {
    return call(async () => {
      const res = await axios.post(`${ML_BASE_URL}/confidence`, features, { timeout: TIMEOUT_MS });
      return res.data;
    });
  },
  async healthCheck() {
    const res = await axios.get(`${ML_BASE_URL}/health`, { timeout: TIMEOUT_MS });
    return res.data;
  }
};

module.exports = mlClient;
