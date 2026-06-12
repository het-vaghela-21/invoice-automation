import React, { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate, useLocation } from 'react-router-dom';
import { invoiceAPI, poAPI } from '../services/api';

const fileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function UploadInvoice() {
  const [file, setFile] = useState(null);
  const [pos, setPos] = useState([]);
  const [selectedPO, setSelectedPO] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    poAPI.getAll({ status: 'approved', limit: 100 }).then((res) => setPos(res.data.data));
    if (location.state?.purchaseOrderId) setSelectedPO(location.state.purchaseOrderId);
  }, [location.state]);

  const onDrop = useCallback((accepted) => {
    if (accepted[0]) { setFile(accepted[0]); setError(''); }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
    onDropRejected: (files) => setError(files[0]?.errors[0]?.message || 'File rejected'),
  });

  const handleUpload = async () => {
    if (!file) return setError('Please select a file first');
    setError('');
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('invoice', file);
      if (selectedPO) formData.append('purchaseOrderId', selectedPO);
      const res = await invoiceAPI.upload(formData);
      navigate(`/invoices/${res.data.data._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-ink-900">Upload Invoice</h1>
        <p className="text-ivory-600 text-sm mt-0.5">Upload a PDF or image invoice to begin extraction and validation</p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {/* PO selector */}
      <div className="card">
        <label className="label">Link to Purchase Order</label>
        <select className="input" value={selectedPO} onChange={(e) => setSelectedPO(e.target.value)}>
          <option value="">No PO — process without matching</option>
          {pos.map((po) => (
            <option key={po._id} value={po._id}>{po.poNumber} — {po.vendor?.name}</option>
          ))}
        </select>
        <p className="text-xs text-ivory-500 mt-2">Linking a PO enables full validation and match scoring against expected amounts and line items.</p>
      </div>

      {/* Drop zone */}
      <div className="card">
        <label className="label mb-3 block">Invoice File</label>
        <div
          {...getRootProps()}
          className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 ${
            isDragActive
              ? 'border-amber-400 bg-amber-50 scale-[1.01]'
              : file
              ? 'border-emerald-300 bg-emerald-50'
              : 'border-ivory-300 hover:border-amber-300 hover:bg-amber-50/50'
          }`}
        >
          <input {...getInputProps()} />
          {file ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-700">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="font-medium text-ink-900 text-sm">{file.name}</p>
                  <p className="text-xs text-ivory-500 mt-0.5">{fileSize(file.size)} · {file.type.split('/')[1].toUpperCase()}</p>
                </div>
              </div>
              <button
                type="button"
                className="text-ivory-400 hover:text-red-500 transition-colors p-1"
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <div>
              <div className="w-14 h-14 bg-ivory-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-ivory-400">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
              <p className="font-semibold text-ink-800 mb-1">
                {isDragActive ? 'Drop it here' : 'Drag & drop your invoice'}
              </p>
              <p className="text-sm text-ivory-500">or <span className="text-amber-600 font-semibold">click to browse</span></p>
              <p className="text-xs text-ivory-400 mt-3">PDF, JPG, or PNG — max 10 MB</p>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          className="btn-primary flex-1 py-3"
          onClick={handleUpload}
          disabled={!file || loading}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Uploading…
            </span>
          ) : 'Upload Invoice →'}
        </button>
        <button className="btn-secondary px-5 py-3" onClick={() => navigate(-1)}>Cancel</button>
      </div>

      {/* Info box */}
      <div className="border border-amber-200 bg-amber-50 rounded-xl p-5">
        <h3 className="text-sm font-bold text-amber-800 mb-2 flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          What happens after upload?
        </h3>
        <ol className="text-sm text-amber-700 space-y-1.5 list-none">
          {[
            'File stored with SHA-256 hash for duplicate detection',
            'Click "Start OCR" to extract text from the document',
            'Review extracted fields side-by-side with the original',
            'Submit for PO matching — receive pass, review, or reject verdict',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="font-mono text-xs font-bold text-amber-500 mt-0.5 flex-shrink-0">0{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
