import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { invoiceAPI } from '../services/api';
import { formatDate, getStatusBadge, getScoreColor } from '../utils/helpers';

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = () => {
    setLoading(true);
    invoiceAPI.getAll({ status: statusFilter || undefined, page, limit: 15 })
      .then((res) => { setInvoices(res.data.data); setTotal(res.data.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [statusFilter, page]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this invoice?')) return;
    await invoiceAPI.delete(id);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-500 text-sm mt-1">{total} total invoices</p>
        </div>
        <Link to="/upload" className="btn-primary">Upload Invoice</Link>
      </div>

      <div className="card p-4 flex gap-4 flex-wrap">
        {['', 'uploaded', 'ocr_extracted', 'pending_review', 'review_required', 'passed', 'rejected'].map((s) => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s === '' ? 'All' : s === 'ocr_extracted' ? 'OCR Done' : s === 'pending_review' ? 'Pending Review' : s === 'review_required' ? 'Review Required' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>{['Invoice', 'File', 'Vendor', 'PO', 'Match Score', 'Status', 'Date', 'Actions'].map((h) => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Loading...</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">No invoices found. <Link to="/upload" className="text-blue-600 hover:underline">Upload one</Link></td></tr>
            ) : invoices.map((inv) => (
              <tr key={inv._id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-blue-600">
                  <Link to={`/invoices/${inv._id}`}>{inv.invoiceNumber || '—'}</Link>
                </td>
                <td className="px-4 py-3 text-gray-500 max-w-[150px] truncate" title={inv.uploadedFile?.originalName}>{inv.uploadedFile?.originalName}</td>
                <td className="px-4 py-3 text-gray-700">{inv.vendor?.name || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{inv.purchaseOrder?.poNumber || '—'}</td>
                <td className="px-4 py-3">
                  {inv.validationResult?.matchScore != null ? (
                    <span className={`font-semibold ${getScoreColor(inv.validationResult.matchScore)}`}>{inv.validationResult.matchScore}%</span>
                  ) : '—'}
                </td>
                <td className="px-4 py-3"><span className={getStatusBadge(inv.status)}>{inv.status}</span></td>
                <td className="px-4 py-3 text-gray-500">{formatDate(inv.createdAt)}</td>
                <td className="px-4 py-3 flex gap-2">
                  <Link to={`/invoices/${inv._id}`} className="text-blue-600 hover:underline text-xs">View</Link>
                  <button className="text-red-500 hover:underline text-xs" onClick={() => handleDelete(inv._id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > 15 && (
        <div className="flex justify-center gap-2">
          <button className="btn-secondary text-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span className="py-2 px-3 text-sm text-gray-600">Page {page} of {Math.ceil(total / 15)}</span>
          <button className="btn-secondary text-sm" disabled={page >= Math.ceil(total / 15)} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
