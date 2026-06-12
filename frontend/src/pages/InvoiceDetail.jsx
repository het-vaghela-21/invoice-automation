import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { invoiceAPI } from '../services/api';
import { getStatusBadge, getScoreColor } from '../utils/helpers';

// Maps fieldKey → { label, type }
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

// Get OCR-extracted value for a field key
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
  const color = value >= 80 ? 'bg-green-400' : value >= 60 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <span className="flex items-center gap-1 text-xs text-gray-400">
      <span className={`w-2 h-2 rounded-full ${color}`}></span>
      {value}%
    </span>
  );
}

// Left panel: file preview
function FilePreview({ invoice }) {
  const { filename, mimetype } = invoice.uploadedFile || {};
  const url = `/uploads/${filename}`;

  if (!filename) return <div className="flex items-center justify-center h-full text-gray-400">No file</div>;

  if (mimetype === 'application/pdf') {
    return (
      <embed
        src={url}
        type="application/pdf"
        className="w-full h-full"
        title="Invoice Preview"
      />
    );
  }
  return (
    <div className="w-full h-full overflow-auto bg-gray-100 flex items-start justify-center p-4">
      <img src={url} alt="Invoice" className="max-w-full object-contain shadow-md" />
    </div>
  );
}

// Status step bar
function StatusBar({ status }) {
  const steps = [
    { key: 'uploaded',        label: 'Uploaded' },
    { key: 'ocr_extracted',   label: 'OCR Done' },
    { key: 'pending_review',  label: 'Verified' },
    { key: 'passed',          label: 'Passed' },
  ];
  const order = ['uploaded', 'ocr_extracted', 'pending_review', 'review_required', 'passed', 'rejected'];
  const currentIdx = order.indexOf(status);

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => {
        const stepIdx = order.indexOf(step.key);
        const done = currentIdx > stepIdx;
        const active = status === step.key || (status === 'review_required' && step.key === 'pending_review');
        return (
          <React.Fragment key={step.key}>
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                done ? 'bg-blue-600 border-blue-600 text-white' :
                active ? 'bg-white border-blue-600 text-blue-600' :
                'bg-white border-gray-300 text-gray-400'
              }`}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-xs mt-1 ${active ? 'text-blue-600 font-medium' : done ? 'text-blue-500' : 'text-gray-400'}`}>{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 mb-4 ${done ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function InvoiceDetail() {
  const { id } = useParams();
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

  const load = useCallback(() => {
    setLoading(true);
    invoiceAPI.getOne(id)
      .then((res) => {
        const inv = res.data.data;
        setInvoice(inv);
        // Initialise edit form from userVerifiedData → extractedData fallback
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
    setOcrLoading(true);
    setError('');
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
    } catch (err) {
      setError(err.response?.data?.message || err.response?.data?.error || 'OCR failed');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleSave = async () => {
    setSaveLoading(true);
    setError('');
    try {
      const fieldsToSave = {};
      ALL_FIELD_KEYS.forEach((key) => {
        const v = editedFields[key];
        if (v !== '' && v !== null && v !== undefined) {
          fieldsToSave[key] = FIELD_META[key].type === 'number' ? parseFloat(v) || v : v;
        }
      });
      const res = await invoiceAPI.updateFields(id, fieldsToSave);
      setInvoice(res.data.data);
      setChangedKeys(new Set());
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleMatch = async () => {
    setMatchLoading(true);
    setError('');
    try {
      // Save current edits first, then run matching
      const fieldsToSave = {};
      ALL_FIELD_KEYS.forEach((key) => {
        const v = editedFields[key];
        if (v !== '' && v !== null && v !== undefined) {
          fieldsToSave[key] = FIELD_META[key].type === 'number' ? parseFloat(v) || v : v;
        }
      });
      if (changedKeys.size > 0) {
        await invoiceAPI.updateFields(id, fieldsToSave);
      }
      const res = await invoiceAPI.submitMatching(id);
      setInvoice(res.data.data);
      setChangedKeys(new Set());
    } catch (err) {
      setError(err.response?.data?.message || 'Matching failed');
    } finally {
      setMatchLoading(false);
    }
  };

  const handleReject = async () => {
    setError('');
    try {
      await invoiceAPI.rejectInvoice(id, rejectReason);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Reject failed');
    }
  };

  if (loading && !invoice) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"></div>
    </div>
  );
  if (!invoice) return <div className="text-center text-gray-400 py-20">Invoice not found</div>;

  const ext = invoice.extractedData || {};
  const po = invoice.purchaseOrder;
  const vr = invoice.validationResult || {};
  const vendor = invoice.vendor;
  const requiredFields = vendor?.requiredFields?.length ? vendor.requiredFields : [];
  const requiredKeys = requiredFields.map((f) => f.fieldKey);
  const otherKeys = ALL_FIELD_KEYS.filter((k) => !requiredKeys.includes(k));

  const showSplitView = ['ocr_extracted', 'pending_review', 'review_required'].includes(invoice.status);

  return (
    <div className="flex flex-col h-full">
      {/* Compact header */}
      <div className="flex items-center justify-between px-1 pb-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/invoices" className="text-gray-400 hover:text-gray-600 text-sm">← Back</Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{invoice.invoiceNumber || invoice.uploadedFile?.originalName || 'Invoice'}</h1>
            <p className="text-xs text-gray-400">{invoice.uploadedFile?.originalName} · {invoice.uploadedFile?.size ? `${(invoice.uploadedFile.size / 1024).toFixed(1)} KB` : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBar status={invoice.status} />
          <span className={`${getStatusBadge(invoice.status)} ml-4`}>{invoice.status.replace(/_/g, ' ')}</span>
          <button onClick={() => setShowLog(!showLog)} className="btn-secondary text-xs">
            {showLog ? 'Hide Log' : 'Log'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex-shrink-0">
          {error}
        </div>
      )}

      {/* Processing log panel */}
      {showLog && (
        <div className="mb-4 card max-h-48 overflow-y-auto flex-shrink-0">
          <h3 className="font-semibold text-sm text-gray-700 mb-2">Processing Log</h3>
          <div className="space-y-1.5">
            {invoice.processingLog?.map((entry, i) => (
              <div key={i} className={`flex gap-2 p-2 rounded text-xs ${
                entry.status === 'error' ? 'bg-red-50' : entry.status === 'success' ? 'bg-green-50' : entry.status === 'warning' ? 'bg-yellow-50' : 'bg-gray-50'
              }`}>
                <span>{entry.status === 'error' ? '❌' : entry.status === 'success' ? '✅' : entry.status === 'warning' ? '⚠️' : 'ℹ️'}</span>
                <div>
                  <span className="font-medium">{entry.action}</span>
                  <span className="text-gray-500 ml-1">— {entry.details}</span>
                  <span className="text-gray-300 ml-2">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* UPLOADED STATE */}
      {invoice.status === 'uploaded' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm space-y-6">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto text-4xl">📄</div>
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Invoice Ready for Processing</h2>
              <p className="text-gray-500 text-sm mt-2">
                Click below to run OCR and extract invoice data. The system will identify all fields based on this vendor's requirements.
              </p>
            </div>
            <div className="card text-left text-sm space-y-2">
              <div className="flex justify-between"><span className="text-gray-500">File</span><span className="font-medium">{invoice.uploadedFile?.originalName}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Type</span><span>{invoice.uploadedFile?.mimetype}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Size</span><span>{invoice.uploadedFile?.size ? `${(invoice.uploadedFile.size / 1024).toFixed(1)} KB` : '—'}</span></div>
              {vendor && <div className="flex justify-between"><span className="text-gray-500">Vendor</span><span className="font-medium">{vendor.name}</span></div>}
              {po && <div className="flex justify-between"><span className="text-gray-500">PO</span><span className="font-medium">{po.poNumber}</span></div>}
              {vendor?.requiredFields?.length > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <span className="text-gray-500 text-xs block mb-1">Fields to extract:</span>
                  <div className="flex flex-wrap gap-1">
                    {vendor.requiredFields.map((f) => (
                      <span key={f.fieldKey} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{f.fieldLabel}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {vr.duplicateCheck?.isDuplicate && (
              <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-orange-700 text-sm">
                ⚠️ This appears to be a duplicate invoice
              </div>
            )}
            <button onClick={handleOCR} disabled={ocrLoading} className="btn-primary w-full text-base py-3">
              {ocrLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Running OCR...
                </span>
              ) : 'Start OCR Processing'}
            </button>
          </div>
        </div>
      )}

      {/* SPLIT VIEW — ocr_extracted, pending_review, review_required */}
      {showSplitView && (
        <div className="flex-1 flex gap-4 min-h-0">
          {/* Left: file preview */}
          <div className="w-1/2 rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex-shrink-0" style={{ minHeight: '500px' }}>
            <div className="bg-gray-100 border-b border-gray-200 px-3 py-2 text-xs text-gray-500 font-medium flex items-center gap-2">
              <span>📄</span> {invoice.uploadedFile?.originalName}
            </div>
            <div className="h-full" style={{ height: 'calc(100% - 33px)' }}>
              <FilePreview invoice={invoice} />
            </div>
          </div>

          {/* Right: extracted fields form */}
          <div className="w-1/2 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">

              {/* Match result banner when review_required */}
              {invoice.status === 'review_required' && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-orange-800">Review Required — {vr.matchScore}% match</h3>
                    <span className="text-2xl">⚠️</span>
                  </div>
                  <p className="text-sm text-orange-700 mb-3">{vr.discrepancies?.length} discrepanc{vr.discrepancies?.length === 1 ? 'y' : 'ies'} found. Correct the fields below or reject this invoice.</p>
                  <div className="space-y-2">
                    {vr.discrepancies?.map((d, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm bg-white rounded-lg p-2 border border-orange-100">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 ${
                          d.severity === 'high' ? 'bg-red-100 text-red-700' : d.severity === 'medium' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                        }`}>{d.severity}</span>
                        <div>
                          <span className="font-medium capitalize">{FIELD_META[d.field]?.label || d.field}</span>
                          <span className="text-gray-500">: expected </span>
                          <span className="text-green-700 font-mono text-xs">{String(d.expected ?? '—')}</span>
                          <span className="text-gray-500">, got </span>
                          <span className="text-red-700 font-mono text-xs">{String(d.actual ?? '—')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Vendor info */}
              {vendor && (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-sm flex items-center justify-between">
                  <div>
                    <span className="text-gray-500">Vendor: </span>
                    <span className="font-medium">{vendor.name}</span>
                    {po && <><span className="text-gray-400 mx-2">·</span><span className="text-gray-500">PO: </span><span className="font-medium">{po.poNumber}</span></>}
                  </div>
                  <span className="text-xs text-gray-400">{requiredKeys.length} required fields</span>
                </div>
              )}

              {/* Required fields (from vendor config) */}
              {requiredKeys.length > 0 && (
                <div className="card space-y-3">
                  <h3 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                    Required Fields
                    <span className="text-xs text-gray-400 font-normal">— Edit if OCR is incorrect</span>
                  </h3>
                  {requiredKeys.map((key) => {
                    const meta = FIELD_META[key] || { label: key, type: 'text' };
                    const conf = getConfidence(ext, key);
                    const isChanged = changedKeys.has(key);
                    const hasDiscrepancy = vr.discrepancies?.some((d) => d.field === key);
                    return (
                      <div key={key} className={`rounded-lg border p-3 ${hasDiscrepancy ? 'border-red-300 bg-red-50' : isChanged ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">{meta.label} *</label>
                          <div className="flex items-center gap-2">
                            {isChanged && <span className="text-xs text-yellow-600 font-medium">edited</span>}
                            {hasDiscrepancy && <span className="text-xs text-red-600 font-medium">mismatch</span>}
                            <ConfidenceDot value={conf} />
                          </div>
                        </div>
                        <input
                          type={meta.type === 'number' ? 'text' : 'text'}
                          className={`input text-sm ${hasDiscrepancy ? 'border-red-300 focus:ring-red-400' : isChanged ? 'border-yellow-300 focus:ring-yellow-400' : ''}`}
                          value={editedFields[key] ?? ''}
                          onChange={(e) => handleFieldChange(key, e.target.value)}
                          placeholder={`Enter ${meta.label.toLowerCase()}`}
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Other extracted fields (optional, collapsible) */}
              <details className="card">
                <summary className="font-semibold text-gray-700 text-sm cursor-pointer select-none">
                  Other Extracted Fields <span className="text-gray-400 font-normal text-xs">(click to expand)</span>
                </summary>
                <div className="mt-3 space-y-2">
                  {otherKeys.map((key) => {
                    const meta = FIELD_META[key] || { label: key, type: 'text' };
                    const conf = getConfidence(ext, key);
                    const isChanged = changedKeys.has(key);
                    return (
                      <div key={key} className={`rounded-lg border p-2.5 ${isChanged ? 'border-yellow-300 bg-yellow-50' : 'border-gray-100'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-gray-500">{meta.label}</label>
                          <div className="flex items-center gap-1">
                            {isChanged && <span className="text-xs text-yellow-600">edited</span>}
                            <ConfidenceDot value={conf} />
                          </div>
                        </div>
                        <input
                          type="text"
                          className={`input text-sm ${isChanged ? 'border-yellow-300' : ''}`}
                          value={editedFields[key] ?? ''}
                          onChange={(e) => handleFieldChange(key, e.target.value)}
                          placeholder={`—`}
                        />
                      </div>
                    );
                  })}
                </div>
              </details>

              {/* Field change history */}
              {invoice.fieldChanges?.length > 0 && (
                <details className="card">
                  <summary className="font-semibold text-gray-700 text-sm cursor-pointer select-none">
                    Change History ({invoice.fieldChanges.length})
                  </summary>
                  <div className="mt-3 space-y-2">
                    {invoice.fieldChanges.map((c, i) => (
                      <div key={i} className="text-xs flex gap-2 items-start p-2 bg-gray-50 rounded">
                        <span className="text-gray-400 flex-shrink-0">{new Date(c.changedAt).toLocaleString()}</span>
                        <span>
                          <span className="font-medium">{FIELD_META[c.field]?.label || c.field}</span>:
                          <span className="text-red-600 line-through mx-1">{c.oldValue || '—'}</span>→
                          <span className="text-green-700 mx-1">{c.newValue}</span>
                          {c.changedBy?.name && <span className="text-gray-400">by {c.changedBy.name}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            {/* Action buttons — fixed at bottom of right panel */}
            <div className="flex-shrink-0 pt-3 border-t border-gray-200 space-y-2">
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
                    {saveLoading ? 'Saving...' : `Save Changes (${changedKeys.size})`}
                  </button>
                )}
                <button
                  onClick={handleMatch}
                  disabled={matchLoading}
                  className="btn-primary flex-1 text-sm"
                >
                  {matchLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      Matching...
                    </span>
                  ) : invoice.status === 'review_required' ? 'Re-run Matching' : 'Submit for Matching'}
                </button>
              </div>

              <p className="text-xs text-gray-400 text-center">
                Unsaved edits will be saved automatically before matching runs
              </p>
            </div>
          </div>
        </div>
      )}

      {/* PASSED STATE */}
      {invoice.status === 'passed' && (
        <div className="flex-1 space-y-6">
          <div className="p-6 bg-green-50 border border-green-200 rounded-xl flex items-center gap-6">
            <div className="text-5xl">✅</div>
            <div>
              <h2 className="text-2xl font-bold text-green-800">Invoice Passed</h2>
              <p className="text-green-700 mt-1">All checks passed. Match score: <strong>{vr.matchScore}%</strong></p>
              {vr.duplicateCheck?.isDuplicate && <p className="text-orange-600 text-sm mt-1">⚠️ Duplicate was detected</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="card space-y-3">
              <h3 className="font-semibold text-gray-800">Verified Data</h3>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-50">
                  {ALL_FIELD_KEYS.map((key) => {
                    const val = invoice.userVerifiedData?.[key] ?? getExtracted(ext, key);
                    if (!val) return null;
                    return (
                      <tr key={key}>
                        <td className="py-2 text-gray-500 w-1/2">{FIELD_META[key]?.label}</td>
                        <td className="py-2 font-medium text-gray-900">{String(val)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {po && (
              <div className="card space-y-3">
                <h3 className="font-semibold text-gray-800">
                  Purchase Order —{' '}
                  <Link to={`/purchase-orders/${po._id}`} className="text-blue-600 hover:underline">{po.poNumber}</Link>
                </h3>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-50">
                    {[
                      ['Vendor', po.vendor?.name],
                      ['Total Amount', po.totalAmount != null ? `${po.currency || ''} ${Number(po.totalAmount).toFixed(2)}` : null],
                      ['Subtotal', po.subTotal != null ? Number(po.subTotal).toFixed(2) : null],
                      ['Tax', po.tax != null ? Number(po.tax).toFixed(2) : null],
                      ['Status', po.status],
                    ].map(([label, val]) => val ? (
                      <tr key={label}>
                        <td className="py-2 text-gray-500">{label}</td>
                        <td className="py-2 font-medium">{val}</td>
                      </tr>
                    ) : null)}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {invoice.fieldChanges?.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-3">User Corrections ({invoice.fieldChanges.length})</h3>
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr>
                  <th className="text-left py-2 px-3 text-gray-500 text-xs">Field</th>
                  <th className="text-left py-2 px-3 text-gray-500 text-xs">Original OCR</th>
                  <th className="text-left py-2 px-3 text-gray-500 text-xs">Corrected To</th>
                  <th className="text-left py-2 px-3 text-gray-500 text-xs">By</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {invoice.fieldChanges.map((c, i) => (
                    <tr key={i}>
                      <td className="py-2 px-3 font-medium">{FIELD_META[c.field]?.label || c.field}</td>
                      <td className="py-2 px-3 text-red-600 line-through">{c.oldValue || '—'}</td>
                      <td className="py-2 px-3 text-green-700">{c.newValue}</td>
                      <td className="py-2 px-3 text-gray-400 text-xs">{c.changedBy?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* REJECTED STATE */}
      {invoice.status === 'rejected' && (
        <div className="flex-1 space-y-6">
          <div className="p-6 bg-red-50 border border-red-200 rounded-xl flex items-center gap-6">
            <div className="text-5xl">❌</div>
            <div>
              <h2 className="text-2xl font-bold text-red-800">Invoice Rejected</h2>
              <p className="text-red-700 mt-1">
                {invoice.processingLog?.filter((l) => l.action === 'Invoice Rejected').slice(-1)[0]?.details || 'This invoice was rejected'}
              </p>
            </div>
          </div>

          {vr.discrepancies?.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-3">Discrepancies Found</h3>
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr>
                  <th className="text-left py-2 px-3 text-gray-500 text-xs">Field</th>
                  <th className="text-left py-2 px-3 text-gray-500 text-xs">Expected</th>
                  <th className="text-left py-2 px-3 text-gray-500 text-xs">Found</th>
                  <th className="text-left py-2 px-3 text-gray-500 text-xs">Severity</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {vr.discrepancies.map((d, i) => (
                    <tr key={i}>
                      <td className="py-2 px-3 font-medium capitalize">{FIELD_META[d.field]?.label || d.field}</td>
                      <td className="py-2 px-3 text-gray-600">{String(d.expected ?? '—')}</td>
                      <td className="py-2 px-3 text-red-700 font-medium">{String(d.actual ?? '—')}</td>
                      <td className="py-2 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          d.severity === 'high' ? 'bg-red-100 text-red-700' : d.severity === 'medium' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                        }`}>{d.severity}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {invoice.fieldChanges?.length > 0 && (
            <div className="card">
              <h3 className="font-semibold text-gray-800 mb-3">User Edits Before Rejection</h3>
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr>
                  <th className="text-left py-2 px-3 text-gray-500 text-xs">Field</th>
                  <th className="text-left py-2 px-3 text-gray-500 text-xs">OCR Value</th>
                  <th className="text-left py-2 px-3 text-gray-500 text-xs">User Corrected To</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {invoice.fieldChanges.map((c, i) => (
                    <tr key={i}>
                      <td className="py-2 px-3 font-medium">{FIELD_META[c.field]?.label || c.field}</td>
                      <td className="py-2 px-3 text-red-500 line-through">{c.oldValue || '—'}</td>
                      <td className="py-2 px-3 text-gray-700">{c.newValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
