import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { invoiceAPI } from '../services/api';

function FieldRow({ label, extracted, expected, isDiscrepancy }) {
  return (
    <tr className={isDiscrepancy ? 'bg-red-50' : ''}>
      <td className="py-2 px-3 text-gray-500 text-sm font-medium w-1/3">{label}</td>
      <td className={`py-2 px-3 text-sm ${isDiscrepancy ? 'text-red-700 font-medium' : 'text-gray-800'}`}>
        {extracted ?? <span className="text-gray-300 italic">not extracted</span>}
      </td>
      <td className={`py-2 px-3 text-sm ${isDiscrepancy ? 'text-red-700 font-medium' : 'text-gray-500'}`}>
        {expected ?? <span className="text-gray-300 italic">-</span>}
      </td>
      {isDiscrepancy && <td className="py-2 px-3"><span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Mismatch</span></td>}
      {!isDiscrepancy && <td></td>}
    </tr>
  );
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reprocessing, setReprocessing] = useState(false);
  const [tab, setTab] = useState('overview');

  const load = () => {
    setLoading(true);
    invoiceAPI.getOne(id).then((res) => setInvoice(res.data.data)).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [id]);

  // Auto-refresh while processing
  useEffect(() => {
    if (invoice?.status === 'processing') {
      const timer = setTimeout(load, 3000);
      return () => clearTimeout(timer);
    }
  }, [invoice]);

  const handleReprocess = async () => {
    setReprocessing(true);
    await invoiceAPI.reprocess(id);
    setReprocessing(false);
    load();
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

  const discrepancyFields = new Set((vr.discrepancies || []).map(d => d.field));

  const fmt = (val) => val ?? '-';
  const fmtAmount = (val) => val != null ? `$${Number(val).toFixed(2)}` : '-';

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link to="/invoices" className="text-gray-400 hover:text-gray-600 text-sm">← Back</Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{invoice.invoiceNumber || 'Invoice (processing...)'}</h1>
            <p className="text-gray-500 text-sm mt-0.5">{invoice.uploadedFile?.originalName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`badge-${invoice.status} text-sm px-3 py-1`}>{invoice.status}</span>
          <button onClick={handleReprocess} disabled={reprocessing} className="btn-secondary text-sm">
            {reprocessing ? 'Processing...' : 'Reprocess'}
          </button>
        </div>
      </div>

      {/* Processing indicator */}
      {invoice.status === 'processing' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
          <p className="text-yellow-800 text-sm">Invoice is being processed... This page will refresh automatically.</p>
        </div>
      )}

      {/* Match score */}
      {vr.matchScore > 0 && (
        <div className={`rounded-xl p-4 flex items-center gap-4 ${
          vr.status === 'validated' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <div className={`text-3xl font-bold ${vr.status === 'validated' ? 'text-green-700' : 'text-red-700'}`}>
            {vr.matchScore}%
          </div>
          <div>
            <p className={`font-semibold ${vr.status === 'validated' ? 'text-green-800' : 'text-red-800'}`}>
              {vr.status === 'validated' ? 'Validation Passed' : 'Validation Failed'}
            </p>
            <p className={`text-sm ${vr.status === 'validated' ? 'text-green-600' : 'text-red-600'}`}>
              {vr.discrepancies?.length || 0} discrepancies found
            </p>
          </div>
          {vr.duplicateCheck?.isDuplicate && (
            <div className="ml-4 bg-red-100 text-red-700 px-3 py-2 rounded-lg text-sm">
              ⚠️ Duplicate invoice detected
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1">
          {['overview', 'validation', 'ocr', 'log'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'log' ? 'Processing Log' : t}
            </button>
          ))}
        </div>
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-6">
          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-800">Extracted Data</h2>
            <table className="w-full">
              <tbody className="divide-y divide-gray-50">
                {[
                  ['Invoice Number', ext.invoiceNumber?.value],
                  ['Vendor Name', ext.vendorName?.value],
                  ['Invoice Date', ext.invoiceDate?.value],
                  ['Due Date', ext.dueDate?.value],
                  ['Subtotal', ext.subTotal?.value != null ? fmtAmount(ext.subTotal.value) : null],
                  ['Tax', ext.tax?.value != null ? fmtAmount(ext.tax.value) : null],
                  ['Total Amount', ext.totalAmount?.value != null ? fmtAmount(ext.totalAmount.value) : null],
                  ['Currency', ext.currency?.value],
                ].map(([label, val]) => (
                  <tr key={label} className={discrepancyFields.has(label.replace(' ', '').toLowerCase()) ? 'bg-red-50' : ''}>
                    <td className="py-2 text-sm text-gray-500">{label}</td>
                    <td className="py-2 text-sm font-medium text-gray-900">{fmt(val)}</td>
                    {ext.overallConfidence != null && <td className="py-2 text-xs text-gray-300">{ext.invoiceNumber?.confidence ? `${ext.invoiceNumber.confidence}%` : ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {ext.overallConfidence != null && (
              <p className="text-xs text-gray-400">Overall extraction confidence: {ext.overallConfidence}%</p>
            )}
          </div>

          {po ? (
            <div className="card space-y-4">
              <h2 className="font-semibold text-gray-800">
                Purchase Order —{' '}
                <Link to={`/purchase-orders/${po._id}`} className="text-blue-600 hover:underline text-base">
                  {po.poNumber}
                </Link>
              </h2>
              <table className="w-full">
                <tbody className="divide-y divide-gray-50">
                  {[
                    ['Vendor', po.vendor?.name],
                    ['Issue Date', po.issueDate ? new Date(po.issueDate).toLocaleDateString() : null],
                    ['Subtotal', fmtAmount(po.subTotal)],
                    ['Tax', fmtAmount(po.tax)],
                    ['Total Amount', fmtAmount(po.totalAmount)],
                    ['Currency', po.currency],
                    ['Status', po.status],
                  ].map(([label, val]) => (
                    <tr key={label}>
                      <td className="py-2 text-sm text-gray-500">{label}</td>
                      <td className="py-2 text-sm font-medium text-gray-900">{fmt(val)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card flex items-center justify-center text-gray-400 text-sm">
              No purchase order linked
            </div>
          )}
        </div>
      )}

      {/* Validation tab */}
      {tab === 'validation' && (
        <div className="space-y-4">
          {vr.discrepancies?.length > 0 ? (
            <div className="card">
              <h2 className="font-semibold text-gray-800 mb-4">Discrepancies ({vr.discrepancies.length})</h2>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left py-2 px-3 text-gray-500">Field</th>
                    <th className="text-left py-2 px-3 text-gray-500">Expected (PO)</th>
                    <th className="text-left py-2 px-3 text-gray-500">Actual (Invoice)</th>
                    <th className="text-left py-2 px-3 text-gray-500">Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {vr.discrepancies.map((d, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2.5 px-3 font-medium capitalize">{d.field}</td>
                      <td className="py-2.5 px-3 text-gray-600">{String(d.expected ?? '-')}</td>
                      <td className="py-2.5 px-3 text-red-700 font-medium">{String(d.actual ?? '-')}</td>
                      <td className="py-2.5 px-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          d.severity === 'high' ? 'bg-red-100 text-red-700' :
                          d.severity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{d.severity}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card text-center text-gray-400 py-10">
              {vr.status === 'validated' ? '✅ No discrepancies — invoice matches PO' : 'No validation result yet'}
            </div>
          )}

          {/* Side-by-side comparison */}
          {po && ext.totalAmount && (
            <div className="card">
              <h2 className="font-semibold text-gray-800 mb-4">Field Comparison</h2>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left py-2 px-3 text-gray-500 w-1/4">Field</th>
                    <th className="text-left py-2 px-3 text-gray-500">Extracted</th>
                    <th className="text-left py-2 px-3 text-gray-500">PO Value</th>
                    <th className="text-left py-2 px-3 text-gray-500 w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  <FieldRow
                    label="Vendor Name"
                    extracted={ext.vendorName?.value}
                    expected={po.vendor?.name}
                    isDiscrepancy={discrepancyFields.has('vendorName')}
                  />
                  <FieldRow
                    label="Total Amount"
                    extracted={fmtAmount(ext.totalAmount?.value)}
                    expected={fmtAmount(po.totalAmount)}
                    isDiscrepancy={discrepancyFields.has('totalAmount')}
                  />
                  <FieldRow
                    label="SubTotal"
                    extracted={fmtAmount(ext.subTotal?.value)}
                    expected={fmtAmount(po.subTotal)}
                    isDiscrepancy={discrepancyFields.has('subTotal')}
                  />
                  <FieldRow
                    label="Currency"
                    extracted={ext.currency?.value}
                    expected={po.currency}
                    isDiscrepancy={discrepancyFields.has('currency')}
                  />
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* OCR tab */}
      {tab === 'ocr' && (
        <div className="space-y-4">
          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-3">Extracted Line Items</h2>
            {ext.lineItems?.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left py-2 px-3 text-gray-500">Description</th>
                    <th className="text-right py-2 px-3 text-gray-500">Qty</th>
                    <th className="text-right py-2 px-3 text-gray-500">Unit Price</th>
                    <th className="text-right py-2 px-3 text-gray-500">Total</th>
                    <th className="text-right py-2 px-3 text-gray-500">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {ext.lineItems.map((item, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2 px-3">{item.description}</td>
                      <td className="py-2 px-3 text-right">{item.quantity}</td>
                      <td className="py-2 px-3 text-right">{fmtAmount(item.unitPrice)}</td>
                      <td className="py-2 px-3 text-right font-medium">{fmtAmount(item.totalPrice)}</td>
                      <td className="py-2 px-3 text-right text-gray-400 text-xs">{item.confidence}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-gray-400 text-sm">No line items extracted</p>}
          </div>

          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-3">Raw OCR Text</h2>
            {invoice.ocrText ? (
              <pre className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 overflow-auto max-h-64 whitespace-pre-wrap">
                {invoice.ocrText}
              </pre>
            ) : <p className="text-gray-400 text-sm">No OCR text available yet</p>}
          </div>

          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-1">File Info</h2>
            <div className="grid grid-cols-2 gap-2 text-sm mt-3">
              <span className="text-gray-500">Original Name</span>
              <span>{invoice.uploadedFile?.originalName}</span>
              <span className="text-gray-500">Type</span>
              <span>{invoice.uploadedFile?.mimetype}</span>
              <span className="text-gray-500">Size</span>
              <span>{invoice.uploadedFile?.size ? `${(invoice.uploadedFile.size / 1024).toFixed(1)} KB` : '-'}</span>
              <span className="text-gray-500">SHA-256 Hash</span>
              <span className="font-mono text-xs text-gray-400 truncate">{invoice.uploadedFile?.hash}</span>
            </div>
          </div>
        </div>
      )}

      {/* Processing log tab */}
      {tab === 'log' && (
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-4">Processing Log</h2>
          {invoice.processingLog?.length === 0 ? (
            <p className="text-gray-400 text-sm">No log entries</p>
          ) : (
            <div className="space-y-2">
              {invoice.processingLog?.map((entry, i) => (
                <div key={i} className={`flex gap-3 p-3 rounded-lg text-sm ${
                  entry.status === 'error' ? 'bg-red-50' :
                  entry.status === 'success' ? 'bg-green-50' :
                  entry.status === 'warning' ? 'bg-yellow-50' : 'bg-gray-50'
                }`}>
                  <span className="text-base flex-shrink-0">
                    {entry.status === 'error' ? '❌' : entry.status === 'success' ? '✅' : entry.status === 'warning' ? '⚠️' : 'ℹ️'}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{entry.action}</p>
                    <p className="text-gray-600 mt-0.5">{entry.details}</p>
                    <p className="text-gray-400 text-xs mt-1">{new Date(entry.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
