import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from './api.js';
import { todayISO } from './dates.js';

/**
 * Game data shared by the sidebar and pages: player level + XP, streak, roadmap progress (GET /api/game),
 * plus today's workout and protein goal for the sidebar's progress dots.
 * Refreshes on navigation, when the window regains focus, and whenever a page calls refreshGame() after saving.
 */
// Only a few learning tracks are active at once (Settings: active_tracks); the rest are parked, with progress kept.
export const DEFAULT_ACTIVE = ['dsa', 'fullstack'];
// .NET and React became one full-stack course: an older saved choice of either means fullstack now
const normalise = (list) => [...new Set(list.map((k) => (k === 'dotnet' || k === 'react' ? 'fullstack' : k)))];
const GameContext = createContext({ game: null, today: null, active: DEFAULT_ACTIVE, name: '', gained: 0, refresh: () => {} });
const EVENT = 'levelup:refresh';

/** Ask the sidebar (and anything else using useGame) to reload, e.g. right after a lesson is marked done. */
export function refreshGame() {
  window.dispatchEvent(new Event(EVENT));
}

export function useGame() {
  return useContext(GameContext);
}

export function GameProvider({ children }) {
  const { pathname } = useLocation();
  const [game, setGame] = useState(null);
  const [today, setToday] = useState(null);
  const [prefs, setPrefs] = useState({ active: DEFAULT_ACTIVE, name: '' });
  const [gained, setGained] = useState(0); // XP gained since the last load: drives the "+XP" in the sidebar
  const lastTotal = useRef(null);

  const refresh = useCallback(async () => {
    const date = todayISO();
    const [g, workout, goals, settings] = await Promise.allSettled([api.game(), api.workoutDay(date), api.goals(date), api.settings()]);
    if (settings.status === 'fulfilled') {
      const list = normalise(String(settings.value.active_tracks || '').split(',').filter(Boolean));
      setPrefs({ active: list.length ? list : DEFAULT_ACTIVE, name: settings.value.display_name || '' });
    }
    if (g.status === 'fulfilled') {
      const total = g.value.player.total;
      if (lastTotal.current != null && total > lastTotal.current) setGained(total - lastTotal.current);
      lastTotal.current = total;
      setGame(mergeFullstack(g.value));
    }
    setToday({
      workout: workout.status === 'fulfilled' ? workoutProgress(workout.value) : null,
      protein: goals.status === 'fulfilled' ? { value: Math.round(goals.value.eaten.protein_g || 0), target: goals.value.targets.protein_g } : null,
    });
  }, []);

  useEffect(() => { refresh(); }, [pathname, refresh]);
  useEffect(() => {
    window.addEventListener(EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener(EVENT, refresh); window.removeEventListener('focus', refresh); };
  }, [refresh]);

  const clearGained = useCallback(() => setGained(0), []);
  return <GameContext.Provider value={{ game, today, active: prefs.active, name: prefs.name, gained, clearGained, refresh }}>{children}</GameContext.Provider>;
}

/**
 * Before the server has the full-stack course it still reports '.NET' and 'React' as two tracks: show them as the one
 * 'Full stack' track (.NET weeks first, then React). apiKey = the key the server expects for that track's next lesson.
 * Once the server sends 'fullstack' itself this changes nothing.
 */
function mergeFullstack(game) {
  if (game.tracks.some((t) => t.key === 'fullstack')) return game;
  const net = game.tracks.find((t) => t.key === 'dotnet');
  const web = game.tracks.find((t) => t.key === 'react');
  if (!net && !web) return game;
  const parts = [net, web].filter(Boolean);
  const done = parts.reduce((n, t) => n + t.done, 0);
  const total = parts.reduce((n, t) => n + t.total, 0);
  const offset = net?.levelsTotal || 0;
  const from = net?.next ? net : web?.next ? web : null;
  const merged = {
    key: 'fullstack', label: 'Full stack', apiKey: from?.key || net?.key || web.key, done, total,
    pct: total ? Math.round((done / total) * 100) : 0,
    levelsComplete: parts.reduce((n, t) => n + (t.levelsComplete || 0), 0),
    levelsTotal: parts.reduce((n, t) => n + (t.levelsTotal || 0), 0),
    currentLevel: from === web ? offset + (web.currentLevel || 1) : net?.currentLevel || 1,
    next: from ? { ...from.next, level: from === web ? offset + from.next.level : from.next.level } : null,
  };
  const at = game.tracks.findIndex((t) => t === net || t === web);
  const tracks = game.tracks.filter((t) => t !== net && t !== web);
  tracks.splice(at, 0, merged);
  const focus = game.focus && (game.focus.track === 'dotnet' || game.focus.track === 'react') ? { ...game.focus, track: 'fullstack', apiTrack: game.focus.track } : game.focus;
  return { ...game, tracks, focus };
}

function workoutProgress(day) {
  if (day.rest) return { rest: true, done: 0, total: 0, complete: false };
  const items = day.items || [];
  return { rest: false, done: items.filter((i) => i.done).length, total: items.length, complete: !!day.complete };
}
