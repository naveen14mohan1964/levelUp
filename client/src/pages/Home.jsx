import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Fire, HandWaving, Plant, RocketLaunch, Robot, ArrowRight } from '@phosphor-icons/react';
import { api } from '../api.js';
import { formatLong, todayISO } from '../dates.js';
import { refreshGame, useGame } from '../game.jsx';
import { pickHeroTrack, minutesText } from '../lib/hero.js';
import { ErrorBox, Loading, Md } from '../components/ui.jsx';
import { EmptyState, TiltCard } from '../components/fx.jsx';
import TodayRings from '../components/TodayRings.jsx';
import Timeline from '../components/Timeline.jsx';
import DailyQuote from '../components/DailyQuote.jsx';
import TodayHero from '../components/TodayHero.jsx';
import WeekWins from '../components/WeekWins.jsx';
import MentorCard from '../components/MentorCard.jsx';

// Which roadmap you picked for the hero today (per-viewer convenience: it's fine if storage is unavailable).
const PICK_KEY = `levelup:hero:${todayISO()}`;
const readPick = () => { try { return sessionStorage.getItem(PICK_KEY); } catch { return null; } };
const savePick = (k) => { try { sessionStorage.setItem(PICK_KEY, k); } catch { /* ignore */ } };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** The encouraging line under the greeting: streak, welcome back, or a fresh start. Never a "streak lost". */
function streakLine(s) {
  if (!s) return null;
  if (s.todayActive) return [Fire, `Today counts. ${s.current} day streak${s.current >= 3 ? ', keep it rolling' : ''}.`];
  if (s.current > 0) return [Fire, `${s.current} day streak. Five minutes today keeps it going.`];
  if (s.welcomeBack) return [HandWaving, `Welcome back. You had a ${s.welcomeBack.previousStreak} day streak, and five minutes today starts a new one.`];
  return [Plant, 'Start your streak today: five minutes counts.'];
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
  const [StreakIcon, streakText] = streakLine(game.streak);
  const streakOn = game.streak.current > 0 || game.streak.todayActive;

  return (
    <>
      {/* hero appear: date, greeting and streak settle in one after another (components/motion.jsx) */}
      <header className="today-head">
        <div className="today-date">
          {formatLong(date)}{schedule.week ? ` · Week ${schedule.week}` : ''}{schedule.focus ? ` · ${schedule.focus}` : ''}
        </div>
        <h1 className="today-title"><span className="text-gradient">{isToday ? greeting() : 'Day 1 preview'}</span></h1>
        <div className={`today-streak${streakOn ? ' on' : ''}`} role="status">
          <StreakIcon size={16} weight={streakOn ? 'fill' : 'regular'} aria-hidden="true" /> {streakText}
        </div>
      </header>

      {/* wide: hero + schedule on the left, wins + quote + mentor in a sticky right column; narrow: hero, then the column, then the schedule */}
      <div className="home-grid today-grid">
        <div className="home-hero">
          <TodayRings />
          {hero ? (
            <TodayHero key={hero.key} track={hero} reason={reason} focus={game.focus} />
          ) : (
            <section className="card"><EmptyState icon="🏆" title="Every roadmap is complete">Keep learning on Stay updated, and give yourself a well-earned break.</EmptyState></section>
          )}
          {others.length > 0 && (
            <>
              <h2 className="section-label">Up next on your other roadmaps</h2>
              <div className="upnext">
                {others.map((t) => (
                  <TiltCard key={t.key} as="button" className="card upnext-card" onClick={() => choose(t.key)} aria-label={`Focus on ${t.label} today: ${t.next.title.replace(/`/g, '')}`}>
                    <span className="upnext-track">{t.label} · Level {t.next.level}</span>
                    <span className="upnext-title"><Md text={t.next.title} /></span>
                    <span className="upnext-meta">~{minutesText(t.next.minutes)} <span className="upnext-go">Make this today's focus <ArrowRight size={14} aria-hidden="true" /></span></span>
                  </TiltCard>
                ))}
              </div>
            </>
          )}
        </div>

        <aside className="home-aside">
          <MentorCard />
          <WeekWins week={game.week} onStart={!game.focus ? startFive : null} />
          <DailyQuote />
          {!isToday && (
            <div className="card notice">
              <RocketLaunch size={20} aria-hidden="true" />
              <span>Your plan starts <strong>{formatLong(meta.startDate)}</strong>. Tonight: lay out workout clothes and sleep by 10:30.</span>
            </div>
          )}
          {saveError && (
            <div className="card notice">
              <span><strong>Couldn't save:</strong> {saveError}</span>
              <button className="link-btn" onClick={() => setSaveError(null)}>Dismiss</button>
            </div>
          )}
          <Link to="/mentor?tab=plan" className="card mentor-cta">
            <span className="mentor-cta-icon" aria-hidden="true"><Robot size={20} /></span>
            <span><strong>Plan my day with your mentor</strong><span className="muted small"> Behind, tired, or short on time? It plans today again around your real timetable.</span></span>
            <ArrowRight size={16} className="mentor-cta-go" aria-hidden="true" />
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
