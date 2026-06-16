import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { invoiceAPI } from '../services/api';
import { getStatusBadge, getScoreColor } from '../utils/helpers';
import { usePageEntrance } from '../utils/motion';
import { useAuth } from '../context/AuthContext';
import { canWrite } from '../utils/permissions';

const FIELD_META = {
  vendorName:    { label: 'Vendor Name',    type: 'text' },
  gstNumber:     { label: 'GST Number',     type: 'text' },
  invoiceNumber: { label: 'Invoice Number', type: 'text' },
  poNumber:      { label: 'PO Number',      type: 'text' },
  invoiceDate:   { label: 'Invoice Date',   type: 'text' },
  dueDate:       { label: 'Due Date',       type: 'text' },
  totalAmount:   { label: 'Total Amount',   type: 'number' },
  subTotal:      { label: 'Subtotal',       type: 'number' },
  taxAmount:     { label: 'Tax Amount',     type: 'number' },
  currency:      { label: 'Currency',       type: 'text' },
  bankAccount:   { label: 'Bank Account',   type: 'text' },
};

const ALL_FIELD_KEYS = Object.keys(FIELD_META);

// Discrepancy fields that aren't user-editable invoice fields (so they
// don't belong in FIELD_META, which also drives the editable-fields list)
// but still need a friendly label when shown in a discrepancy list/table.
const DISCREPANCY_LABELS = {
  poStatus: 'PO Status',
  duplicateInvoice: 'Duplicate Check',
  lineItemCount: 'Line Item Count',
};
const discrepancyLabel = (field) => FIELD_META[field]?.label || DISCREPANCY_LABELS[field] || field;

function getExtracted(ext, key) {
  if (!ext) return null;
  switch (key) {
    case 'vendorName':    return ext.vendorName?.value;
    case 'gstNumber':     return ext.gstNumber?.value;
    case 'invoiceNumber': return ext.invoiceNumber?.value;
    case 'poNumber':      return ext.poNumber?.value;
    case 'invoiceDate':   return ext.invoiceDate?.value;
    case 'dueDate':       return ext.dueDate?.value;
    case 'totalAmount':   return ext.totalAmount?.value;
    case 'subTotal':      return ext.subTotal?.value;
    case 'taxAmount':     return ext.tax?.value;
    case 'currency':      return ext.currency?.value;
    case 'bankAccount':   return ext.bankAccount?.value;
    default:              return null;
  }
}

function getConfidence(ext, key) {
  if (!ext) return 0;
  switch (key) {
    case 'vendorName':    return ext.vendorName?.confidence;
    case 'gstNumber':     return ext.gstNumber?.confidence;
    case 'invoiceNumber': return ext.invoiceNumber?.confidence;
    case 'poNumber':      return ext.poNumber?.confidence;
    case 'invoiceDate':   return ext.invoiceDate?.confidence;
    case 'dueDate':       return ext.dueDate?.confidence;
    case 'totalAmount':   return ext.totalAmount?.confidence;
    case 'subTotal':      return ext.subTotal?.confidence;
    case 'taxAmount':     return ext.tax?.confidence;
    case 'currency':      return ext.currency?.confidence;
    case 'bankAccount':   return ext.bankAccount?.confidence;
    default:              return 0;
  }
}

function ConfidenceDot({ value }) {
  if (!value) return null;
  const color = value >= 80 ? 'bg-emerald-400' : value >= 60 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <span className="flex items-center gap-1 text-xs text-ivory-600">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      {value}%
    </span>
  );
}

function FilePreview({ invoice }) {
  const { filename, mimetype } = invoice.uploadedFile || {};
  const url = `/uploads/${filename}`;
  if (!filename) return <div className="flex items-center justify-center h-full text-ivory-400 text-sm">No file attached</div>;
  if (mimetype === 'application/pdf') {
    return <embed src={url} type="application/pdf" className="w-full h-full" title="Invoice Preview" />;
  }
  return (
    <div className="w-full h-full overflow-auto bg-ivory-100 flex items-start justify-center p-4">
      <img src={url} alt="Invoice" className="max-w-full object-contain shadow-md rounded" />
    </div>
  );
}

function StatusBar({ status }) {
  const steps = [
    { key: 'uploaded',       label: 'Uploaded' },
    { key: 'ocr_extracted',  label: 'OCR Done' },
    { key: 'pending_review', label: 'Verified' },
    { key: 'passed',         label: 'Passed' },
  ];
  const order = ['uploaded', 'ocr_extracted', 'pending_review', 'review_required', 'passed', 'rejected'];
  const currentIdx = order.indexOf(status);

  return (
    <ol className="hidden sm:flex items-center gap-0 list-none" aria-label="Invoice processing pipeline">
      {steps.map((step, i) => {
        const stepIdx = order.indexOf(step.key);
        const done = currentIdx > stepIdx;
        const active = status === step.key || (status === 'review_required' && step.key === 'pending_review');
        return (
          <React.Fragment key={step.key}>
            <li className="flex flex-col items-center" aria-current={active ? 'step' : undefined}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                done ? 'bg-ink-600 border-ink-600 text-white' :
                active ? 'bg-white border-amber-600 text-amber-800' :
                'bg-white border-ivory-400 text-ivory-600'
              }`} aria-hidden="true">
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] mt-0.5 font-semibold ${active ? 'text-amber-800' : done ? 'text-ink-600' : 'text-ivory-600'}`}>
                {step.label}
                <span className="sr-only">{done ? ' (complete)' : active ? ' (current step)' : ''}</span>
              </span>
            </li>
            {i < steps.length - 1 && (
              <li className={`h-px flex-1 mx-1 mb-4 min-w-[16px] ${done ? 'bg-ink-400' : 'bg-ivory-400'}`} aria-hidden="true" />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const allowWrite = canWrite(user);
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [matchLoading, setMatchLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [editedFields, setEditedFields] = useState({});
  const [changedKeys, setChangedKeys] = useState(new Set());
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [error, setError] = useState('');
  const [showLog, setShowLog] = useState(false);
  const pageRef = usePageEntrance(!loading && !!invoice);

  const load = useCallback(() => {
    setLoading(true);
    invoiceAPI.getOne(id)
      .then((res) => {
        const inv = res.data.data;
        setInvoice(inv);
        const init = {};
        ALL_FIELD_KEYS.forEach((key) => {
          const verified = inv.userVerifiedData?.[key];
          const extracted = getExtracted(inv.extractedData, key);
          const val = verified !== undefined ? verified : extracted;
          init[key] = val !== null && val !== undefined ? String(val) : '';
        });
        setEditedFields(init);
        setChangedKeys(new Set());
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleFieldChange = (key, value) => {
    setEditedFields((prev) => ({ ...prev, [key]: value }));
    setChangedKeys((prev) => new Set(prev).add(key));
  };

  const handleOCR = async () => {
    setOcrLoading(true); setError('');
    try {
      const res = await invoiceAPI.triggerOCR(id);
      setInvoice(res.data.data);
      const inv = res.data.data;
      const init = {};
      ALL_FIELD_KEYS.forEach((key) => {
        const val = getExtracted(inv.extractedData, key);
        init[key] = val !== null && val !== undefined ? String(val) : '';
      });
      setEditedFields(init);
      setChangedKeys(new Set());
      toast.success('OCR complete — review the extracted fields');
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'OCR failed';
      setError(msg);
      toast.error(msg);
    } finally { setOcrLoading(false); }
  };

  const handleSave = async () => {
    setSaveLoading(true); setError('');
    try {
      const fieldsToSave = {};
      ALL_FIELD_KEYS.forEach((key) => {
        const v = editedFields[key];
        if (v !== '' && v !== null && v !== undefined)
          fieldsToSave[key] = FIELD_META[key].type === 'number' ? parseFloat(v) || v : v;
      });
      const res = await invoiceAPI.updateFields(id, fieldsToSave);
      setInvoice(res.data.data);
      const savedCount = changedKeys.size;
      setChangedKeys(new Set());
      toast.success(`Saved ${savedCount} field${savedCount !== 1 ? 's' : ''}`);
    } catch (err) {
      const msg = err.response?.data?.message || 'Save failed';
      setError(msg);
      toast.error(msg);
    } finally { setSaveLoading(false); }
  };

  const handleMatch = async () => {
    setMatchLoading(true); setError('');
    try {
      const fieldsToSave = {};
      ALL_FIELD_KEYS.forEach((key) => {
        const v = editedFields[key];
        if (v !== '' && v !== null && v !== undefined)
          fieldsToSave[key] = FIELD_META[key].type === 'number' ? parseFloat(v) || v : v;
      });
      if (changedKeys.size > 0) await invoiceAPI.updateFields(id, fieldsToSave);
      const res = await invoiceAPI.submitMatching(id);
      setInvoice(res.data.data);
      setChangedKeys(new Set());
      const vr = res.data.data.validationResult;
      if (vr?.status === 'passed') toast.success(`Matched — ${vr.matchScore}% score`);
      else toast.error(`Review required — ${vr?.matchScore ?? 0}% score, ${vr?.discrepancies?.length ?? 0} issue(s)`);
    } catch (err) {
      const msg = err.response?.data?.message || 'Matching failed';
      setError(msg);
      toast.error(msg);
    } finally { setMatchLoading(false); }
  };

  const handleReject = async () => {
    setError('');
    try {
      await invoiceAPI.rejectInvoice(id, rejectReason);
      toast.success('Invoice rejected');
      load();
    } catch (err) {
      const msg = err.response?.data?.message || 'Reject failed';
      setError(msg);
      toast.error(msg);
    }
  };

  if (loading && !invoice) return (
    <div className="flex items-center justify-center h-64" role="status" aria-live="polite">
      <div className="animate-spin w-7 h-7 border-[3px] border-amber-600 border-t-transparent rounded-full" aria-hidden="true" />
      <span className="sr-only">Loading invoice…</span>
    </div>
  );
  if (!invoice) return <div className="text-center text-ivory-700 py-20">Invoice not found</div>;

  const ext = invoice.extractedData || {};
  const po = invoice.purchaseOrder;
  const vr = invoice.validationResult || {};
  const vendor = invoice.vendor;
  const requiredFields = vendor?.requiredFields?.length ? vendor.requiredFields : [];
  const requiredKeys = requiredFields.map((f) => f.fieldKey);
  const otherKeys = ALL_FIELD_KEYS.filter((k) => !requiredKeys.includes(k));
  const showSplitView = ['ocr_extracted', 'pending_review', 'review_required'].includes(invoice.status);
  const knownStatuses = ['uploaded', 'ocr_extracted', 'pending_review', 'review_required', 'passed', 'rejected'];
  const isUnknownStatus = !knownStatuses.includes(invoice.status);

  return (
    <div ref={pageRef} className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 flex-shrink-0" data-animate>
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/invoices" className="text-ivory-700 hover:text-ink-700 text-sm flex items-center gap-1 flex-shrink-0 transition-colors rounded">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" /></svg>
            Invoices
          </Link>
          <span className="text-ivory-400" aria-hidden="true">/</span>
          <div className="min-w-0">
            <h1 className="font-serif text-xl font-bold text-ink-800 truncate">
              {invoice.invoiceNumber || invoice.uploadedFile?.originalName || 'Invoice'}
            </h1>
            <p className="text-xs text-ivory-600 truncate">
              {invoice.uploadedFile?.originalName}
              {invoice.uploadedFile?.size ? ` · ${(invoice.uploadedFile.size / 1024).toFixed(1)} KB` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <StatusBar status={invoice.status} />
          <span className={`${getStatusBadge(invoice.status)} flex-shrink-0`} role="status" aria-live="polite">
            <span className="sr-only">Invoice status: </span>{invoice.status.replace(/_/g, ' ')}
          </span>
          <button
            onClick={() => setShowLog(!showLog)}
            className="btn-ghost text-xs px-2 py-1"
            aria-expanded={showLog}
            aria-label="Toggle processing log"
            title="Processing log"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10z" clipRule="evenodd" />
            </svg>
            Log
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="mb-3 p-3 bg-red-50 border border-red-300 rounded-lg text-red-800 text-sm flex items-center gap-2 flex-shrink-0">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {/* Duplicate warning */}
      {vr.duplicateCheck?.isDuplicate && (
        <div className="mb-3 p-4 bg-orange-50 border border-orange-200 rounded-xl flex items-start gap-3 flex-shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="font-semibold text-orange-800 text-sm">Duplicate Invoice Detected</p>
            <p className="text-xs text-orange-700 mt-0.5">
              This appears to be a duplicate of an existing invoice.
              {vr.duplicateCheck.similarInvoiceId && (
                <> Similar ID: <span className="font-mono bg-orange-100 px-1 rounded text-[10px]">{String(vr.duplicateCheck.similarInvoiceId)}</span></>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Processing log */}
      {showLog && (
        <div className="mb-4 bg-white border border-ivory-200 rounded-xl p-4 max-h-44 overflow-y-auto scrollbar-thin flex-shrink-0">
          <h3 className="font-semibold text-xs uppercase tracking-wider text-ivory-600 mb-2">Processing Log</h3>
          <div className="space-y-1.5">
            {invoice.processingLog?.map((entry, i) => (
              <div key={i} className={`flex gap-2 p-2 rounded-lg text-xs ${
                entry.status === 'error'   ? 'bg-red-50 text-red-800' :
                entry.status === 'success' ? 'bg-emerald-50 text-emerald-800' :
                entry.status === 'warning' ? 'bg-amber-50 text-amber-800' :
                'bg-ivory-50 text-ivory-700'
              }`}>
                <span className="flex-shrink-0">{
                  entry.status === 'error' ? '✕' :
                  entry.status === 'success' ? '✓' :
                  entry.status === 'warning' ? '⚠' : 'ℹ'
                }</span>
                <div>
                  <span className="font-semibold">{entry.action}</span>
                  <span className="opacity-70 ml-1">— {entry.details}</span>
                  <span className="opacity-40 ml-2">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Unknown status ── */}
      {isUnknownStatus && (
        <div className="flex-1 space-y-4">
          <div className="p-6 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-5">
            <div className="w-10 h-10 flex items-center justify-center">
              <div className="animate-spin w-8 h-8 border-[3px] border-blue-500 border-t-transparent rounded-full" />
            </div>
            <div>
              <h2 className="font-serif text-xl font-bold text-blue-800 capitalize">{invoice.status.replace(/_/g, ' ')}</h2>
              <p className="text-blue-600 mt-0.5 text-sm">Processing in progress. Refresh to check status.</p>
            </div>
          </div>
          <button onClick={load} className="btn-secondary text-sm">↺ Refresh</button>
        </div>
      )}

      {/* ── UPLOADED ── */}
      {invoice.status === 'uploaded' && (
        <div className="flex-1 flex items-center justify-center py-8">
          <div className="text-center max-w-sm w-full space-y-6">
            <div className="w-20 h-20 bg-ivory-100 border-2 border-dashed border-ivory-300 rounded-2xl flex items-center justify-center mx-auto">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-9 h-9 text-ivory-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div>
              <h2 className="font-serif text-2xl font-bold text-ink-900">Ready to Process</h2>
              <p className="text-ivory-600 text-sm mt-2 leading-relaxed">
                Click below to run OCR and extract all invoice data. The system will identify fields based on this vendor's requirements.
              </p>
            </div>

            <div className="bg-white border border-ivory-200 rounded-xl p-4 text-left text-sm space-y-2">
              {[
                ['File', invoice.uploadedFile?.originalName],
                ['Type', invoice.uploadedFile?.mimetype],
                ['Size', invoice.uploadedFile?.size ? `${(invoice.uploadedFile.size / 1024).toFixed(1)} KB` : null],
                ['Vendor', vendor?.name],
                ['PO', po?.poNumber],
              ].filter(([, v]) => v).map(([label, val]) => (
                <div key={label} className="flex justify-between border-b border-ivory-100 pb-2 last:border-0 last:pb-0">
                  <span className="text-ivory-500">{label}</span>
                  <span className="font-medium text-ink-800 font-mono text-xs truncate ml-3 max-w-[180px]">{val}</span>
                </div>
              ))}
              {vendor?.requiredFields?.length > 0 && (
                <div className="pt-2 border-t border-ivory-100">
                  <span className="text-xs font-bold uppercase tracking-wide text-ivory-500 block mb-2">Fields to extract</span>
                  <div className="flex flex-wrap gap-1">
                    {vendor.requiredFields.map((f) => (
                      <span key={f.fieldKey} className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium">{f.fieldLabel}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {allowWrite ? (
              <button onClick={handleOCR} disabled={ocrLoading} className="btn-primary w-full py-3 text-base">
                {ocrLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Running OCR…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
                    </svg>
                    Start OCR Processing
                  </span>
                )}
              </button>
            ) : (
              <p className="text-center text-sm text-ivory-500 italic py-3 border border-ivory-200 rounded-xl bg-ivory-50">
                Read-only — ask an accountant or admin to process this invoice.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── SPLIT VIEW (ocr_extracted, pending_review, review_required) ── */}
      {showSplitView && (
        <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
          {/* Left: file preview */}
          <div className="lg:w-1/2 rounded-xl border border-ivory-300 overflow-hidden bg-ivory-100 flex-shrink-0 flex flex-col" style={{ minHeight: '400px' }}>
            <div className="bg-white border-b border-ivory-200 px-3 py-2 text-xs text-ivory-500 font-medium flex items-center gap-2 flex-shrink-0">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-ivory-400">
                <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.379 2H4.5zm2.25 8.5a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5zm0 3a.75.75 0 000 1.5h6.5a.75.75 0 000-1.5h-6.5z" clipRule="evenodd" />
              </svg>
              {invoice.uploadedFile?.originalName}
            </div>
            <div className="flex-1" style={{ minHeight: 0 }}>
              <FilePreview invoice={invoice} />
            </div>
          </div>

          {/* Right: extracted fields */}
          <div className="lg:w-1/2 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto scrollbar-thin space-y-3 pr-1">

              {/* Review required banner */}
              {invoice.status === 'review_required' && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-serif font-bold text-orange-800 text-base">Review Required — {vr.matchScore}% match</h3>
                    <span className="text-xs font-semibold bg-orange-100 text-orange-700 px-2 py-0.5 rounded border border-orange-200">
                      {vr.discrepancies?.length} issue{vr.discrepancies?.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-sm text-orange-700 mb-3">Correct the fields below or reject this invoice.</p>
                  <div className="space-y-2">
                    {vr.discrepancies?.map((d, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm bg-white rounded-lg p-2.5 border border-orange-100">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 mt-0.5 ${
                          d.severity === 'high' ? 'bg-red-100 text-red-700' :
                          d.severity === 'medium' ? 'bg-orange-100 text-orange-700' :
                          'bg-ivory-100 text-ivory-600'
                        }`}>{d.severity?.toUpperCase()}</span>
                        <div className="text-xs">
                          <span className="font-semibold text-ink-800">{discrepancyLabel(d.field)}</span>
                          <span className="text-ivory-500">: expected </span>
                          <span className="text-emerald-700 font-mono">{String(d.expected ?? '—')}</span>
                          <span className="text-ivory-500">, got </span>
                          <span className="text-red-700 font-mono">{String(d.actual ?? '—')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Vendor/PO info pill */}
              {vendor && (
                <div className="flex items-center justify-between px-3 py-2 bg-white border border-ivory-200 rounded-lg text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-ivory-500 text-xs">Vendor</span>
                    <span className="font-semibold text-ink-800">{vendor.name}</span>
                    {po && (
                      <>
                        <span className="text-ivory-300">·</span>
                        <span className="text-ivory-500 text-xs">PO</span>
                        <span className="font-mono text-xs font-bold text-ink-800">{po.poNumber}</span>
                      </>
                    )}
                  </div>
                  <span className="text-xs text-ivory-400">{requiredKeys.length} required</span>
                </div>
              )}

              {/* Required fields */}
              {requiredKeys.length > 0 && (
                <div className="bg-white border border-ivory-200 rounded-xl p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-ivory-600 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                    Required Fields — edit if OCR is wrong
                  </h3>
                  {requiredKeys.map((key) => {
                    const meta = FIELD_META[key] || { label: key, type: 'text' };
                    const conf = getConfidence(ext, key);
                    const isChanged = changedKeys.has(key);
                    const hasDiscrepancy = vr.discrepancies?.some((d) => d.field === key);
                    return (
                      <div key={key} className={`rounded-lg border p-3 transition-colors ${
                        hasDiscrepancy ? 'border-red-300 bg-red-50' :
                        isChanged ? 'border-amber-300 bg-amber-50' :
                        'border-ivory-200'
                      }`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <label htmlFor={`field-${key}`} className="text-[10px] font-bold uppercase tracking-wide text-ivory-700">
                            {meta.label} <span className="text-amber-700" aria-hidden="true">*</span>
                          </label>
                          <div className="flex items-center gap-1.5">
                            {isChanged && <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 px-1 rounded">edited</span>}
                            {hasDiscrepancy && <span className="text-[10px] font-semibold text-red-600 bg-red-100 px-1 rounded">mismatch</span>}
                            <ConfidenceDot value={conf} />
                          </div>
                        </div>
                        <input
                          id={`field-${key}`}
                          type="text"
                          disabled={!allowWrite}
                          className={`input text-sm font-mono disabled:bg-ivory-100 disabled:text-ivory-600 disabled:cursor-not-allowed ${
                            hasDiscrepancy ? 'border-red-300 focus:ring-red-300' :
                            isChanged ? 'border-amber-300 focus:ring-amber-300' : ''
                          }`}
                          value={editedFields[key] ?? ''}
                          onChange={(e) => handleFieldChange(key, e.target.value)}
                          placeholder={`Enter ${meta.label.toLowerCase()}`}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Other fields (collapsible) */}
              <details className="bg-white border border-ivory-200 rounded-xl">
                <summary className="px-4 py-3 text-sm font-semibold text-ivory-700 cursor-pointer select-none hover:text-ink-900 transition-colors">
                  Other Extracted Fields
                  <span className="text-ivory-600 font-normal text-xs ml-1">(click to expand)</span>
                </summary>
                <div className="px-4 pb-4 space-y-2 border-t border-ivory-100 pt-3">
                  {otherKeys.map((key) => {
                    const meta = FIELD_META[key] || { label: key, type: 'text' };
                    const conf = getConfidence(ext, key);
                    const isChanged = changedKeys.has(key);
                    return (
                      <div key={key} className={`rounded-lg border p-2.5 ${isChanged ? 'border-amber-300 bg-amber-50' : 'border-ivory-100'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <label htmlFor={`field-other-${key}`} className="text-[10px] font-semibold uppercase tracking-wide text-ivory-600">{meta.label}</label>
                          <div className="flex items-center gap-1">
                            {isChanged && <span className="text-[10px] text-amber-600 font-semibold">edited</span>}
                            <ConfidenceDot value={conf} />
                          </div>
                        </div>
                        <input
                          id={`field-other-${key}`}
                          type="text"
                          disabled={!allowWrite}
                          className={`input text-sm font-mono py-1.5 disabled:bg-ivory-100 disabled:text-ivory-600 disabled:cursor-not-allowed ${isChanged ? 'border-amber-300' : ''}`}
                          value={editedFields[key] ?? ''}
                          onChange={(e) => handleFieldChange(key, e.target.value)}
                          placeholder="—"
                        />
                      </div>
                    );
                  })}
                </div>
              </details>

              {/* Change history */}
              {invoice.fieldChanges?.length > 0 && (
                <details className="bg-white border border-ivory-200 rounded-xl">
                  <summary className="px-4 py-3 text-sm font-semibold text-ivory-700 cursor-pointer select-none hover:text-ink-900 transition-colors">
                    Change History ({invoice.fieldChanges.length})
                  </summary>
                  <div className="px-4 pb-4 space-y-1.5 border-t border-ivory-100 pt-3">
                    {invoice.fieldChanges.map((c, i) => (
                      <div key={i} className="text-xs flex gap-2 items-start p-2 bg-ivory-50 rounded-lg border border-ivory-100">
                        <span className="text-ivory-400 flex-shrink-0 font-mono">{new Date(c.changedAt).toLocaleString()}</span>
                        <span>
                          <span className="font-semibold text-ink-800">{FIELD_META[c.field]?.label || c.field}</span>:
                          <span className="text-red-500 line-through mx-1 font-mono">{c.oldValue || '—'}</span>
                          <span className="text-ivory-400">→</span>
                          <span className="text-emerald-600 mx-1 font-mono">{c.newValue}</span>
                          {c.changedBy?.name && <span className="text-ivory-400">by {c.changedBy.name}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            {/* Action buttons */}
            {allowWrite ? (
              <div className="flex-shrink-0 pt-3 border-t border-ivory-200 space-y-2 mt-2">
                {invoice.status === 'review_required' && (
                  <>
                    {!showRejectInput ? (
                      <button onClick={() => setShowRejectInput(true)} className="btn-danger w-full text-sm">
                        Reject Invoice
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <input
                          className="input text-sm"
                          placeholder="Reason for rejection (optional)"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <button onClick={handleReject} className="btn-danger flex-1 text-sm">Confirm Reject</button>
                          <button onClick={() => setShowRejectInput(false)} className="btn-secondary flex-1 text-sm">Cancel</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div className="flex gap-2">
                  {changedKeys.size > 0 && (
                    <button onClick={handleSave} disabled={saveLoading} className="btn-secondary flex-1 text-sm">
                      {saveLoading ? 'Saving…' : `Save (${changedKeys.size})`}
                    </button>
                  )}
                  <button onClick={handleMatch} disabled={matchLoading} className="btn-primary flex-1 text-sm">
                    {matchLoading ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Matching…
                      </span>
                    ) : invoice.status === 'review_required' ? 'Re-run Matching' : 'Submit for Matching'}
                  </button>
                </div>
                <p className="text-[10px] text-ivory-600 text-center">Unsaved edits are saved automatically before matching</p>
              </div>
            ) : (
              <p className="flex-shrink-0 mt-2 text-center text-sm text-ivory-500 italic py-3 border-t border-ivory-200">
                Read-only — ask an accountant or admin to edit or submit this invoice.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── PASSED ── */}
      {invoice.status === 'passed' && (
        <div className="flex-1 space-y-5">
          <div className="p-5 bg-ink-50 border border-ink-200 rounded-xl flex items-center gap-5" role="status" aria-live="polite">
            <div className="w-12 h-12 bg-ink-100 rounded-xl flex items-center justify-center flex-shrink-0" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-6 h-6 text-ink-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="font-serif text-2xl font-bold text-ink-700">Invoice Passed</h2>
              <p className="text-ink-600 mt-0.5 text-sm">All checks passed. Match score: <span className="font-mono font-bold">{vr.matchScore}%</span></p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="card">
              <h3 className="font-serif font-bold text-ink-900 mb-3">Verified Data</h3>
              <div className="space-y-1.5">
                {ALL_FIELD_KEYS.map((key) => {
                  const val = invoice.userVerifiedData?.[key] ?? getExtracted(ext, key);
                  if (!val) return null;
                  return (
                    <div key={key} className="flex justify-between py-1.5 border-b border-ivory-100 last:border-0 text-sm">
                      <span className="text-ivory-600">{FIELD_META[key]?.label}</span>
                      <span className="font-mono font-medium text-ink-900 text-right ml-3 truncate">{String(val)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {po && (
              <div className="card">
                <h3 className="font-serif font-bold text-ink-900 mb-3">
                  Purchase Order — <Link to={`/purchase-orders/${po._id}`} className="text-amber-600 hover:underline font-mono text-base">{po.poNumber}</Link>
                </h3>
                <div className="space-y-1.5">
                  {[
                    ['Vendor', po.vendor?.name],
                    ['Total Amount', po.totalAmount != null ? `${po.currency || ''} ${Number(po.totalAmount).toFixed(2)}` : null],
                    ['Subtotal', po.subTotal != null ? Number(po.subTotal).toFixed(2) : null],
                    ['Tax', po.tax != null ? Number(po.tax).toFixed(2) : null],
                    ['Status', po.status],
                  ].filter(([, v]) => v).map(([label, val]) => (
                    <div key={label} className="flex justify-between py-1.5 border-b border-ivory-100 last:border-0 text-sm">
                      <span className="text-ivory-600">{label}</span>
                      <span className="font-mono font-medium text-ink-900">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {invoice.fieldChanges?.length > 0 && (
            <div className="card">
              <h3 className="font-serif font-bold text-ink-900 mb-3">User Corrections ({invoice.fieldChanges.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[400px]">
                  <thead>
                    <tr className="bg-ivory-50 text-left text-[10px] font-bold uppercase tracking-wide text-ivory-500">
                      <th className="py-2 px-3">Field</th>
                      <th className="py-2 px-3">OCR Value</th>
                      <th className="py-2 px-3">Corrected To</th>
                      <th className="py-2 px-3">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ivory-100">
                    {invoice.fieldChanges.map((c, i) => (
                      <tr key={i}>
                        <td className="py-2 px-3 font-semibold text-ink-800">{FIELD_META[c.field]?.label || c.field}</td>
                        <td className="py-2 px-3 text-red-500 line-through font-mono text-xs">{c.oldValue || '—'}</td>
                        <td className="py-2 px-3 text-emerald-700 font-mono text-xs">{c.newValue}</td>
                        <td className="py-2 px-3 text-ivory-400 text-xs">{c.changedBy?.name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── REJECTED ── */}
      {invoice.status === 'rejected' && (
        <div className="flex-1 space-y-5">
          <div className="p-5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-5">
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-6 h-6 text-red-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="font-serif text-2xl font-bold text-red-800">Invoice Rejected</h2>
              <p className="text-red-700 mt-0.5 text-sm">
                {invoice.processingLog?.filter((l) => l.action === 'Invoice Rejected').slice(-1)[0]?.details || 'Manually rejected'}
              </p>
            </div>
          </div>

          {vr.discrepancies?.length > 0 && (
            <div className="card">
              <h3 className="font-serif font-bold text-ink-900 mb-3">Discrepancies Found</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[400px]">
                  <thead>
                    <tr className="bg-ivory-50 text-left text-[10px] font-bold uppercase tracking-wide text-ivory-500">
                      <th className="py-2 px-3">Field</th>
                      <th className="py-2 px-3">Expected</th>
                      <th className="py-2 px-3">Found</th>
                      <th className="py-2 px-3">Severity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ivory-100">
                    {vr.discrepancies.map((d, i) => (
                      <tr key={i}>
                        <td className="py-2 px-3 font-semibold capitalize">{discrepancyLabel(d.field)}</td>
                        <td className="py-2 px-3 text-ivory-600 font-mono text-xs">{String(d.expected ?? '—')}</td>
                        <td className="py-2 px-3 text-red-700 font-mono text-xs font-medium">{String(d.actual ?? '—')}</td>
                        <td className="py-2 px-3">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                            d.severity === 'high' ? 'bg-red-100 text-red-700' :
                            d.severity === 'medium' ? 'bg-orange-100 text-orange-700' :
                            'bg-ivory-100 text-ivory-600'
                          }`}>{d.severity?.toUpperCase()}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {invoice.fieldChanges?.length > 0 && (
            <div className="card">
              <h3 className="font-serif font-bold text-ink-900 mb-3">User Edits Before Rejection</h3>
              <div className="space-y-1.5">
                {invoice.fieldChanges.map((c, i) => (
                  <div key={i} className="flex gap-3 text-xs py-1.5 border-b border-ivory-100 last:border-0">
                    <span className="font-semibold text-ink-800 w-28 flex-shrink-0">{FIELD_META[c.field]?.label || c.field}</span>
                    <span className="text-red-500 line-through font-mono">{c.oldValue || '—'}</span>
                    <span className="text-ivory-400">→</span>
                    <span className="text-ivory-700 font-mono">{c.newValue}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
