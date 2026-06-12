import React, { useEffect, useState } from 'react';
import { vendorAPI } from '../services/api';
import { formatDate, getStatusBadge } from '../utils/helpers';

function VendorModal({ vendor, onClose, onSave }) {
  const [form, setForm] = useState(vendor || { name: '', email: '', phone: '', taxId: '', registrationNumber: '', paymentTerms: 'Net 30', status: 'active', address: { street: '', city: '', state: '', country: '', zipCode: '' } });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (vendor?._id) {
        await vendorAPI.update(vendor._id, form);
      } else {
        await vendorAPI.create(form);
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
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold">{vendor ? 'Edit Vendor' : 'Add Vendor'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="label">Company Name *</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div><label className="label">Email *</label><input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
            <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className="label">Tax ID</label><input className="input" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} /></div>
            <div><label className="label">Registration No.</label><input className="input" value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} /></div>
            <div><label className="label">Payment Terms</label>
              <select className="input" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}>
                {['Net 15', 'Net 30', 'Net 60', 'Net 90', 'Due on Receipt'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Active</option><option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="col-span-2"><label className="label">Street Address</label><input className="input" value={form.address?.street || ''} onChange={(e) => setForm({ ...form, address: { ...form.address, street: e.target.value } })} /></div>
            <div><label className="label">City</label><input className="input" value={form.address?.city || ''} onChange={(e) => setForm({ ...form, address: { ...form.address, city: e.target.value } })} /></div>
            <div><label className="label">Country</label><input className="input" value={form.address?.country || ''} onChange={(e) => setForm({ ...form, address: { ...form.address, country: e.target.value } })} /></div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={loading}>{loading ? 'Saving...' : 'Save Vendor'}</button>
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
  const [modal, setModal] = useState(null); // null | 'add' | vendor object
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
          <p className="text-gray-500 text-sm mt-1">Manage registered vendors</p>
        </div>
        <button className="btn-primary" onClick={() => setModal('add')}>+ Add Vendor</button>
      </div>

      <div className="card p-4">
        <input className="input max-w-sm" placeholder="Search vendors..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>{['Vendor', 'Email', 'Tax ID', 'Payment Terms', 'Status', 'Added', 'Actions'].map((h) => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">Loading...</td></tr>
            ) : vendors.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-400">No vendors found</td></tr>
            ) : vendors.map((v) => (
              <tr key={v._id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{v.name}</td>
                <td className="px-4 py-3 text-gray-500">{v.email}</td>
                <td className="px-4 py-3 text-gray-500">{v.taxId || '—'}</td>
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
