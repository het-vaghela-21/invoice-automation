import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';
import { usePageEntrance } from '../utils/motion';
import { useDocumentTitle } from '../utils/useDocumentTitle';

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

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetUrl, setResetUrl] = useState(null);
  const [done, setDone] = useState(false);
  useDocumentTitle('Forgot Password');
  const pageRef = usePageEntrance();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authAPI.forgotPassword({ email });
      setResetUrl(res.data.resetUrl || null);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={pageRef} className="min-h-screen flex items-center justify-center font-sans bg-ivory-100 p-6">
      <div className="w-full max-w-sm" data-animate>
        <div className="mb-8 flex justify-center"><Wordmark /></div>

        <div className="bg-white border border-ivory-300 rounded-2xl shadow-card p-8">
          {!done ? (
            <>
              <h1 className="font-serif text-2xl font-bold text-ink-800 mb-1">Reset your password</h1>
              <p className="text-ivory-700 text-sm mb-6">Enter your email and we'll generate a reset link.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="forgot-email" className="label">Email address</label>
                  <input
                    id="forgot-email"
                    className="input"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    autoComplete="email"
                    onChange={(e) => setEmail(e.target.value)}
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
                      Sending…
                    </span>
                  ) : 'Send reset link →'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-4" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 text-emerald-700">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
              </div>
              <h1 className="font-serif text-2xl font-bold text-ink-800 mb-1">Check your link</h1>
              <p className="text-ivory-700 text-sm mb-4">
                If that email is registered, a password reset link has been generated.
              </p>

              {resetUrl && (
                <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 mb-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-800 mb-2">
                    No email service is configured for this demo — use the link directly:
                  </p>
                  <Link to={resetUrl.replace(window.location.origin, '')} className="text-amber-900 underline decoration-amber-400 underline-offset-2 font-mono text-xs break-all">
                    {resetUrl}
                  </Link>
                </div>
              )}

              <Link to="/login" className="text-amber-800 hover:text-amber-900 font-semibold text-sm">← Back to sign in</Link>
            </>
          )}
        </div>

        {!done && (
          <p className="mt-6 text-center text-sm text-ivory-700">
            <Link to="/login" className="text-amber-800 hover:text-amber-900 font-semibold">← Back to sign in</Link>
          </p>
        )}
      </div>
    </div>
  );
}
