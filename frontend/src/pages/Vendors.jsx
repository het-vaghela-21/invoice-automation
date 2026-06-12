import React, { useEffect, useState } from 'react';
import { vendorAPI } from '../services/api';
import { formatDate, getStatusBadge } from '../utils/helpers';

const ALL_FIELDS = [
  { fieldKey: 'vendorName',    fieldLabel: 'Vendor Name' },
  { fieldKey: 'gstNumber',     fieldLabel: 'GST Number' },
  { fieldKey: 'invoiceNumber', fieldLabel: 'Invoice Number' },
  { fieldKey: 'poNumber',      fieldLabel: 'PO Number' },
  { fieldKey: 'invoiceDate',   fieldLabel: 'Invoice Date' },
  { fieldKey: 'dueDate',       fieldLabel: 'Due Date' },
  { fieldKey: 'totalAmount',   fieldLabel: 'Total Amount' },
  { fieldKey: 'subTotal',      fieldLabel: 'Subtotal' },
  { fieldKey: 'taxAmount',     fieldLabel: 'Tax Amount' },
  { fieldKey: 'currency',      fieldLabel: 'Currency' },
  { fieldKey: 'bankAccount',   fieldLabel: 'Bank Account' },
];

function VendorModal({ vendor, onClose, onSave }) {
  const defaultRequired = vendor?.requiredFields?.length
    ? vendor.requiredFields.map((f) => f.fieldKey)
    : ['vendorName', 'invoiceNumber', 'totalAmount'];

  const [form, setForm] = useState(vendor || {
    name: '', email: '', phone: '', taxId: '', registrationNumber: '',
    paymentTerms: 'Net 30', status: 'active',
    address: { street: '', city: '', state: '', country: '', zipCode: '' },
    requiredFields: []
  });
  const [selectedKeys, setSelectedKeys] = useState(defaultRequired);
  const [tab, setTab] = useState('basic');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleField = (key) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const requiredFields = selectedKeys.map((key) => ({
        fieldKey: key,
        fieldLabel: ALL_FIELDS.find((f) => f.fieldKey === key)?.fieldLabel || key
      }));
      const payload = { ...form, requiredFields };
      if (vendor?._id) {
        await vendorAPI.update(vendor._id, payload);
      } else {
        await vendorAPI.create(payload);
      }
      onSave();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold">{vendor ? 'Edit Vendor' : 'Add Vendor'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <div className="flex border-b border-gray-200">
          {['basic', 'fields'].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t === 'basic' ? 'Basic Info' : 'Required Invoice Fields'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}

          {tab === 'basic' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label">Company Name *</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label className="label">Email *</label>
                <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label className="label">Tax ID / GSTIN</label>
                <input className="input" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
              </div>
              <div>
                <label className="label">Registration No.</label>
                <input className="input" value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} />
              </div>
              <div>
                <label className="label">Payment Terms</label>
                <select className="input" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}>
                  {['Net 15', 'Net 30', 'Net 60', 'Net 90', 'Due on Receipt'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Street Address</label>
                <input className="input" value={form.address?.street || ''} onChange={(e) => setForm({ ...form, address: { ...form.address, street: e.target.value } })} />
              </div>
              <div>
                <label className="label">City</label>
                <input className="input" value={form.address?.city || ''} onChange={(e) => setForm({ ...form, address: { ...form.address, city: e.target.value } })} />
              </div>
              <div>
                <label className="label">Country</label>
                <input className="input" value={form.address?.country || ''} onChange={(e) => setForm({ ...form, address: { ...form.address, country: e.target.value } })} />
              </div>
            </div>
          )}

          {tab === 'fields' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Select which fields this vendor <strong>must provide</strong> on every invoice. OCR will extract and verify these fields during invoice processing.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {ALL_FIELDS.map(({ fieldKey, fieldLabel }) => (
                  <label key={fieldKey} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedKeys.includes(fieldKey) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={selectedKeys.includes(fieldKey)}
                      onChange={() => toggleField(fieldKey)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">{fieldLabel}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400">
                {selectedKeys.length} field{selectedKeys.length !== 1 ? 's' : ''} selected
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? 'Saving...' : 'Save Vendor'}
            </button>
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Vendors() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    vendorAPI.getAll({ search }).then((res) => setVendors(res.data.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this vendor?')) return;
    await vendorAPI.delete(id);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
          <p className="text-gray-500 text-sm mt-1">Manage vendors and their invoice field requirements</p>
        </div>
        <button className="btn-primary" onClick={() => setModal('add')}>+ Add Vendor</button>
      </div>

      <div className="card p-4">
        <input className="input max-w-sm" placeholder="Search vendors..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Vendor', 'Email', 'Tax ID', 'Required Fields', 'Payment Terms', 'Status', 'Added', 'Actions'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Loading...</td></tr>
            ) : vendors.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">No vendors found</td></tr>
            ) : vendors.map((v) => (
              <tr key={v._id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{v.name}</td>
                <td className="px-4 py-3 text-gray-500">{v.email}</td>
                <td className="px-4 py-3 text-gray-500">{v.taxId || '—'}</td>
                <td className="px-4 py-3">
                  {v.requiredFields?.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {v.requiredFields.slice(0, 3).map((f) => (
                        <span key={f.fieldKey} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{f.fieldLabel}</span>
                      ))}
                      {v.requiredFields.length > 3 && (
                        <span className="text-xs text-gray-400">+{v.requiredFields.length - 3} more</span>
                      )}
                    </div>
                  ) : <span className="text-gray-300 text-xs">None set</span>}
                </td>
                <td className="px-4 py-3 text-gray-500">{v.paymentTerms}</td>
                <td className="px-4 py-3"><span className={getStatusBadge(v.status)}>{v.status}</span></td>
                <td className="px-4 py-3 text-gray-500">{formatDate(v.createdAt)}</td>
                <td className="px-4 py-3 flex gap-2">
                  <button className="text-blue-600 hover:underline text-xs" onClick={() => setModal(v)}>Edit</button>
                  <button className="text-red-600 hover:underline text-xs" onClick={() => handleDelete(v._id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <VendorModal
          vendor={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
