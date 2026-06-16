import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

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
  exportCSV:      (params) => api.get('/invoices/export', { params, responseType: 'blob' })
};

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
