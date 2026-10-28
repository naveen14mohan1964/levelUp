import { useRef, useState } from 'react';
import { EmptyState, GlowBorder, LockBadge, Stagger, StaggerItem, TiltCard, XpFloat } from '../components/fx.jsx';
import { ProgressBar, ProgressRing } from '../components/ui.jsx';
import { burst, levelUpConfetti } from '../lib/celebrate.js';
import { BUDDY_STATES } from '../components/StudyBuddy.jsx';
import Buddy from '../components/Buddy.jsx';

/**
 * /design: a living preview of the design system's building blocks (not in the menu).
 * Use it to check colours, glass, motion and reduced-motion behaviour before using a block on a real page.
 */
const SWATCHES = [
  ['--brand', 'Violet', 'Brand · active level · primary buttons'],
  ['--streak', 'Amber', 'Streak + today\'s task only'],
  ['--success', 'Green', 'Completion only'],
  ['--focus', 'Cyan', 'Focus rings + progress bars'],
  ['--danger', 'Red', 'Delete / real errors only, never "missed"'],
];

export default function DesignPreview() {
  const [xp, setXp] = useState(null);
  const doneRef = useRef(null);
  function complete() {
    burst(doneRef.current);
    setXp(Date.now());
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Design system</h1>
          <div className="muted small">Building blocks for the Level Up redesign · rules in .claude/skills/level-up-design</div>
        </div>
      </div>

      <section className="card">
        <h2>Study buddy: every state</h2>
        <div className="buddy-grid">
          {BUDDY_STATES.map((st) => <div key={st} className="card"><strong className="small">{st}</strong><Buddy state={st} size={220} /></div>)}
        </div>
      </section>

      <section className="card">
        <h2>Colour meanings</h2>
        <div className="ds-swatches">
          {SWATCHES.map(([v, name, use]) => (
            <div key={v} className="ds-swatch"><i style={{ background: `var(${v})` }} /><strong>{name}</strong><span>{use}</span></div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Type, buttons, progress</h2>
        <h3 style={{ margin: '0 0 0.25rem', fontSize: '1.9rem' }}>Space Grotesk heading · 1,250 XP</h3>
        <p className="muted" style={{ marginTop: 0 }}>Inter body text: calm, readable, and quick to scan.</p>
        <div className="ds-row">
          <button className="btn primary">Start lesson</button>
          <button className="btn">Secondary</button>
          <a href="#focus" className="link-btn">A link (Tab to see the focus ring)</a>
        </div>
        <div className="ds-row top-gap">
          <ProgressBar value={3} total={5} />
          <ProgressBar value={5} total={5} />
          <ProgressRing value={3} total={5} size={58} stroke={6} />
          <ProgressRing value={5} total={5} size={58} stroke={6} />
        </div>
      </section>

      <h2>Cards: tilt, glow, locked</h2>
      <Stagger className="ds-grid">
        <StaggerItem index={0}>
          <TiltCard className="card ds-tile">
            <h3>✅ Completed level</h3>
            <span className="small muted">Hover me: 3D tilt + glare (mouse only, off with reduce motion)</span>
          </TiltCard>
        </StaggerItem>
        <StaggerItem index={1}>
          <GlowBorder className="card ds-tile">
            <h3>🎯 Current level</h3>
            <span className="small muted">Animated glow border: only on the one active item</span>
          </GlowBorder>
        </StaggerItem>
        <StaggerItem index={2}>
          <div className="card ds-tile is-locked" aria-disabled="true">
            <h3>Level 3 · RAG</h3>
            <LockBadge reason="Finish Level 2 to unlock" />
          </div>
        </StaggerItem>
      </Stagger>

      <section className="card">
        <h2>Empty state (instead of a bare zero)</h2>
        <EmptyState icon="🔥" title="Start your streak today" action={<button className="btn primary">Just 5 minutes</button>}>
          Five focused minutes counts. Small steps build the habit.
        </EmptyState>
      </section>

      <section className="card">
        <h2>Celebrations</h2>
        <div className="ds-row">
          <span className="xp-anchor">
            <button ref={doneRef} className="btn primary" onClick={complete}>✅ Done: next lesson</button>
            {xp && <XpFloat key={xp} amount={25} onDone={() => setXp(null)} />}
          </span>
          <button className="btn" onClick={() => levelUpConfetti()}>🏆 Level-complete confetti</button>
        </div>
        <p className="small muted">With "reduce motion" on: no confetti, and +XP shows as a short static toast.</p>
      </section>
    </>
  );
}
