import React, { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate, useLocation } from 'react-router-dom';
import { invoiceAPI, poAPI } from '../services/api';

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
    if (location.state?.purchaseOrderId) {
      setSelectedPO(location.state.purchaseOrderId);
    }
  }, [location.state]);

  const onDrop = useCallback((accepted) => {
    if (accepted[0]) setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
    onDropRejected: (files) => setError(files[0]?.errors[0]?.message || 'File rejected')
  });

  const handleUpload = async () => {
    if (!file) return setError('Please select a file');
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

  const fileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Upload Invoice</h1>
        <p className="text-gray-500 text-sm mt-1">Upload a PDF or image invoice to process and validate</p>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}

      <div className="card">
        <label className="label">Match Against Purchase Order</label>
        <select className="input" value={selectedPO} onChange={(e) => setSelectedPO(e.target.value)}>
          <option value="">No PO (process without matching)</option>
          {pos.map((po) => (
            <option key={po._id} value={po._id}>{po.poNumber} — {po.vendor?.name}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">Selecting a PO enables full invoice validation and match scoring</p>
      </div>

      <div className="card">
        <label className="label mb-3 block">Invoice File</label>
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            isDragActive ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
          }`}
        >
          <input {...getInputProps()} />
          <div className="text-4xl mb-3">📄</div>
          <p className="text-gray-700 font-medium">
            {isDragActive ? 'Drop the file here' : 'Drag & drop your invoice here'}
          </p>
          <p className="text-sm text-gray-400 mt-1">or click to browse</p>
          <p className="text-xs text-gray-400 mt-2">PDF, JPG, PNG — max 10 MB</p>
        </div>

        {file && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{file.type === 'application/pdf' ? '📕' : '🖼️'}</span>
              <div>
                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                <p className="text-xs text-gray-500">{fileSize(file.size)} · {file.type}</p>
              </div>
            </div>
            <button className="text-gray-400 hover:text-gray-600" onClick={() => setFile(null)}>×</button>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button className="btn-primary" onClick={handleUpload} disabled={!file || loading}>
          {loading ? 'Uploading & Processing...' : 'Upload & Process'}
        </button>
        <button className="btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
      </div>

      <div className="card bg-blue-50 border-blue-100">
        <h3 className="text-sm font-semibold text-blue-800 mb-2">What happens after upload?</h3>
        <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
          <li>File is stored securely and SHA-256 hash computed for duplicate detection</li>
          <li>OCR extracts text (Tesseract for images, pdf-parse for PDFs)</li>
          <li>Heuristic extraction identifies invoice number, vendor, amounts, line items</li>
          <li>Extracted data is validated against the linked Purchase Order</li>
          <li>Match score and discrepancies are reported</li>
        </ol>
      </div>
    </div>
  );
}
