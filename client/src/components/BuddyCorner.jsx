import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useFocus } from '../focus.jsx';
import Buddy from './Buddy.jsx';
import { useBuddyState } from './StudyBuddy.jsx';

const LINES = [
  'One more problem. Then another.',
  'Small steps, every day. That\'s the ninja way.',
  'Your future self is watching. Make him proud.',
  'Done beats perfect. Start the timer.',
  'Patterns, not problems. You\'re building patterns.',
  'Hard today, easy in the interview.',
];
const LOUD = new Set(['distracted', 'celebrate']); // states worth popping up for
const read = () => { try { return localStorage.getItem('levelup:buddyMin') === '1'; } catch { return false; } };
const save = (v) => { try { localStorage.setItem('levelup:buddyMin', v ? '1' : '0'); } catch { /* ignore */ } };

/**
 * The 3D buddy in the corner of every page (Today has the big one in its hero). He peeks over the bottom edge so he
 * never covers what you're reading, and pops up when something happens: you drift (camera guard), you earn XP,
 * a 👍 for focus, or you hover / click him (he waves and says something). "–" tucks him away (remembered).
 */
export default function BuddyCorner() {
  const { pathname } = useLocation();
  const f = useFocus();
  const state = useBuddyState({ distracted: f.distracted, watching: f.watching });
  const [min, setMin] = useState(read);
  const [wave, setWave] = useState(0);
  const [line, setLine] = useState(null);
  const [popped, setPopped] = useState(false);
  const [hover, setHover] = useState(false);
  const timer = useRef(null);
  const approve = f.watching && f.view.focusStreakMs >= 120_000 && f.view.focusStreakMs % 120_000 < 5000;

  const pop = (ms = 6000) => {
    setPopped(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setPopped(false); setLine(null); }, ms);
  };
  useEffect(() => { if (LOUD.has(state) || approve) pop(state === 'distracted' ? 60_000 : 6000); }, [state, approve]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), []);
  if (pathname === '/') return null;

  if (min) {
    return <button className="buddy-corner-tab" onClick={() => { setMin(false); save(false); }} aria-label="Show the study buddy" title="Show the study buddy">🥷</button>;
  }
  const up = popped || hover || state === 'distracted';
  return (
    <aside className={`buddy-corner${up ? ' up' : ''}`} aria-label="Study buddy" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button className="buddy-corner-hit" onClick={() => { setWave((n) => n + 1); setLine(LINES[Math.floor(Math.random() * LINES.length)]); pop(); }} aria-label="Say hi to the study buddy">
        <Buddy state={state} gaze={f.camOn ? f.view.gaze : null} approve={approve} size={140} caption={up && (!!line || state === 'distracted')} line={line} wave={wave} />
      </button>
      <button className="buddy-corner-min" onClick={() => { setMin(true); save(true); }} aria-label="Hide the study buddy">–</button>
    </aside>
  );
}
