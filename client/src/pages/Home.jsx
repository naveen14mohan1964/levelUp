import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CaretDown, Fire, HandWaving, Medal, Plant, RocketLaunch } from '@phosphor-icons/react';
import { api } from '../api.js';
import { formatLong, todayISO } from '../dates.js';
import { refreshGame, useGame } from '../game.jsx';
import { pickHeroTrack } from '../lib/hero.js';
import { dayProgress, missionCandidates, pickMissions } from '../lib/priorities.js';
import { quoteFor } from '../lib/quotes.js';
import { burst } from '../lib/celebrate.js';
import { ErrorBox, Loading, ProgressRing } from '../components/ui.jsx';
import { EmptyState } from '../components/fx.jsx';
import Timeline from '../components/Timeline.jsx';
import TodayHero from '../components/TodayHero.jsx';
import Priorities from '../components/Priorities.jsx';
import CheckIn from '../components/CheckIn.jsx';
import ChallengeCard from '../components/ChallengeCard.jsx';

// Per-viewer conveniences for today only (fine if storage is unavailable): your pick for the third mission,
// and whether the "all three done" celebration already played.
const store = (name) => {
  const key = `levelup:${name}:${todayISO()}`;
  return {
    get: () => { try { return localStorage.getItem(key); } catch { return null; } },
    set: (v) => { try { localStorage.setItem(key, v); } catch { /* ignore */ } },
  };
};
const thirdPick = store('mission3');
const celebrated = store('day-done');

function greeting(name) {
  const h = new Date().getHours();
  const hello = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return name ? `${hello}, ${name}` : hello;
}

/** The encouraging line under the greeting: streak, welcome back, or a fresh start. Never a "streak lost". */
function streakLine(s) {
  if (!s) return null;
  if (s.todayActive) return [Fire, `Today counts. ${s.current} day streak${s.current >= 3 ? ', keep it rolling' : ''}.`];
  if (s.current > 0) return [Fire, `${s.current} day streak. Five minutes today keeps it going.`];
  if (s.welcomeBack) return [HandWaving, 'Welcome back. Five minutes makes today count.'];
  return [Plant, 'Five minutes makes today count.'];
}

function dayLine(missions) {
  const done = missions.filter((m) => m.complete).length;
  if (!missions.length) return 'Nothing is planned today. Rest counts too.';
  if (done === missions.length) return 'All three missions done. That is a full day.';
  if (done) return `${done} of ${missions.length} missions done. Nice work.`;
  return 'Three missions today. The first one is ready.';
}

// Today = "what do I do now?": one next action, three missions, one ring for the day, this week's challenge and
// a 10-second check-in. Everything else (the full schedule, other roadmaps) is one click away, not on screen.
export default function Home() {
  const { game, today, active, name } = useGame();
  const [meta, setMeta] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [choice, setChoice] = useState(thirdPick.get);
  const dayCard = useRef(null);

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

  const ready = meta && schedule && game;
  const { missions, swapTo } = ready ? pickMissions(missionCandidates(schedule, today, game), choice) : { missions: [], swapTo: null };
  const pct = dayProgress(missions);
  const allDone = isToday && missions.length > 0 && missions.every((m) => m.complete);

  // The completion moment: one short confetti burst the first time all three are done today, never again that day.
  useEffect(() => {
    if (!allDone || celebrated.get()) return;
    celebrated.set('1');
    burst(dayCard.current);
  }, [allDone]);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!ready) return <Loading />;

  // Next action: a running timer wins; otherwise whatever the timeline has on now, among your active tracks only.
  const tracks = game.tracks.filter((t) => active.includes(t.key));
  const auto = pickHeroTrack(tracks, schedule);
  const heroKey = game.focus?.track || auto?.key;
  const hero = game.tracks.find((t) => t.key === heroKey && t.next);
  const reason = game.focus ? 'Focus timer running' : auto?.reason;
  const [StreakIcon, streakText] = streakLine(game.streak);
  const streakOn = game.streak.current > 0 || game.streak.todayActive;
  const { player, growth } = game;
  const consistency = growth?.consistency;
  const nextMilestone = growth?.milestones.next[0];
  const quote = quoteFor(todayISO());
  const swap = () => { thirdPick.set(swapTo.key); setChoice(swapTo.key); };
  const toggleHabit = (m) => toggle(() => api.setHabit(todayISO(), m.habit, !m.complete));

  return (
    <>
      {/* hero appear: date, greeting and streak settle in one after another (components/motion.jsx) */}
      <header className="today-head">
        <div className="today-date">
          {formatLong(date)}{schedule.week ? ` · Week ${schedule.week}` : ''}{!isToday ? ' · Day 1 preview' : ''}
        </div>
        <h1 className="today-title"><span className="text-gradient">{greeting(name)}</span></h1>
        <div className={`today-streak${streakOn ? ' on' : ''}`} role="status">
          <StreakIcon size={16} weight={streakOn ? 'fill' : 'regular'} aria-hidden="true" /> {streakText}
          {consistency?.active > 0 && <span className="today-consistency">Active {consistency.active} of the last {consistency.total} days</span>}
        </div>
      </header>

      {/* wide: day + next action on the left, missions + challenge + check-in on the right.
          narrow: one column in the order day, missions, next action, the rest (see .today-cols in styles-growth.css) */}
      <div className="today-cols">
        <div className="today-main">
          <section ref={dayCard} className="card day-card t-day" aria-label="Today's progress">
            <ProgressRing value={pct} total={100} size={84} stroke={8} />
            <div className="day-text">
              <div className="day-line">{isToday ? dayLine(missions) : 'Your plan starts tomorrow. Here is your first day.'}</div>
              <div className="day-level">
                <Link to="/me">Level {player.level}</Link>
                <span className="day-xp" role="progressbar" aria-label="XP toward the next level" aria-valuemin={0} aria-valuemax={player.xpForNext} aria-valuenow={player.xpInLevel}>
                  <span style={{ transform: `scaleX(${player.xpInLevel / player.xpForNext})` }} />
                </span>
                <span className="muted">{player.xpInLevel} of {player.xpForNext} XP{player.today ? ` · ${player.today} earned today` : ''}</span>
              </div>
              {nextMilestone && (
                <div className="day-milestone"><Medal size={14} aria-hidden="true" /> Next milestone: {nextMilestone.title} <span className="muted">({nextMilestone.value} of {nextMilestone.target})</span></div>
              )}
              <figure className="day-quote">
                <blockquote>“{quote.text}”</blockquote>
                <figcaption>{quote.author}</figcaption>
              </figure>
            </div>
          </section>

          <div className="t-hero">
            {hero ? (
              <TodayHero key={hero.key} track={hero} reason={reason} focus={game.focus} />
            ) : (
              <section className="card"><EmptyState icon="🏆" title="Your active roadmaps are complete">Bring the next one back from Journey, and give yourself a well-earned break.</EmptyState></section>
            )}
          </div>

          <div className="t-rest">
            <details className="schedule-more">
              <summary>Full schedule for the day <CaretDown size={14} aria-hidden="true" /></summary>
              <Timeline
                schedule={schedule}
                isToday={isToday}
                onToggleTask={(it) => toggle(() => api.setTaskDone(it.id, !it.done))}
                onToggleProject={(it) => toggle(() => api.updateProjectTask(it.id, it.step === 'learn' ? { learn_done: !it.done } : { done: !it.done }))}
              />
            </details>
          </div>
        </div>

        <aside className="today-side">
          <div className="t-missions">
            <Priorities items={missions} preview={!isToday} swapTo={swapTo} onSwap={swap} onToggleHabit={toggleHabit} />
          </div>
          <div className="t-extra">
            <ChallengeCard />
            {isToday && <CheckIn />}
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
          </div>
        </aside>
      </div>
    </>
  );
}
