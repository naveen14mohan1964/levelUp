import { useEffect, useRef, useState } from 'react';
import { FLOOR, poseAt, rig } from '../lib/stickman.js';
import { MOVES } from '../lib/moves.js';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// A looping stick-figure demo drawn to match the plan exactly (your wall, chair, sofa, band). Like a GIF, but drawn live.
export default function StickDemo({ move, label }) {
  const m = MOVES[move];
  const [ms, setMs] = useState(0);
  const start = useRef(null);

  useEffect(() => {
    if (!m || reducedMotion()) return undefined;
    let raf;
    const tick = (t) => {
      start.current ??= t;
      setMs(t - start.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [m]);

  if (!m) return null;
  // Reduced motion: show the key positions side by side instead of animating.
  const poses = reducedMotion() ? m.frames.map((f) => f.pose) : [poseAt(m.frames, ms)];
  return (
    <figure className="stick-demo">
      <svg viewBox={`0 -16 ${200 * poses.length} 166`} role="img" aria-label={`${label}: animated demo`}>
        {poses.map((p, i) => (
          <g key={i} transform={`translate(${200 * i} 0)`}>
            <Props props={m.props} />
            <Figure g={rig(p)} />
          </g>
        ))}
      </svg>
      {m.caption && <figcaption className="small muted">{m.caption}</figcaption>}
    </figure>
  );
}

function Props({ props }) {
  return (
    <>
      <line x1="0" y1={FLOOR} x2="200" y2={FLOOR} className="sd-floor" />
      {props.map((p, i) => {
        if (p.type === 'wall') return <rect key={i} x={p.x} y="8" width="7" height={FLOOR - 8} className="sd-prop" />;
        if (p.type === 'mat') return <rect key={i} x="18" y={FLOOR - 2} width="168" height="4" rx="2" className="sd-mat" />;
        return null;
      })}
    </>
  );
}

const pts = (...p) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

function Figure({ g }) {
  const limbs = (L, cls) => (
    <g className={cls}>
      <polyline points={pts(g.shoulder, L.elbow, L.hand)} />
      <polyline points={pts(g.hip, L.knee, L.ankle, L.toe)} />
    </g>
  );
  return (
    <g className="sd-figure">
      {limbs(g.far, 'sd-far')}
      <polyline points={pts(g.hip, g.shoulder, g.neck)} className="sd-near" />
      {limbs(g.near, 'sd-near')}
      <circle cx={g.head[0]} cy={g.head[1]} r="8" className="sd-head" />
    </g>
  );
}
