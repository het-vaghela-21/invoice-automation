import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const pageRef = usePageEntrance();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
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
            Get started<br /><span className="italic text-amber-700">today.</span>
          </h2>
          <p className="text-ivory-700 text-base leading-relaxed">
            Create an account and start processing invoices automatically — no setup needed.
          </p>
        </div>

        <figure className="bg-white border border-ivory-300 rounded-xl p-5 shadow-card" data-animate>
          <blockquote className="text-ivory-800 text-sm italic leading-relaxed">
            "We cut our invoice review time from 3 days to a few hours. The matching is surprisingly accurate."
          </blockquote>
          <figcaption className="text-ivory-600 text-xs mt-3 font-semibold">— Finance team lead</figcaption>
        </figure>
      </div>

      {/* Right panel — form */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm" data-animate>
          {/* Mobile logo */}
          <div className="mb-8 md:hidden"><Wordmark /></div>

          <div className="bg-white border border-ivory-300 rounded-2xl shadow-card p-8">
            <h1 className="font-serif text-3xl font-bold text-ink-800 mb-1">Create account</h1>
            <p className="text-ivory-700 text-sm mb-8">
              Already registered?{' '}
              <Link to="/login" className="text-amber-800 hover:text-amber-900 font-semibold rounded">Sign in →</Link>
            </p>

            {error && (
              <div role="alert" className="mb-4 bg-red-50 border border-red-300 text-red-800 text-sm rounded-lg p-3">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="reg-name" className="label">Full name</label>
                <input
                  id="reg-name"
                  className="input"
                  type="text"
                  placeholder="Jane Smith"
                  value={form.name}
                  autoComplete="name"
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label htmlFor="reg-email" className="label">Email address</label>
                <input
                  id="reg-email"
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
                <label htmlFor="reg-password" className="label">Password</label>
                <input
                  id="reg-password"
                  className="input"
                  type="password"
                  placeholder="At least 6 characters"
                  value={form.password}
                  autoComplete="new-password"
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                  minLength={6}
                />
              </div>
              <button type="submit" className="btn-primary w-full py-2.5 text-base" disabled={loading}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2" role="status">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" aria-hidden="true" />
                    Creating account…
                  </span>
                ) : 'Create account →'}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
