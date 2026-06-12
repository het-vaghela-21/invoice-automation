import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { dashboardAPI } from '../services/api';
import { formatCurrency, formatDate, getStatusBadge } from '../utils/helpers';

const COLORS = { validated: '#22c55e', rejected: '#ef4444', processing: '#eab308', uploaded: '#3b82f6' };

function StatCard({ label, value, color, icon }) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${color}`}>{icon}</div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardAPI.getStats()
      .then((res) => setStats(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-500">Loading...</div>;
  if (!stats) return null;

  const chartData = [
    { name: 'Validated', value: stats.invoices.validated, color: COLORS.validated },
    { name: 'Rejected', value: stats.invoices.rejected, color: COLORS.rejected },
    { name: 'Processing', value: stats.invoices.processing, color: COLORS.processing },
    { name: 'Uploaded', value: stats.invoices.uploaded, color: COLORS.uploaded }
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Invoice processing overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Invoices" value={stats.invoices.total} icon="🧾" color="bg-blue-50" />
        <StatCard label="Validated" value={stats.invoices.validated} icon="✅" color="bg-green-50" />
        <StatCard label="Rejected" value={stats.invoices.rejected} icon="❌" color="bg-red-50" />
        <StatCard label="Processing" value={stats.invoices.processing + stats.invoices.uploaded} icon="⏳" color="bg-yellow-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Invoice Status</h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={chartData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value">
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">No invoice data yet</div>
          )}
          <div className="flex flex-wrap gap-3 mt-2">
            {chartData.map((d) => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                {d.name}: {d.value}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Quick Stats</h2>
          <div className="space-y-3 mt-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Active Vendors</span>
              <span className="font-medium">{stats.vendors}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Purchase Orders</span>
              <span className="font-medium">{stats.purchaseOrders}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Validation Rate</span>
              <span className="font-medium text-green-600">
                {stats.invoices.total > 0 ? Math.round((stats.invoices.validated / stats.invoices.total) * 100) : 0}%
              </span>
            </div>
          </div>
          <div className="mt-6 space-y-2">
            <Link to="/upload" className="btn-primary w-full text-center block text-sm">Upload Invoice</Link>
            <Link to="/purchase-orders/new" className="btn-secondary w-full text-center block text-sm">New Purchase Order</Link>
          </div>
        </div>

        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-base font-semibold text-gray-900">Recent Invoices</h2>
            <Link to="/invoices" className="text-sm text-blue-600 hover:underline">View all</Link>
          </div>
          {stats.recentInvoices.length === 0 ? (
            <p className="text-gray-400 text-sm">No invoices yet</p>
          ) : (
            <div className="space-y-3">
              {stats.recentInvoices.map((inv) => (
                <Link key={inv._id} to={`/invoices/${inv._id}`} className="flex items-center justify-between hover:bg-gray-50 -mx-2 px-2 py-1.5 rounded-lg">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{inv.invoiceNumber || inv.uploadedFile?.originalName || 'Unnamed'}</p>
                    <p className="text-xs text-gray-500">{formatDate(inv.createdAt)}</p>
                  </div>
                  <span className={getStatusBadge(inv.status)}>{inv.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
