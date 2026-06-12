import React, { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { invoiceAPI, poAPI } from '../services/api';

export default function InvoiceUpload() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [pos, setPOs] = useState([]);
  const [selectedPO, setSelectedPO] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    poAPI.getAll({ status: 'approved', limit: 100 }).then((res) => setPOs(res.data.data)).catch(console.error);
  }, []);

  const onDrop = useCallback((accepted) => {
    if (accepted[0]) setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024
  });

  const handleUpload = async () => {
    if (!file) { setError('Please select a file'); return; }
    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('invoice', file);
      if (selectedPO) formData.append('purchaseOrderId', selectedPO);
      const res = await invoiceAPI.upload(formData);
      navigate(`/invoices/${res.data.data._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Upload Invoice</h1>
        <p className="text-gray-500 mt-1">Upload a PDF or image invoice for automated OCR extraction and PO validation</p>
      </div>

      <div className="card space-y-6">
        {/* Drop zone */}
        <div>
          <label className="label">Invoice File *</label>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            }`}
          >
            <input {...getInputProps()} />
            {file ? (
              <div className="space-y-2">
                <div className="text-4xl">📄</div>
                <p className="font-medium text-gray-800">{file.name}</p>
                <p className="text-sm text-gray-400">{formatSize(file.size)}</p>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="text-xs text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-4xl text-gray-300">📁</div>
                <p className="text-gray-600 font-medium">
                  {isDragActive ? 'Drop the file here' : 'Drag & drop your invoice here'}
                </p>
                <p className="text-sm text-gray-400">or click to browse</p>
                <p className="text-xs text-gray-400 mt-2">PDF, JPG, or PNG — max 10 MB</p>
              </div>
            )}
          </div>
        </div>

        {/* PO Selection */}
        <div>
          <label className="label">Link to Purchase Order (optional)</label>
          <select
            className="input"
            value={selectedPO}
            onChange={(e) => setSelectedPO(e.target.value)}
          >
            <option value="">No PO — process without validation</option>
            {pos.map((po) => (
              <option key={po._id} value={po._id}>
                {po.poNumber} — {po.vendor?.name} — ${po.totalAmount?.toLocaleString()} {po.currency}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Linking to a PO enables automatic field validation and match scoring.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
            {error}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="btn-primary w-full py-3"
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              Uploading...
            </span>
          ) : 'Upload & Process Invoice'}
        </button>
      </div>

      <div className="card bg-blue-50 border-blue-100">
        <h3 className="font-semibold text-blue-800 mb-2">Processing Pipeline</h3>
        <ol className="space-y-1.5 text-sm text-blue-700">
          <li>1. File uploaded and stored securely</li>
          <li>2. OCR text extraction (Tesseract.js for images, pdf-parse for PDFs)</li>
          <li>3. Heuristic field extraction (invoice #, dates, amounts, line items)</li>
          <li>4. Duplicate detection via SHA-256 file hash</li>
          <li>5. PO validation — field matching with 5% tolerance on amounts</li>
          <li>6. Final status: Validated or Rejected with match score</li>
        </ol>
      </div>
    </div>
  );
}
