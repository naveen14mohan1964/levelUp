import { useEffect, useState } from 'react';
import { api } from '../api.js';

/** Settings → The Mentor: strictness (tone only), times, time zone, Telegram, vacation, rest/sick allowance, goals. */
const CATS = [['dsa', 'DSA'], ['learning', 'Learning (AI/LLD/HLD)'], ['project', 'Project'], ['workout', 'Workout'], ['nutrition', 'Nutrition']];

export default function MentorSettings() {
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.settings().then((s) => setF({
      mentor_enabled: s.mentor_enabled !== '0', mentor_strictness: s.mentor_strictness || 'standard', mentor_eval_time: s.mentor_eval_time || '23:00',
      mentor_morning: s.mentor_morning !== '0', mentor_morning_time: s.mentor_morning_time || '06:30', mentor_tz: s.mentor_tz || '',
      mentor_telegram: s.mentor_telegram !== '0', mentor_pause_until: s.mentor_pause_until || '', mentor_rest_per_month: s.mentor_rest_per_month ?? '2',
      mentor_sick_per_month: s.mentor_sick_per_month ?? '3', mentor_learning_minutes: s.mentor_learning_minutes ?? '30',
      mentor_categories: String(s.mentor_categories || CATS.map((c) => c[0]).join(',')).split(','),
    })).catch((e) => setError(e.message));
  }, []);
  if (!f) return error ? <section className="card"><div className="form-error">{error}</div></section> : null;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg(null); setError(null);
    try {
      await api.saveSettings({ ...f, mentor_categories: f.mentor_categories.join(',') });
      setMsg('Saved.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setMsg(null); setError(null);
    try { const r = await api.checkinTestMessage(); setMsg(`Test message sent (${r.channel}${r.source === 'template' ? ', template' : ''}): "${r.content.split('\n')[0].slice(0, 90)}…"`); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <section className="card mentor-settings">
      <h2>🧭 The Mentor</h2>
      <p className="muted small">A strict but supportive coach: checks your goals every evening, tells you what slipped and the one thing to do next. Strictness changes the tone only: it never insults you.</p>
      <form onSubmit={save} className="mentor-settings-form">
        <label className="check"><input type="checkbox" checked={f.mentor_enabled} onChange={set('mentor_enabled')} /> Mentor on</label>
        <fieldset className="seg" aria-label="Strictness">
          <legend className="field-label">Strictness</legend>
          {[['gentle', 'Gentle'], ['standard', 'Standard'], ['drill', 'Drill sergeant']].map(([v, label]) => (
            <label key={v} className={`seg-opt${f.mentor_strictness === v ? ' on' : ''}`}><input type="radio" name="strict" value={v} checked={f.mentor_strictness === v} onChange={set('mentor_strictness')} />{label}</label>
          ))}
        </fieldset>
        <div className="grid-fields">
          <label className="field"><span className="field-label">Evening check-in</span><input type="time" value={f.mentor_eval_time} onChange={set('mentor_eval_time')} required /></label>
          <label className="field"><span className="field-label">Morning message</span><input type="time" value={f.mentor_morning_time} onChange={set('mentor_morning_time')} disabled={!f.mentor_morning} /></label>
          <label className="field"><span className="field-label">Time zone (empty = this machine)</span><input value={f.mentor_tz} onChange={set('mentor_tz')} placeholder="Asia/Kolkata" /></label>
          <label className="field"><span className="field-label">Vacation until (pauses messages)</span><input type="date" value={f.mentor_pause_until} onChange={set('mentor_pause_until')} /></label>
          <label className="field"><span className="field-label">Rest days / month</span><input type="number" min="0" max="10" value={f.mentor_rest_per_month} onChange={set('mentor_rest_per_month')} /></label>
          <label className="field"><span className="field-label">Sick days / month</span><input type="number" min="0" max="10" value={f.mentor_sick_per_month} onChange={set('mentor_sick_per_month')} /></label>
          <label className="field"><span className="field-label">Learning goal (min/day)</span><input type="number" min="5" max="240" value={f.mentor_learning_minutes} onChange={set('mentor_learning_minutes')} /></label>
        </div>
        <div className="row gap wrap">
          <label className="check"><input type="checkbox" checked={f.mentor_morning} onChange={set('mentor_morning')} /> Morning message</label>
          <label className="check"><input type="checkbox" checked={f.mentor_telegram} onChange={set('mentor_telegram')} /> Send on Telegram too</label>
        </div>
        <fieldset aria-label="Goals the mentor checks"><legend className="field-label">Goals it checks</legend>
          <div className="row gap wrap">
            {CATS.map(([k, label]) => (
              <label key={k} className="check"><input type="checkbox" checked={f.mentor_categories.includes(k)} onChange={(e) => setF({ ...f, mentor_categories: e.target.checked ? [...f.mentor_categories, k] : f.mentor_categories.filter((c) => c !== k) })} /> {label}</label>
            ))}
          </div>
        </fieldset>
        <div className="row gap wrap top-gap">
          <button className="btn primary" disabled={busy || !f.mentor_categories.length}>Save</button>
          <button type="button" className="btn" disabled={busy} onClick={test}>Send a test message</button>
        </div>
        {msg && <div className="small ok-text top-gap">{msg}</div>}
        {error && <div className="form-error">{error}</div>}
      </form>
    </section>
  );
}
