import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { invoiceAPI } from '../services/api';

export default function InvoiceList() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});

  const load = (p = page) => {
    setLoading(true);
    invoiceAPI.getAll({ status: statusFilter || undefined, page: p, limit: 20 })
      .then((res) => {
        setInvoices(res.data.data);
        setPagination({ total: res.data.total, pages: res.data.pages });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(1); setPage(1); }, [statusFilter]);
  useEffect(() => { load(page); }, [page]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this invoice?')) return;
    await invoiceAPI.delete(id);
    load(page);
  };

  const matchScoreColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-500 mt-1">{pagination.total || 0} total invoices</p>
        </div>
        <Link to="/upload" className="btn-primary">Upload Invoice</Link>
      </div>

      <div className="card p-4 flex gap-4">
        <select className="input max-w-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="uploaded">Uploaded</option>
          <option value="processing">Processing</option>
          <option value="validated">Validated</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Invoice #','File','Vendor','PO','Match Score','Status','Uploaded','Actions'].map(h => (
                <th key={h} className="text-left py-3 px-4 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-12 text-gray-400">Loading...</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-gray-400">No invoices found. <Link to="/upload" className="text-blue-600 hover:underline">Upload one</Link>.</td></tr>
            ) : invoices.map((inv) => (
              <tr key={inv._id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-3 px-4 font-medium text-blue-700">
                  <Link to={`/invoices/${inv._id}`} className="hover:underline">{inv.invoiceNumber || 'Pending'}</Link>
                </td>
                <td className="py-3 px-4 text-gray-500 max-w-[150px] truncate">{inv.uploadedFile?.originalName}</td>
                <td className="py-3 px-4 text-gray-600">{inv.vendor?.name || '-'}</td>
                <td className="py-3 px-4 text-gray-500 font-mono text-xs">{inv.purchaseOrder?.poNumber || '-'}</td>
                <td className="py-3 px-4">
                  {inv.validationResult?.matchScore > 0 ? (
                    <span className={`font-semibold ${matchScoreColor(inv.validationResult.matchScore)}`}>
                      {inv.validationResult.matchScore}%
                    </span>
                  ) : <span className="text-gray-300">-</span>}
                </td>
                <td className="py-3 px-4"><span className={`badge-${inv.status}`}>{inv.status}</span></td>
                <td className="py-3 px-4 text-gray-400 text-xs">{new Date(inv.createdAt).toLocaleDateString()}</td>
                <td className="py-3 px-4">
                  <div className="flex gap-2">
                    <Link to={`/invoices/${inv._id}`} className="text-blue-600 hover:underline text-xs">View</Link>
                    <button onClick={() => handleDelete(inv._id)} className="text-red-500 hover:underline text-xs">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="flex items-center gap-2 justify-center">
          <button className="btn-secondary text-xs px-3 py-1.5" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span className="text-sm text-gray-500">Page {page} of {pagination.pages}</span>
          <button className="btn-secondary text-xs px-3 py-1.5" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
