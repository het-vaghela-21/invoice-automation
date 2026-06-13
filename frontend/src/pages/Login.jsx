import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePageEntrance } from '../utils/motion';

function Wordmark() {
  return (
    <Link to="/" className="inline-flex items-center gap-2.5 rounded-lg" aria-label="Ledger — back to home">
      <span className="w-8 h-8 bg-ink-600 rounded-lg flex items-center justify-center" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fefdf9" strokeWidth="2.2" className="w-4 h-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      </span>
      <span className="font-serif font-bold text-ink-700 text-xl tracking-tight">Ledger</span>
    </Link>
  );
}

export default function Login() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pageRef = usePageEntrance();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={pageRef} className="min-h-screen flex font-sans bg-ivory-100">
      {/* Left panel — light editorial */}
      <div className="hidden md:flex md:w-2/5 bg-ivory-50 border-r border-ivory-300 paper-ruled flex-col justify-between p-10">
        <div data-animate><Wordmark /></div>

        <div data-animate>
          <h2 className="font-serif text-4xl font-bold text-ink-700 leading-tight mb-4">
            Welcome<br /><span className="italic text-amber-700">back.</span>
          </h2>
          <p className="text-ivory-700 text-base leading-relaxed">
            Your invoices are waiting. Sign in to review, verify, and close out the queue.
          </p>
        </div>

        <ul className="space-y-3 list-none" data-animate>
          {[
            'OCR data extraction',
            'Purchase order matching',
            'Full audit trail',
          ].map((f) => (
            <li key={f} className="flex items-center gap-2 text-ivory-800 text-sm">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-ink-500 flex-shrink-0" aria-hidden="true">
                <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd" />
              </svg>
              {f}
            </li>
          ))}
        </ul>
      </div>

      {/* Right panel — form */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm" data-animate>
          {/* Mobile logo */}
          <div className="mb-8 md:hidden"><Wordmark /></div>

          <div className="bg-white border border-ivory-300 rounded-2xl shadow-card p-8">
            <h1 className="font-serif text-3xl font-bold text-ink-800 mb-1">Sign in</h1>
            <p className="text-ivory-700 text-sm mb-8">
              No account?{' '}
              <Link to="/register" className="text-amber-800 hover:text-amber-900 font-semibold rounded">Create one →</Link>
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="login-email" className="label">Email address</label>
                <input
                  id="login-email"
                  className="input"
                  type="email"
                  placeholder="you@company.com"
                  value={form.email}
                  autoComplete="email"
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </div>
              <div>
                <label htmlFor="login-password" className="label">Password</label>
                <input
                  id="login-password"
                  className="input"
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  autoComplete="current-password"
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
              </div>

              {error && (
                <div role="alert" className="bg-red-50 border border-red-300 text-red-800 text-sm rounded-lg p-3">
                  {error}
                </div>
              )}

              <button type="submit" className="btn-primary w-full py-2.5 text-base" disabled={loading}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2" role="status">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true" />
                    Signing in…
                  </span>
                ) : 'Sign in →'}
              </button>
            </form>
          </div>

          <div className="mt-6 p-3 bg-ivory-200 border border-ivory-300 rounded-lg text-xs text-ivory-700 text-center">
            Demo: <span className="font-mono">admin@company.com</span> / <span className="font-mono">admin123</span>
          </div>
        </div>
      </main>
    </div>
  );
}
