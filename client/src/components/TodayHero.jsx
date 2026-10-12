import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatShort } from '../dates.js';
import { refreshGame } from '../game.jsx';
import { lessonLink, minutesText } from '../lib/hero.js';
import { burst } from '../lib/celebrate.js';
import { XpFloat } from './fx.jsx';
import { Md } from './ui.jsx';

/** Re-renders every second while `active` (for the timer). */
export function useNow(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/**
 * The one big card on Today: the next unlocked lesson, its estimate, a large Start, and "Just 5 minutes".
 * Start / 5 minutes run a focus timer on the server (it survives reloads); the minutes count toward the streak.
 */
export default function TodayHero({ track, reason, focus }) {
  const lesson = track.next;
  const running = focus && focus.track === track.key ? focus : null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [finished, setFinished] = useState(null); // { minutes, short } after a timer ends
  const [xp, setXp] = useState(null);
  const doneBtn = useRef(null);
  const cardRef = useRef(null);

  async function act(fn) {
    setBusy(true); setError(null);
    try { await fn(); refreshGame(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const start = (minutes) => act(async () => {
    setFinished(null);
    await api.focusStart({ track: track.key, ref: lesson.ref, ...(minutes ? { minutes } : {}) });
  });
  const stop = (auto = false) => act(async () => {
    const r = await api.focusStop(auto);
    setFinished({ minutes: r.stopped.minutes, short: running?.plannedMin <= 5 });
    if (r.stopped.minutes >= 5) burst(cardRef.current);
  });
  const markDone = () => act(async () => {
    if (running) await api.focusStop();
    await api.aiLesson(lesson.ref, { done: true });
    burst(doneBtn.current);
    setXp(Date.now());
    setFinished(null);
  });

  return (
    <section ref={cardRef} className="card hero glow-active" aria-labelledby="hero-title">
      <div className="hero-kicker">
        <span className="hero-track">🎯 Next lesson · {track.label}</span>
        <span className="hero-level">Level {lesson.level}: {lesson.levelTitle}</span>
      </div>
      <h2 id="hero-title" className="hero-title"><Md text={lesson.title} /></h2>
      <div className="hero-meta">
        <span>⏱ ~{minutesText(lesson.minutes)}</span>
        {lesson.planDate && <span>📅 planned for {formatShort(lesson.planDate)}</span>}
        {reason && <span className="hero-reason">{reason}</span>}
      </div>

      {running ? (
        <FocusPanel focus={running} busy={busy} onStop={stop} lessonTo={lessonLink(track.key, lesson)} />
      ) : finished ? (
        <div className="hero-finished" role="status">
          <strong>{finished.minutes >= 5 ? `🎉 ${finished.minutes} focused minutes. Today counts for your streak!` : `Nice start: ${finished.minutes || 'a few'} minute${finished.minutes === 1 ? '' : 's'} logged.`}</strong>
          <div className="hero-actions">
            <button className="btn primary btn-lg" disabled={busy} onClick={() => start(25)}>Keep going · 25 min</button>
            {track.key === 'ai' && <button ref={doneBtn} className="btn btn-lg" disabled={busy} onClick={markDone}>✅ Mark lesson done</button>}
            <button className="btn btn-lg ghost" onClick={() => setFinished(null)}>Done for now</button>
          </div>
        </div>
      ) : (
        <div className="hero-actions">
          <button className="btn primary btn-xl" disabled={busy} onClick={() => start()}>▶ Start</button>
          <button className="btn btn-lg" disabled={busy} onClick={() => start(5)}>⚡ Just 5 minutes</button>
          <Link className="hero-open" to={lessonLink(track.key, lesson)}>Open lesson →</Link>
          {track.key === 'ai' && (
            <span className="xp-anchor">
              <button ref={doneBtn} className="link-btn" disabled={busy} onClick={markDone}>✅ Already done? Mark it</button>
              {xp && <XpFloat key={xp} amount={25} onDone={() => setXp(null)} />}
            </span>
          )}
        </div>
      )}
      {error && <div className="form-error top-gap">{error}</div>}
    </section>
  );
}

/** Countdown + ring for the running timer; stops itself when time is up. */
function FocusPanel({ focus, busy, onStop, lessonTo }) {
  const now = useNow(true);
  const total = focus.plannedMin * 60;
  const left = Math.max(0, total - (now - focus.startedMs) / 1000);
  const fired = useRef(false);
  useEffect(() => {
    if (left <= 0 && !fired.current) { fired.current = true; onStop(true); }
  }, [left, onStop]);
  const size = 76;
  const r = 32;
  const c = 2 * Math.PI * r;
  return (
    <div className="focus-panel" role="timer" aria-label={`${clock(left)} left`}>
      <svg width={size} height={size} viewBox="0 0 76 76" aria-hidden="true">
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <circle cx="38" cy="38" r={r} fill="none" stroke="var(--focus)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - left / total)} transform="rotate(-90 38 38)" />
      </svg>
      <div className="focus-text">
        <div className="focus-clock">{clock(left)}</div>
        <div className="small muted">{focus.plannedMin <= 5 ? 'Just 5 minutes: you can stop after this' : `Focus session · ${focus.plannedMin} min`}</div>
      </div>
      <div className="hero-actions">
        <Link className="btn btn-lg" to={lessonTo}>Open lesson →</Link>
        <button className="btn btn-lg ghost" disabled={busy} onClick={() => onStop(false)}>■ Stop</button>
      </div>
    </div>
  );
}
