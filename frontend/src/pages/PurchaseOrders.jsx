import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { poAPI, vendorAPI } from '../services/api';

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
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-3xl my-4">
        <div className="px-6 py-4 border-b border-ivory-200 flex justify-between items-center">
          <h2 className="font-serif text-xl font-bold text-ink-900">Create Purchase Order</h2>
          <button onClick={onClose} className="text-ivory-400 hover:text-ink-800 transition-colors text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-ivory-100">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-full">
              <label className="label">Vendor *</label>
              <select className="input" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} required>
                <option value="">Select vendor…</option>
                {vendors.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Issue Date</label>
              <input className="input" type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
            </div>
            <div>
              <label className="label">Expected Delivery</label>
              <input className="input" type="date" value={form.expectedDelivery} onChange={(e) => setForm({ ...form, expectedDelivery: e.target.value })} />
            </div>
            <div>
              <label className="label">Currency</label>
              <select className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tax Rate (%)</label>
              <input className="input" type="number" min="0" max="100" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="draft">Draft</option>
                <option value="approved">Approved</option>
              </select>
            </div>
            <div>
              <label className="label">Notes</label>
              <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes…" />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Line Items</label>
              <button type="button" onClick={addLine} className="text-amber-600 hover:text-amber-700 text-sm font-semibold">+ Add item</button>
            </div>
            <div className="bg-ivory-50 rounded-xl border border-ivory-200 overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-ivory-500 bg-ivory-100 border-b border-ivory-200">
                <div className="col-span-5">Description</div>
                <div className="col-span-2">Qty</div>
                <div className="col-span-3">Unit Price</div>
                <div className="col-span-1 text-right">Total</div>
                <div className="col-span-1" />
              </div>
              {form.lineItems.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center px-3 py-2 border-b border-ivory-200 last:border-0">
                  <input className="input col-span-5 text-xs py-1.5" placeholder="Item description" value={item.description} onChange={(e) => setLine(i, 'description', e.target.value)} required />
                  <input className="input col-span-2 text-xs py-1.5 font-mono" type="number" min="0" step="0.01" value={item.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} />
                  <input className="input col-span-3 text-xs py-1.5 font-mono" type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => setLine(i, 'unitPrice', e.target.value)} />
                  <div className="col-span-1 text-right text-xs font-mono font-medium text-ink-700">
                    {((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)).toFixed(2)}
                  </div>
                  <button type="button" onClick={() => removeLine(i)} className="col-span-1 text-ivory-400 hover:text-red-500 transition-colors flex items-center justify-center">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 text-right space-y-1 text-sm">
              <div className="text-ivory-600">Subtotal: <span className="font-mono font-semibold text-ink-800">{form.currency} {subTotal.toFixed(2)}</span></div>
              <div className="text-ivory-600">Tax ({form.taxRate}%): <span className="font-mono font-semibold text-ink-800">{form.currency} {tax.toFixed(2)}</span></div>
              <div className="text-base font-serif font-bold text-ink-900">Total: <span className="font-mono">{form.currency} {total.toFixed(2)}</span></div>
            </div>
          </div>

          {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

          <div className="flex gap-3 pt-2 border-t border-ivory-100">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Creating…' : 'Create Purchase Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const STATUS_BADGE = {
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  draft:    'bg-ivory-100 text-ivory-600 border-ivory-200',
  closed:   'bg-red-50 text-red-600 border-red-200',
};

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

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-900">Purchase Orders</h1>
          <p className="text-ivory-600 text-sm mt-0.5">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary self-start sm:self-auto">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create PO
        </button>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {[['', 'All'], ['approved', 'Approved'], ['draft', 'Draft'], ['closed', 'Closed']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-150 ${
              statusFilter === key
                ? 'bg-ink-900 text-white'
                : 'bg-white text-ivory-700 border border-ivory-300 hover:border-ivory-400 hover:text-ink-900'
            }`}
          >{label}</button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-ivory-300 shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="bg-ivory-100 border-b border-ivory-200">
                {['PO Number', 'Vendor', 'Issue Date', 'Total Amount', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-ivory-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-14">
                  <div className="flex items-center justify-center gap-2 text-ivory-500">
                    <div className="animate-spin w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full" />
                    Loading…
                  </div>
                </td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-14 text-ivory-500">No purchase orders found</td></tr>
              ) : orders.map((po) => (
                <tr key={po._id} className="border-b border-ivory-100 hover:bg-ivory-50 transition-colors">
                  <td className="px-4 py-3.5">
                    <Link to={`/purchase-orders/${po._id}`} className="font-mono text-sm font-bold text-amber-700 hover:text-amber-800">{po.poNumber}</Link>
                  </td>
                  <td className="px-4 py-3.5 font-medium text-ink-800">{po.vendor?.name}</td>
                  <td className="px-4 py-3.5 text-sm text-ivory-600">{new Date(po.issueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono font-semibold text-ink-900">{po.currency} {po.totalAmount?.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${STATUS_BADGE[po.status] || 'bg-ivory-100 text-ivory-600 border-ivory-200'}`}>
                      {po.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <Link to={`/purchase-orders/${po._id}`} className="text-xs font-semibold text-amber-600 hover:text-amber-800">View →</Link>
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
