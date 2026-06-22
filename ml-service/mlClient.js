const axios = require('axios');

const ML_BASE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

// Keep ML calls from hanging the OCR/matching flow if the Python service is
// slow or wedged — every call below fails fast and the Node side falls back
// to its regex/substring logic in the caller's catch block.
const TIMEOUT_MS = Number(process.env.ML_SERVICE_TIMEOUT_MS) || 8000;

const mlClient = {
  async extract(text) {
    const res = await axios.post(`${ML_BASE_URL}/extract`, { text }, { timeout: TIMEOUT_MS });
    return res.data;
  },
  async anomaly(features) {
    const res = await axios.post(`${ML_BASE_URL}/anomaly`, features, { timeout: TIMEOUT_MS });
    return res.data;
  },
  async match(name1, name2) {
    const res = await axios.post(`${ML_BASE_URL}/match`, { name1, name2 }, { timeout: TIMEOUT_MS });
    return res.data;
  },
  async confidence(features) {
    const res = await axios.post(`${ML_BASE_URL}/confidence`, features, { timeout: TIMEOUT_MS });
    return res.data;
  },
  async healthCheck() {
    const res = await axios.get(`${ML_BASE_URL}/health`, { timeout: TIMEOUT_MS });
    return res.data;
  }
};

module.exports = mlClient;
