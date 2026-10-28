import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { api } from '../api.js';
import { formatShort } from '../dates.js';
import { refreshGame } from '../game.jsx';
import { DiffPill, ErrorBox, Loading } from '../components/ui.jsx';
import LogSolveDialog from '../components/LogSolveDialog.jsx';
import { PickRow } from '../components/PatternPick.jsx';

const LEVEL_TEXT = { new: 'Not started', learning: 'Learning', building: 'Building', solid: 'Solid', mastered: 'Mastered' };

/**
 * DSA pattern mastery: one tile per pattern, in the order your plan teaches them. Mastery mixes how many you've
 * solved (6 = full credit), your confidence ratings, how often re-solves succeed, and how recently you practised.
 */
export default function Patterns() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [logging, setLogging] = useState(null);
  const load = useCallback(() => api.patterns().then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const started = data.patterns.filter((p) => p.solved);
  const avg = started.length ? Math.round(started.reduce((n, p) => n + p.score, 0) / started.length) : 0;
  const sel = data.patterns.find((p) => p.topic === open);

  return (
    <>
      <div className="stat-row">
        <div className="stat"><strong>{started.length}/{data.patterns.length}</strong><span>patterns started</span></div>
        <div className="stat"><strong>{started.length ? `${avg}%` : 'Start'}</strong><span>{started.length ? 'average mastery of started patterns' : 'solve a problem to light up a tile'}</span></div>
        <div className="stat"><strong>{data.patterns.filter((p) => p.score >= 70).length}</strong><span>solid or mastered</span></div>
      </div>

      <section className="card pick-card">
        <h2>🎯 Practice pick</h2>
        <p className="muted small">Each day your weakest started pattern picks one extra problem: a new one at the right level, or one you rated 1–2 to re-solve.</p>
        <div className="pick-pair">
          <PickRow pick={data.picks.today} label="Today" onLog={setLogging} />
          <PickRow pick={data.picks.tomorrow} label="Tomorrow (live)" />
        </div>
      </section>

      <section className="card">
        <h2>🧭 Pattern map</h2>
        <div className="heat" role="list">
          {data.patterns.map((p, i) => (
            <motion.button key={p.topic} role="listitem" className={`heat-tile lvl-${p.level}${open === p.topic ? ' sel' : ''}`}
              style={{ '--m': p.score / 100 }} onClick={() => setOpen(open === p.topic ? null : p.topic)}
              initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.015 }}
              aria-label={`${p.topic}: ${LEVEL_TEXT[p.level]}, mastery ${p.score}%, ${p.solved} of ${p.total} solved`}>
              <span className="heat-name">{p.topic}</span>
              <span className="heat-score">{p.solved ? `${p.score}%` : '·'}</span>
              <span className="heat-sub">{p.solved}/{p.total} solved{p.dueReviews ? ` · ${p.dueReviews} due` : ''}</span>
            </motion.button>
          ))}
        </div>
        <div className="heat-legend small muted">
          <span className="heat-dot lvl-new" /> not started <span className="heat-dot lvl-learning" /> learning &lt;40
          <span className="heat-dot lvl-building" /> building &lt;70 <span className="heat-dot lvl-solid" /> solid &lt;85 <span className="heat-dot lvl-mastered" /> mastered
        </div>
      </section>

      {sel && (
        <section className="card">
          <div className="row-gap" style={{ justifyContent: 'space-between' }}>
            <h2>{sel.topic} · {LEVEL_TEXT[sel.level]}{sel.solved ? ` · ${sel.score}%` : ''}</h2>
            <button className="link-btn" onClick={() => setOpen(null)}>Close</button>
          </div>
          <div className="pattern-facts small">
            <span>✅ {sel.solved}/{sel.total} solved</span>
            <span>⭐ confidence {sel.avgConf ?? '–'}/5</span>
            <span>🔁 {sel.reviews ? `${sel.successRate}% of ${sel.reviews} attempts succeeded` : 'no attempts yet'}</span>
            <span>🕒 {sel.lastPracticed ? `last practised ${formatShort(sel.lastPracticed)}` : 'not practised yet'}</span>
            {sel.firstPlanDate && <span>📅 in your plan from {formatShort(sel.firstPlanDate)}</span>}
          </div>
          <ul className="pattern-problems">
            {sel.problems.map((p) => (
              <li key={p.id} className={p.solved ? 'solved' : ''}>
                <DiffPill d={p.difficulty} />
                {p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.title} ↗</a> : <span>{p.title}</span>}
                <span className="small muted">{p.solved ? `✓ ${p.confidence ? `${p.confidence}/5` : 'solved'}` : p.plan_date ? formatShort(p.plan_date) : 'yours'}{p.is_stretch ? ' · stretch' : ''}</span>
                <button className="link-btn small" onClick={() => setLogging(p)}>{p.solved ? 'Re-solve' : 'Log'}</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {logging && <LogSolveDialog problem={logging} onClose={() => { setLogging(null); load(); refreshGame(); }} />}
    </>
  );
}
