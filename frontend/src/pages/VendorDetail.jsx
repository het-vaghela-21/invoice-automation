import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts';
import { vendorAPI } from '../services/api';
import { formatDate, formatCurrency, getStatusBadge, getScoreColor } from '../utils/helpers';
import { usePageEntrance } from '../utils/motion';
import { useDocumentTitle } from '../utils/useDocumentTitle';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function StatCard({ label, value, sub }) {
  return (
    <div className="card">
      <p className="text-xs font-bold uppercase tracking-wide text-ivory-500">{label}</p>
      <p className="font-serif text-2xl font-bold text-ink-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-ivory-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function reliabilityConfig(score) {
  if (score == null) return { label: 'No Data',   grade: '—',  ringColor: '#cbd5c0', textColor: '#6b7280', bg: '#f9fafb' };
  if (score >= 80)   return { label: 'Excellent',  grade: 'A',  ringColor: '#2d7a5a', textColor: '#14532d', bg: '#f0fdf4' };
  if (score >= 65)   return { label: 'Good',       grade: 'B',  ringColor: '#0d9488', textColor: '#115e59', bg: '#f0fdfa' };
  if (score >= 50)   return { label: 'Fair',       grade: 'C',  ringColor: '#d97706', textColor: '#78350f', bg: '#fffbeb' };
  return               { label: 'At Risk',    grade: 'D',  ringColor: '#dc2626', textColor: '#7f1d1d', bg: '#fef2f2' };
}

function MetricCell({ label, value, sub, highlight }) {
  return (
    <div className={`rounded-lg p-3 ${highlight || 'bg-ivory-50'}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-ivory-500">{label}</p>
      <p className={`font-serif text-xl font-bold mt-0.5 ${highlight ? 'text-ink-900' : 'text-ink-800'}`}>{value ?? '—'}</p>
      {sub && <p className="text-[10px] text-ivory-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function StatusBar({ statusBreakdown, totalInvoices }) {
  if (!statusBreakdown?.length || !totalInvoices) return null;

  const ORDER = ['passed', 'ocr_extracted', 'pending_review', 'uploaded', 'review_required', 'rejected'];
  const COLORS = {
    passed:         { bg: '#16a34a', label: 'Passed' },
    ocr_extracted:  { bg: '#7c3aed', label: 'OCR done' },
    pending_review: { bg: '#d97706', label: 'Pending' },
    uploaded:       { bg: '#3b82f6', label: 'Uploaded' },
    review_required:{ bg: '#ea580c', label: 'Review' },
    rejected:       { bg: '#dc2626', label: 'Rejected' },
  };

  const sorted = ORDER
    .map(k => statusBreakdown.find(s => s._id === k))
    .filter(Boolean);

  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden gap-px">
        {sorted.map(s => {
          const pct = (s.count / totalInvoices) * 100;
          return (
            <div
              key={s._id}
              style={{ width: `${pct}%`, background: COLORS[s._id]?.bg || '#ccc' }}
              title={`${COLORS[s._id]?.label || s._id}: ${s.count}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {sorted.map(s => (
          <span key={s._id} className="flex items-center gap-1 text-[10px] text-ivory-600">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: COLORS[s._id]?.bg || '#ccc' }} />
            {COLORS[s._id]?.label || s._id} ({s.count})
          </span>
        ))}
      </div>
    </div>
  );
}

function RiskChips({ riskBreakdown }) {
  if (!riskBreakdown?.length) return <span className="text-xs text-ivory-500">No risk data</span>;
  const CFG = {
    low:     { bg: 'bg-ink-50',    text: 'text-ink-700',    dot: 'bg-ink-500'    },
    medium:  { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500'  },
    high:    { bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500'    },
    unknown: { bg: 'bg-ivory-100', text: 'text-ivory-600',  dot: 'bg-ivory-400'  },
  };
  return (
    <div className="flex flex-wrap gap-2">
      {riskBreakdown.map(r => {
        const c = CFG[r._id] || CFG.unknown;
        return (
          <span key={r._id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${c.bg} ${c.text}`}>
            <span className={`w-2 h-2 rounded-full ${c.dot}`} />
            {r._id} risk
            <span className="font-mono font-bold ml-0.5">{r.count}</span>
          </span>
        );
      })}
    </div>
  );
}

function MonthlyTrend({ monthlyTrend }) {
  if (!monthlyTrend?.length) return <p className="text-xs text-ivory-500 py-4">No data for the last 6 months.</p>;

  // Fill last 6 months with zeros for missing months
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const dataMap = {};
  for (const m of monthlyTrend) {
    dataMap[`${m._id.year}-${m._id.month}`] = m;
  }

  const chartData = months.map(({ year, month }) => {
    const key = `${year}-${month}`;
    const m = dataMap[key] || {};
    return {
      name: `${MONTHS[month - 1]} '${String(year).slice(2)}`,
      passed: m.passed || 0,
      rejected: m.rejected || 0,
      other: Math.max(0, (m.total || 0) - (m.passed || 0) - (m.rejected || 0)),
    };
  });

  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }} barSize={16}>
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9c9488' }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#9c9488' }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e5e0d8' }}
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
        />
        <Bar dataKey="passed"  name="Passed"  stackId="a" fill="#16a34a" radius={[0,0,0,0]} />
        <Bar dataKey="other"   name="Review"  stackId="a" fill="#ea580c" radius={[0,0,0,0]} />
        <Bar dataKey="rejected" name="Rejected" stackId="a" fill="#dc2626" radius={[2,2,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function VendorAnalytics({ stats }) {
  const {
    processedCount, passRate, rejectionRate, avgMatchScore, duplicateCount,
    reliabilityScore, riskBreakdown, topDiscrepancies, monthlyTrend,
    statusBreakdown, totalInvoices
  } = stats;

  const cfg = reliabilityConfig(reliabilityScore);
  const hasProcessed = processedCount > 0;

  return (
    <div className="card space-y-5" data-animate>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif font-bold text-ink-900">Vendor Analytics</h2>
          <p className="text-xs text-ivory-500 mt-0.5">Invoice quality and behaviour insights for the auditing team</p>
        </div>
        {/* Reliability score badge */}
        <div
          className="flex-shrink-0 flex flex-col items-center justify-center w-20 h-20 rounded-2xl border-2 shadow-sm"
          style={{ borderColor: cfg.ringColor, background: cfg.bg }}
        >
          <span className="font-serif text-2xl font-bold leading-none" style={{ color: cfg.textColor }}>
            {reliabilityScore != null ? reliabilityScore : cfg.grade}
          </span>
          <span className="text-[10px] font-semibold mt-1 text-center leading-tight px-1" style={{ color: cfg.textColor }}>
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCell
          label="Pass Rate"
          value={passRate != null ? `${passRate}%` : '—'}
          sub={hasProcessed ? `${stats.passed || 0} of ${processedCount} processed` : 'no processed invoices'}
          highlight={passRate != null && passRate >= 70 ? 'bg-ink-50' : passRate != null && passRate < 50 ? 'bg-red-50' : undefined}
        />
        <MetricCell
          label="Rejection Rate"
          value={rejectionRate != null ? `${rejectionRate}%` : '—'}
          sub={hasProcessed ? `${stats.rejected || 0} rejected` : undefined}
          highlight={rejectionRate != null && rejectionRate >= 30 ? 'bg-red-50' : undefined}
        />
        <MetricCell
          label="Avg Match Score"
          value={avgMatchScore != null ? `${avgMatchScore}%` : '—'}
          sub={avgMatchScore != null ? (avgMatchScore >= 80 ? 'Strong match' : avgMatchScore >= 60 ? 'Moderate' : 'Weak match') : 'no scored invoices'}
        />
        <MetricCell
          label="Duplicates"
          value={duplicateCount ?? 0}
          sub={duplicateCount > 0 ? 'duplicate submissions flagged' : 'no duplicates detected'}
          highlight={duplicateCount > 0 ? 'bg-amber-50' : undefined}
        />
      </div>

      {/* Invoice status distribution */}
      {totalInvoices > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ivory-500 mb-2">Invoice Status Distribution</p>
          <StatusBar statusBreakdown={statusBreakdown} totalInvoices={totalInvoices} />
        </div>
      )}

      {/* Bottom two columns: risk + discrepancies */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ivory-500 mb-2">Risk Levels</p>
          <RiskChips riskBreakdown={riskBreakdown} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ivory-500 mb-2">Top Discrepancy Fields</p>
          {topDiscrepancies?.length > 0 ? (
            <ol className="space-y-1">
              {topDiscrepancies.map((d, i) => (
                <li key={d._id} className="flex items-center gap-2 text-xs text-ivory-800">
                  <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px] flex items-center justify-center flex-shrink-0">{i + 1}</span>
                  <span className="font-mono font-medium">{d._id}</span>
                  <span className="text-ivory-400 ml-auto">{d.count}×</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-ivory-500">No discrepancies recorded.</p>
          )}
        </div>
      </div>

      {/* Monthly trend */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-ivory-500 mb-2">Monthly Activity (last 6 months)</p>
        <MonthlyTrend monthlyTrend={monthlyTrend} />
        {monthlyTrend?.length > 0 && (
          <div className="flex items-center gap-4 mt-2">
            {[['#16a34a', 'Passed'], ['#ea580c', 'Review'], ['#dc2626', 'Rejected']].map(([color, label]) => (
              <span key={label} className="flex items-center gap-1 text-[10px] text-ivory-500">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function VendorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useDocumentTitle(data?.vendor?.name || 'Vendor');
  const pageRef = usePageEntrance(!loading);

  useEffect(() => {
    setLoading(true);
    vendorAPI.getSummary(id)
      .then((res) => setData(res.data.data))
      .catch((err) => setError(err.response?.data?.message || 'Vendor not found'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center h-64" role="status" aria-live="polite">
      <div className="animate-spin w-7 h-7 border-[3px] border-amber-600 border-t-transparent rounded-full" aria-hidden="true" />
    </div>
  );

  if (error || !data) return (
    <div className="text-center py-16">
      <p className="text-ivory-700 mb-4">{error || 'Vendor not found'}</p>
      <button onClick={() => navigate('/vendors')} className="btn-secondary">← Back to Vendors</button>
    </div>
  );

  const { vendor, purchaseOrders, invoices, stats } = data;

  return (
    <div ref={pageRef} className="space-y-5 max-w-6xl">
      <div data-animate>
        <Link to="/vendors" className="text-ivory-600 hover:text-ink-800 text-sm flex items-center gap-1 mb-2 transition-colors">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" /></svg>
          Vendors
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-ink-900 rounded-xl flex items-center justify-center text-white font-serif font-bold text-xl flex-shrink-0" aria-hidden="true">
              {vendor.name[0].toUpperCase()}
            </div>
            <div>
              <h1 className="font-serif text-2xl font-bold text-ink-800">{vendor.name}</h1>
              <p className="text-ivory-700 text-sm">{vendor.email}</p>
            </div>
          </div>
          <span className={getStatusBadge(vendor.status)}>{vendor.status}</span>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" data-animate>
        <StatCard label="Purchase Orders" value={stats.totalPOs} />
        <StatCard label="Invoices" value={stats.totalInvoices} sub={stats.flaggedInvoices > 0 ? `${stats.flaggedInvoices} flagged` : 'none flagged'} />
        <StatCard label="Total PO Value" value={formatCurrency(stats.totalPOValue, purchaseOrders[0]?.currency || 'USD')} />
        <StatCard label="Total Invoiced" value={formatCurrency(stats.totalInvoiced, purchaseOrders[0]?.currency || 'USD')} />
      </div>

      {/* Analytics panel */}
      <VendorAnalytics stats={stats} />

      {/* Vendor info */}
      <div className="card" data-animate>
        <h2 className="font-serif font-bold text-ink-900 mb-3">Vendor Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {[
            ['Phone', vendor.phone],
            ['Tax ID / GSTIN', vendor.taxId],
            ['Registration No.', vendor.registrationNumber],
            ['Payment Terms', vendor.paymentTerms],
            ['Address', [vendor.address?.street, vendor.address?.city, vendor.address?.country].filter(Boolean).join(', ')],
            ['Added', formatDate(vendor.createdAt)],
          ].filter(([, v]) => v).map(([label, val]) => (
            <div key={label} className="flex justify-between border-b border-ivory-100 pb-2">
              <span className="text-ivory-600">{label}</span>
              <span className="font-medium text-ink-800 text-right ml-3">{val}</span>
            </div>
          ))}
        </div>
        {vendor.requiredFields?.length > 0 && (
          <div className="mt-4 pt-3 border-t border-ivory-100">
            <p className="text-xs font-bold uppercase tracking-wide text-ivory-500 mb-2">Required invoice fields</p>
            <div className="flex flex-wrap gap-1">
              {vendor.requiredFields.map((f) => (
                <span key={f.fieldKey} className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium">{f.fieldLabel}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Purchase Orders */}
      <div className="card" data-animate>
        <h2 className="font-serif font-bold text-ink-900 mb-3">Purchase Orders ({purchaseOrders.length})</h2>
        {purchaseOrders.length === 0 ? (
          <p className="text-sm text-ivory-600">No purchase orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="bg-ivory-50 text-left text-[10px] font-bold uppercase tracking-wide text-ivory-500">
                  <th className="py-2 px-3">PO Number</th>
                  <th className="py-2 px-3">Issue Date</th>
                  <th className="py-2 px-3">Total</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ivory-100">
                {purchaseOrders.map((po) => (
                  <tr key={po._id} className="hover:bg-ivory-50 transition-colors">
                    <td className="py-2 px-3">
                      <Link to={`/purchase-orders/${po._id}`} className="font-mono font-bold text-amber-800 hover:text-amber-900">{po.poNumber}</Link>
                    </td>
                    <td className="py-2 px-3 text-ivory-700">{formatDate(po.issueDate)}</td>
                    <td className="py-2 px-3 font-mono font-medium text-ink-900">{formatCurrency(po.totalAmount, po.currency)}</td>
                    <td className="py-2 px-3"><span className={getStatusBadge(po.status)}>{po.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoices */}
      <div className="card" data-animate>
        <h2 className="font-serif font-bold text-ink-900 mb-3">Invoices ({invoices.length})</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-ivory-600">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[550px]">
              <thead>
                <tr className="bg-ivory-50 text-left text-[10px] font-bold uppercase tracking-wide text-ivory-500">
                  <th className="py-2 px-3">Invoice #</th>
                  <th className="py-2 px-3">PO</th>
                  <th className="py-2 px-3">Score</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Uploaded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ivory-100">
                {invoices.map((inv) => (
                  <tr key={inv._id} className="hover:bg-ivory-50 transition-colors">
                    <td className="py-2 px-3">
                      <Link to={`/invoices/${inv._id}`} className="font-mono font-bold text-amber-800 hover:text-amber-900 text-xs">{inv.invoiceNumber || '—'}</Link>
                    </td>
                    <td className="py-2 px-3 font-mono text-xs text-ivory-700">{inv.purchaseOrder?.poNumber || '—'}</td>
                    <td className="py-2 px-3">
                      {inv.validationResult?.matchScore != null ? (
                        <span className={`font-mono font-bold ${getScoreColor(inv.validationResult.matchScore)}`}>{inv.validationResult.matchScore}%</span>
                      ) : <span className="text-ivory-400">—</span>}
                    </td>
                    <td className="py-2 px-3"><span className={getStatusBadge(inv.status)}>{inv.status.replace(/_/g, ' ')}</span></td>
                    <td className="py-2 px-3 text-xs text-ivory-600">{formatDate(inv.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
