import { useEffect, useRef } from 'react';
import { todayISO } from '../dates.js';
import { notify, oncePerDay } from './pwa.js';

/**
 * Local desktop nudges while the app is open (checked every minute, each at most once a day):
 *   21:00+  streak at risk: no focus minutes yet today
 *   07:00+  flashcards due (when there are any)
 */
export function useReminders(game) {
  const g = useRef(game);
  g.current = game;
  useEffect(() => {
    const check = () => {
      const game = g.current;
      if (!game) return;
      const day = todayISO();
      const h = new Date().getHours();
      if (h >= 21 && !game.streak?.todayActive && !game.focus && oncePerDay('streak', day)) {
        const n = game.streak?.current || 0;
        notify(n ? `🔥 ${n}-day streak at risk` : '🔥 Start a streak tonight', 'No focus minutes yet today. 5 minutes keeps it alive.', { url: '/', tag: 'streak' });
      }
      const due = game.cards?.due || 0;
      if (h >= 7 && due > 0 && oncePerDay('cards', day)) {
        notify(`🃏 ${due} flashcard${due === 1 ? '' : 's'} due`, 'A 5-minute review keeps them in long-term memory.', { url: '/cards', tag: 'cards' });
      }
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, []);
}
