import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { refreshGame, useGame } from './game.jsx';
import { useFocusGuard } from './lib/useFocusGuard.js';
import { playAlarm, unlockAudio } from './lib/alarm.js';
import { duck, play, prefs, stop as stopSound, subscribe } from './lib/soundscape.js';
import { notify } from './lib/pwa.js';

/**
 * The focus session at app level, so it follows you to every page (DSA, a lesson, Settings…) and keeps going while
 * you study in another tab (YouTube, docs): the camera guard, the focus sound, auto-stop when time is up, and the
 * result of the last session. The floating FocusDock (components/FocusDock.jsx) holds the camera preview.
 */
const FocusContext = createContext(null);
export const useFocus = () => useContext(FocusContext);
export const DISTRACTED = ['away', 'looking-away', 'phone', 'drowsy'];

const readFlag = (k) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
const saveFlag = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* ignore */ } };

export function FocusProvider({ children }) {
  const { game } = useGame();
  const running = game?.focus || null;
  const loaded = !!game;
  const [camOn, setCamOn] = useState(false);
  const [readingNotes, setReadingNotes] = useState(false);
  const [officeMode, setOfficeMode] = useState(() => readFlag('levelup:officeMode'));
  const [faahOn, setFaahOn] = useState(() => readFlag('levelup:faah')); // the loud alarm (off by default)
  const [alarmName, setAlarmName] = useState(() => { try { return localStorage.getItem('levelup:alarmName') || 'Naveen'; } catch { return 'Naveen'; } });
  const [alarmSound, setAlarmSound] = useState(() => { try { return localStorage.getItem('levelup:alarmSound') || 'faah'; } catch { return 'faah'; } });
  const [lastStop, setLastStop] = useState(null); // { id, track, minutes, pct, short, auto, at }
  const [sound, setSound] = useState(prefs);
  const guard = useFocusGuard({ active: !!running && camOn, readingNotes, officeMode: officeMode || faahOn, onHeartbeat: (d) => api.focusStats(d).catch(() => {}) });
  const g = guard.view;

  // the session ended (here, in another tab, or from Telegram): camera off, reading-notes reset
  useEffect(() => { if (loaded && !running) { setCamOn(false); setReadingNotes(false); } }, [loaded, running]);

  // focus sound: plays while a session runs, whisper-quiet while the guard sees you away
  useEffect(() => subscribe(setSound), []);
  useEffect(() => { if (running && sound.kind !== 'off') play(sound.kind); else stopSound(); }, [running, sound.kind]);
  const distracted = camOn && !!running && DISTRACTED.includes(g.status);
  const watching = camOn && !!running && ['focused', 'calibrating'].includes(g.status);
  useEffect(() => { duck(distracted && g.level >= 1); }, [distracted, g.level]);

  // Loud alarm: the moment a distraction counts (after the 3 s grace) the server turns the laptop's volume to 100%
  // (unmuted) and a 12-second round plays (Faaah / "Padi da, Parama!" / both / your own file); while you're still away
  // a new round starts every 15 s. A round always finishes, then your own volume comes back.
  // Never in office mode. If the page closes mid-alarm, a beacon restores the volume (and the server does after 90 s).
  const round = useRef(null);
  useEffect(() => {
    if (!faahOn || officeMode || !distracted) return undefined;
    const restore = () => navigator.sendBeacon?.('/api/guard/loud', new Blob([JSON.stringify({ on: false })], { type: 'application/json' }));
    api.guardLoud(true).catch(() => {});
    round.current = playAlarm(alarmSound, 12_000, { name: alarmName });
    let n = 0;
    const t = setInterval(() => {
      round.current = playAlarm(alarmSound, 12_000, { name: alarmName });
      if (++n % 4 === 0) api.guardLoud(true).catch(() => {}); // keep it up past the server's 90 s safety reset
    }, 15_000);
    window.addEventListener('pagehide', restore);
    return () => {
      clearInterval(t);
      window.removeEventListener('pagehide', restore);
      const left = Math.max(0, (round.current?.endsAt || 0) - Date.now());
      setTimeout(() => api.guardLoud(false).catch(() => {}), left + 300); // let the round finish, then your volume
    };
  }, [faahOn, officeMode, distracted, alarmSound, alarmName]);

  // while you're in another tab the screen flash can't be seen: a desktop notification instead (once per distraction)
  const notified = useRef(false);
  useEffect(() => {
    if (!distracted || g.level < 1) { notified.current = false; return; }
    if (document.hidden && !notified.current) {
      notified.current = true;
      notify('👀 Your buddy is watching', g.status === 'phone' ? 'Phone down. Back to the lesson.' : 'Eyes back on the lesson.', { tag: 'guard' });
    }
  }, [distracted, g.level, g.status]);

  const stopSession = useCallback(async ({ auto = false } = {}) => {
    const cam = camOn ? guard.stats() : null;
    const r = await api.focusStop({ auto, ...(cam ? { distractedSec: cam.distractedSec, camera: true } : {}) });
    const done = { id: r.stopped.id, track: r.stopped.track, minutes: r.stopped.minutes, pct: cam?.pct ?? null, short: (running?.plannedMin || 0) <= 5, auto, at: Date.now() };
    setLastStop(done);
    setCamOn(false); // the camera goes off with the session, right away
    if (auto) notify('⏰ Focus session done', `${done.minutes} focused minutes${cam ? ` · ${cam.pct}% on camera` : ''}. Take a 5-minute break.`, { tag: 'focus' });
    refreshGame();
    return done;
  }, [camOn, guard, running]);

  // time's up: stop once, on whatever page you are (or in another tab)
  const autoStopped = useRef(null);
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => {
      const left = running.plannedMin * 60_000 - (Date.now() - running.startedMs);
      if (left <= 0 && autoStopped.current !== running.id) {
        autoStopped.current = running.id;
        stopSession({ auto: true }).catch(() => refreshGame());
      }
    }, 1000);
    return () => clearInterval(t);
  }, [running, stopSession]);

  const value = {
    running, camOn, readingNotes, officeMode, faahOn, alarmSound, alarmName, view: g, guard, distracted, watching, lastStop, sound,
    toggleCam: () => { unlockAudio(); setCamOn((v) => !v); },
    stopCam: () => setCamOn(false),
    toggleReadingNotes: () => setReadingNotes((v) => !v),
    toggleOfficeMode: () => setOfficeMode((v) => { saveFlag('levelup:officeMode', !v); return !v; }),
    toggleFaah: () => { unlockAudio(); setFaahOn((v) => { saveFlag('levelup:faah', !v); return !v; }); },
    setAlarmSound: (k) => { try { localStorage.setItem('levelup:alarmSound', k); } catch { /* ignore */ } setAlarmSound(k); },
    testAlarm: () => { unlockAudio(); round.current?.stop(); round.current = playAlarm(alarmSound, 4000, { name: alarmName }); }, // a 4-second preview at your current volume
    setAlarmName: (n) => { const v = String(n).slice(0, 24); try { localStorage.setItem('levelup:alarmName', v); } catch { /* ignore */ } setAlarmName(v); },
    recalibrate: guard.recalibrate,
    stopSession,
    clearLastStop: () => setLastStop(null),
  };
  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}
