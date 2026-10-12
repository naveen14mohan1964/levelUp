import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AREAS, areaByKey } from '../areas.js';
import { useGame } from '../game.jsx';
import { XpFloat } from './fx.jsx';
import { clock, useNow } from './TodayHero.jsx';

/**
 * Sidebar (desktop) / header + bottom tab bar (phone): player level + XP bar + streak flame on top,
 * a glowing pill on the active section, and a small progress ring per section.
 */
const PRIMARY = ['home', 'dsa', 'ai', 'workout']; // phone tab bar; everything else lives under "More"
const TRACK_KEYS = new Set(['ai', 'dsa', 'lld', 'hld', 'react', 'dotnet', 'node']);
const PILL_SPRING = { type: 'spring', stiffness: 420, damping: 34 };

/** Progress for a section's ring: { value, total, label } or null (no ring). Labels never show a bare zero. */
function sectionProgress(key, game, today) {
  if (TRACK_KEYS.has(key)) {
    const t = game?.tracks.find((x) => x.key === key);
    if (!t) return null;
    return { value: t.done, total: t.total, label: t.done ? `${t.done} of ${t.total} lessons done` : 'Your first lesson is ready' };
  }
  if (key === 'workout' && today?.workout && !today.workout.rest) {
    const w = today.workout;
    return { value: w.complete ? w.total : w.done, total: w.total, label: w.complete ? 'Today\'s workout is done' : w.done ? `${w.done} of ${w.total} moves done today` : 'Today\'s workout is ready' };
  }
  if (key === 'meals' && today?.protein?.target) {
    const p = today.protein;
    return { value: Math.min(p.value, p.target), total: p.target, label: p.value ? `Protein ${p.value} of ${p.target} g today` : `Protein goal today: ${p.target} g` };
  }
  return null;
}

function MiniRing({ value, total }) {
  const size = 18;
  const r = 7;
  const c = 2 * Math.PI * r;
  const pct = total ? Math.min(value / total, 1) : 0;
  const color = pct >= 1 ? 'var(--success)' : 'var(--focus)';
  return (
    <svg className="mini-ring" width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r={r} fill="none" stroke="var(--glass-border)" strokeWidth="2.5" />
      {pct > 0 && (
        <circle cx="9" cy="9" r={r} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 9 9)" />
      )}
      {pct >= 1 && <path d="M5.8 9.2l2.1 2.1 4.3-4.4" fill="none" stroke="var(--success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

/** The flame grows with the streak (sizes 0–5); unlit and grey before the first day. */
export function Flame({ tier }) {
  return <span className={`flame flame-${tier}`} aria-hidden="true">🔥</span>;
}

function streakText(s) {
  if (!s) return '';
  if (s.current > 0) return s.todayActive ? `${s.current}-day streak` : `${s.current}-day streak · 5 min today keeps it`;
  if (s.welcomeBack) return 'Welcome back! 5 minutes restarts your streak';
  return 'Start your streak today';
}

function PlayerCard({ compact = false }) {
  const { game, gained, clearGained } = useGame();
  if (!game) return <div className={`player${compact ? ' compact' : ''} player-loading`} aria-hidden="true" />;
  const { player, streak } = game;
  const fill = player.xpInLevel / player.xpForNext;
  const xpLabel = player.total ? `${player.xpInLevel} / ${player.xpForNext} XP to level ${player.level + 1}` : 'Earn your first XP: start a lesson';
  return (
    <div className={`player${compact ? ' compact' : ''}`}>
      <div className="player-top">
        <span className="level-badge" title={`Level ${player.level}`}>
          <span className="sr-only">Level </span>{player.level}
        </span>
        <div className="player-info">
          <div className="player-level">Level {player.level}</div>
          {!compact && <div className="player-xp-text">{xpLabel}</div>}
        </div>
        <span className="xp-anchor player-streak" title={streak.freeze.available ? 'Streak freeze ready: one missed day this week won\'t break your streak' : 'This week\'s streak freeze is used'}>
          <Flame tier={streak.flame} />
          {streak.current > 0 && <strong className="streak-num">{streak.current}</strong>}
          {streak.freeze.available && streak.current > 0 && <span className="freeze-dot" aria-label="Streak freeze ready">❄</span>}
        </span>
      </div>
      <div className="xp-bar" role="progressbar" aria-label="XP toward the next level" aria-valuemin={0} aria-valuemax={player.xpForNext} aria-valuenow={player.xpInLevel}>
        <motion.div className="xp-bar-fill" initial={false} animate={{ scaleX: fill }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
        {gained > 0 && <span className="xp-bar-float"><XpFloat amount={gained} onDone={clearGained} /></span>}
      </div>
      {!compact && <div className={`player-streak-text${streak.current > 0 ? ' on' : ''}`}>{streakText(streak)}</div>}
      {game.focus && <FocusChip focus={game.focus} />}
    </div>
  );
}

/** Running focus timer, visible on every page; opens Today. */
function FocusChip({ focus }) {
  const now = useNow(true);
  const left = Math.max(0, focus.plannedMin * 60 - (now - focus.startedMs) / 1000);
  return (
    <Link to="/" className="focus-chip" aria-label={left ? `Focus timer: ${clock(left)} left` : 'Focus timer finished'}>
      ⏱ <strong>{left ? clock(left) : "Time's up"}</strong> <span>{left ? 'focus' : '· open Today'}</span>
    </Link>
  );
}

function NavItem({ area, progress, pillId, onClick }) {
  return (
    <NavLink
      to={area.to}
      end={area.end}
      style={{ '--nav-color': area.color }}
      className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
      title={progress?.label}
      onClick={onClick}
    >
      {({ isActive }) => (
        <>
          {isActive && <motion.span layoutId={pillId} className="nav-pill" transition={PILL_SPRING} aria-hidden="true" />}
          <span className="nav-icon">{area.icon}</span>
          <span className="nav-label">{area.label}</span>
          {progress && <MiniRing value={progress.value} total={progress.total} />}
          {progress && <span className="sr-only">: {progress.label}</span>}
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const { game, today } = useGame();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreBtn = useRef(null);
  const seg = pathname.split('/')[1] || 'home';
  const inMore = !PRIMARY.includes(seg);
  useEffect(() => { setMoreOpen(false); }, [pathname]);
  const prog = (key) => sectionProgress(key, game, today);

  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="/favicon.svg" alt="" className="brand-mark" /> Level Up
        <NavLink to="/settings" className={({ isActive }) => `settings-link${isActive ? ' active' : ''}`} aria-label="Settings" title="Settings">⚙️</NavLink>
      </div>
      <div className="player-desktop"><PlayerCard /></div>
      <div className="player-phone"><PlayerCard compact /></div>

      {/* desktop: every section */}
      <nav className="nav" aria-label="Sections">
        {AREAS.map((a) => <NavItem key={a.key} area={a} progress={prog(a.key)} pillId="nav-pill" />)}
      </nav>

      {/* phone: 4 main sections + More */}
      <nav className="tabbar" aria-label="Sections">
        {PRIMARY.map((k) => <NavItem key={k} area={areaByKey[k]} progress={prog(k)} pillId="tab-pill" />)}
        <button ref={moreBtn} className={`nav-link more-btn${inMore ? ' active' : ''}`} aria-expanded={moreOpen} aria-haspopup="dialog" onClick={() => setMoreOpen(true)}>
          {inMore && <motion.span layoutId="tab-pill" className="nav-pill" transition={PILL_SPRING} aria-hidden="true" />}
          <span className="nav-icon">☰</span>
          <span className="nav-label">More</span>
        </button>
      </nav>
      <AnimatePresence>
        {moreOpen && <MoreSheet onClose={() => { setMoreOpen(false); moreBtn.current?.focus(); }} prog={prog} />}
      </AnimatePresence>
    </aside>
  );
}

/** Phone "More" sheet: the other sections + Settings. Esc or the backdrop closes it; focus stays inside. */
function MoreSheet({ onClose, prog }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector('a, button')?.focus();
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !ref.current) return;
      const items = [...ref.current.querySelectorAll('a, button')];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const rest = AREAS.filter((a) => !PRIMARY.includes(a.key));
  return (
    <>
      <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        ref={ref}
        className="more-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="More sections"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="more-grid">
          {rest.map((a) => <NavItem key={a.key} area={a} progress={prog(a.key)} pillId="sheet-pill" />)}
          <NavItem area={{ key: 'settings', to: '/settings', label: 'Settings', icon: '⚙️', color: 'var(--muted)' }} pillId="sheet-pill" />
        </div>
        <button className="btn sheet-close" onClick={onClose}>Close</button>
      </motion.div>
    </>
  );
}
