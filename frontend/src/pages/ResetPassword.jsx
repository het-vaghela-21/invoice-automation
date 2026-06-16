import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
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

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { setUserFromToken } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pageRef = usePageEntrance();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const res = await authAPI.resetPassword(token, { password });
      setUserFromToken(res.data.token, res.data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Reset link is invalid or has expired');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={pageRef} className="min-h-screen flex items-center justify-center font-sans bg-ivory-100 p-6">
      <div className="w-full max-w-sm" data-animate>
        <div className="mb-8 flex justify-center"><Wordmark /></div>

        <div className="bg-white border border-ivory-300 rounded-2xl shadow-card p-8">
          <h1 className="font-serif text-2xl font-bold text-ink-800 mb-1">Set a new password</h1>
          <p className="text-ivory-700 text-sm mb-6">Choose a new password for your account.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="reset-password" className="label">New password</label>
              <input
                id="reset-password"
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                autoComplete="new-password"
                minLength={6}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="reset-confirm" className="label">Confirm password</label>
              <input
                id="reset-confirm"
                className="input"
                type="password"
                placeholder="••••••••"
                value={confirm}
                autoComplete="new-password"
                minLength={6}
                onChange={(e) => setConfirm(e.target.value)}
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
                  Resetting…
                </span>
              ) : 'Reset password →'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-ivory-700">
          <Link to="/login" className="text-amber-800 hover:text-amber-900 font-semibold">← Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
