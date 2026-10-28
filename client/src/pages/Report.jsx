import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { api } from '../api.js';
import { formatShort } from '../dates.js';
import { ErrorBox, Loading } from '../components/ui.jsx';

const STATS = [
  ['minutes', '⏱', 'Focus minutes'],
  ['activeDays', '🔥', 'Active days'],
  ['xp', '⭐', 'XP'],
  ['lessons', '📘', 'Lessons'],
  ['problems', '🧠', 'Problems'],
  ['cards', '🃏', 'Card reviews'],
  ['workouts', '💪', 'Workout days'],
];
const GOAL_TEXT = { met: 'met', partial: 'partly', missed: 'missed', off: 'not tracked', rest: 'rest day' };
const BAR_GOAL = 30; // a marker on the chart: 30 focused minutes a day

/** The weekly report: Mon–Sun at a glance, compared with the week before, with a short honest verdict. */
export default function Report() {
  const { start } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const load = useCallback(() => { setData(null); api.weekReport(start).then(setData).catch((e) => setError(e.message)); }, [start]);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const { week, prev, days } = data;
  const max = Math.max(BAR_GOAL, ...days.map((d) => d.minutes));
  const go = (s) => navigate(s ? `/report/${s}` : '/report');

  const copy = async () => {
    const text = [`Level Up · week of ${formatShort(data.start)}`, ...data.verdict, '',
      ...STATS.map(([k, , label]) => `${label}: ${week[k]}`)].join('\n');
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>📊 Weekly report</h1>
          <div className="muted small">{formatShort(data.start)} – {formatShort(data.end)}{data.isCurrent ? ' · this week so far' : ''}</div>
        </div>
        <div className="row-gap">
          <button className="btn" onClick={() => go(data.prevStart)} aria-label="Previous week">← Prev</button>
          {!data.isCurrent && <button className="btn" onClick={() => go(null)}>This week</button>}
          <button className="btn" onClick={() => go(data.nextStart)} disabled={data.isCurrent} aria-label="Next week">Next →</button>
        </div>
      </div>

      <section className="card report-verdict">
        <div className="report-verdict-head">
          <h2>🤖 The verdict</h2>
          <button className="btn" onClick={copy}>{copied ? '✓ Copied' : '📋 Copy summary'}</button>
        </div>
        <ul>{data.verdict.map((l) => <li key={l}>{l}</li>)}</ul>
      </section>

      <div className="report-stats">
        {STATS.map(([k, icon, label], i) => {
          const d = week[k] - prev[k];
          return (
            <motion.div key={k} className="report-stat" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <span className="report-stat-icon" aria-hidden="true">{icon}</span>
              <strong>{week[k]}</strong>
              <span className="small muted">{label}</span>
              {(week[k] || prev[k]) ? <span className={`delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`}>{d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : '='} <span className="muted">vs last week</span></span> : null}
            </motion.div>
          );
        })}
      </div>

      <section className="card">
        <h2>Focus minutes per day</h2>
        <div className="bars" role="img" aria-label={days.map((d) => `${d.name} ${d.minutes} minutes`).join(', ')}>
          <div className="bars-goal" style={{ bottom: `${(BAR_GOAL / max) * 100}%` }}><span>{BAR_GOAL} min</span></div>
          {days.map((d, i) => (
            <div key={d.date} className={`bar-col${d.future ? ' future' : ''}`}>
              <span className="bar-val small">{d.minutes || ''}</span>
              <motion.div className={`bar${d.minutes >= BAR_GOAL ? ' hit' : ''}`} initial={{ height: 0 }} animate={{ height: `${(d.minutes / max) * 100}%` }}
                transition={{ type: 'spring', stiffness: 140, damping: 18, delay: i * 0.05 }} />
              <span className="bar-day small">{d.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Daily goals</h2>
        {days.some((d) => d.goals) ? (
          <div className="report-goals" role="table" aria-label="Goals per day">
            <div role="row" className="goal-row head"><span role="columnheader" />{days.map((d) => <span role="columnheader" key={d.date}>{d.name}</span>)}</div>
            {data.goals.map((g) => (
              <div role="row" className="goal-row" key={g.key}>
                <span role="rowheader">{g.label}</span>
                {days.map((d) => {
                  const s = d.goals?.[g.key] || (d.future ? 'future' : 'none');
                  return <span role="cell" key={d.date} className={`goal-cell ${s}`} title={`${g.label}, ${d.name}: ${GOAL_TEXT[s] || 'no check-in'}`}><span className="sr-only">{GOAL_TEXT[s] || 'no check-in'}</span></span>;
                })}
              </div>
            ))}
            <div className="goal-legend small muted"><span className="goal-cell met" /> met <span className="goal-cell partial" /> partly <span className="goal-cell missed" /> missed <span className="goal-cell off" /> not tracked</div>
          </div>
        ) : <p className="muted">The Mentor's daily check-ins fill this grid once the plan starts (Mon 26 Oct).</p>}
      </section>

      <section className="card">
        <h2>Highlights</h2>
        <ul className="highlights">
          <li>🔥 Streak: <strong>{data.streak.current} day{data.streak.current === 1 ? '' : 's'}</strong> (best {data.streak.best}){data.streak.shields ? ` · 🛡 ${data.streak.shields}` : ''}</li>
          {data.longestSession && <li>⏱ Longest session: <strong>{data.longestSession.minutes} min</strong> on {formatShort(data.longestSession.date)}</li>}
          {data.camera && <li>📷 Camera focus: <strong>{data.camera.pct}%</strong> ({data.camera.focusedMin} focused, {data.camera.distractedMin} away, {data.camera.sessions} session{data.camera.sessions === 1 ? '' : 's'})</li>}
          {data.weight && <li>⚖️ Weight: <strong>{data.weight.last} kg</strong> ({data.weight.change > 0 ? '+' : ''}{data.weight.change} kg this week)</li>}
          <li>⭐ Player level <strong>{data.player.level}</strong></li>
        </ul>
      </section>
    </>
  );
}
