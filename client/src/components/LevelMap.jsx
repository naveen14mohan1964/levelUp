import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'motion/react';
import { LockBadge, Stagger, StaggerItem } from './fx.jsx';
import { ProgressBar } from './ui.jsx';

/**
 * Game-style level map for any roadmap (data: GET /api/game/track/:key).
 *   complete → green ✓ card (tap to review)   current → big hero card with the glowing border + its lessons
 *   open     → unlocked but behind you (catch-up)   locked → dimmed with a lock and the reason; no "0/5" counts
 * A path rail joins the levels. Pages pass renderLesson to show their own lesson rows (checkboxes, links, notes…).
 *
 * Unlock animation: arriving with location.state.unlock = { track, from, to } (from "Continue" on LEVEL COMPLETE) plays
 *   the finished level pops green → a glowing path draws down → the next lock shakes and breaks → it grows into the hero.
 * It plays once (the state is cleared afterwards); with reduce motion it jumps straight to the end.
 */
const UNLOCK_AT = { path: 600, lock: 1350, open: 2150, end: 2900 }; // ms after arriving
export default function LevelMap({ track, levelKicker, levelExtra, renderLesson, unlockHint }) {
  const reduce = useReducedMotion();
  const currentRef = useRef(null);
  const [openLevels, setOpenLevels] = useState({});
  const toggle = (n) => setOpenLevels((o) => ({ ...o, [n]: !o[n] }));
  const location = useLocation();
  const navigate = useNavigate();
  const unlock = location.state?.unlock?.track === track.key ? location.state.unlock : null;
  const [phase, setPhase] = useState(null); // null | complete | path | lock | open
  const fromRef = useRef(null);

  // Bring the current level into view when the map opens, but only if it's off-screen (the page header stays put otherwise).
  useEffect(() => {
    if (unlock) return;
    const el = currentRef.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }, [track.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // The unlock sequence after "Continue to Level N".
  useEffect(() => {
    if (!unlock) return undefined;
    const clearState = () => navigate(location.pathname + location.search, { replace: true, state: null });
    const toCurrent = (smooth) => currentRef.current?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' });
    if (reduce || !unlock.to) {
      setPhase(null);
      const t = setTimeout(() => { toCurrent(false); clearState(); }, 50);
      return () => clearTimeout(t);
    }
    setPhase('complete');
    const t0 = setTimeout(() => fromRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30);
    const timers = [
      t0,
      setTimeout(() => setPhase('path'), UNLOCK_AT.path),
      setTimeout(() => setPhase('lock'), UNLOCK_AT.lock),
      setTimeout(() => { setPhase('open'); setTimeout(() => toCurrent(true), 60); }, UNLOCK_AT.open),
      setTimeout(() => { setPhase(null); clearState(); }, UNLOCK_AT.end),
    ];
    return () => timers.forEach(clearTimeout);
  }, [location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const animating = !!(phase && unlock);
  // While the lock is still closed, the next level is drawn locked (the data already says it's open).
  const statusOf = (lv) => (animating && lv.n === unlock.to && phase !== 'open' ? 'locked' : lv.status);

  const total = track.levels.length;
  return (
    <ol className="lmap" aria-label={`${track.label} level map`}>
      {track.levels.map((lv, i) => {
        const prev = track.levels[i - 1];
        const status = statusOf(lv);
        const isOpen = status === 'current' || !!openLevels[lv.n];
        const justDone = animating && lv.n === unlock.from;
        const breaking = animating && lv.n === unlock.to && phase === 'lock';
        const arriving = animating && lv.n === unlock.to && phase === 'open';
        const kicker = levelKicker ? levelKicker(lv) : `Level ${lv.n} of ${total}`;
        const segDone = status === 'complete';
        return (
          <li
            key={lv.n}
            className={`lmap-level is-${status}${segDone ? ' seg-done' : ''}${justDone ? ' just-done' : ''}${breaking ? ' breaking' : ''}${arriving ? ' arriving' : ''}`}
            ref={status === 'current' ? currentRef : justDone ? fromRef : undefined}
          >
            <div className="lmap-node" aria-hidden="true">
              {status === 'complete' ? '✓' : status === 'locked' ? (breaking ? <BreakingLock /> : <LockIcon />) : lv.n}
            </div>
            {justDone && ['path', 'lock', 'open'].includes(phase) && <span className="lmap-path-anim" aria-hidden="true" />}

            {status === 'current' ? (
              <section className="card lmap-card lmap-hero glow-active" aria-label={`Current level: ${lv.title}`}>
                <div className="lmap-kicker"><span className="lmap-now">Current level</span> · {kicker}</div>
                <h3 className="lmap-hero-title">{lv.title}</h3>
                {lv.goal && <p className="lmap-goal">{lv.goal}</p>}
                <div className="lmap-progress">
                  <ProgressBar value={lv.done} total={lv.total} />
                  <span className="small nowrap">{lv.done ? `${lv.done} of ${lv.total} done` : `${lv.total} lessons · start with the first`}</span>
                </div>
                {levelExtra?.(lv)}
                <Stagger className="lmap-lessons">
                  {lv.lessons.map((x, j) => (
                    <StaggerItem key={x.ref} index={j}>{renderLesson(x, lv)}</StaggerItem>
                  ))}
                </Stagger>
              </section>
            ) : status === 'locked' ? (
              <div className="card lmap-card is-locked" aria-disabled="true" tabIndex={0} aria-label={`${kicker}: ${lv.title}. Locked: ${unlockHint ? unlockHint(lv, prev) : `finish Level ${prev?.n ?? lv.n - 1} to unlock`}`}>
                <div className="lmap-kicker">{kicker}</div>
                <div className="lmap-row">
                  <h3 className="lmap-title">{lv.title}</h3>
                  <LockBadge reason={unlockHint ? unlockHint(lv, prev) : `Finish Level ${prev?.n ?? lv.n - 1} to unlock`} />
                </div>
              </div>
            ) : (
              <div className={`card lmap-card${status === 'complete' ? ' lmap-done' : ''}`}>
                <button className="lmap-head" onClick={() => toggle(lv.n)} aria-expanded={isOpen}>
                  <span className="lmap-head-text">
                    <span className="lmap-kicker">{kicker}</span>
                    <span className="lmap-title">{lv.title}</span>
                  </span>
                  <span className="lmap-count">
                    {status === 'complete' ? `✓ ${lv.total}/${lv.total}` : lv.done ? `${lv.done} of ${lv.total} · catch up` : 'Open · catch up'}
                  </span>
                  <span className="chev" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                </button>
                {isOpen && <div className="lmap-lessons">{lv.lessons.map((x) => <div key={x.ref}>{renderLesson(x, lv)}</div>)}</div>}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** The lock that breaks open: the shackle flies up, the body pops and fades (CSS: .breaking). */
function BreakingLock() {
  return (
    <svg className="lock-breaking" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path className="lock-shackle" d="M8 11V7a4 4 0 0 1 8 0v4" />
      <rect className="lock-body" x="4" y="11" width="16" height="10" rx="2" />
    </svg>
  );
}

export function LockIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** Default lesson row: status icon, title, meta, and an optional link/action on the right. */
export function LessonRow({ lesson, meta, children }) {
  const s = lesson.status;
  return (
    <div className={`lrow is-${s}`} aria-disabled={s === 'locked' || undefined}>
      <span className="lrow-icon" aria-hidden="true">{s === 'done' ? '✓' : s === 'locked' ? <LockIcon size={12} /> : s === 'current' ? '▶' : '○'}</span>
      <span className="lrow-main">
        <span className="lrow-title">{children || lesson.title}</span>
        {meta && <span className="lrow-meta">{meta}</span>}
      </span>
      {s === 'current' && <span className="lrow-next">Next</span>}
      {s === 'locked' && <span className="sr-only">Locked: finish the lesson before it first</span>}
    </div>
  );
}
