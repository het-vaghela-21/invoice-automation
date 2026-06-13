// Shared GSAP motion helpers.
// Every animation here respects the user's `prefers-reduced-motion` setting:
// when reduced motion is requested we skip the tween entirely and render the
// final state immediately, so no content is ever hidden or delayed.
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Staggered page-entrance choreography.
 * Attach the returned ref to a container; every descendant carrying a
 * `data-animate` attribute fades/rises in with a small stagger.
 * Elements are fully visible by default (no CSS opacity:0), so even if GSAP
 * never runs the page stays readable.
 *
 * @param {boolean} ready - run only once this is true (e.g. after data load)
 */
export function usePageEntrance(ready = true) {
  const ref = useRef(null);
  const played = useRef(false);

  useEffect(() => {
    if (!ready || played.current || !ref.current) return;
    played.current = true;
    if (prefersReducedMotion()) return;

    const targets = ref.current.querySelectorAll('[data-animate]');
    if (!targets.length) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        targets,
        { autoAlpha: 0, y: 16 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.55,
          ease: 'power3.out',
          stagger: 0.07,
          clearProps: 'opacity,transform,visibility',
        }
      );
    }, ref);
    return () => ctx.revert();
  }, [ready]);

  return ref;
}

/**
 * Animated number count-up for dashboard stats / amounts.
 * Returns a ref to attach to the element whose textContent will be animated.
 * With reduced motion the final value is written immediately.
 */
export function useCountUp(value, { duration = 1.1, format } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const end = Number(value) || 0;
    const fmt = format || ((v) => String(Math.round(v)));

    if (prefersReducedMotion()) {
      el.textContent = fmt(end);
      return;
    }

    const state = { v: 0 };
    const tween = gsap.to(state, {
      v: end,
      duration,
      ease: 'power2.out',
      onUpdate: () => { el.textContent = fmt(state.v); },
      onComplete: () => { el.textContent = fmt(end); },
    });
    return () => tween.kill();
  }, [value, duration, format]);

  return ref;
}

/**
 * Scroll-triggered entrance for landing-page sections.
 * Attach the returned ref to a container; every direct child with
 * `data-scroll` fades/rises in as it enters the viewport.
 * Works with ScrollTrigger; falls back to immediate visibility under
 * prefers-reduced-motion.
 */
export function useScrollEntrance(options = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const targets = container.querySelectorAll('[data-scroll]');
    if (!targets.length) return;

    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      targets.forEach((el, i) => {
        gsap.fromTo(
          el,
          { autoAlpha: 0, y: 28 },
          {
            autoAlpha: 1,
            y: 0,
            duration: options.duration || 0.6,
            ease: 'power3.out',
            delay: (options.stagger || 0.1) * i,
            clearProps: 'opacity,transform,visibility',
            scrollTrigger: {
              trigger: el,
              start: 'top 88%',
              once: true,
            },
          }
        );
      });
    }, container);

    return () => ctx.revert();
  }, []);

  return ref;
}

/**
 * Gentle attention pulse (used for drag-over states, status changes).
 * No-op under reduced motion.
 */
export function pulse(el) {
  if (!el || prefersReducedMotion()) return;
  gsap.fromTo(el, { scale: 0.985 }, { scale: 1, duration: 0.35, ease: 'back.out(2)', clearProps: 'transform' });
}
