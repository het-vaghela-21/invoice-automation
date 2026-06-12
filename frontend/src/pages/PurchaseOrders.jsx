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
        lineItems: form.lineItems.map(item => ({
          ...item,
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.unitPrice)
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-xl font-bold">Create Purchase Order</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Vendor *</label>
              <select className="input" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} required>
                <option value="">Select vendor...</option>
                {vendors.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
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
                {['USD','EUR','GBP','CAD','AUD','INR'].map(c => <option key={c}>{c}</option>)}
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
              <input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Line Items</label>
              <button type="button" onClick={addLine} className="text-blue-600 text-xs hover:underline">+ Add Item</button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-1">
                <div className="col-span-5">Description</div>
                <div className="col-span-2">Qty</div>
                <div className="col-span-3">Unit Price</div>
                <div className="col-span-1">Total</div>
                <div className="col-span-1"></div>
              </div>
              {form.lineItems.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input className="input col-span-5 text-xs" placeholder="Description" value={item.description} onChange={(e) => setLine(i, 'description', e.target.value)} required />
                  <input className="input col-span-2 text-xs" type="number" min="0" step="0.01" value={item.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} />
                  <input className="input col-span-3 text-xs" type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => setLine(i, 'unitPrice', e.target.value)} />
                  <div className="col-span-1 text-xs text-gray-600 font-medium">${((parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)).toFixed(2)}</div>
                  <button type="button" onClick={() => removeLine(i)} className="col-span-1 text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                </div>
              ))}
            </div>
            <div className="mt-3 text-right text-sm space-y-1 border-t border-gray-100 pt-3">
              <div className="text-gray-500">Subtotal: <span className="font-medium text-gray-900">${subTotal.toFixed(2)}</span></div>
              <div className="text-gray-500">Tax ({form.taxRate}%): <span className="font-medium text-gray-900">${tax.toFixed(2)}</span></div>
              <div className="text-gray-700 font-bold">Total: ${total.toFixed(2)} {form.currency}</div>
            </div>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>{saving ? 'Creating...' : 'Create PO'}</button>
          </div>
        </form>
      </div>
    </div>
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
          <p className="text-gray-500 mt-1">{orders.length} purchase orders</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">+ Create PO</button>
      </div>

      <div className="card p-4">
        <select className="input max-w-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['PO Number','Vendor','Issue Date','Total Amount','Status','Actions'].map(h => (
                <th key={h} className="text-left py-3 px-4 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">Loading...</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-gray-400">No purchase orders found</td></tr>
            ) : orders.map((po) => (
              <tr key={po._id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-3 px-4 font-mono font-medium text-blue-700">{po.poNumber}</td>
                <td className="py-3 px-4 text-gray-800">{po.vendor?.name}</td>
                <td className="py-3 px-4 text-gray-500">{new Date(po.issueDate).toLocaleDateString()}</td>
                <td className="py-3 px-4 font-medium">${po.totalAmount?.toLocaleString()} {po.currency}</td>
                <td className="py-3 px-4"><span className={`badge-${po.status}`}>{po.status}</span></td>
                <td className="py-3 px-4">
                  <Link to={`/purchase-orders/${po._id}`} className="text-blue-600 hover:underline text-xs">View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && <POModal onClose={() => setShowModal(false)} onSave={() => { setShowModal(false); load(); }} />}
    </div>
  );
}
