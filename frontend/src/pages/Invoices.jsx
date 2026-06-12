import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { invoiceAPI } from '../services/api';
import { formatDate, getStatusBadge, getScoreColor } from '../utils/helpers';

const FILTERS = [
  { key: '',               label: 'All' },
  { key: 'uploaded',       label: 'Uploaded' },
  { key: 'ocr_extracted',  label: 'OCR Done' },
  { key: 'pending_review', label: 'Pending' },
  { key: 'review_required',label: 'Review' },
  { key: 'passed',         label: 'Passed' },
  { key: 'rejected',       label: 'Rejected' },
];

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 15;

  const load = () => {
    setLoading(true);
    invoiceAPI.getAll({ status: statusFilter || undefined, page, limit: LIMIT })
      .then((res) => { setInvoices(res.data.data); setTotal(res.data.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [statusFilter, page]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this invoice? This cannot be undone.')) return;
    await invoiceAPI.delete(id);
    load();
  };

  const pages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-5 max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-900">Invoices</h1>
          <p className="text-ivory-600 text-sm mt-0.5">{total} total invoice{total !== 1 ? 's' : ''}</p>
        </div>
        <Link to="/upload" className="btn-primary self-start sm:self-auto">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          Upload Invoice
        </Link>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setStatusFilter(f.key); setPage(1); }}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-150 ${
              statusFilter === f.key
                ? 'bg-ink-900 text-white shadow-sm'
                : 'bg-white text-ivory-700 border border-ivory-300 hover:border-ivory-400 hover:text-ink-900'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-ivory-300 shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-ivory-100 border-b border-ivory-200">
                {['Invoice #', 'File', 'Vendor', 'PO', 'Score', 'Status', 'Uploaded', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-ivory-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-16">
                    <div className="flex items-center justify-center gap-2 text-ivory-500">
                      <div className="animate-spin w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full" />
                      Loading invoices…
                    </div>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-ivory-500">
                    No invoices found.{' '}
                    <Link to="/upload" className="text-amber-600 hover:text-amber-700 font-semibold">Upload one →</Link>
                  </td>
                </tr>
              ) : invoices.map((inv) => (
                <tr key={inv._id} className="border-b border-ivory-100 hover:bg-ivory-50 transition-colors">
                  <td className="px-4 py-3.5">
                    <Link to={`/invoices/${inv._id}`} className="font-mono text-amber-700 hover:text-amber-800 font-semibold text-xs">
                      {inv.invoiceNumber || '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 text-ivory-600 max-w-[140px]">
                    <span className="truncate block text-xs" title={inv.uploadedFile?.originalName}>
                      {inv.uploadedFile?.originalName || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 font-medium text-ink-800 text-sm">{inv.vendor?.name || <span className="text-ivory-400">—</span>}</td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-xs text-ivory-600">{inv.purchaseOrder?.poNumber || '—'}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    {inv.validationResult?.matchScore != null ? (
                      <span className={`font-mono font-bold text-sm ${getScoreColor(inv.validationResult.matchScore)}`}>
                        {inv.validationResult.matchScore}%
                      </span>
                    ) : <span className="text-ivory-300">—</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={getStatusBadge(inv.status)}>{inv.status.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-ivory-500">{formatDate(inv.createdAt)}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <Link to={`/invoices/${inv._id}`} className="text-xs font-medium text-amber-600 hover:text-amber-800 transition-colors">
                        Open →
                      </Link>
                      <button
                        className="text-xs text-ivory-400 hover:text-red-500 transition-colors"
                        onClick={() => handleDelete(inv._id)}
                        title="Delete invoice"
                      >
                        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="px-4 py-3 border-t border-ivory-200 flex items-center justify-between bg-ivory-50">
            <span className="text-xs text-ivory-500">
              Page {page} of {pages} · {total} invoices
            </span>
            <div className="flex gap-2">
              <button
                className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >← Prev</button>
              <button
                className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
