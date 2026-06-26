import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url,
).toString();

// Color palette for each annotatable field.
// `bg`        — solid pastel used for the legend chip background (opaque, small UI)
// `highlight` — same hue at 30% opacity used for the in-PDF mark (text must show through)
const FIELD_HIGHLIGHTS = {
  vendorName:    { bg: '#fef9c3', highlight: 'rgba(202,138,  4,0.30)', border: '#ca8a04', label: 'Vendor',     text: '#713f12' },
  invoiceNumber: { bg: '#dbeafe', highlight: 'rgba( 59,130,246,0.30)', border: '#3b82f6', label: 'Invoice #',  text: '#1e3a8a' },
  totalAmount:   { bg: '#dcfce7', highlight: 'rgba( 22,163, 74,0.30)', border: '#16a34a', label: 'Total',      text: '#14532d' },
  invoiceDate:   { bg: '#f3e8ff', highlight: 'rgba(147, 51,234,0.30)', border: '#9333ea', label: 'Date',       text: '#581c87' },
  poNumber:      { bg: '#ffedd5', highlight: 'rgba(234, 88, 12,0.30)', border: '#ea580c', label: 'PO #',       text: '#7c2d12' },
  gstNumber:     { bg: '#ccfbf1', highlight: 'rgba( 13,148,136,0.30)', border: '#0d9488', label: 'GST/Tax',    text: '#134e4a' },
  bankAccount:   { bg: '#fce7f3', highlight: 'rgba(219, 39,119,0.30)', border: '#db2777', label: 'Bank Acct',  text: '#831843' },
};

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getFieldValue(ext, key) {
  if (!ext) return null;
  const map = {
    vendorName:    ext.vendorName?.value,
    invoiceNumber: ext.invoiceNumber?.value,
    totalAmount:   ext.totalAmount?.value,
    invoiceDate:   ext.invoiceDate?.value,
    poNumber:      ext.poNumber?.value,
    gstNumber:     ext.gstNumber?.value,
    bankAccount:   ext.bankAccount?.value,
  };
  return map[key] ?? null;
}

// Build a function that takes a text item string and returns HTML
// with matched field values wrapped in <mark> spans.
function buildHighlighter(extractedData, activeField) {
  const terms = [];

  Object.keys(FIELD_HIGHLIGHTS).forEach((key) => {
    if (activeField && activeField !== key) return;
    const raw = getFieldValue(extractedData, key);
    if (raw == null) return;

    const str = String(raw).trim();
    if (str.length < 2) return;

    // Collect value variants: raw, comma-formatted, fixed-decimal
    const variants = new Set([str]);
    const num = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, ''));
    if (!isNaN(num) && isFinite(num)) {
      variants.add(num.toLocaleString());
      variants.add(num.toFixed(2));
      variants.add(num.toLocaleString(undefined, { minimumFractionDigits: 2 }));
    }

    variants.forEach((v) => {
      if (v.length >= 2) {
        terms.push({ key, pattern: new RegExp(escapeRegex(v), 'gi') });
      }
    });
  });

  if (terms.length === 0) return (str) => escapeHtml(str);

  return (str) => {
    const matches = [];
    for (const { key, pattern } of terms) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(str)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length, key, text: m[0] });
      }
    }
    if (matches.length === 0) return escapeHtml(str);

    // Sort by position; skip overlapping spans
    matches.sort((a, b) => a.start - b.start);

    let result = '';
    let cursor = 0;
    for (const { start, end, key, text } of matches) {
      if (start < cursor) continue;
      result += escapeHtml(str.slice(cursor, start));
      const c = FIELD_HIGHLIGHTS[key];
      result += `<mark style="background:${c.highlight};outline:1.5px solid ${c.border};border-radius:2px;padding:0 1px;color:inherit">${escapeHtml(text)}</mark>`;
      cursor = end;
    }
    result += escapeHtml(str.slice(cursor));
    return result;
  };
}

export default function PDFAnnotationViewer({ invoice }) {
  const [numPages, setNumPages] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [activeField, setActiveField] = useState(null);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(480);
  const [imageBlobUrl, setImageBlobUrl] = useState(null);

  const ext = invoice.extractedData;
  const hasExtracted = Boolean(
    ext && Object.values(ext).some((v) => v?.value != null)
  );

  // Track container width so PDF pages fill the available space
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(Math.max(300, Math.floor(entry.contentRect.width) - 4));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const highlighter = useMemo(
    () => buildHighlighter(ext, activeField),
    [ext, activeField]
  );

  const { filename, mimetype } = invoice.uploadedFile || {};

  // For image invoices: fetch with auth header and create a blob URL so the
  // <img> tag can display it (plain <img src> can't send Authorization headers).
  useEffect(() => {
    if (!filename || mimetype === 'application/pdf') return;
    const token = localStorage.getItem('token');
    let objectUrl;
    fetch(`/uploads/${filename}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then((r) => r.blob())
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setImageBlobUrl(objectUrl);
      })
      .catch(() => setImageBlobUrl(null));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [filename, mimetype]);

  // Non-PDF fallback (images)
  if (!filename || mimetype !== 'application/pdf') {
    if (!filename) {
      return (
        <div className="flex items-center justify-center h-full text-ivory-400 text-sm">
          No file attached
        </div>
      );
    }
    return (
      <div className="w-full h-full overflow-auto bg-ivory-100 flex items-start justify-center p-4">
        {imageBlobUrl ? (
          <img
            src={imageBlobUrl}
            alt="Invoice"
            className="max-w-full object-contain shadow-md rounded"
          />
        ) : (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    );
  }

  const highlightedFields = Object.keys(FIELD_HIGHLIGHTS).filter(
    (key) => getFieldValue(ext, key) != null
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Legend chips ── */}
      {hasExtracted && highlightedFields.length > 0 && (
        <div className="flex flex-wrap gap-1 px-2 py-1.5 bg-white border-b border-ivory-200 flex-shrink-0">
          {highlightedFields.map((key) => {
            const c = FIELD_HIGHLIGHTS[key];
            const val = getFieldValue(ext, key);
            const isActive = activeField === key;
            const dimmed = activeField != null && !isActive;
            return (
              <button
                key={key}
                onClick={() => setActiveField(isActive ? null : key)}
                title={`Click to isolate ${c.label} highlights`}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-opacity select-none ${
                  dimmed ? 'opacity-25' : 'opacity-100'
                }`}
                style={{ background: c.bg, borderColor: c.border, color: c.text }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: c.border }}
                />
                {c.label}
                <span className="font-mono opacity-75 truncate max-w-[72px]">
                  {String(val)}
                </span>
              </button>
            );
          })}
          {activeField && (
            <button
              onClick={() => setActiveField(null)}
              className="px-1.5 py-0.5 rounded text-[10px] font-semibold border border-ivory-300 bg-white text-ivory-600 hover:bg-ivory-50 transition-colors"
            >
              Show all
            </button>
          )}
        </div>
      )}

      {/* ── PDF canvas ── */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-ivory-100 min-h-0">
        {loadError ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-sm text-ivory-600 p-4 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 text-ivory-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span>Preview unavailable</span>
            <button
              onClick={() => {
                const token = localStorage.getItem('token');
                fetch(`/uploads/${filename}`, {
                  headers: token ? { Authorization: `Bearer ${token}` } : {}
                })
                  .then((r) => r.blob())
                  .then((blob) => {
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank');
                  });
              }}
              className="text-amber-600 hover:underline font-medium"
            >
              Open PDF in new tab
            </button>
          </div>
        ) : (
          <Document
            file={{
              url: `/uploads/${filename}`,
              httpHeaders: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
            }}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            onLoadError={() => setLoadError(true)}
            loading={
              <div className="flex items-center justify-center h-40">
                <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              </div>
            }
            className="flex flex-col items-center gap-3 py-4"
          >
            {numPages &&
              Array.from({ length: numPages }, (_, i) => (
                <Page
                  key={i + 1}
                  pageNumber={i + 1}
                  width={containerWidth}
                  renderTextLayer={hasExtracted}
                  renderAnnotationLayer={false}
                  customTextRenderer={hasExtracted ? ({ str }) => highlighter(str) : undefined}
                  className="shadow-md"
                  loading={null}
                />
              ))}
          </Document>
        )}
      </div>
    </div>
  );
}
