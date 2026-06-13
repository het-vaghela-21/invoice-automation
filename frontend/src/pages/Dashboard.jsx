import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { dashboardAPI } from '../services/api';
import { formatDate, getStatusBadge } from '../utils/helpers';
import { useAuth } from '../context/AuthContext';
import { usePageEntrance, useCountUp } from '../utils/motion';

const STATUS_COLORS = {
  passed:          '#2d7a5a', // ink-500
  rejected:        '#b91c1c', // red-700
  review_required: '#c97b2e', // amber-500
  inProgress:      '#7db8a0', // ink-300
  uploaded:        '#cdc8bc', // ivory-500
};

const REDUCED = typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function StatCard({ label, value, sub, tone, icon }) {
  const countRef = useCountUp(value);
  return (
    <div className="bg-white rounded-xl border border-ivory-300 p-5 shadow-card flex items-start gap-4" data-animate>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${tone}`} aria-hidden="true">
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ivory-600 mb-0.5">{label}</p>
        <p className="text-3xl font-mono font-bold text-ink-700 leading-none" aria-label={`${label}: ${value}`}>
          <span ref={countRef} aria-hidden="true">{value}</span>
        </p>
        {sub && <p className="text-xs text-ivory-600 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-ivory-300 rounded-lg px-3 py-2 shadow-card text-sm">
      <span className="font-medium text-ink-700">{payload[0].name}:</span>{' '}
      <span className="font-mono font-bold text-ivory-900">{payload[0].value}</span>
    </div>
  );
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const pageRef = usePageEntrance(!loading && !!stats);

  useEffect(() => {
    dashboardAPI.getStats()
      .then((res) => setStats(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64" role="status" aria-live="polite">
      <div className="animate-spin w-8 h-8 border-[3px] border-amber-600 border-t-transparent rounded-full" aria-hidden="true" />
      <span className="sr-only">Loading dashboard…</span>
    </div>
  );
  if (!stats) return null;

  const inv = stats.invoices;

  // Use correct status field names from updated backend
  const passedCount       = inv.passed        ?? inv.validated   ?? 0;
  const rejectedCount     = inv.rejected       ?? 0;
  const reviewCount       = inv.reviewRequired ?? inv.processing  ?? 0;
  const inProgressCount   = inv.inProgress     ?? reviewCount;
  const uploadedCount     = inv.uploaded       ?? 0;

  const chartData = [
    { name: 'Passed',          value: passedCount,     color: STATUS_COLORS.passed },
    { name: 'Rejected',        value: rejectedCount,   color: STATUS_COLORS.rejected },
    { name: 'Review Required', value: reviewCount,     color: STATUS_COLORS.review_required },
    { name: 'In Progress',     value: (inProgressCount - reviewCount) > 0 ? inProgressCount - reviewCount : 0, color: STATUS_COLORS.inProgress },
    { name: 'Uploaded',        value: uploadedCount,   color: STATUS_COLORS.uploaded },
  ].filter((d) => d.value > 0);

  const validationRate = inv.total > 0
    ? Math.round((passedCount / inv.total) * 100)
    : 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

  return (
    <div ref={pageRef} className="space-y-7 max-w-6xl">
      {/* Header */}
      <div data-animate>
        <h1 className="font-serif text-3xl font-bold text-ink-800">
          Good {greeting},{' '}
          <span className="text-amber-700 italic">{user?.name?.split(' ')[0]}</span>.
        </h1>
        <p className="text-ivory-700 mt-1 text-sm">Here's what's happening with your invoices today.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Invoices"
          value={inv.total}
          tone="bg-ink-50 text-ink-600"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          }
        />
        <StatCard
          label="Passed"
          value={passedCount}
          sub={`${validationRate}% pass rate`}
          tone="bg-ink-100 text-ink-700"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Need Review"
          value={reviewCount}
          tone="bg-amber-100 text-amber-800"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          }
        />
        <StatCard
          label="Rejected"
          value={rejectedCount}
          tone="bg-red-50 text-red-700"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Three-col row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Donut chart */}
        <section className="card" data-animate aria-label="Invoice status breakdown">
          <h2 className="font-serif text-lg font-bold text-ink-800 mb-1">Status Breakdown</h2>
          <p className="text-xs text-ivory-600 mb-4">All invoices by current state</p>
          {chartData.length > 0 ? (
            <>
              {/* Donut with centered total */}
              <div className="relative" role="img" aria-label={`Donut chart: ${chartData.map((d) => `${d.name} ${d.value}`).join(', ')}`}>
                <ResponsiveContainer width="100%" height={176}>
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%" cy="50%"
                      innerRadius={54} outerRadius={80}
                      dataKey="value"
                      strokeWidth={3} stroke="#faf8f1"
                      isAnimationActive={!REDUCED}
                      paddingAngle={2}
                    >
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Centre label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" aria-hidden="true">
                  <span className="font-mono text-2xl font-bold text-ink-700 leading-none">{inv.total}</span>
                  <span className="text-[10px] uppercase tracking-wide text-ivory-600 mt-0.5">total</span>
                </div>
              </div>
              <ul className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3 list-none">
                {chartData.map((d) => (
                  <li key={d.name} className="flex items-center gap-1.5 text-xs text-ivory-700">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} aria-hidden="true" />
                    {d.name}: <span className="font-mono font-semibold text-ivory-900">{d.value}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="h-[176px] flex flex-col items-center justify-center gap-3 text-ivory-600 text-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="w-10 h-10 text-ivory-400" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              No invoice data yet
            </div>
          )}
        </section>

        {/* Quick stats + actions */}
        <section className="card paper-ruled" data-animate aria-label="Overview">
          <h2 className="font-serif text-lg font-bold text-ink-800 mb-1">Overview</h2>
          <p className="text-xs text-ivory-600 mb-4">Your ledger at a glance</p>
          <dl className="space-y-0 mb-5">
            {[
              { label: 'Active Vendors',   value: stats.vendors,        color: '' },
              { label: 'Purchase Orders',  value: stats.purchaseOrders, color: '' },
              { label: 'Pass Rate',        value: `${validationRate}%`, color: validationRate >= 70 ? 'text-ink-600' : validationRate >= 40 ? 'text-amber-800' : 'text-red-700' },
              { label: 'In Progress',      value: inProgressCount,       color: '' },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center py-2.5 border-b border-ivory-300/60 last:border-0">
                <dt className="text-sm text-ivory-700">{row.label}</dt>
                <dd className={`font-mono font-bold text-sm ${row.color || 'text-ivory-900'}`}>{row.value}</dd>
              </div>
            ))}
          </dl>
          <div className="space-y-2">
            <Link to="/upload" className="btn-primary w-full text-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Upload Invoice
            </Link>
            <Link to="/purchase-orders/new" className="btn-secondary w-full text-sm">New Purchase Order</Link>
          </div>
        </section>

        {/* Recent invoices — activity-feed style */}
        <section className="card" data-animate aria-label="Recent invoices">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="font-serif text-lg font-bold text-ink-800">Recent Activity</h2>
              <p className="text-xs text-ivory-600">Latest invoice updates</p>
            </div>
            <Link to="/invoices" className="text-xs text-amber-800 hover:text-amber-900 font-semibold rounded">View all →</Link>
          </div>
          {stats.recentInvoices.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-ivory-600 text-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="w-10 h-10 text-ivory-400" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              No invoices yet.{' '}
              <Link to="/upload" className="text-amber-800 font-semibold hover:underline">Upload one →</Link>
            </div>
          ) : (
            <ul className="space-y-0 list-none divide-y divide-ivory-100">
              {stats.recentInvoices.map((inv) => (
                <li key={inv._id}>
                  <Link
                    to={`/invoices/${inv._id}`}
                    className="flex items-center gap-3 -mx-2 px-2 py-2.5 rounded-lg hover:bg-ivory-100 transition-colors group"
                  >
                    {/* Status dot */}
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      inv.status === 'passed'          ? 'bg-ink-500' :
                      inv.status === 'rejected'        ? 'bg-red-500' :
                      inv.status === 'review_required' ? 'bg-amber-500' :
                      'bg-ivory-400'
                    }`} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ivory-900 truncate group-hover:text-amber-800 transition-colors">
                        {inv.invoiceNumber || inv.uploadedFile?.originalName || 'Unnamed'}
                      </p>
                      <p className="text-xs text-ivory-600 mt-0.5 flex items-center gap-1.5">
                        <span>{formatDate(inv.createdAt)}</span>
                        {inv.validationResult?.matchScore != null && (
                          <>
                            <span className="text-ivory-300">·</span>
                            <span className={`font-mono font-semibold ${
                              inv.validationResult.matchScore >= 80 ? 'text-ink-600' :
                              inv.validationResult.matchScore >= 50 ? 'text-amber-700' :
                              'text-red-600'
                            }`}>{inv.validationResult.matchScore}%</span>
                          </>
                        )}
                      </p>
                    </div>
                    <span className={`${getStatusBadge(inv.status)} flex-shrink-0 text-[10px]`}>
                      {inv.status.replace(/_/g, ' ')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
