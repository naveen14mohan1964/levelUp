import { Component, Suspense, lazy, useEffect, useState } from 'react';
import StudyBuddy, { CAPTION } from './StudyBuddy.jsx';

const Buddy3D = lazy(() => import('./Buddy3D.jsx')); // three.js downloads only when a buddy is on screen
const BuddyHuman = lazy(() => import('./BuddyHuman.jsx')); // the humanoid (public/models/buddy); Buddy3D if it can't load

let webgl = null;
const hasWebGL = () => {
  if (webgl == null) {
    try { const c = document.createElement('canvas'); webgl = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { webgl = false; }
  }
  return webgl;
};
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;

/** If the 3D scene fails (lost GPU context, old browser), quietly show the SVG buddy instead. */
class Fallback extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/**
 * The study buddy, in 3D when the browser can (Buddy3D.jsx), else the SVG one (StudyBuddy.jsx).
 * Same props everywhere: state, gaze, approve, size, caption; plus `wave` (bump it to make him wave).
 * Overlays (the "!", Zzz, 👍, sparkles) and the caption are plain HTML on top of the canvas.
 */
export default function Buddy({ state = 'idle', gaze, approve = false, size = 230, caption = true, wave = 0, line = null, className = '' }) {
  const [still, setStill] = useState(reducedMotion);
  const [human, setHuman] = useState(true);
  useEffect(() => {
    const m = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!m) return undefined;
    const on = () => setStill(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  const svg = <StudyBuddy state={state} size={size} caption={caption} gaze={gaze} approve={approve} className={className} />;
  if (!hasWebGL()) return svg;
  return (
    <figure className={`b3 b3-${state} ${className}`} style={{ width: size }}>
      <div className="b3-stage">
        <Fallback fallback={svg}>
          <Suspense fallback={<div className="b3-loading" style={{ width: size, height: size * 1.1 }} />}>
            {human
              ? <Fallback fallback={<Buddy3D state={state} gaze={gaze} approve={approve} wave={wave} size={size} still={still} />}>
                  <BuddyHuman state={state} gaze={gaze} approve={approve} wave={wave} size={size} still={still} onError={() => setHuman(false)} />
                </Fallback>
              : <Buddy3D state={state} gaze={gaze} approve={approve} wave={wave} size={size} still={still} />}
          </Suspense>
        </Fallback>
        {state === 'distracted' && <span className="b3-bang" aria-hidden="true">!</span>}
        {state === 'sleepy' && <span className="b3-zzz" aria-hidden="true">z<small>z</small><small>z</small></span>}
        {approve && state !== 'distracted' && <span className="b3-thumb" aria-hidden="true">👍</span>}
        {state === 'celebrate' && <span className="b3-sparkles" aria-hidden="true">✨<span>⭐</span><span>✨</span></span>}
        {state === 'watching' && <span className="b3-eye" aria-hidden="true">👀</span>}
      </div>
      {caption && <figcaption className="b3-caption">{line || CAPTION[state]}</figcaption>}
    </figure>
  );
}
