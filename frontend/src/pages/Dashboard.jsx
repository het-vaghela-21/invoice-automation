import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { dashboardAPI } from '../services/api';
import { formatDate, getStatusBadge } from '../utils/helpers';
import { useAuth } from '../context/AuthContext';

const STATUS_COLORS = {
  passed:          '#10b981',
  rejected:        '#ef4444',
  review_required: '#f97316',
  uploaded:        '#3b82f6',
  ocr_extracted:   '#8b5cf6',
  pending_review:  '#f59e0b',
};

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div className="bg-white rounded-xl border border-ivory-300 p-5 shadow-card flex items-start gap-4 animate-fade-up">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ivory-600 mb-0.5">{label}</p>
        <p className="text-3xl font-serif font-bold text-ink-900 leading-none">{value}</p>
        {sub && <p className="text-xs text-ivory-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-ivory-300 rounded-lg px-3 py-2 shadow-card text-sm">
      <span className="font-medium text-ink-900">{payload[0].name}:</span>{' '}
      <span className="font-mono font-bold">{payload[0].value}</span>
    </div>
  );
};

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    dashboardAPI.getStats()
      .then((res) => setStats(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-[3px] border-amber-500 border-t-transparent rounded-full" />
    </div>
  );
  if (!stats) return null;

  const chartData = [
    { name: 'Passed',          value: stats.invoices.validated,  color: STATUS_COLORS.passed },
    { name: 'Rejected',        value: stats.invoices.rejected,   color: STATUS_COLORS.rejected },
    { name: 'Review Required', value: stats.invoices.processing, color: STATUS_COLORS.review_required },
    { name: 'Uploaded',        value: stats.invoices.uploaded,   color: STATUS_COLORS.uploaded },
  ].filter((d) => d.value > 0);

  const validationRate = stats.invoices.total > 0
    ? Math.round((stats.invoices.validated / stats.invoices.total) * 100)
    : 0;

  return (
    <div className="space-y-7 max-w-6xl">
      {/* Header */}
      <div className="animate-fade-up">
        <h1 className="font-serif text-3xl font-bold text-ink-900">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'},{' '}
          <span className="text-amber-600">{user?.name?.split(' ')[0]}</span>.
        </h1>
        <p className="text-ivory-600 mt-1 text-sm">Here's what's happening with your invoices today.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Invoices"
          value={stats.invoices.total}
          color="bg-blue-50 text-blue-600"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          }
        />
        <StatCard
          label="Passed"
          value={stats.invoices.validated}
          sub={`${validationRate}% rate`}
          color="bg-emerald-50 text-emerald-600"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Need Review"
          value={stats.invoices.processing}
          color="bg-orange-50 text-orange-600"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          }
        />
        <StatCard
          label="Rejected"
          value={stats.invoices.rejected}
          color="bg-red-50 text-red-500"
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Three-col row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Chart */}
        <div className="card animate-fade-up delay-100">
          <h2 className="font-serif text-lg font-bold text-ink-900 mb-4">Invoice Breakdown</h2>
          {chartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={chartData} cx="50%" cy="50%" innerRadius={52} outerRadius={78} dataKey="value" strokeWidth={2} stroke="#f5f2eb">
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3">
                {chartData.map((d) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs text-ivory-600">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                    {d.name}: <span className="font-mono font-semibold text-ink-800">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-ivory-500 text-sm">
              No invoice data yet
            </div>
          )}
        </div>

        {/* Quick stats */}
        <div className="card animate-fade-up delay-200">
          <h2 className="font-serif text-lg font-bold text-ink-900 mb-4">Overview</h2>
          <div className="space-y-3">
            {[
              { label: 'Active Vendors', value: stats.vendors },
              { label: 'Purchase Orders', value: stats.purchaseOrders },
              { label: 'Validation Rate', value: `${validationRate}%`, color: validationRate >= 70 ? 'text-emerald-600' : 'text-orange-500' },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center py-2 border-b border-ivory-200 last:border-0">
                <span className="text-sm text-ivory-700">{row.label}</span>
                <span className={`font-mono font-bold text-sm ${row.color || 'text-ink-900'}`}>{row.value}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 space-y-2">
            <Link to="/upload" className="btn-primary w-full text-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Upload Invoice
            </Link>
            <Link to="/purchase-orders/new" className="btn-secondary w-full text-sm">New Purchase Order</Link>
          </div>
        </div>

        {/* Recent invoices */}
        <div className="card animate-fade-up delay-300">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-serif text-lg font-bold text-ink-900">Recent</h2>
            <Link to="/invoices" className="text-xs text-amber-600 hover:text-amber-700 font-semibold">View all →</Link>
          </div>
          {stats.recentInvoices.length === 0 ? (
            <p className="text-ivory-500 text-sm text-center py-8">No invoices yet</p>
          ) : (
            <div className="space-y-1">
              {stats.recentInvoices.map((inv) => (
                <Link
                  key={inv._id}
                  to={`/invoices/${inv._id}`}
                  className="flex items-center justify-between -mx-2 px-2 py-2 rounded-lg hover:bg-ivory-100 transition-colors group"
                >
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="text-sm font-medium text-ink-800 truncate group-hover:text-amber-700 transition-colors">
                      {inv.invoiceNumber || inv.uploadedFile?.originalName || 'Unnamed'}
                    </p>
                    <p className="text-xs text-ivory-500 mt-0.5">{formatDate(inv.createdAt)}</p>
                  </div>
                  <span className={getStatusBadge(inv.status)}>{inv.status.replace(/_/g, ' ')}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
