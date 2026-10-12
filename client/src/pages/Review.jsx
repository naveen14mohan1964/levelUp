import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatShort, todayISO } from '../dates.js';
import { DiffPill, ErrorBox, Loading } from '../components/ui.jsx';
import LogSolveDialog from '../components/LogSolveDialog.jsx';
import { Stars } from './Problems.jsx';

/**
 * Spaced-repetition queue. Re-solve each due problem from a blank editor, then rate it.
 * Behavioural design: a short, finite list ("3 due today") is a small win you can finish.
 */
export default function Review() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [logging, setLogging] = useState(null);
  const today = todayISO();

  const load = () => api.reviewQueue(today).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;

  const overdue = data.due.filter((p) => p.next_review < today).length;
  const maxUpcoming = Math.max(1, ...data.upcoming.map((u) => u.n));

  return (
    <>
      <div className="stat-row">
        <div className="stat">{data.due.length ? <><strong>{data.due.length}</strong><span>due today{overdue ? ` (${overdue} carried over)` : ''}</span></> : <><strong>🎉</strong><span>nothing due today</span></>}</div>
        <div className="stat">{data.mastered ? <><strong>{data.mastered}</strong><span>mastered</span></> : <><strong>60 days</strong><span>between reviews = mastered</span></>}</div>
        <div className="stat"><strong>{data.unrated || 0}</strong><span>solved but not rated yet</span></div>
      </div>

      <section className="card">
        <h2>🔁 Due today</h2>
        {data.due.length === 0 ? (
          <p className="muted">Nothing due. Your memory is up to date. 🎉 New problems enter this queue once you rate them.</p>
        ) : (
          <>
            <p className="muted small">Re-solve each one <strong>from a blank editor</strong> (no peeking at your old code), then rate it honestly.</p>
            <ul className="plist">
              {data.due.map((p) => (
                <li key={p.id} className="prow">
                  <div className="prow-main static">
                    <a className="prow-title" href={p.url} target="_blank" rel="noreferrer">{p.lc_number ? `${p.lc_number}. ` : ''}{p.title} ↗</a>
                    <span className="prow-meta">
                      <DiffPill d={p.difficulty} />
                      <span className="muted small">{p.topic}</span>
                      <span className={`small ${p.next_review < today ? 'warn-text' : 'muted'}`}>due {formatShort(p.next_review)}</span>
                      {p.notes && <span className="muted small">💡 {p.notes.slice(0, 60)}{p.notes.length > 60 ? '…' : ''}</span>}
                    </span>
                  </div>
                  <Stars n={p.confidence} />
                  <button className="btn primary" onClick={() => setLogging(p)}>Re-solved</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {data.upcoming.length > 0 && (
        <section className="card">
          <h2>Next 7 days</h2>
          <ul className="forecast">
            {data.upcoming.map((u) => (
              <li key={u.d}>
                <span className="small muted">{formatShort(u.d)}</span>
                <span className="forecast-bar" style={{ width: `${(u.n / maxUpcoming) * 100}%` }} />
                <span className="small">{u.n}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {logging && <LogSolveDialog problem={logging} onClose={() => { setLogging(null); load(); }} />}
    </>
  );
}
