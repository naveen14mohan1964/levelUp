import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { refreshGame } from '../game.jsx';

/**
 * 🧭 The Mentor on Today: its latest message, today so far per goal, plan vs actual, your commitments,
 * "tell the mentor why", and at level 3 the blocker buttons + a confirmed plan shift. Misses stay neutral (never red).
 */
export const CAT_LABEL = { dsa: 'DSA', learning: 'Learning', project: 'Project', workout: 'Workout', nutrition: 'Nutrition' };
export const STATUS_ICON = { met: '✓', partial: '◐', missed: '○', off: '–' };
export const LEVEL_TEXT = ['On track', '1 day missed', 'Minimum day', 'Serious talk', 'Reset & rebuild'];
const BLOCKERS = [['time', '⏰ Time'], ['energy', '🔋 Energy'], ['difficulty', '🧩 Difficulty'], ['motivation', '💭 Motivation']];

export function PaceChip({ pace }) {
  if (!pace) return null;
  const s = pace.overall.status;
  const days = Math.abs(pace.overall.daysBehind);
  return (
    <span className={`pace-chip pace-${s.replace(' ', '-')}`} title={pace.tracks.map((t) => `${t.label}: ${t.status}${t.daysBehind ? ` (${Math.abs(t.daysBehind)} d)` : ''}`).join(' · ')}>
      {s === 'on track' ? 'On track' : s === 'behind' ? `${days} day${days === 1 ? '' : 's'} behind` : `${days} day${days === 1 ? '' : 's'} ahead`} · {pace.daysLeft} days left
    </span>
  );
}

export function Message({ m }) {
  if (!m) return null;
  const [body, ...rest] = m.content.split('\n');
  const action = rest.join(' ');
  return (
    <div className="mentor-msg">
      <div className="mentor-msg-meta small muted">{{ evening: 'Evening check-in', morning: 'Morning', reply: 'Reply', test: 'Test message' }[m.kind] || m.kind} · {new Date(m.created_ms).toLocaleString('en-IN', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}{m.source === 'template' ? ' · template' : ''}</div>
      <p className="mentor-msg-body">{body}</p>
      {action && <p className="mentor-msg-action">{action}</p>}
    </div>
  );
}

export default function MentorCard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [commit, setCommit] = useState({ category: 'dsa', planned_at: '07:00', place: '' });
  const [shift, setShift] = useState(null); // a proposal waiting for confirmation
  const load = useCallback(() => api.checkin().then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function run(fn) {
    setBusy(true); setError(null);
    try { const r = await fn(); await load(); refreshGame(); return r; } catch (e) { setError(e.message); return null; } finally { setBusy(false); }
  }
  if (!data) return error ? <section className="card mentor-card small muted">The Mentor is unavailable: {error}</section> : null;

  const t = data.today;
  const s = data.settings;
  const latest = data.messages[0];
  const tomorrow = new Date(`${t.date}T00:00:00`); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  const upcoming = data.commitments.filter((c) => c.date >= t.date && c.fulfilled == null);
  const preStart = Object.values(t.results).every((r) => r.status === 'off') && !t.rest;

  return (
    <section className={`card mentor-card level-${t.level}`} aria-label="The Mentor">
      <div className="mentor-head">
        <h2>🧭 The Mentor</h2>
        <span className="mentor-level">{t.rest ? (t.rest === 'sick' ? '🤒 Sick day' : '🛌 Rest day') : preStart ? 'Plan starts soon' : LEVEL_TEXT[t.level]}</span>
      </div>
      <div className="row gap wrap center-v small">
        <PaceChip pace={data.pace} />
        <span className="muted">🛡 {data.shields.available}/{data.shields.bank}</span>
        {data.paused && <span className="muted">⏸ paused until {s.pauseUntil}</span>}
        {data.freshStart && <span className="fresh-chip">{data.freshStart === 'month' ? 'New month: clean slate' : 'New week: clean slate'}</span>}
      </div>

      {latest ? <Message m={latest} /> : <p className="small muted">{preStart ? 'Your plan starts on Monday. The mentor checks in every evening at ' + s.evalTime + ' from then on.' : `First check-in tonight at ${s.evalTime}.`}</p>}

      {!preStart && (
        <ul className="mentor-today" aria-label="Today so far">
          {s.categories.map((c) => {
            const r = t.results[c] || {};
            return <li key={c} className={`st-${r.status}`} title={r.detail}><span aria-hidden="true">{STATUS_ICON[r.status] || '–'}</span> {CAT_LABEL[c]}<span className="sr-only">: {r.status}, {r.detail}</span></li>;
          })}
        </ul>
      )}

      {t.level >= 3 && !t.rest && (
        <div className="mentor-blockers">
          <div className="small"><strong>What's blocking you?</strong></div>
          <div className="row gap wrap">
            {BLOCKERS.map(([b, label]) => (
              <button key={b} className="btn" disabled={busy} onClick={async () => { const r = await run(() => api.checkinReason({ date: t.date, blocker: b })); if (r?.shift?.any) setShift(r.shift); }}>{label}</button>
            ))}
          </div>
        </div>
      )}
      {shift && (
        <div className="mentor-shift card subtle small" role="alertdialog" aria-label="Shift the plan">
          Move your unfinished days forward ({[shift.dsa?.days ? `DSA ${shift.dsa.days} d` : null, shift.project?.days ? `projects ${shift.project.days} d` : null].filter(Boolean).join(', ')}) so the first one is today? Finished work stays; the plan end moves too.
          <div className="row gap top-gap">
            <button className="btn primary" disabled={busy} onClick={async () => { await run(() => api.checkinShift()); setShift(null); }}>Yes, shift</button>
            <button className="btn ghost" onClick={() => setShift(null)}>Keep the plan</button>
          </div>
        </div>
      )}

      <form className="mentor-reason" onSubmit={async (e) => { e.preventDefault(); if (!reason.trim()) return; if (await run(() => api.checkinReason({ reason: reason.trim() }))) setReason(''); }}>
        <label className="sr-only" htmlFor="mentor-reason">Tell the mentor what happened</label>
        <input id="mentor-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tell the mentor what happened…" maxLength={500} />
        <button className="btn" disabled={busy || !reason.trim()}>Send</button>
      </form>

      <details className="mentor-commit">
        <summary className="small">📌 Commit: when and where {upcoming.length ? `(${upcoming.length} planned)` : ''}</summary>
        {upcoming.length > 0 && (
          <ul className="mentor-commits">
            {upcoming.map((c) => (
              <li key={c.id} className="small">
                {c.date === t.date ? 'Today' : c.date === tomorrowISO ? 'Tomorrow' : c.date} {c.planned_at}: {CAT_LABEL[c.category]}{c.place ? ` · ${c.place}` : ''}
                <button className="link-btn" aria-label="Remove commitment" onClick={() => run(() => api.checkinUncommit(c.id))}>✕</button>
              </li>
            ))}
          </ul>
        )}
        <form className="mentor-commit-form" onSubmit={async (e) => { e.preventDefault(); await run(() => api.checkinCommit({ date: tomorrowISO, ...commit, place: commit.place || null })); }}>
          <select value={commit.category} onChange={(e) => setCommit({ ...commit, category: e.target.value })} aria-label="Goal">
            {s.categories.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
          </select>
          <input type="time" value={commit.planned_at} onChange={(e) => setCommit({ ...commit, planned_at: e.target.value })} aria-label="Time" required />
          <input value={commit.place} onChange={(e) => setCommit({ ...commit, place: e.target.value })} placeholder="where (desk, gym…)" aria-label="Place" maxLength={100} />
          <button className="btn primary" disabled={busy}>Commit for tomorrow</button>
        </form>
      </details>
      {error && <div className="form-error">{error}</div>}
      <div className="small top-gap"><Link to="/mentor?tab=checkins">History, rest days and shields →</Link></div>
    </section>
  );
}
