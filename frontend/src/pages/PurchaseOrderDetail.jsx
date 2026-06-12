import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { poAPI } from '../services/api';
import { formatCurrency, formatDate, getStatusBadge } from '../utils/helpers';

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    poAPI.getOne(id).then((res) => setPo(res.data.data)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400">Loading...</div>;
  if (!po) return <div className="text-center text-gray-400 py-20">Purchase order not found</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link to="/purchase-orders" className="text-sm text-gray-500 hover:text-gray-700">← Purchase Orders</Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{po.poNumber}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={getStatusBadge(po.status)}>{po.status}</span>
            <span className="text-sm text-gray-500">Issued {formatDate(po.issueDate)}</span>
          </div>
        </div>
        <Link to="/upload" state={{ purchaseOrderId: po._id, poNumber: po.poNumber }} className="btn-primary text-sm">Match Invoice</Link>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-3">Vendor Details</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Name</dt><dd className="font-medium">{po.vendor?.name}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Email</dt><dd>{po.vendor?.email}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Payment Terms</dt><dd>{po.vendor?.paymentTerms || '—'}</dd></div>
          </dl>
        </div>
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-3">Order Details</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Currency</dt><dd>{po.currency}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Expected Delivery</dt><dd>{po.expectedDelivery ? formatDate(po.expectedDelivery) : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Tax Rate</dt><dd>{po.taxRate}%</dd></div>
          </dl>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">Line Items</h2>
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200">
            <tr className="text-left text-gray-500 text-xs uppercase">
              <th className="pb-2">Description</th>
              <th className="pb-2 text-right">Qty</th>
              <th className="pb-2 text-right">Unit Price</th>
              <th className="pb-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {po.lineItems.map((item, i) => (
              <tr key={i}>
                <td className="py-2.5">{item.description}</td>
                <td className="py-2.5 text-right text-gray-600">{item.quantity}</td>
                <td className="py-2.5 text-right text-gray-600">{formatCurrency(item.unitPrice, po.currency)}</td>
                <td className="py-2.5 text-right font-medium">{formatCurrency(item.totalPrice, po.currency)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-gray-200 text-sm">
            <tr><td colSpan={3} className="pt-3 text-right text-gray-500">Subtotal</td><td className="pt-3 text-right">{formatCurrency(po.subTotal, po.currency)}</td></tr>
            <tr><td colSpan={3} className="pt-1 text-right text-gray-500">Tax ({po.taxRate}%)</td><td className="pt-1 text-right">{formatCurrency(po.tax, po.currency)}</td></tr>
            <tr><td colSpan={3} className="pt-2 text-right font-bold text-gray-900">Total</td><td className="pt-2 text-right font-bold text-gray-900">{formatCurrency(po.totalAmount, po.currency)}</td></tr>
          </tfoot>
        </table>
      </div>

      {po.notes && (
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-2">Notes</h2>
          <p className="text-sm text-gray-600">{po.notes}</p>
        </div>
      )}
    </div>
  );
}
