import React from 'react';
import { Link } from 'react-router-dom';
import { usePageEntrance, useScrollEntrance } from '../utils/motion';

const features = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
    title: 'OCR Extraction',
    desc: 'Upload any PDF or image invoice. Our engine extracts vendor names, amounts, GST numbers, and PO references automatically.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
      </svg>
    ),
    title: 'PO Matching',
    desc: 'Every invoice is scored against your purchase orders. Vendor name, amount, currency, line items — all cross-referenced automatically.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
      </svg>
    ),
    title: 'Manual Verification',
    desc: 'Side-by-side split view lets your team correct OCR errors with a full audit trail of every change made.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
      </svg>
    ),
    title: 'Real-time Analytics',
    desc: 'Track validation rates, spot duplicate invoices, and monitor vendor performance from a single dashboard.',
  },
];

const steps = [
  { num: '01', title: 'Upload', desc: 'Drag & drop your PDF or image invoice. Supports any format.' },
  { num: '02', title: 'Extract', desc: 'OCR identifies all relevant fields based on your vendor config.' },
  { num: '03', title: 'Verify', desc: 'Review extracted data side-by-side with the original document.' },
  { num: '04', title: 'Match', desc: 'Invoice is scored against PO. Pass, review, or reject.' },
];

function MockDashboard() {
  const rows = [
    { id: 'INV-2026-041', vendor: 'Acme Supplies', amount: '₹56,640', status: 'passed', score: 97 },
    { id: 'INV-TC-0189',  vendor: 'TechCorp',      amount: '$12,000', status: 'review', score: 42 },
    { id: 'INV-GLOB-031', vendor: 'Global Svc',    amount: '$2,400',  status: 'pending', score: null },
  ];
  const statusStyle = { passed: 'text-ink-700 bg-ink-50', review: 'text-orange-800 bg-orange-50', pending: 'text-amber-800 bg-amber-50' };
  const statusLabel = { passed: 'Passed', review: 'Review', pending: 'Pending' };

  return (
    <div className="bg-white rounded-2xl shadow-modal overflow-hidden border border-ivory-200 select-none">
      {/* mock top bar */}
      <div className="bg-ivory-100 border-b border-ivory-300 px-5 py-3 flex items-center gap-3">
        <div className="flex gap-1.5" aria-hidden="true">
          <div className="w-3 h-3 rounded-full bg-red-300" />
          <div className="w-3 h-3 rounded-full bg-amber-300" />
          <div className="w-3 h-3 rounded-full bg-ink-300" />
        </div>
        <div className="flex-1 text-center text-xs font-mono text-ivory-600">ledger.app — Dashboard</div>
      </div>

      {/* mock stats row */}
      <div className="grid grid-cols-3 divide-x divide-ivory-200 border-b border-ivory-200">
        {[['5', 'Total Invoices'], ['2', 'Passed'], ['1', 'Review Req.']].map(([v, l]) => (
          <div key={l} className="p-4 text-center">
            <div className="text-2xl font-mono font-bold text-ink-700">{v}</div>
            <div className="text-xs text-ivory-600 mt-0.5">{l}</div>
          </div>
        ))}
      </div>

      {/* mock table */}
      <div className="text-xs">
        <div className="grid grid-cols-4 px-4 py-2 bg-ivory-100 text-ivory-600 font-bold uppercase tracking-wider text-[10px]">
          <span>Invoice</span><span>Vendor</span><span>Amount</span><span>Status</span>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-4 px-4 py-2.5 border-t border-ivory-100 items-center">
            <span className="font-mono text-[10px] text-ink-600">{r.id}</span>
            <span className="text-ivory-800">{r.vendor}</span>
            <span className="font-mono font-medium">{r.amount}</span>
            <span>
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusStyle[r.status]}`}>
                {statusLabel[r.status]}
              </span>
              {r.score && <span className="ml-1.5 text-[10px] text-ivory-500">{r.score}%</span>}
            </span>
          </div>
        ))}
      </div>

      {/* mock footer */}
      <div className="px-4 py-3 bg-ivory-50 border-t border-ivory-200 flex justify-between items-center">
        <span className="text-[10px] text-ivory-500 font-mono">3 invoices shown</span>
        <div className="h-1.5 w-24 bg-ivory-200 rounded-full overflow-hidden">
          <div className="h-full w-2/3 bg-amber-500 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const pageRef = usePageEntrance();
  const featuresRef = useScrollEntrance({ stagger: 0.1, duration: 0.55 });
  const stepsRef = useScrollEntrance({ stagger: 0.12, duration: 0.5 });
  return (
    <div ref={pageRef} className="min-h-screen bg-ivory-100 font-sans">
      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <nav className="bg-ivory-50/90 backdrop-blur border-b border-ivory-300 px-6 md:px-12 py-4 flex items-center justify-between sticky top-0 z-30" aria-label="Primary">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-ink-600 rounded flex items-center justify-center" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fefdf9" strokeWidth="2.2" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <span className="font-serif font-bold text-lg tracking-tight text-ink-700">Ledger</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="text-sm font-medium text-ivory-800 hover:text-ink-700 transition-colors rounded">Sign In</Link>
          <Link to="/register" className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors shadow-sm">
            Get Started
          </Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="bg-ivory-50 paper-ruled border-b border-ivory-300 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-20 md:py-28 grid md:grid-cols-2 gap-16 items-center">
          {/* Left */}
          <div data-animate>
            <div className="inline-flex items-center gap-2 bg-white border border-ivory-300 rounded-full px-3 py-1 text-xs font-medium text-ivory-800 mb-8 shadow-card">
              <span className="w-1.5 h-1.5 rounded-full bg-ink-500 animate-pulse" aria-hidden="true" />
              Invoice automation for finance teams
            </div>
            <h1 className="font-serif text-5xl md:text-6xl font-bold leading-[1.08] mb-6 text-ink-800">
              Invoice processing,<br />
              <span className="text-amber-700 italic">done right.</span>
            </h1>
            <p className="text-ivory-700 text-lg leading-relaxed mb-10 max-w-md">
              Upload invoices, extract data automatically, verify against purchase orders,
              and close books faster — with a full audit trail on every decision.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/register" className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-6 py-3 rounded-lg transition-all duration-200 shadow-sm">
                Start free →
              </Link>
              <Link to="/login" className="bg-white hover:bg-ivory-100 text-ink-700 font-medium px-6 py-3 rounded-lg transition-all duration-200 border border-ivory-400">
                Sign in
              </Link>
            </div>
            <p className="mt-6 text-xs text-ivory-600 font-mono">Demo credentials: admin@company.com / admin123</p>
          </div>

          {/* Right — mock dashboard */}
          <div className="hidden md:block" data-animate>
            <MockDashboard />
          </div>
        </div>
      </section>

      {/* ── Features grid ────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-20">
        <div className="text-center mb-14" data-animate>
          <h2 className="font-serif text-4xl font-bold text-ink-800 mb-3">Everything you need</h2>
          <p className="text-ivory-700 text-lg">from upload to approval, without the spreadsheet chaos</p>
        </div>
        <div ref={featuresRef} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f, i) => (
            <div
              key={i}
              className="bg-white border border-ivory-300 rounded-xl p-6 hover:shadow-card-hover hover:border-amber-300 transition-all duration-300"
              data-scroll
            >
              <div className="w-11 h-11 bg-amber-50 text-amber-800 rounded-xl flex items-center justify-center mb-4" aria-hidden="true">
                {f.icon}
              </div>
              <h3 className="font-serif font-bold text-ink-700 text-lg mb-2">{f.title}</h3>
              <p className="text-ivory-700 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section className="bg-ink-50 border-y border-ink-100 py-20">
        <div className="max-w-5xl mx-auto px-6 md:px-12">
          <h2 className="font-serif text-4xl font-bold text-center mb-14 text-ink-800" data-animate>
            Four steps,<br /><span className="text-amber-700 italic">zero guesswork.</span>
          </h2>
          <div ref={stepsRef} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((s, i) => (
              <div key={i} className="relative" data-scroll>
                {i < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-5 left-[calc(100%-12px)] w-full h-px border-t border-dashed border-ink-300 z-0" aria-hidden="true" />
                )}
                <div className="relative z-10">
                  <div className="font-mono text-3xl font-bold text-amber-700 mb-3" aria-hidden="true">{s.num}</div>
                  <h3 className="font-serif font-bold text-xl text-ink-700 mb-2">{s.title}</h3>
                  <p className="text-ivory-700 text-sm leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h2 className="font-serif text-4xl font-bold text-ink-800 mb-4">
          Ready to clear the invoice backlog?
        </h2>
        <p className="text-ivory-700 text-lg mb-8">
          Start with the demo account and see how your workflow can look.
        </p>
        <Link
          to="/login"
          className="inline-block bg-amber-600 hover:bg-amber-700 text-white font-semibold text-lg px-8 py-4 rounded-xl transition-all duration-200 shadow-sm"
        >
          Open the dashboard →
        </Link>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-ivory-300 py-8 px-6 md:px-12 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-ivory-700">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-ink-600 rounded flex items-center justify-center" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fefdf9" strokeWidth="2.5" className="w-3 h-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <span className="font-serif font-bold text-ink-700">Ledger</span>
        </div>
        <span>Invoice Automation System — Finance Management</span>
      </footer>
    </div>
  );
}
