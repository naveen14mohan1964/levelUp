import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CalendarBlank, CheckCircle, Clock, Lightning, Play, Stop, Target } from '@phosphor-icons/react';
import { api } from '../api.js';
import { formatShort } from '../dates.js';
import { refreshGame } from '../game.jsx';
import { lessonLink, minutesText } from '../lib/hero.js';
import { burst } from '../lib/celebrate.js';
import { XpFloat } from './fx.jsx';
import { Md } from './ui.jsx';
import { useBuddyState } from './StudyBuddy.jsx';
import Buddy from './Buddy.jsx';
import BuddyFire from './BuddyFire.jsx';
import { STATUS_TEXT } from '../lib/focusRules.js';
import SoundBar from './SoundBar.jsx';
import { DISTRACTED, useFocus } from '../focus.jsx';

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
  const [xp, setXp] = useState(null);
  const [wave, setWave] = useState(0); // click the buddy: he waves
  const doneBtn = useRef(null);
  const cardRef = useRef(null);
  // The session (camera guard, sound, auto-stop) lives at app level so it follows you to every page: see focus.jsx
  const f = useFocus();
  const g = f.view;
  const buddy = useBuddyState({ distracted: f.distracted, watching: f.watching });
  const approve = f.watching && g.focusStreakMs >= 120_000 && g.focusStreakMs % 120_000 < 5000; // a 👍 every 2 focused minutes
  // the result of the last session on this roadmap ("🎉 25 focused minutes"), until you start again or dismiss it
  const finished = f.lastStop && f.lastStop.track === track.key ? f.lastStop : null;
  const celebrated = useRef(null);
  useEffect(() => {
    if (finished && finished.minutes >= 5 && celebrated.current !== finished.at) { celebrated.current = finished.at; burst(cardRef.current); }
  }, [finished]);

  async function act(fn) {
    setBusy(true); setError(null);
    try { await fn(); refreshGame(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const start = (minutes) => act(async () => {
    f.clearLastStop();
    await api.focusStart({ track: track.key, ref: lesson.ref, ...(minutes ? { minutes } : {}) });
  });
  const [params, setParams] = useSearchParams();
  const autoStarted = useRef(false);
  useEffect(() => {
    const want = params.get('start');
    if (want == null || autoStarted.current) return;
    autoStarted.current = true;
    setParams((p) => { p.delete('start'); return p; }, { replace: true });
    const m = Number(want);
    if (!running && lesson) start(m >= 1 && m <= 180 ? m : undefined);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const stop = () => act(() => f.stopSession());
  const markDone = () => act(async () => {
    if (running) await f.stopSession();
    await api.aiLesson(lesson.ref, { done: true });
    burst(doneBtn.current);
    setXp(Date.now());
    f.clearLastStop();
  });

  return (
    <section ref={cardRef} className="card hero glow-active" aria-labelledby="hero-title">
      <div className="hero-with-buddy">
      <div>
      <div className="hero-kicker">
        <span className="hero-track"><Target size={14} weight="bold" aria-hidden="true" /> Next lesson · {track.label}</span>
        <span className="hero-level">Level {lesson.level}: {lesson.levelTitle}</span>
      </div>
      <h2 id="hero-title" className="hero-title"><Md text={lesson.title} /></h2>
      <div className="hero-meta">
        <span><Clock size={14} aria-hidden="true" /> ~{minutesText(lesson.minutes)}</span>
        {lesson.planDate && <span><CalendarBlank size={14} aria-hidden="true" /> Planned for {formatShort(lesson.planDate)}</span>}
        {reason && <span className="hero-reason">{reason}</span>}
      </div>

      {running ? (
        <>
          <FocusPanel focus={running} busy={busy} onStop={stop} lessonTo={lessonLink(track.key, lesson)} />
          <SoundBar running={!!running} />
          <GuardBar f={f} />
        </>
      ) : finished ? (
        <div className="hero-finished" role="status">
          <strong>{finished.minutes >= 5 ? `🎉 ${finished.minutes} focused minutes. Today counts for your streak!` : `Nice start: ${finished.minutes || 'a few'} minute${finished.minutes === 1 ? '' : 's'} logged.`}</strong>
          {finished.pct != null && <div className="small muted">📷 Focus on camera: {finished.pct}%{finished.pct >= 90 ? '. Locked in!' : finished.pct >= 70 ? '. Solid.' : '. Next one, phone in another room?'}</div>}
          <div className="hero-actions">
            <button className="btn primary btn-lg" disabled={busy} onClick={() => start(25)}>Keep going · 25 min</button>
            {track.key === 'ai' && <button ref={doneBtn} className="btn btn-lg" disabled={busy} onClick={markDone}><CheckCircle size={18} aria-hidden="true" /> Mark lesson done</button>}
            <button className="btn btn-lg ghost" onClick={f.clearLastStop}>Done for now</button>
          </div>
        </div>
      ) : (
        <div className="hero-actions">
          <button className="btn primary btn-xl sheen" disabled={busy} onClick={() => start()}><Play size={18} weight="fill" aria-hidden="true" /> Start</button>
          <button className="btn btn-lg" disabled={busy} onClick={() => start(5)}><Lightning size={18} aria-hidden="true" /> Just 5 minutes</button>
          <Link className="hero-open" to={lessonLink(track.key, lesson)}>Open lesson <ArrowRight size={14} aria-hidden="true" /></Link>
          {track.key === 'ai' && (
            <span className="xp-anchor">
              <button ref={doneBtn} className="link-btn" disabled={busy} onClick={markDone}>Already done? Mark it</button>
              {xp && <XpFloat key={xp} amount={25} onDone={() => setXp(null)} />}
            </span>
          )}
        </div>
      )}
      {error && <div className="form-error top-gap">{error}</div>}
      </div>
      <div className="hero-buddy"><BuddyFire charged={!!running} /><button className="buddy-hit" onClick={() => setWave((n) => n + 1)} aria-label="Say hi to the study buddy"><Buddy state={buddy} size={230} gaze={f.camOn ? g.gaze : null} approve={approve} wave={wave} /></button></div>
      </div>
    </section>
  );
}

/** The camera focus guard's controls (the live preview is in the floating FocusDock, which follows you to every page). */
function GuardBar({ f }) {
  const { camOn, view, readingNotes, officeMode, faahOn } = f;
  const [sounds, setSounds] = useState([]);
  const [upErr, setUpErr] = useState(null);
  const loadSounds = () => api.guardSounds().then((r) => setSounds(r.sounds)).catch(() => {});
  useEffect(() => { if (faahOn) loadSounds(); }, [faahOn]);
  const addSound = async (file) => {
    if (!file) return;
    setUpErr(null);
    const fd = new FormData(); fd.append('file', file);
    try { const r = await api.guardSoundAdd(fd); await loadSounds(); f.setAlarmSound(`file:${r.name}`); } catch (e) { setUpErr(e.message); }
  };
  const distracted = DISTRACTED.includes(view.status);
  return (
    <div className={`guard${camOn ? ' on' : ''}${distracted ? ' alert' : ''}`}>
      <div className="guard-row">
        <button className={`btn${camOn ? ' primary' : ''}`} onClick={f.toggleCam} aria-pressed={camOn}>{camOn ? '📷 Watching you · stop camera' : '📷 Watch me (camera)'}</button>
        {camOn && <span className="guard-dot" aria-hidden="true" />}
        {camOn && (
          <span className="guard-status" role="status">
            {STATUS_TEXT[view.status] || view.status}
            {distracted && view.level >= 1 ? (view.level === 2 ? ' · alarm' : ' · come back') : ''}
            {view.status !== 'starting' && view.status !== 'calibrating' && view.status !== 'error' ? ` · ${view.pct}% focused` : ''}
          </span>
        )}
      </div>
      {camOn && (
        <div className="guard-row">
          <div className="guard-options small">
            <label className="check"><input type="checkbox" checked={readingNotes} onChange={f.toggleReadingNotes} /> 📖 Reading notes (looking down is fine)</label>
            <label className="check"><input type="checkbox" checked={officeMode} onChange={f.toggleOfficeMode} /> 🔇 Office mode (screen flash, no sound)</label>
            <label className="check" title={officeMode ? 'Turn office mode off to use it' : ''}>
              <input type="checkbox" checked={faahOn && !officeMode} disabled={officeMode} onChange={f.toggleFaah} /> 📢 Loud alarm: look away and it shouts for 12 s+, laptop volume to 100% (yours comes back after)
            </label>
            {faahOn && !officeMode && (
              <div className="alarm-pick">
                <select value={f.alarmSound} onChange={(e) => f.setAlarmSound(e.target.value)} aria-label="Alarm sound">
                  <option value="faah">Faaah (built in)</option>
                  <option value="padi-mass">🎬 Mass hero: Rajini-style punch dialogues (5, taking turns)</option>
                  <option value="padi-me">"Padi da, {f.alarmName || 'Naveen'} ehh!" (spoken)</option>
                  <option value="padi">"Padi da, Parama!" (spoken)</option>
                  <option value="mix">Faaah + Padi da, Parama!</option>
                  {sounds.map((s) => <option key={s.name} value={`file:${s.name}`}>🎵 {s.name}</option>)}
                  {sounds.map((s) => <option key={`m-${s.name}`} value={`clipmass:${s.name}`}>🎵 {s.name} + 🎬 mass line</option>)}
                </select>
                {(f.alarmSound === 'padi-me' || f.alarmSound === 'padi-mass') && <input className="alarm-name" value={f.alarmName} onChange={(e) => f.setAlarmName(e.target.value)} aria-label="Name in the alarm" placeholder="Your name" />}
                <button className="link-btn" onClick={f.testAlarm}>▶ Preview (your current volume)</button>
                <label className="link-btn upload-sound">+ Add your own sound<input type="file" accept="audio/*" onChange={(e) => addSound(e.target.files?.[0])} hidden /></label>
                <span className="muted">Your files stay on this laptop (server/uploads/sounds, never committed).</span>
                {upErr && <span className="form-error">{upErr}</span>}
              </div>
            )}
            <button className="link-btn" onClick={f.recalibrate}>↺ Re-learn my position</button>
            <span className="muted">Keeps watching on every page and while you study in another tab (YouTube, lesson links): facing the screen counts as studying. Runs only in this browser; nothing is recorded or sent.</span>
          </div>
        </div>
      )}
      {!camOn && <p className="small muted guard-note">Off by default. Turn it on for this session and the buddy watches: a chime after 15 s away, an alarm after 45 s.</p>}
      {view.error && (
        <div className="form-error">
          {view.error}
          {view.stale && <> <button className="btn" onClick={() => window.location.reload()}>↻ Reload now</button></>}
        </div>
      )}
    </div>
  );
}

/** Countdown + ring for the running timer (focus.jsx stops it when time is up, on any page). */
function FocusPanel({ focus, busy, onStop, lessonTo }) {
  const now = useNow(true);
  const total = focus.plannedMin * 60;
  const left = Math.max(0, total - (now - focus.startedMs) / 1000);
  const size = 76;
  const r = 32;
  const c = 2 * Math.PI * r;
  return (
    <div className="focus-panel" role="timer" aria-label={`${clock(left)} left`}>
      <svg width={size} height={size} viewBox="0 0 76 76" aria-hidden="true">
        <circle cx="38" cy="38" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="6" />
        <circle cx="38" cy="38" r={r} fill="none" stroke="var(--focus)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - left / total)} transform="rotate(-90 38 38)" className="focus-arc" />
      </svg>
      <div className="focus-text">
        <div className="focus-clock">{clock(left)}</div>
        <div className="small muted">{focus.plannedMin <= 5 ? 'Just 5 minutes: you can stop after this' : `Focus session · ${focus.plannedMin} min`}</div>
      </div>
      <div className="hero-actions">
        <Link className="btn btn-lg" to={lessonTo}>Open lesson <ArrowRight size={16} aria-hidden="true" /></Link>
        <button className="btn btn-lg ghost" disabled={busy} onClick={onStop}><Stop size={16} weight="fill" aria-hidden="true" /> Stop</button>
      </div>
    </div>
  );
}
