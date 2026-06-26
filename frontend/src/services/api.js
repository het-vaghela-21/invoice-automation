import axios from 'axios';

// In dev, Vite proxies /api → localhost:5000 (vite.config.js).
// In production (Render static site), set VITE_API_URL to the full backend
// origin, e.g. https://invoice-api.onrender.com/api
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  resetPassword: (token, data) => api.post(`/auth/reset-password/${token}`, data)
};

export const vendorAPI = {
  getAll: (params) => api.get('/vendors', { params }),
  getOne: (id) => api.get(`/vendors/${id}`),
  getSummary: (id) => api.get(`/vendors/${id}/summary`),
  create: (data) => api.post('/vendors', data),
  update: (id, data) => api.put(`/vendors/${id}`, data),
  delete: (id) => api.delete(`/vendors/${id}`)
};

export const poAPI = {
  getAll: (params) => api.get('/purchase-orders', { params }),
  getOne: (id) => api.get(`/purchase-orders/${id}`),
  create: (data) => api.post('/purchase-orders', data),
  update: (id, data) => api.put(`/purchase-orders/${id}`, data),
  exportCSV: (params) => api.get('/purchase-orders/export', { params, responseType: 'blob' })
};

export const invoiceAPI = {
  getAll:         (params) => api.get('/invoices', { params }),
  getOne:         (id) => api.get(`/invoices/${id}`),
  upload:         (formData) => api.post('/invoices', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  triggerOCR:     (id) => api.post(`/invoices/${id}/ocr`),
  updateFields:   (id, fields) => api.patch(`/invoices/${id}/fields`, { fields }),
  submitMatching: (id) => api.post(`/invoices/${id}/match`),
  rejectInvoice:  (id, reason) => api.post(`/invoices/${id}/reject`, { reason }),
  delete:         (id) => api.delete(`/invoices/${id}`),
  exportCSV:      (params) => api.get('/invoices/export', { params, responseType: 'blob' }),
  getJobStatus:   (jobId) => api.get(`/invoices/jobs/${jobId}`)
};

// When OCR/matching is queued (HTTP 202, backend has Redis), the response only
// carries a jobId — the work happens in a worker. Poll the job until it settles.
// Resolves on completion; rejects if the job failed or we time out. If the
// backend processed inline (no queue), callers skip this entirely.
export const pollJob = (jobId, { intervalMs = 1500, timeoutMs = 120000 } = {}) =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = async () => {
      try {
        const { data } = await invoiceAPI.getJobStatus(jobId);
        const state = data.data?.state;
        if (state === 'completed') return resolve(data.data);
        if (state === 'failed') return reject(new Error(data.data?.failedReason || 'Processing failed'));
        if (Date.now() > deadline) return reject(new Error('Timed out waiting for processing'));
        setTimeout(tick, intervalMs);
      } catch (err) {
        // A 404 right after completion means the job record was cleaned up —
        // treat that as done rather than an error.
        if (err.response?.status === 404) return resolve({ state: 'completed' });
        reject(err);
      }
    };
    tick();
  });

// Triggers a browser download for a blob response returned by one of the
// exportCSV() calls above. Kept here (not in a component) so any page can reuse it.
export const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats')
};

// Admin-only — see backend/src/routes/userRoutes.js
export const userAPI = {
  getAll: () => api.get('/users'),
  updateRole: (id, role) => api.patch(`/users/${id}/role`, { role })
};

export default api;
