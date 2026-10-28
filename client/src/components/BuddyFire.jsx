import { useMemo } from 'react';

/** An Archimedean spiral as an SVG path (the "chakra swirl"), centred on 0,0. */
function spiral(turns = 3.2, r = 44, steps = 160) {
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const rr = 4 + t * r;
    d += `${i ? 'L' : 'M'}${(Math.cos(a) * rr).toFixed(2)} ${(Math.sin(a) * rr).toFixed(2)}`;
  }
  return d;
}

/**
 * The fiery stage behind the buddy in the Today hero: drifting flame glows, a slowly turning spiral and embers
 * that rise and fade. Pure CSS/SVG (no images), transform and opacity only, static with "reduce motion".
 * `charged` (a focus session is running) makes it burn brighter and faster.
 */
export default function BuddyFire({ charged = false }) {
  const path = useMemo(() => spiral(), []);
  const embers = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    left: `${8 + ((i * 37) % 84)}%`,
    delay: `${-(i * 0.73) % 4.4}s`,
    dur: `${3.2 + (i % 4) * 0.55}s`,
    size: `${3 + (i % 3) * 2}px`,
    drift: `${((i % 5) - 2) * 9}px`,
  })), []);
  return (
    <div className={`buddy-fire${charged ? ' charged' : ''}`} aria-hidden="true">
      <span className="fire-glow g1" />
      <span className="fire-glow g2" />
      <span className="fire-glow g3" />
      <svg className="fire-swirl" viewBox="-50 -50 100 100">
        <path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      {embers.map((e, i) => (
        <span key={i} className="ember" style={{ left: e.left, width: e.size, height: e.size, animationDelay: e.delay, animationDuration: e.dur, '--drift': e.drift }} />
      ))}
    </div>
  );
}
