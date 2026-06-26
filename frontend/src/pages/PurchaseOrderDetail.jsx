import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { poAPI } from '../services/api';
import { formatCurrency, formatDate, getStatusBadge } from '../utils/helpers';
import { usePageEntrance } from '../utils/motion';
import { useDocumentTitle } from '../utils/useDocumentTitle';

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);
  useDocumentTitle(po?.poNumber || 'Purchase Order');
  const pageRef = usePageEntrance(!loading && !!po);

  useEffect(() => {
    poAPI.getOne(id).then((res) => setPo(res.data.data)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center h-64" role="status" aria-live="polite">
      <div className="animate-spin w-7 h-7 border-[3px] border-amber-600 border-t-transparent rounded-full" aria-hidden="true" />
      <span className="sr-only">Loading purchase order…</span>
    </div>
  );
  if (!po) return <div className="text-center text-ivory-700 py-20">Purchase order not found</div>;

  return (
    <div ref={pageRef} className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-3" data-animate>
        <div>
          <nav aria-label="Breadcrumb" className="mb-1">
            <Link to="/purchase-orders" className="text-sm text-ivory-700 hover:text-ink-700 flex items-center gap-1 rounded transition-colors">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
              </svg>
              Purchase Orders
            </Link>
          </nav>
          <h1 className="font-mono text-3xl font-bold text-ink-800 tracking-tight">{po.poNumber}</h1>
          <div className="flex items-center gap-3 mt-1.5">
            <span className={getStatusBadge(po.status)}>{po.status}</span>
            <span className="text-sm text-ivory-700">Issued {formatDate(po.issueDate)}</span>
          </div>
        </div>
        <Link to="/upload" state={{ purchaseOrderId: po._id, poNumber: po.poNumber }} className="btn-primary text-sm self-start">
          Match Invoice
        </Link>
      </div>

      {/* Vendor + order details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <section className="card" data-animate aria-label="Vendor details">
          <h2 className="font-serif text-lg font-bold text-ink-800 mb-3">Vendor Details</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3 py-1 border-b border-ivory-200 last:border-0">
              <dt className="text-ivory-700">Name</dt>
              <dd className="font-medium text-ivory-900 text-right">{po.vendor?.name}</dd>
            </div>
            <div className="flex justify-between gap-3 py-1 border-b border-ivory-200 last:border-0">
              <dt className="text-ivory-700">Email</dt>
              <dd className="text-ivory-900 text-right truncate">{po.vendor?.email}</dd>
            </div>
            <div className="flex justify-between gap-3 py-1">
              <dt className="text-ivory-700">Payment Terms</dt>
              <dd className="text-ivory-900 text-right">{po.vendor?.paymentTerms || '—'}</dd>
            </div>
          </dl>
        </section>

        <section className="card" data-animate aria-label="Order details">
          <h2 className="font-serif text-lg font-bold text-ink-800 mb-3">Order Details</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3 py-1 border-b border-ivory-200 last:border-0">
              <dt className="text-ivory-700">Currency</dt>
              <dd className="font-mono text-ivory-900">{po.currency}</dd>
            </div>
            <div className="flex justify-between gap-3 py-1 border-b border-ivory-200 last:border-0">
              <dt className="text-ivory-700">Expected Delivery</dt>
              <dd className="text-ivory-900">{po.expectedDelivery ? formatDate(po.expectedDelivery) : '—'}</dd>
            </div>
            <div className="flex justify-between gap-3 py-1">
              <dt className="text-ivory-700">Tax Rate</dt>
              <dd className="font-mono text-ivory-900">{po.taxRate}%</dd>
            </div>
          </dl>
        </section>
      </div>

      {/* Line items — ledger style */}
      <section className="card" data-animate aria-label="Line items">
        <h2 className="font-serif text-lg font-bold text-ink-800 mb-4">Line Items</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <caption className="sr-only">Purchase order line items with quantity, unit price and totals</caption>
            <thead className="border-b-2 border-ink-200">
              <tr className="text-left text-ivory-600 text-xs uppercase tracking-wider">
                <th scope="col" className="pb-2 font-bold">Description</th>
                <th scope="col" className="pb-2 text-right font-bold">Qty</th>
                <th scope="col" className="pb-2 text-right font-bold">Unit Price</th>
                <th scope="col" className="pb-2 text-right font-bold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ivory-200">
              {po.lineItems.map((item, i) => (
                <tr key={i}>
                  <td className="py-2.5 text-ivory-900">{item.description}</td>
                  <td className="py-2.5 text-right font-mono text-ivory-800">{item.quantity}</td>
                  <td className="py-2.5 text-right font-mono text-ivory-800">{formatCurrency(item.unitPrice, po.currency)}</td>
                  <td className="py-2.5 text-right font-mono font-medium text-ivory-900">{formatCurrency(item.totalPrice, po.currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-ink-200 text-sm">
              <tr>
                <td colSpan={3} className="pt-3 text-right text-ivory-700">Subtotal</td>
                <td className="pt-3 text-right font-mono text-ivory-900">{formatCurrency(po.subTotal, po.currency)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="pt-1 text-right text-ivory-700">Tax ({po.taxRate}%)</td>
                <td className="pt-1 text-right font-mono text-ivory-900">{formatCurrency(po.tax, po.currency)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="pt-2 text-right font-serif font-bold text-ink-700 text-base">Total</td>
                <td className="pt-2 text-right font-mono font-bold text-ink-700 text-base">{formatCurrency(po.totalAmount, po.currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {po.notes && (
        <section className="card paper-ruled" data-animate aria-label="Notes">
          <h2 className="font-serif text-lg font-bold text-ink-800 mb-2">Notes</h2>
          <p className="text-sm text-ivory-800">{po.notes}</p>
        </section>
      )}
    </div>
  );
}
