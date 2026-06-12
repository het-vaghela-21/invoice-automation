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

  const toggleField = (key) =>
    setSelectedKeys((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);

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
      if (vendor?._id) await vendorAPI.update(vendor._id, payload);
      else await vendorAPI.create(payload);
      onSave();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-10 md:items-center md:pt-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-2xl my-4" onClick={(e) => e.stopPropagation()}>
        {/* Modal header */}
        <div className="px-6 py-4 border-b border-ivory-200 flex justify-between items-center">
          <h2 className="font-serif text-xl font-bold text-ink-900">{vendor ? 'Edit Vendor' : 'Add Vendor'}</h2>
          <button onClick={onClose} className="text-ivory-400 hover:text-ink-800 transition-colors text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-ivory-100">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-ivory-200 px-1">
          {[['basic', 'Basic Info'], ['fields', 'Required Invoice Fields']].map(([t, l]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                tab === t ? 'border-amber-500 text-amber-700' : 'border-transparent text-ivory-600 hover:text-ink-900'
              }`}
            >{l}</button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

          {tab === 'basic' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-full">
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
                <input className="input font-mono" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
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
              <div className="col-span-full">
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
              <p className="text-sm text-ivory-700">
                Select which fields this vendor <strong className="text-ink-800">must provide</strong> on every invoice. OCR will extract and verify these fields.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ALL_FIELDS.map(({ fieldKey, fieldLabel }) => (
                  <label
                    key={fieldKey}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-150 ${
                      selectedKeys.includes(fieldKey)
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-ivory-200 hover:border-ivory-400 bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedKeys.includes(fieldKey)}
                      onChange={() => toggleField(fieldKey)}
                      className="w-4 h-4 accent-amber-500 rounded"
                    />
                    <span className="text-sm font-medium text-ink-800">{fieldLabel}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-ivory-500">
                {selectedKeys.length} field{selectedKeys.length !== 1 ? 's' : ''} selected
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-5 mt-2 border-t border-ivory-100">
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? 'Saving…' : vendor ? 'Update Vendor' : 'Add Vendor'}
            </button>
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function VendorCard({ vendor, onEdit, onDelete }) {
  return (
    <div className="bg-white rounded-xl border border-ivory-300 shadow-card hover:shadow-card-hover hover:border-ivory-400 transition-all duration-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-ink-900 rounded-xl flex items-center justify-center text-white font-serif font-bold text-lg flex-shrink-0">
            {vendor.name[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-ink-900 truncate">{vendor.name}</h3>
            <p className="text-xs text-ivory-500 truncate">{vendor.email}</p>
          </div>
        </div>
        <span className={`${getStatusBadge(vendor.status)} ml-2 flex-shrink-0`}>{vendor.status}</span>
      </div>

      <div className="space-y-1.5 mb-3 text-xs">
        {vendor.taxId && (
          <div className="flex items-center gap-2 text-ivory-600">
            <span className="font-mono bg-ivory-100 px-1.5 py-0.5 rounded text-[10px]">{vendor.taxId}</span>
            <span className="text-ivory-400">GST/Tax ID</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-ivory-600">
          <span>{vendor.paymentTerms}</span>
          <span className="text-ivory-300">·</span>
          <span>Added {formatDate(vendor.createdAt)}</span>
        </div>
      </div>

      {vendor.requiredFields?.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ivory-500 mb-1.5">Required fields</p>
          <div className="flex flex-wrap gap-1">
            {vendor.requiredFields.map((f) => (
              <span key={f.fieldKey} className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                {f.fieldLabel}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-3 border-t border-ivory-100">
        <button onClick={onEdit} className="btn-secondary flex-1 text-xs py-1.5">Edit</button>
        <button onClick={onDelete} className="flex-1 text-xs py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 transition-all duration-150 font-medium">Delete</button>
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
    if (!confirm('Delete this vendor? All associated data will be affected.')) return;
    await vendorAPI.delete(id);
    load();
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-900">Vendors</h1>
          <p className="text-ivory-600 text-sm mt-0.5">Manage vendors and their invoice field requirements</p>
        </div>
        <button className="btn-primary self-start sm:self-auto" onClick={() => setModal('add')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Vendor
        </button>
      </div>

      <div className="relative max-w-sm">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ivory-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          className="input pl-9"
          placeholder="Search vendors…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full" />
        </div>
      ) : vendors.length === 0 ? (
        <div className="text-center py-16 text-ivory-500">
          <div className="text-4xl mb-3 opacity-30">🏢</div>
          <p className="text-lg font-medium text-ivory-600">No vendors yet</p>
          <p className="text-sm">Add your first vendor to get started.</p>
          <button className="btn-primary mt-4" onClick={() => setModal('add')}>Add Vendor</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendors.map((v) => (
            <VendorCard
              key={v._id}
              vendor={v}
              onEdit={() => setModal(v)}
              onDelete={() => handleDelete(v._id)}
            />
          ))}
        </div>
      )}

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
