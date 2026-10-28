import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { GearSix, List, MagnifyingGlass, Timer, X } from '@phosphor-icons/react';
import { AREAS, areaByKey } from '../areas.js';
import { useGame } from '../game.jsx';
import { XpFloat } from './fx.jsx';
import { clock, useNow } from './TodayHero.jsx';
import { openPalette } from './CommandPalette.jsx';

/**
 * Sidebar (desktop) / header + bottom tab bar (phone): player level + XP bar + streak flame on top,
 * a glowing pill on the active section, and a small progress ring per section.
 */
const PRIMARY = ['home', 'dsa', 'ai', 'workout']; // phone tab bar; everything else lives under "More"
const TRACK_KEYS = new Set(['ai', 'dsa', 'lld', 'hld', 'judge', 'react', 'dotnet', 'node']);
const PILL_SPRING = { duration: 0.5, ease: [0.22, 1, 0.36, 1] }; // base curve (landing-page-design B7)
// Desktop nav groups (AREAS keeps the canonical order for the command palette)
const GROUPS = [
  { label: null, keys: ['home'] },
  { label: 'Learn', keys: ['dsa', 'ai', 'lld', 'hld', 'judge', 'react', 'dotnet', 'node', 'assignments', 'cards'] },
  { label: 'Body', keys: ['workout', 'meals', 'progress'] },
  { label: 'Career', keys: ['linkedin', 'mentor', 'report'] },
];
const SETTINGS_AREA = { key: 'settings', to: '/settings', label: 'Settings', icon: '⚙️', Icon: GearSix, color: 'var(--muted)' };

/** Progress for a section's ring: { value, total, label } or null (no ring). Labels never show a bare zero. */
export function sectionProgress(key, game, today) {
  if (TRACK_KEYS.has(key)) {
    const t = game?.tracks.find((x) => x.key === key);
    if (!t) return null;
    return { value: t.done, total: t.total, label: t.done ? `${t.done} of ${t.total} lessons done` : 'Your first lesson is ready' };
  }
  if (key === 'cards' && game?.cards && (game.cards.due || game.cards.reviewedToday)) {
    const c = game.cards;
    return { value: c.reviewedToday, total: c.reviewedToday + c.due, label: c.due ? `${c.due} flashcard${c.due === 1 ? '' : 's'} due today` : 'Today\'s flashcards are done' };
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
        <span className="xp-anchor player-streak" title={streak.shields?.available ? `${streak.shields.available} streak shield${streak.shields.available === 1 ? '' : 's'}: a missed day won't break your streak. A perfect week earns another.` : 'No streak shield right now: a perfect week earns one'}>
          <Flame tier={streak.flame} />
          {streak.current > 0 && <strong className="streak-num">{streak.current}</strong>}
          {streak.shields?.available > 0 && streak.current > 0 && <span className="freeze-dot" aria-label={`${streak.shields.available} streak shield${streak.shields.available === 1 ? '' : 's'}`}>🛡{streak.shields.available > 1 ? streak.shields.available : ''}</span>}
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
      <Timer size={14} weight="bold" aria-hidden="true" /> <strong>{left ? clock(left) : "Time's up"}</strong> <span>{left ? 'focus' : '· open Today'}</span>
    </Link>
  );
}

function NavItem({ area, progress, pillId, onClick }) {
  const Icon = area.Icon;
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
          <span className="nav-icon" aria-hidden="true">{Icon ? <Icon size={18} weight={isActive ? 'fill' : 'regular'} /> : area.icon}</span>
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
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="brand">
        <img src="/favicon.svg" alt="" className="brand-mark" /> Level Up
        <button className="icon-btn palette-btn" onClick={openPalette} aria-label="Search and commands (Ctrl+K)" title="Search and commands (Ctrl+K)"><MagnifyingGlass size={18} /></button>
        <NavLink to="/settings" className={({ isActive }) => `icon-btn settings-link${isActive ? ' active' : ''}`} aria-label="Settings" title="Settings"><GearSix size={18} /></NavLink>
      </div>
      <div className="player-desktop"><PlayerCard /></div>
      <div className="player-phone"><PlayerCard compact /></div>

      {/* desktop: every section, grouped; links settle in one after another on first load */}
      <nav className="nav" aria-label="Sections">
        {GROUPS.map((g) => (
          <div key={g.keys[0]} className="nav-group">
            {g.label && <div className="nav-group-label">{g.label}</div>}
            {g.keys.map((k) => (
              <motion.div key={k} initial={{ opacity: 0, x: -10, filter: 'blur(4px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: Math.min(AREAS.findIndex((a) => a.key === k) * 0.03, 0.4) }}>
                <NavItem area={areaByKey[k]} progress={prog(k)} pillId="nav-pill" />
              </motion.div>
            ))}
          </div>
        ))}
      </nav>

      {/* phone: 4 main sections + More */}
      <nav className="tabbar" aria-label="Sections">
        {PRIMARY.map((k) => <NavItem key={k} area={areaByKey[k]} progress={prog(k)} pillId="tab-pill" />)}
        <button ref={moreBtn} className={`nav-link more-btn${inMore ? ' active' : ''}`} aria-expanded={moreOpen} aria-haspopup="dialog" onClick={() => setMoreOpen(true)}>
          {inMore && <motion.span layoutId="tab-pill" className="nav-pill" transition={PILL_SPRING} aria-hidden="true" />}
          <span className="nav-icon" aria-hidden="true"><List size={20} weight={inMore ? 'bold' : 'regular'} /></span>
          <span className="nav-label">More</span>
        </button>
      </nav>
      <AnimatePresence>
        {moreOpen && <MoreSheet onClose={() => { setMoreOpen(false); moreBtn.current?.focus(); }} prog={prog} />}
      </AnimatePresence>
    </aside>
  );
}

// Menu links arrive one after another in reading order: 24px up + fade, staggered, whole sequence within 400 ms
const SHEET_LIST = { show: { transition: { staggerChildren: 0.025, delayChildren: 0.08 } } };
const SHEET_ITEM = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

/** Phone "More": a full-height panel with the other sections + Settings. Esc or the close button closes it; focus stays inside. */
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
      <motion.div
        ref={ref}
        className="more-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="More sections"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="sheet-top">
          <span className="sheet-title">All sections</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close menu">
            <motion.span initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} style={{ display: 'flex' }}>
              <X size={20} />
            </motion.span>
          </button>
        </div>
        <motion.div className="more-grid" variants={SHEET_LIST} initial="hidden" animate="show">
          {[...rest, SETTINGS_AREA].map((a) => (
            <motion.div key={a.key} variants={SHEET_ITEM}>
              <NavItem area={a} progress={a.key === 'settings' ? null : prog(a.key)} pillId="sheet-pill" />
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </>
  );
}
