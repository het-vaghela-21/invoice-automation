import React, { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { prefersReducedMotion } from '../utils/motion';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal dialog:
 * - role="dialog" + aria-modal + labelled title
 * - traps Tab focus inside, closes on Escape and backdrop click
 * - restores focus to the previously focused element on close
 * - gentle GSAP entrance (skipped under prefers-reduced-motion)
 */
export default function Modal({ title, onClose, children, maxWidth = 'max-w-2xl' }) {
  const panelRef = useRef(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const panel = panelRef.current;

    // Move focus into the dialog
    const first = panel?.querySelector(FOCUSABLE);
    (first || panel)?.focus();

    // Entrance animation
    if (panel && !prefersReducedMotion()) {
      gsap.fromTo(
        panel,
        { autoAlpha: 0, y: 14, scale: 0.985 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.3, ease: 'power3.out', clearProps: 'opacity,transform,visibility' }
      );
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const focusables = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!focusables.length) return;
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-ink-900/30 backdrop-blur-[2px] flex items-start justify-center z-50 p-4 pt-10 md:items-center md:pt-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`bg-white rounded-2xl shadow-modal w-full ${maxWidth} my-4 outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-ivory-200 flex justify-between items-center">
          <h2 id={titleId} className="font-serif text-xl font-bold text-ink-700">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-ivory-600 hover:text-ink-700 transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-ivory-100"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
