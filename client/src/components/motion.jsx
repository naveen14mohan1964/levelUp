import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * App-wide entrance motion (rules: .claude/skills/design-to-motion "Website" + landing-page-design B7).
 * One observer on <main> gives every page the same choreography without per-page code:
 *   - page heads ("hero appear"): 6px rise + 2px blur to sharp, 60 ms apart, on load
 *   - cards (`card` kind): 24px rise, scale 0.985, 6px blur, staggered 80 ms in reading order,
 *     each played once when about a fifth of it scrolls into view
 * Opt out with data-reveal="off" on any ancestor. Dialogs and fixed layers are skipped.
 * Uses the Web Animations API with a single "from" keyframe, so each element settles on its own
 * resting styles (a locked card ends at its 0.7 opacity, a tilted card keeps its transform).
 */
const HEAD = '.page-head > *, .today-head > *';
const CARD = '.card, .reveal, .section-label, .tabs, .upnext > *';
const SELECTOR = `${HEAD}, ${CARD}`;

const KINDS = {
  up: { from: { opacity: 0, transform: 'translateY(6px)', filter: 'blur(2px)' }, duration: 800, step: 60 },
  card: { from: { opacity: 0, transform: 'translateY(24px) scale(0.985)', filter: 'blur(6px)' }, duration: 900, step: 80 },
};
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const MAX_STEPS = 8; // after 8 items in one batch, the rest arrive together

function skip(el, root) {
  if (el.closest('[data-reveal="off"], [role="dialog"]')) return true;
  // nested inside something that already reveals: the parent carries it
  const parent = el.parentElement?.closest(SELECTOR);
  if (parent && root.contains(parent)) return true;
  return getComputedStyle(el).position === 'fixed';
}

export function useAutoReveal(rootRef) {
  const reduce = useReducedMotion();
  useEffect(() => {
    const root = rootRef.current;
    if (!root || reduce || typeof IntersectionObserver === 'undefined' || !Element.prototype.animate) return undefined;
    const seen = new WeakSet();

    // Visible enough = 18% of the element, OR (for elements taller than the screen, which can never reach 18%)
    // a slice covering a fifth of the viewport. Without the second rule a long list stayed hidden forever.
    const visibleEnough = (e) => e.isIntersecting
      && (e.intersectionRatio >= 0.18 || e.intersectionRect.height >= (e.rootBounds?.height || window.innerHeight) * 0.2);
    const io = new IntersectionObserver((entries) => {
      const shown = entries.filter(visibleEnough).map((e) => e.target);
      // reading order: top to bottom, then left to right
      shown.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      const n = { up: 0, card: 0 };
      for (const el of shown) {
        io.unobserve(el);
        const kind = el.matches(HEAD) ? 'up' : 'card';
        const k = KINDS[kind];
        const delay = Math.min(n[kind]++, MAX_STEPS) * k.step;
        el.classList.remove('rv-pending');
        el.animate([k.from], { duration: k.duration, delay, easing: EASE, fill: 'backwards' });
      }
    }, { threshold: [0, 0.05, 0.1, 0.18], rootMargin: '0px 0px -4% 0px' });

    function register(el) {
      if (seen.has(el)) return;
      seen.add(el);
      if (skip(el, root)) return;
      el.classList.add('rv-pending'); // hidden until it enters the viewport (no flash of the final state)
      io.observe(el);
    }
    function scan(node) {
      if (node.nodeType !== 1) return;
      if (node.matches(SELECTOR)) register(node);
      node.querySelectorAll(SELECTOR).forEach(register);
    }

    scan(root);
    const mo = new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach(scan);
    });
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io.disconnect();
      root.querySelectorAll('.rv-pending').forEach((el) => el.classList.remove('rv-pending'));
    };
  }, [rootRef, reduce]);
}

/** Calls back once when the element first scrolls into view (30% visible). */
export function useInViewOnce(ref, amount = 0.3) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: amount });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, amount, seen]);
  return seen;
}

const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/**
 * A number that counts up to `value` the first time it scrolls into view, then follows later changes.
 * Non-numeric values render as they are. Screen readers get the final value only.
 */
export function CountUp({ value, duration = 1100, format = (n) => n.toLocaleString() }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const numeric = typeof value === 'number' && Number.isFinite(value);
  const inView = useInViewOnce(ref);
  const [shown, setShown] = useState(numeric && !reduce ? 0 : value);
  const from = useRef(0);

  useEffect(() => {
    if (!numeric || reduce) { setShown(value); return undefined; }
    if (!inView) return undefined;
    const start = performance.now();
    const a = from.current;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(a + (value - a) * easeOutExpo(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, numeric, reduce, inView, duration]);

  return (
    <span ref={ref} className="count-up">
      <span aria-hidden="true">{numeric ? format(shown) : value}</span>
      <span className="sr-only">{numeric ? format(value) : ''}</span>
    </span>
  );
}

/** Skeleton loader shaped like a typical page: title, tabs, then a grid of cards (skill B9: never a spinner). */
export function SkeletonPage({ cards = 4 }) {
  return (
    <div className="sk-page" data-reveal="off" aria-busy="true">
      <span className="sr-only" role="status">Loading…</span>
      <div className="sk sk-title" />
      <div className="sk sk-sub" />
      <div className="sk-grid">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="sk-card">
            <div className="sk sk-line w60" />
            <div className="sk sk-line w90" />
            <div className="sk sk-line w40" />
          </div>
        ))}
      </div>
    </div>
  );
}
