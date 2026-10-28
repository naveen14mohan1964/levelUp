import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, animate, motion, useReducedMotion } from 'motion/react';
import { api } from '../api.js';
import { useGame } from '../game.jsx';
import { levelUpConfetti } from '../lib/celebrate.js';

/** Where each roadmap's level map lives. */
export function roadmapPath(track) {
  if (track === 'ai' || track === 'lld' || track === 'hld' || track === 'judge') return `/${track}?tab=roadmap`;
  if (track === 'dsa') return '/dsa/plan';
  return `/${track}/roadmap`;
}

/** Counts from 0 to `to` (instantly with reduce motion). */
function useCountUp(to, active) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? to : 0);
  useEffect(() => {
    if (!active) return undefined;
    if (reduce) { setValue(to); return undefined; }
    const controls = animate(0, to, { duration: 1.4, ease: 'easeOut', delay: 0.35, onUpdate: (v) => setValue(Math.round(v)) });
    return () => controls.stop();
  }, [to, active, reduce]);
  return value;
}

/** A medal for the level: gradient ring, the level number, a ribbon. */
export function LevelBadge({ level, size = 132 }) {
  return (
    <svg width={size} height={size * 1.18} viewBox="0 0 120 142" role="img" aria-label={`Level ${level} badge`}>
      <defs>
        <linearGradient id="badge-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#C4B5FD" /><stop offset="0.5" stopColor="#8B5CF6" /><stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
        <radialGradient id="badge-core" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#2A1F5C" /><stop offset="1" stopColor="#120D2B" />
        </radialGradient>
      </defs>
      <path d="M38 92 L28 138 L46 128 L56 140 L60 96 Z" fill="#7C3AED" opacity="0.9" />
      <path d="M82 92 L92 138 L74 128 L64 140 L60 96 Z" fill="#22D3EE" opacity="0.85" />
      <circle cx="60" cy="56" r="52" fill="url(#badge-ring)" />
      <circle cx="60" cy="56" r="43" fill="url(#badge-core)" />
      <circle cx="60" cy="56" r="43" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
      <text x="60" y="49" textAnchor="middle" fontFamily="Geist Variable, Geist, sans-serif" fontSize="11" fontWeight="600" fill="#C4B5FD" letterSpacing="2">LEVEL</text>
      <text x="60" y="80" textAnchor="middle" fontFamily="Geist Variable, Geist, sans-serif" fontSize="34" fontWeight="700" fill="#FFFFFF">{level}</text>
    </svg>
  );
}

/**
 * Full-screen "LEVEL COMPLETE" for levels finished since the game layer started (GET /api/game → celebrate).
 * Plays once per level (POST /api/game/seen). "Continue" opens the map, which animates the unlock.
 */
export default function LevelComplete() {
  const { game, refresh } = useGame();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [hidden, setHidden] = useState(() => new Set());
  const c = (game?.celebrate || []).find((x) => !hidden.has(`${x.track}|${x.level}`)) || null;
  const xp = useCountUp(c?.xp || 0, !!c);
  const continueBtn = useRef(null);
  const key = c ? `${c.track}|${c.level}` : null;

  useEffect(() => {
    if (!c) return undefined;
    levelUpConfetti();
    const t = setTimeout(() => continueBtn.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  async function close(goToMap) {
    if (!c) return;
    setHidden((h) => new Set(h).add(key));
    api.gameSeen(c.track, c.level).then(refresh).catch(() => {});
    if (goToMap) navigate(roadmapPath(c.track), { state: { unlock: { track: c.track, from: c.level, to: c.nextLevel?.n ?? null } } });
  }

  useEffect(() => {
    if (!c) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Tab') { // keep focus on the two buttons
        const btns = [...document.querySelectorAll('.lvl-done button')];
        const i = btns.indexOf(document.activeElement);
        e.preventDefault();
        btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length]?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence>
      {c && (
        <motion.div key={key} className="lvl-done-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="lvl-done"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lvl-done-title"
            initial={{ opacity: 0, scale: 0.9, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          >
            <motion.div
              className="lvl-done-badge"
              initial={reduce ? false : { scale: 0.3, rotate: -25, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.15 }}
            >
              <LevelBadge level={c.level} />
            </motion.div>
            <div className="lvl-done-kicker">{c.trackLabel}</div>
            <h2 id="lvl-done-title" className="lvl-done-title">LEVEL COMPLETE</h2>
            <p className="lvl-done-name">Level {c.level}: {c.title}</p>
            <div className="lvl-done-xp" aria-live="polite"><span>+{xp}</span> XP</div>
            {c.nextLevel
              ? <p className="lvl-done-next">Unlocked: <strong>Level {c.nextLevel.n} · {c.nextLevel.title}</strong></p>
              : <p className="lvl-done-next"><strong>That was the last level. The whole roadmap is complete. 🏆</strong></p>}
            <div className="lvl-done-actions">
              <button ref={continueBtn} className="btn primary btn-xl" onClick={() => close(true)}>
                {c.nextLevel ? `Continue to Level ${c.nextLevel.n} →` : 'See your roadmap →'}
              </button>
              <button className="btn ghost btn-lg" onClick={() => close(false)}>Later</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
