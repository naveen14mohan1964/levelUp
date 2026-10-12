import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from './api.js';
import { todayISO } from './dates.js';

/**
 * Game data shared by the sidebar and pages: player level + XP, streak, roadmap progress (GET /api/game),
 * plus today's workout and protein goal for the sidebar's progress dots.
 * Refreshes on navigation, when the window regains focus, and whenever a page calls refreshGame() after saving.
 */
const GameContext = createContext({ game: null, today: null, gained: 0, refresh: () => {} });
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
  const [gained, setGained] = useState(0); // XP gained since the last load: drives the "+XP" in the sidebar
  const lastTotal = useRef(null);

  const refresh = useCallback(async () => {
    const date = todayISO();
    const [g, workout, goals] = await Promise.allSettled([api.game(), api.workoutDay(date), api.goals(date)]);
    if (g.status === 'fulfilled') {
      const total = g.value.player.total;
      if (lastTotal.current != null && total > lastTotal.current) setGained(total - lastTotal.current);
      lastTotal.current = total;
      setGame(g.value);
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
  return <GameContext.Provider value={{ game, today, gained, clearGained, refresh }}>{children}</GameContext.Provider>;
}

function workoutProgress(day) {
  if (day.rest) return { rest: true, done: 0, total: 0, complete: false };
  const items = day.items || [];
  return { rest: false, done: items.filter((i) => i.done).length, total: items.length, complete: !!day.complete };
}
