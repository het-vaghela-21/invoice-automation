import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { vendorAPI } from '../services/api';
import { formatDate, getStatusBadge } from '../utils/helpers';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { usePageEntrance } from '../utils/motion';
import { useAuth } from '../context/AuthContext';
import { canWrite, canDelete } from '../utils/permissions';
import { useDocumentTitle } from '../utils/useDocumentTitle';

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
      toast.success(vendor?._id ? 'Vendor updated' : 'Vendor added');
      onSave();
    } catch (err) {
      const msg = err.response?.data?.message || 'Save failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={vendor ? 'Edit Vendor' : 'Add Vendor'} onClose={onClose}>
        {/* Tabs */}
        <div className="flex border-b border-ivory-200 px-1" role="tablist" aria-label="Vendor form sections">
          {[['basic', 'Basic Info'], ['fields', 'Required Invoice Fields']].map(([t, l]) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                tab === t ? 'border-amber-600 text-amber-900' : 'border-transparent text-ivory-700 hover:text-ink-700'
              }`}
            >{l}</button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-300 rounded-lg text-red-800 text-sm">{error}</div>}

          {tab === 'basic' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-full">
                <label htmlFor="vendor-name" className="label">Company Name *</label>
                <input id="vendor-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <label htmlFor="vendor-email" className="label">Email *</label>
                <input id="vendor-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              <div>
                <label htmlFor="vendor-phone" className="label">Phone</label>
                <input id="vendor-phone" className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <label htmlFor="vendor-taxid" className="label">Tax ID / GSTIN</label>
                <input id="vendor-taxid" className="input font-mono" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
              </div>
              <div>
                <label htmlFor="vendor-regno" className="label">Registration No.</label>
                <input id="vendor-regno" className="input" value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} />
              </div>
              <div>
                <label htmlFor="vendor-terms" className="label">Payment Terms</label>
                <select id="vendor-terms" className="input" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}>
                  {['Net 15', 'Net 30', 'Net 60', 'Net 90', 'Due on Receipt'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="vendor-status" className="label">Status</label>
                <select id="vendor-status" className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="col-span-full">
                <label htmlFor="vendor-street" className="label">Street Address</label>
                <input id="vendor-street" className="input" value={form.address?.street || ''} onChange={(e) => setForm({ ...form, address: { ...form.address, street: e.target.value } })} />
              </div>
              <div>
                <label htmlFor="vendor-city" className="label">City</label>
                <input id="vendor-city" className="input" value={form.address?.city || ''} onChange={(e) => setForm({ ...form, address: { ...form.address, city: e.target.value } })} />
              </div>
              <div>
                <label htmlFor="vendor-country" className="label">Country</label>
                <input id="vendor-country" className="input" value={form.address?.country || ''} onChange={(e) => setForm({ ...form, address: { ...form.address, country: e.target.value } })} />
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
                        ? 'border-amber-500 bg-amber-50'
                        : 'border-ivory-300 hover:border-ivory-500 bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedKeys.includes(fieldKey)}
                      onChange={() => toggleField(fieldKey)}
                      className="w-4 h-4 accent-amber-600 rounded"
                    />
                    <span className="text-sm font-medium text-ink-800">{fieldLabel}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-ivory-600" aria-live="polite">
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
    </Modal>
  );
}

function VendorRow({ vendor, onEdit, onDelete, showEdit, showDelete }) {
  return (
    <tr className="border-b border-ivory-100 hover:bg-ivory-50 transition-colors">
      <td className="px-4 py-3.5">
        <Link to={`/vendors/${vendor._id}`} className="flex items-center gap-3 group min-w-0">
          <div className="w-8 h-8 bg-ink-600 rounded-lg flex items-center justify-center text-white font-serif font-bold text-sm flex-shrink-0" aria-hidden="true">
            {vendor.name[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-ink-800 group-hover:text-amber-800 transition-colors truncate text-sm leading-tight">{vendor.name}</p>
            <p className="text-xs text-ivory-600 truncate">{vendor.email}</p>
          </div>
        </Link>
      </td>
      <td className="px-4 py-3.5">
        {vendor.taxId
          ? <span className="font-mono text-xs bg-ivory-100 px-2 py-0.5 rounded text-ivory-800">{vendor.taxId}</span>
          : <span className="text-ivory-400">—</span>}
      </td>
      <td className="px-4 py-3.5 text-xs text-ivory-700">{vendor.paymentTerms || '—'}</td>
      <td className="px-4 py-3.5">
        {vendor.requiredFields?.length > 0 ? (
          <div className="flex flex-wrap gap-1 max-w-[260px]">
            {vendor.requiredFields.map((f) => (
              <span key={f.fieldKey} className="text-[10px] bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                {f.fieldLabel}
              </span>
            ))}
          </div>
        ) : <span className="text-ivory-400 text-xs">—</span>}
      </td>
      <td className="px-4 py-3.5">
        <span className={getStatusBadge(vendor.status)}>{vendor.status}</span>
      </td>
      <td className="px-4 py-3.5 text-xs text-ivory-700">{formatDate(vendor.createdAt)}</td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <Link to={`/vendors/${vendor._id}`} className="text-xs font-medium text-amber-800 hover:text-amber-900 transition-colors whitespace-nowrap">
            View →
          </Link>
          {showEdit && (
            <button
              onClick={onEdit}
              aria-label={`Edit ${vendor.name}`}
              className="text-xs font-medium text-ivory-600 hover:text-ink-800 transition-colors"
            >
              Edit
            </button>
          )}
          {showDelete && (
            <button
              onClick={onDelete}
              aria-label={`Delete ${vendor.name}`}
              className="text-xs text-ivory-400 hover:text-red-700 transition-colors p-1 rounded"
              title="Delete vendor"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function Vendors() {
  const { user } = useAuth();
  const allowWrite = canWrite(user);
  const allowDelete = canDelete(user);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Debounce: wait 300 ms after the user stops typing before querying
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = () => {
    setLoading(true);
    vendorAPI.getAll({ search: debouncedSearch }).then((res) => setVendors(res.data.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [debouncedSearch]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await vendorAPI.delete(deleteTarget._id);
      toast.success(`"${deleteTarget.name}" deleted`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  useDocumentTitle('Vendors');
  const pageRef = usePageEntrance(!loading);

  return (
    <div ref={pageRef} className="space-y-5 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3" data-animate>
        <div>
          <h1 className="font-serif text-2xl font-bold text-ink-800">Vendors</h1>
          <p className="text-ivory-700 text-sm mt-0.5" aria-live="polite">
            {loading ? 'Loading…' : `${vendors.length} vendor${vendors.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {allowWrite && (
          <button className="btn-primary self-start sm:self-auto" onClick={() => setModal('add')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Vendor
          </button>
        )}
      </div>

      <div className="relative max-w-sm" data-animate>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ivory-500" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <label htmlFor="vendor-search" className="sr-only">Search vendors</label>
        <input
          id="vendor-search"
          type="search"
          className="input pl-9"
          placeholder="Search vendors…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-xl border border-ivory-300 shadow-card overflow-hidden" data-animate>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <caption className="sr-only">List of vendors with contact details, payment terms and status</caption>
            <thead>
              <tr className="bg-ivory-100 border-b border-ivory-200">
                {['Vendor', 'Tax ID', 'Terms', 'Required Fields', 'Status', 'Added', 'Actions'].map((h) => (
                  <th key={h} scope="col" className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-ivory-600">
                    {h === 'Actions' ? <span className="sr-only">{h}</span> : h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <div className="flex items-center justify-center gap-2 text-ivory-600" role="status" aria-live="polite">
                      <div className="animate-spin w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full" />
                      Loading vendors…
                    </div>
                  </td>
                </tr>
              ) : vendors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16 text-ivory-700">
                    {search ? (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="w-10 h-10 mx-auto mb-3 text-ivory-400" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                        <p className="font-serif font-bold text-ink-700 mb-1">No vendors match &ldquo;{search}&rdquo;</p>
                        <button onClick={() => setSearch('')} className="text-amber-800 hover:text-amber-900 font-semibold underline underline-offset-2 text-sm mt-1">Clear search</button>
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="w-10 h-10 mx-auto mb-3 text-ivory-400" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
                        </svg>
                        <p className="font-serif font-bold text-ink-700 mb-1">No vendors yet</p>
                        <p className="text-sm">{allowWrite ? 'Add your first vendor to get started.' : 'Ask an accountant or admin to add one.'}</p>
                        {allowWrite && <button className="btn-primary mt-4" onClick={() => setModal('add')}>Add Vendor</button>}
                      </>
                    )}
                  </td>
                </tr>
              ) : vendors.map((v) => (
                <VendorRow
                  key={v._id}
                  vendor={v}
                  onEdit={() => setModal(v)}
                  onDelete={() => setDeleteTarget(v)}
                  showEdit={allowWrite}
                  showDelete={allowDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <VendorModal
          vendor={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); load(); }}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete vendor?"
          message={`"${deleteTarget.name}" will be removed. Purchase orders and invoices already linked to this vendor will keep a reference to it but it will no longer appear in lookups. This cannot be undone.`}
          confirmLabel="Delete vendor"
          loading={deleting}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
