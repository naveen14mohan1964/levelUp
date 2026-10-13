import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrorBox, Loading } from './ui.jsx';
import { EmptyState } from './fx.jsx';
import { CAT_LABEL, LEVEL_TEXT, Message, PaceChip, STATUS_ICON } from './MentorCard.jsx';

/** Mentor → Check-ins: what the mentor said, recent days, plan vs actual, commitments, rest / sick days and shields. */
export default function CheckinsTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [rest, setRest] = useState({ date: '', kind: 'rest', note: '' });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.checkin().then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  async function run(fn) {
    setBusy(true); setError(null);
    try { await fn(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  if (!data && error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const cats = data.settings.categories;

  return (
    <div className="checkins">
      <section className="checkins-row">
        <div>
          <h3>Plan vs actual</h3>
          {data.pace ? (
            <>
              <PaceChip pace={data.pace} />
              <ul className="pace-tracks small">{data.pace.tracks.map((t) => <li key={t.key}>{t.label}: {t.status}{t.daysBehind ? ` (${Math.abs(t.daysBehind)} day${Math.abs(t.daysBehind) === 1 ? '' : 's'} ${t.daysBehind > 0 ? 'behind' : 'ahead'})` : ''}</li>)}</ul>
            </>
          ) : <p className="small muted">Shows once the plan starts.</p>}
        </div>
        <div>
          <h3>🛡 Streak shields</h3>
          <p className="small">{data.shields.available} of {data.shields.bank} in the bank. A perfect week earns one; one is spent automatically when it saves your streak.</p>
          <ul className="small muted">{data.shields.list.slice(-4).map((x) => <li key={x.id}>{x.reason === 'starter' ? 'Starter shield' : `Perfect week of ${x.reason.split(':')[1]}`}{x.used_ms ? ` · used for ${x.used_for_day}` : ' · ready'}</li>)}</ul>
        </div>
      </section>

      <h3>Recent days</h3>
      {data.recent.length ? (
        <div className="table-scroll">
          <table className="data-table checkins-days">
            <thead><tr><th>Day</th>{cats.map((c) => <th key={c}>{CAT_LABEL[c]}</th>)}<th>Level</th><th>Note</th></tr></thead>
            <tbody>
              {[...data.recent].reverse().map((d) => (
                <tr key={d.date}>
                  <td className="nowrap">{d.date}{!d.final && ' (so far)'}</td>
                  {cats.map((c) => <td key={c} className={`st-${d.results[c]?.status}`} title={d.results[c]?.detail}>{STATUS_ICON[d.results[c]?.status] || '–'}</td>)}
                  <td className="nowrap">{d.rest ? (d.rest === 'sick' ? '🤒 sick' : '🛌 rest') : LEVEL_TEXT[d.level]}{d.shield_used ? ' · 🛡' : ''}</td>
                  <td className="small muted">{[d.blocker, d.reason].filter(Boolean).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState icon="🧭" title="No check-ins yet">The mentor evaluates each day at {data.settings.evalTime} once your plan starts.</EmptyState>}

      <h3>Rest &amp; sick days <span className="small muted">({data.restDays.restLeft} rest · {data.restDays.sickLeft} sick left in {data.restDays.month})</span></h3>
      <form className="row gap wrap center-v" onSubmit={(e) => { e.preventDefault(); run(() => api.checkinRest({ ...rest, note: rest.note || null })); }}>
        <input type="date" value={rest.date} onChange={(e) => setRest({ ...rest, date: e.target.value })} required aria-label="Date" />
        <select value={rest.kind} onChange={(e) => setRest({ ...rest, kind: e.target.value })} aria-label="Kind"><option value="rest">Rest day (in advance)</option><option value="sick">Sick day</option></select>
        <input value={rest.note} onChange={(e) => setRest({ ...rest, note: e.target.value })} placeholder="note (optional)" maxLength={200} aria-label="Note" />
        <button className="btn primary" disabled={busy}>Add</button>
      </form>
      {data.restDays.list.length > 0 && (
        <ul className="small">{data.restDays.list.map((r) => <li key={r.date}>{r.date} · {r.kind === 'sick' ? '🤒 sick' : '🛌 rest'}{r.note ? ` · ${r.note}` : ''} <button className="link-btn" onClick={() => run(() => api.checkinUnrest(r.date))} aria-label={`Remove ${r.date}`}>remove</button></li>)}</ul>
      )}

      <h3>Commitments</h3>
      {data.commitments.length ? (
        <ul className="small">{[...data.commitments].reverse().map((c) => <li key={c.id}>{c.date} {c.planned_at}: {CAT_LABEL[c.category]}{c.place ? ` · ${c.place}` : ''} · {c.fulfilled == null ? 'planned' : c.fulfilled ? '✓ kept' : 'not kept'}</li>)}</ul>
      ) : <p className="small muted">None yet: commit to a time and place from the Mentor card on Today, or <code>/commit 7am desk dsa</code> on Telegram.</p>}

      <h3>Messages</h3>
      {data.messages.length ? data.messages.map((m) => <Message key={m.id} m={m} />) : <p className="small muted">The mentor's messages will appear here (and on Telegram).</p>}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
