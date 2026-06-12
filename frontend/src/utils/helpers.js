export const formatCurrency = (amount, currency = 'USD') => {
  if (amount == null) return 'N/A';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
};

export const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export const getStatusBadge = (status) => {
  const map = {
    validated: 'badge-validated',
    rejected: 'badge-rejected',
    processing: 'badge-processing',
    uploaded: 'badge-uploaded',
    pending: 'badge-pending',
    approved: 'badge-approved',
    draft: 'badge-draft',
    active: 'badge-active',
    inactive: 'badge-inactive'
  };
  return map[status] || 'badge-pending';
};

export const getScoreColor = (score) => {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
};

export const getSeverityColor = (severity) => {
  if (severity === 'high') return 'text-red-600 bg-red-50';
  if (severity === 'medium') return 'text-yellow-600 bg-yellow-50';
  return 'text-blue-600 bg-blue-50';
};
