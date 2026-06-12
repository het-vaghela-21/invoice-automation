import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { poAPI, vendorAPI } from '../services/api';
import { formatCurrency } from '../utils/helpers';

const emptyItem = { description: '', quantity: 1, unitPrice: 0, totalPrice: 0 };

export default function NewPurchaseOrder() {
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState({ vendor: '', issueDate: new Date().toISOString().split('T')[0], expectedDelivery: '', currency: 'USD', taxRate: 10, notes: '', status: 'draft', lineItems: [{ ...emptyItem }] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => { vendorAPI.getAll({ status: 'active', limit: 100 }).then((res) => setVendors(res.data.data)); }, []);

  const updateItem = (idx, field, value) => {
    const items = [...form.lineItems];
    items[idx] = { ...items[idx], [field]: value };
    if (field === 'quantity' || field === 'unitPrice') {
      items[idx].totalPrice = (field === 'quantity' ? value : items[idx].quantity) * (field === 'unitPrice' ? value : items[idx].unitPrice);
    }
    setForm({ ...form, lineItems: items });
  };

  const addItem = () => setForm({ ...form, lineItems: [...form.lineItems, { ...emptyItem }] });
  const removeItem = (idx) => setForm({ ...form, lineItems: form.lineItems.filter((_, i) => i !== idx) });

  const subTotal = form.lineItems.reduce((s, i) => s + (parseFloat(i.quantity) * parseFloat(i.unitPrice) || 0), 0);
  const tax = subTotal * (form.taxRate / 100);
  const total = subTotal + tax;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.vendor) return setError('Please select a vendor');
    if (form.lineItems.length === 0) return setError('Add at least one line item');
    setLoading(true);
    setError('');
    try {
      const res = await poAPI.create({ ...form, lineItems: form.lineItems.map(i => ({ ...i, quantity: parseFloat(i.quantity), unitPrice: parseFloat(i.unitPrice), totalPrice: parseFloat(i.quantity) * parseFloat(i.unitPrice) })) });
      navigate(`/purchase-orders/${res.data.data._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create PO');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Purchase Order</h1>
        <p className="text-gray-500 text-sm mt-1">Create a purchase order to match against invoices</p>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-900">PO Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Vendor *</label>
              <select className="input" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} required>
                <option value="">Select vendor...</option>
                {vendors.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
              </select>
            </div>
            <div><label className="label">Issue Date</label><input type="date" className="input" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} /></div>
            <div><label className="label">Expected Delivery</label><input type="date" className="input" value={form.expectedDelivery} onChange={(e) => setForm({ ...form, expectedDelivery: e.target.value })} /></div>
            <div><label className="label">Currency</label>
              <select className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                {['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR'].map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div><label className="label">Tax Rate (%)</label><input type="number" className="input" value={form.taxRate} min="0" max="100" step="0.1" onChange={(e) => setForm({ ...form, taxRate: parseFloat(e.target.value) || 0 })} /></div>
            <div><label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="draft">Draft</option><option value="approved">Approved</option>
              </select>
            </div>
            <div><label className="label">Notes</label><input className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
        </div>

        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-gray-900">Line Items</h2>
            <button type="button" className="btn-secondary text-sm" onClick={addItem}>+ Add Item</button>
          </div>
          <div className="space-y-3">
            {form.lineItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5"><input className="input text-sm" placeholder="Description" value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} required /></div>
                <div className="col-span-2"><input type="number" className="input text-sm" placeholder="Qty" value={item.quantity} min="0" step="0.01" onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)} required /></div>
                <div className="col-span-2"><input type="number" className="input text-sm" placeholder="Unit Price" value={item.unitPrice} min="0" step="0.01" onChange={(e) => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)} required /></div>
                <div className="col-span-2 text-sm font-medium text-right py-2">{formatCurrency(item.quantity * item.unitPrice, form.currency)}</div>
                <div className="col-span-1 text-right"><button type="button" className="text-red-400 hover:text-red-600 text-lg" onClick={() => removeItem(idx)}>×</button></div>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-200 mt-4 pt-4 space-y-2 text-sm">
            <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(subTotal, form.currency)}</span></div>
            <div className="flex justify-between text-gray-600"><span>Tax ({form.taxRate}%)</span><span>{formatCurrency(tax, form.currency)}</span></div>
            <div className="flex justify-between font-bold text-gray-900 text-base"><span>Total</span><span>{formatCurrency(total, form.currency)}</span></div>
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Creating...' : 'Create Purchase Order'}</button>
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
