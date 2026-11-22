import { Link, NavLink, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { GearSix, MagnifyingGlass, Timer } from '@phosphor-icons/react';
import { NAV, areaByKey } from '../areas.js';
import { useGame } from '../game.jsx';
import { XpFloat } from './fx.jsx';
import { clock, useNow } from './TodayHero.jsx';
import { openPalette } from './CommandPalette.jsx';

/**
 * Sidebar (desktop) / header + bottom tab bar (phone). Four sections only: Today, Journey, Journal, Me.
 * Everything else (roadmaps, workout, meals, parked modules) is reached from inside Journey or Me,
 * so the navigation never asks "which of 17 things?" (choice overload is why the old sidebar felt heavy).
 */
const TRACK_KEYS = new Set(['ai', 'dsa', 'lld', 'hld', 'judge', 'fullstack', 'node']);
const PILL_SPRING = { duration: 0.5, ease: [0.22, 1, 0.36, 1] }; // base curve (landing-page-design B7)
const UNDER_ME = new Set(['me', 'report', 'progress']);

/** Which of the four sections a URL belongs to (a roadmap or the workout page lives under Journey). */
export function sectionOf(pathname) {
  const seg = pathname.split('/')[1] || 'home';
  if (seg === 'home' || seg === 'journal' || seg === 'settings') return seg;
  return UNDER_ME.has(seg) ? 'me' : 'journey';
}

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

/** The flame grows with the streak (sizes 0–5); unlit and grey before the first day. */
export function Flame({ tier }) {
  return <span className={`flame flame-${tier}`} aria-hidden="true">🔥</span>;
}

/** Consistency never drops to zero after a break, so it is the line under the XP bar (not "streak lost"). */
function consistencyText(game) {
  const c = game.growth?.consistency;
  if (c?.active) return `Active ${c.active} of the last ${c.total} days`;
  return game.streak.welcomeBack ? 'Welcome back. Five minutes makes today count.' : 'Five minutes makes today count';
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
        <span className="xp-anchor player-streak" title={streak.shields?.available ? `${streak.shields.available} streak shield${streak.shields.available === 1 ? '' : 's'}: a missed day won't break your streak. A perfect week earns another.` : 'A perfect week earns a streak shield'}>
          <Flame tier={streak.flame} />
          {streak.current > 0 && <strong className="streak-num">{streak.current}</strong>}
          {streak.shields?.available > 0 && streak.current > 0 && <span className="freeze-dot" aria-label={`${streak.shields.available} streak shield${streak.shields.available === 1 ? '' : 's'}`}>🛡{streak.shields.available > 1 ? streak.shields.available : ''}</span>}
        </span>
      </div>
      <div className="xp-bar" role="progressbar" aria-label="XP toward the next level" aria-valuemin={0} aria-valuemax={player.xpForNext} aria-valuenow={player.xpInLevel}>
        <motion.div className="xp-bar-fill" initial={false} animate={{ scaleX: fill }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
        {gained > 0 && <span className="xp-bar-float"><XpFloat amount={gained} onDone={clearGained} /></span>}
      </div>
      {!compact && <div className={`player-streak-text${game.growth?.consistency?.active ? ' on' : ''}`}>{consistencyText(game)}</div>}
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

function NavItem({ area, active, pillId }) {
  const Icon = area.Icon;
  return (
    <Link to={area.to} style={{ '--nav-color': area.color }} className={`nav-link${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
      {active && <motion.span layoutId={pillId} className="nav-pill" transition={PILL_SPRING} aria-hidden="true" />}
      <span className="nav-icon" aria-hidden="true"><Icon size={18} weight={active ? 'fill' : 'regular'} /></span>
      <span className="nav-label">{area.label}</span>
    </Link>
  );
}

export default function Sidebar() {
  const { pathname } = useLocation();
  const current = sectionOf(pathname);

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

      {/* desktop: the four sections */}
      <nav className="nav" aria-label="Sections">
        <div className="nav-group">
          {NAV.map((k, i) => (
            <motion.div key={k} initial={{ opacity: 0, x: -10, filter: 'blur(4px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: i * 0.04 }}>
              <NavItem area={areaByKey[k]} active={current === k} pillId="nav-pill" />
            </motion.div>
          ))}
        </div>
      </nav>

      {/* phone: the same four sections in a floating tab bar */}
      <nav className="tabbar" aria-label="Sections">
        {NAV.map((k) => <NavItem key={k} area={areaByKey[k]} active={current === k} pillId="tab-pill" />)}
      </nav>
    </aside>
  );
}
