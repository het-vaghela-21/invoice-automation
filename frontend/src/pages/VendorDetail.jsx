import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { vendorAPI } from '../services/api';
import { formatDate, formatCurrency, getStatusBadge, getScoreColor } from '../utils/helpers';
import { usePageEntrance } from '../utils/motion';
import { useDocumentTitle } from '../utils/useDocumentTitle';

function StatCard({ label, value, sub }) {
  return (
    <div className="card">
      <p className="text-xs font-bold uppercase tracking-wide text-ivory-500">{label}</p>
      <p className="font-serif text-2xl font-bold text-ink-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-ivory-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function VendorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useDocumentTitle(data?.vendor?.name || 'Vendor');
  const pageRef = usePageEntrance(!loading);

  useEffect(() => {
    setLoading(true);
    vendorAPI.getSummary(id)
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.message || 'Vendor not found'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center h-64" role="status" aria-live="polite">
      <div className="animate-spin w-7 h-7 border-[3px] border-amber-600 border-t-transparent rounded-full" aria-hidden="true" />
    </div>
  );

  if (error || !data) return (
    <div className="text-center py-16">
      <p className="text-ivory-700 mb-4">{error || 'Vendor not found'}</p>
      <button onClick={() => navigate('/vendors')} className="btn-secondary">← Back to Vendors</button>
    </div>
  );

  const { vendor, purchaseOrders, invoices, stats } = data;

  return (
    <div ref={pageRef} className="space-y-5 max-w-6xl">
      <div data-animate>
        <Link to="/vendors" className="text-ivory-600 hover:text-ink-800 text-sm flex items-center gap-1 mb-2 transition-colors">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" /></svg>
          Vendors
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-ink-900 rounded-xl flex items-center justify-center text-white font-serif font-bold text-xl flex-shrink-0" aria-hidden="true">
              {vendor.name[0].toUpperCase()}
            </div>
            <div>
              <h1 className="font-serif text-2xl font-bold text-ink-800">{vendor.name}</h1>
              <p className="text-ivory-700 text-sm">{vendor.email}</p>
            </div>
          </div>
          <span className={getStatusBadge(vendor.status)}>{vendor.status}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" data-animate>
        <StatCard label="Purchase Orders" value={stats.totalPOs} />
        <StatCard label="Invoices" value={stats.totalInvoices} sub={stats.flaggedInvoices > 0 ? `${stats.flaggedInvoices} flagged` : 'none flagged'} />
        <StatCard label="Total PO Value" value={formatCurrency(stats.totalPOValue, purchaseOrders[0]?.currency || 'USD')} />
        <StatCard label="Total Invoiced" value={formatCurrency(stats.totalInvoiced, purchaseOrders[0]?.currency || 'USD')} />
      </div>

      {/* Vendor info */}
      <div className="card" data-animate>
        <h2 className="font-serif font-bold text-ink-900 mb-3">Vendor Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {[
            ['Phone', vendor.phone],
            ['Tax ID / GSTIN', vendor.taxId],
            ['Registration No.', vendor.registrationNumber],
            ['Payment Terms', vendor.paymentTerms],
            ['Address', [vendor.address?.street, vendor.address?.city, vendor.address?.country].filter(Boolean).join(', ')],
            ['Added', formatDate(vendor.createdAt)],
          ].filter(([, v]) => v).map(([label, val]) => (
            <div key={label} className="flex justify-between border-b border-ivory-100 pb-2">
              <span className="text-ivory-600">{label}</span>
              <span className="font-medium text-ink-800 text-right ml-3">{val}</span>
            </div>
          ))}
        </div>
        {vendor.requiredFields?.length > 0 && (
          <div className="mt-4 pt-3 border-t border-ivory-100">
            <p className="text-xs font-bold uppercase tracking-wide text-ivory-500 mb-2">Required invoice fields</p>
            <div className="flex flex-wrap gap-1">
              {vendor.requiredFields.map((f) => (
                <span key={f.fieldKey} className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium">{f.fieldLabel}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Purchase Orders */}
      <div className="card" data-animate>
        <h2 className="font-serif font-bold text-ink-900 mb-3">Purchase Orders ({purchaseOrders.length})</h2>
        {purchaseOrders.length === 0 ? (
          <p className="text-sm text-ivory-600">No purchase orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="bg-ivory-50 text-left text-[10px] font-bold uppercase tracking-wide text-ivory-500">
                  <th className="py-2 px-3">PO Number</th>
                  <th className="py-2 px-3">Issue Date</th>
                  <th className="py-2 px-3">Total</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ivory-100">
                {purchaseOrders.map((po) => (
                  <tr key={po._id} className="hover:bg-ivory-50 transition-colors">
                    <td className="py-2 px-3">
                      <Link to={`/purchase-orders/${po._id}`} className="font-mono font-bold text-amber-800 hover:text-amber-900">{po.poNumber}</Link>
                    </td>
                    <td className="py-2 px-3 text-ivory-700">{formatDate(po.issueDate)}</td>
                    <td className="py-2 px-3 font-mono font-medium text-ink-900">{formatCurrency(po.totalAmount, po.currency)}</td>
                    <td className="py-2 px-3"><span className={getStatusBadge(po.status)}>{po.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoices */}
      <div className="card" data-animate>
        <h2 className="font-serif font-bold text-ink-900 mb-3">Invoices ({invoices.length})</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-ivory-600">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[550px]">
              <thead>
                <tr className="bg-ivory-50 text-left text-[10px] font-bold uppercase tracking-wide text-ivory-500">
                  <th className="py-2 px-3">Invoice #</th>
                  <th className="py-2 px-3">PO</th>
                  <th className="py-2 px-3">Score</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Uploaded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ivory-100">
                {invoices.map((inv) => (
                  <tr key={inv._id} className="hover:bg-ivory-50 transition-colors">
                    <td className="py-2 px-3">
                      <Link to={`/invoices/${inv._id}`} className="font-mono font-bold text-amber-800 hover:text-amber-900 text-xs">{inv.invoiceNumber || '—'}</Link>
                    </td>
                    <td className="py-2 px-3 font-mono text-xs text-ivory-700">{inv.purchaseOrder?.poNumber || '—'}</td>
                    <td className="py-2 px-3">
                      {inv.validationResult?.matchScore != null ? (
                        <span className={`font-mono font-bold ${getScoreColor(inv.validationResult.matchScore)}`}>{inv.validationResult.matchScore}%</span>
                      ) : <span className="text-ivory-400">—</span>}
                    </td>
                    <td className="py-2 px-3"><span className={getStatusBadge(inv.status)}>{inv.status.replace(/_/g, ' ')}</span></td>
                    <td className="py-2 px-3 text-xs text-ivory-600">{formatDate(inv.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
