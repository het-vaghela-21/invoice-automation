import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { poAPI, vendorAPI } from '../services/api';
import Modal from '../components/Modal';
import { usePageEntrance } from '../utils/motion';
import { getStatusBadge } from '../utils/helpers';

function POModal({ onClose, onSave }) {
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState({
    vendor: '', issueDate: new Date().toISOString().slice(0, 10),
    expectedDelivery: '', currency: 'USD', taxRate: 10, status: 'draft', notes: '',
    lineItems: [{ description: '', quantity: 1, unitPrice: 0 }]
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    vendorAPI.getAll({ status: 'active' }).then((res) => setVendors(res.data.data));
  }, []);

  const setLine = (i, field, val) => {
    const items = [...form.lineItems];
    items[i] = { ...items[i], [field]: val };
    setForm((f) => ({ ...f, lineItems: items }));
  };
  const addLine = () => setForm((f) => ({ ...f, lineItems: [...f.lineItems, { description: '', quantity: 1, unitPrice: 0 }] }));
  const removeLine = (i) => setForm((f) => ({ ...f, lineItems: f.lineItems.filter((_, idx) => idx !== i) }));

  const subTotal = form.lineItems.reduce((s, item) => s + (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0), 0);
  const tax = subTotal * (form.taxRate / 100);
  const total = subTotal + tax;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await poAPI.create({
        ...form,
        lineItems: form.lineItems.map((item) => ({
          ...item,
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.unitPrice),
        }))
      });
      onSave();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Create Purchase Order" onClose={onClose} maxWidth="max-w-3xl">
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-full">
              <label htmlFor="po-vendor" className="label">Vendor *</label>
              <select id="po-vendor" className="input" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} required>
                <option value="">Select vendor…</option>
                {vendors.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="po-issue" className="label">Issue Date</label>
              <input id="po-issue" className="input" type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
            </div>
            <div>
              <label htmlFor="po-delivery" className="label">Expected Delivery</label>
              <input id="po-delivery" className="input" type="date" value={form.expectedDelivery} onChange={(e) => setForm({ ...form, expectedDelivery: e.target.value })} />
            </div>
            <div>
              <label htmlFor="po-currency" className="label">Currency</label>
              <select id="po-currency" className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="po-taxrate" className="label">Tax Rate (%)</label>
              <input id="po-taxrate" className="input" type="number" min="0" max="100" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label htmlFor="po-status" className="label">Status</label>
              <select id="po-status" className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="draft">Draft</option>
                <option value="approved">Approved</option>
              </select>
            </div>
            <div>
              <label htmlFor="po-notes" className="label">Notes</label>
              <input id="po-notes" className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes…" />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="label mb-0">Line Items</span>
              <button type="button" onClick={addLine} className="text-amber-800 hover:text-amber-900 text-sm font-semibold rounded">+ Add item</button>
            </div>
            <div className="bg-ivory-50 rounded-xl border border-ivory-200 overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-ivory-600 bg-ivory-100 border-b border-ivory-200" aria-hidden="true">
                <div className="col-span-5">Description</div>
                <div className="col-span-2">Qty</div>
                <div className="col-span-3">Unit Price</div>
                <div className="col-span-1 text-right">Total</div>
                <div className="col-span-1" />
              </div>
              {form.lineItems.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center px-3 py-2 border-b border-ivory-200 last:border-0">
                  <input className="input col-span-5 text-xs py-1.5" placeholder="Item description" aria-label={`Item ${i + 1} description`} value={item.description} onChange={(e) => setLine(i, 'description', e.target.value)} required />
                  <input className="input col-span-2 text-xs py-1.5 font-mono" type="number" min="0" step="0.01" aria-label={`Item ${i + 1} quantity`} value={item.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} />
                  <input className="input col-span-3 text-xs py-1.5 font-mono" type="number" min="0" step="0.01" aria-label={`Item ${i + 1} unit price`} value={item.unitPrice} onChange={(e) => setLine(i, 'unitPrice', e.target.value)} />
                  <div className="col-span-1 text-right text-xs font-mono font-medium text-ivory-900">
                    {((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)).toFixed(2)}
                  </div>
                  <button type="button" onClick={() => removeLine(i)} aria-label={`Remove line item ${i + 1}`} className="col-span-1 text-ivory-500 hover:text-red-700 transition-colors flex items-center justify-center rounded p-1">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 text-right space-y-1 text-sm" aria-live="polite">
              <div className="text-ivory-700">Subtotal: <span className="font-mono font-semibold text-ivory-900">{form.currency} {subTotal.toFixed(2)}</span></div>
              <div className="text-ivory-700">Tax ({form.taxRate}%): <span className="font-mono font-semibold text-ivory-900">{form.currency} {tax.toFixed(2)}</span></div>
              <div className="text-base font-serif font-bold text-ink-700">Total: <span className="font-mono">{form.currency} {total.toFixed(2)}</span></div>
            </div>
          </div>

          {error && <p role="alert" className="text-red-800 text-sm bg-red-50 border border-red-300 rounded-lg p-3">{error}</p>}

          <div className="flex gap-3 pt-2 border-t border-ivory-100">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Creating…' : 'Create Purchase Order'}
            </button>
          </div>
        </form>
    </Modal>
  );
}


export default function PurchaseOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const load = () => {
    setLoading(true);
    poAPI.getAll({ status: statusFilter || undefined })
      .then((res) => setOrders(res.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [statusFilter]);

  const pageRef = usePageEntrance(!loading);

  return (
    <div ref={pageRef} className="space-y-5 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3" data-animate>
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-800">Purchase Orders</h1>
          <p className="text-ivory-700 text-sm mt-0.5" aria-live="polite">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary self-start sm:self-auto">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create PO
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap" role="group" aria-label="Filter purchase orders by status" data-animate>
        {[['', 'All'], ['approved', 'Approved'], ['draft', 'Draft'], ['closed', 'Closed']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            aria-pressed={statusFilter === key}
            className={statusFilter === key ? 'pill-active' : 'pill'}
          >{label}</button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-ivory-300 shadow-card overflow-hidden" data-animate>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <caption className="sr-only">Purchase orders with vendor, issue date, total amount and status</caption>
            <thead>
              <tr className="bg-ivory-100 border-b border-ivory-200">
                {['PO Number', 'Vendor', 'Issue Date', 'Total Amount', 'Status', 'Actions'].map((h) => (
                  <th key={h} scope="col" className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-ivory-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-14">
                  <div className="flex items-center justify-center gap-2 text-ivory-600" role="status" aria-live="polite">
                    <div className="animate-spin w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full" aria-hidden="true" />
                    Loading…
                  </div>
                </td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-14 text-ivory-700">No purchase orders found</td></tr>
              ) : orders.map((po) => (
                <tr key={po._id} className="border-b border-ivory-100 hover:bg-ivory-50 transition-colors">
                  <td className="px-4 py-3.5">
                    <Link to={`/purchase-orders/${po._id}`} className="font-mono text-sm font-bold text-amber-800 hover:text-amber-900 underline decoration-amber-300 underline-offset-2">{po.poNumber}</Link>
                  </td>
                  <td className="px-4 py-3.5 font-medium text-ivory-900">{po.vendor?.name}</td>
                  <td className="px-4 py-3.5 text-sm text-ivory-700">{new Date(po.issueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono font-semibold text-ivory-900">{po.currency} {po.totalAmount?.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={getStatusBadge(po.status)}>
                      {po.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <Link to={`/purchase-orders/${po._id}`} aria-label={`View purchase order ${po.poNumber}`} className="text-xs font-semibold text-amber-800 hover:text-amber-900">View →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && <POModal onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); load(); }} />}
    </div>
  );
}
