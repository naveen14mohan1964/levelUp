import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { refreshGame } from '../game.jsx';
import { DiffPill } from './ui.jsx';
import LogSolveDialog from './LogSolveDialog.jsx';

/** One pick: the problem, why it was chosen, and a way to solve / log it. */
export function PickRow({ pick, label, onLog }) {
  if (!pick?.problem) return null;
  const p = pick.problem;
  return (
    <div className={`pick${pick.done ? ' done' : ''}`}>
      <div className="pick-head">
        <span className="pick-label">{label}</span>
        <span className="chip">{pick.topic}</span>
        {pick.kind === 'resolve' && <span className="chip">re-solve</span>}
      </div>
      <div className="pick-title">
        <DiffPill d={p.difficulty} />
        {p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.title} ↗</a> : <strong>{p.title}</strong>}
      </div>
      <p className="small muted">{pick.reason}</p>
      {onLog && (pick.done ? <span className="ok-text small">✓ Done. Nice.</span>
        : <button className="btn" onClick={() => onLog(p)}>Log a solve</button>)}
    </div>
  );
}

/** "🎯 Pattern pick" on the DSA Today page: your weakest pattern chooses one extra problem a day. */
export default function PatternPickCard() {
  const [data, setData] = useState(null);
  const [logging, setLogging] = useState(null);
  const load = useCallback(() => api.patterns().then(setData).catch(() => setData(null)), []);
  useEffect(() => { load(); }, [load]);
  if (!data?.picks?.today) return null;
  return (
    <section className="card pick-card">
      <div className="row-gap" style={{ justifyContent: 'space-between' }}>
        <h2>🎯 Pattern pick</h2>
        <Link to="/dsa/patterns" className="small">See all patterns →</Link>
      </div>
      <PickRow pick={data.picks.today} label="Today" onLog={setLogging} />
      {data.picks.tomorrow && <div className="small muted pick-next">Tomorrow (updates as you practise): {data.picks.tomorrow.topic} · {data.picks.tomorrow.problem?.title}</div>}
      {logging && <LogSolveDialog problem={logging} onClose={() => { setLogging(null); load(); refreshGame(); }} />}
    </section>
  );
}
