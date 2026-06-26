import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { invoiceAPI, downloadBlob } from '../services/api';
import { formatDate, getStatusBadge, getScoreColor } from '../utils/helpers';
import { usePageEntrance } from '../utils/motion';
import ConfirmDialog from '../components/ConfirmDialog';
import { useAuth } from '../context/AuthContext';
import { canWrite, canDelete } from '../utils/permissions';
import { useDocumentTitle } from '../utils/useDocumentTitle';

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
  const { user } = useAuth();
  const allowWrite = canWrite(user);
  const allowDelete = canDelete(user);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const LIMIT = 15;

  const load = () => {
    setLoading(true);
    invoiceAPI.getAll({ status: statusFilter || undefined, page, limit: LIMIT })
      .then((res) => { setInvoices(res.data.data); setTotal(res.data.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [statusFilter, page]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await invoiceAPI.delete(deleteTarget._id);
      toast.success('Invoice deleted');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await invoiceAPI.exportCSV({ status: statusFilter || undefined });
      downloadBlob(res.data, `invoices-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success('CSV exported');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const pages = Math.ceil(total / LIMIT);
  useDocumentTitle('Invoices');
  const pageRef = usePageEntrance(!loading);

  return (
    <div ref={pageRef} className="space-y-5 max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3" data-animate>
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-800">Invoices</h1>
          <p className="text-ivory-700 text-sm mt-0.5" aria-live="polite">{total} total invoice{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={handleExport} disabled={exporting || total === 0} className="btn-secondary disabled:opacity-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5 7.5 12M12 3v13.5" />
            </svg>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
          {allowWrite && (
            <Link to="/upload" className="btn-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Upload Invoice
            </Link>
          )}
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap" role="group" aria-label="Filter invoices by status" data-animate>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setStatusFilter(f.key); setPage(1); }}
            aria-pressed={statusFilter === f.key}
            className={statusFilter === f.key ? 'pill-active' : 'pill'}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-ivory-300 shadow-card overflow-hidden" data-animate>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <caption className="sr-only">List of invoices with vendor, match score, status and upload date</caption>
            <thead>
              <tr className="bg-ivory-100 border-b border-ivory-200">
                {['Invoice #', 'File', 'Vendor', 'PO', 'Score', 'Status', 'Uploaded', 'Actions'].map((h) => (
                  <th key={h} scope="col" className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-ivory-600">
                    {h === 'Actions' ? <span className="sr-only">{h}</span> : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-16">
                    <div className="flex items-center justify-center gap-2 text-ivory-600" role="status" aria-live="polite">
                      <div className="animate-spin w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full" />
                      Loading invoices…
                    </div>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-16 text-ivory-700">
                    {statusFilter
                      ? <>No <strong>{FILTERS.find((f) => f.key === statusFilter)?.label.toLowerCase()}</strong> invoices.{' '}<button onClick={() => { setStatusFilter(''); setPage(1); }} className="text-amber-800 hover:text-amber-900 font-semibold underline underline-offset-2">Clear filter</button></>
                      : <>{allowWrite ? <><span>No invoices yet. </span><Link to="/upload" className="text-amber-800 hover:text-amber-900 font-semibold">Upload one →</Link></> : 'No invoices yet.'}</>
                    }
                  </td>
                </tr>
              ) : invoices.map((inv) => (
                <tr key={inv._id} className="border-b border-ivory-100 hover:bg-ivory-50 transition-colors">
                  <td className="px-4 py-3.5">
                    <Link to={`/invoices/${inv._id}`} className="font-mono text-amber-800 hover:text-amber-900 underline decoration-amber-300 underline-offset-2 font-semibold text-xs">
                      {inv.invoiceNumber || '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5 text-ivory-700 max-w-[140px]">
                    <span className="truncate block text-xs" title={inv.uploadedFile?.originalName}>
                      {inv.uploadedFile?.originalName || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 font-medium text-ivory-900 text-sm">{inv.vendor?.name || <span className="text-ivory-500" aria-label="No vendor">—</span>}</td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-xs text-ivory-700">{inv.purchaseOrder?.poNumber || '—'}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    {inv.validationResult?.matchScore != null ? (
                      <span className={`font-mono font-bold text-sm ${getScoreColor(inv.validationResult.matchScore)}`}>
                        {inv.validationResult.matchScore}%
                      </span>
                    ) : <span className="text-ivory-500">—</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={getStatusBadge(inv.status)}>{inv.status.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-ivory-700">{formatDate(inv.createdAt)}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <Link to={`/invoices/${inv._id}`} className="text-xs font-medium text-amber-800 hover:text-amber-900 transition-colors">
                        Open →
                      </Link>
                      {allowDelete && (
                        <button
                          className="text-xs text-ivory-500 hover:text-red-700 transition-colors p-1 rounded"
                          onClick={() => setDeleteTarget(inv)}
                          aria-label={`Delete invoice ${inv.invoiceNumber || inv.uploadedFile?.originalName || ''}`}
                          title="Delete invoice"
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
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
            <span className="text-xs text-ivory-700">
              Page {page} of {pages} · {total} invoices
            </span>
            <nav className="flex gap-2" aria-label="Invoice list pagination">
              <button
                className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
                disabled={page === 1}
                aria-label="Previous page"
                onClick={() => setPage((p) => p - 1)}
              >← Prev</button>
              <button
                className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
                disabled={page >= pages}
                aria-label="Next page"
                onClick={() => setPage((p) => p + 1)}
              >Next →</button>
            </nav>
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete invoice?"
          message={`"${deleteTarget.invoiceNumber || deleteTarget.uploadedFile?.originalName || 'This invoice'}" and its uploaded file reference will be permanently removed. This cannot be undone.`}
          confirmLabel="Delete invoice"
          loading={deleting}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
