import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatLong, todayISO } from '../dates.js';
import { refreshGame, useGame } from '../game.jsx';
import { pickHeroTrack, minutesText } from '../lib/hero.js';
import { ErrorBox, Loading, Md } from '../components/ui.jsx';
import { EmptyState, Stagger, StaggerItem, TiltCard } from '../components/fx.jsx';
import Timeline from '../components/Timeline.jsx';
import DailyQuote from '../components/DailyQuote.jsx';
import TodayHero from '../components/TodayHero.jsx';
import WeekWins from '../components/WeekWins.jsx';

// Which roadmap you picked for the hero today (per-viewer convenience: it's fine if storage is unavailable).
const PICK_KEY = `levelup:hero:${todayISO()}`;
const readPick = () => { try { return sessionStorage.getItem(PICK_KEY); } catch { return null; } };
const savePick = (k) => { try { sessionStorage.setItem(PICK_KEY, k); } catch { /* ignore */ } };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** The encouraging line above the hero: streak, welcome back, or a fresh start. Never a "streak lost". */
function streakLine(s) {
  if (!s) return null;
  if (s.todayActive) return `🔥 Today counts. ${s.current}-day streak${s.current >= 3 ? ', keep it rolling' : ''}!`;
  if (s.current > 0) return `🔥 ${s.current}-day streak. 5 minutes today keeps it going.`;
  if (s.welcomeBack) return `👋 Welcome back! You had a ${s.welcomeBack.previousStreak}-day streak. 5 minutes today starts a new one.`;
  return '🌱 Start your streak today: 5 minutes counts.';
}

// Today = "what do I do now?": the next lesson (one big card), wins this week, today's quote, then the day's schedule.
export default function Home() {
  const { game } = useGame();
  const [meta, setMeta] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [pick, setPick] = useState(readPick);

  // Before the plan starts, preview Day 1 so the first screen still has a concrete plan.
  const date = meta && todayISO() < meta.startDate ? meta.startDate : todayISO();
  const isToday = date === todayISO();

  const load = useCallback(async () => {
    try {
      const m = meta || (await api.meta());
      if (!meta) setMeta(m);
      const d = todayISO() < m.startDate ? m.startDate : todayISO();
      setSchedule(await api.schedule(d));
    } catch (e) {
      setError(e.message);
    }
  }, [meta]);
  useEffect(() => { load(); }, [load]);

  async function toggle(fn) {
    try {
      await fn();
      setSaveError(null);
    } catch (e) {
      setSaveError(e.message);
    }
    load();
    refreshGame();
  }

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!meta || !schedule || !game) return <Loading />;

  // Hero: a running timer wins; then your pick for today; then whatever the timeline has on now (else AI + FDE).
  const auto = pickHeroTrack(game.tracks, schedule);
  const heroKey = game.focus?.track || (pick && game.tracks.some((t) => t.key === pick && t.next) ? pick : auto?.key);
  const hero = game.tracks.find((t) => t.key === heroKey);
  const reason = game.focus ? 'Focus timer running' : heroKey === pick && pick !== auto?.key ? 'Your pick for today' : auto?.reason;
  const others = game.tracks.filter((t) => t.next && t.key !== heroKey);
  const choose = (k) => { savePick(k); setPick(k); };
  const startFive = hero ? () => api.focusStart({ track: hero.key, ref: hero.next.ref, minutes: 5 }).then(refreshGame) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isToday ? `${greeting()} 👋` : 'Day 1 preview'}</h1>
          <div className="muted small">
            {formatLong(date)}{schedule.week ? ` · Week ${schedule.week}` : ''}{schedule.focus ? ` · ${schedule.focus}` : ''}
          </div>
        </div>
      </div>

      {/* wide: hero + schedule on the left, wins + quote + mentor in a sticky right column; narrow: hero, then the column, then the schedule */}
      <div className="home-grid today-grid">
        <div className="home-hero">
          <div className={`today-streak${game.streak.current > 0 || game.streak.todayActive ? ' on' : ''}`} role="status">{streakLine(game.streak)}</div>
          {hero ? (
            <TodayHero key={hero.key} track={hero} reason={reason} focus={game.focus} />
          ) : (
            <section className="card"><EmptyState icon="🏆" title="Every roadmap is complete">Keep learning on Stay updated, and give yourself a well-earned break.</EmptyState></section>
          )}
          {others.length > 0 && (
            <>
              <h2 className="section-label">Up next on your other roadmaps</h2>
              <Stagger className="upnext">
                {others.map((t, i) => (
                  <StaggerItem key={t.key} index={i}>
                    <TiltCard as="button" className="card upnext-card" onClick={() => choose(t.key)} aria-label={`Focus on ${t.label} today: ${t.next.title.replace(/`/g, '')}`}>
                      <span className="upnext-track">{t.label} · L{t.next.level}</span>
                      <span className="upnext-title"><Md text={t.next.title} /></span>
                      <span className="upnext-meta">~{minutesText(t.next.minutes)} · make this today's focus</span>
                    </TiltCard>
                  </StaggerItem>
                ))}
              </Stagger>
            </>
          )}
        </div>

        <aside className="home-aside">
          <WeekWins week={game.week} onStart={!game.focus ? startFive : null} />
          <DailyQuote />
          {!isToday && (
            <div className="card notice">
              <span>🚀 Your plan starts <strong>{formatLong(meta.startDate)}</strong>. Tonight: lay out workout clothes and sleep by 10:30.</span>
            </div>
          )}
          {saveError && (
            <div className="card notice">
              <span><strong>Couldn't save:</strong> {saveError}</span>
              <button className="link-btn" onClick={() => setSaveError(null)}>Dismiss</button>
            </div>
          )}
          <Link to="/mentor?tab=plan" className="card mentor-cta">
            <span>🤖</span>
            <span><strong>Plan my day with your mentor</strong><span className="muted small"> · behind, tired, or short on time? It re-plans today around your real timetable.</span></span>
          </Link>
        </aside>

        <div className="home-rest">
          <h2 className="section-label">Today's schedule</h2>
          <Timeline
            schedule={schedule}
            isToday={isToday}
            onToggleTask={(it) => toggle(() => api.setTaskDone(it.id, !it.done))}
            onToggleProject={(it) => toggle(() => api.updateProjectTask(it.id, it.step === 'learn' ? { learn_done: !it.done } : { done: !it.done }))}
          />
        </div>
      </div>
    </>
  );
}
