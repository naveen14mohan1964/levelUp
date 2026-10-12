import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrorBox, Loading } from '../components/ui.jsx';
import { Link } from 'react-router-dom';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Everything the LinkedIn automation uses, editable here (slots, pillars, voice, safety). */
export default function LinkedInSettings({ onPausedChange }) {
  const [cfg, setCfg] = useState(null);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api.liConfig().then(setCfg).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorBox error={error} />;
  if (!cfg) return <Loading />;

  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const setSlot = (i, k, v) => set('slots', cfg.slots.map((s, j) => (j === i ? { ...s, [k]: k === 'day' ? Number(v) : v } : s)));
  const setPillar = (i, k, v) => set('pillars', cfg.pillars.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  async function save() {
    setMsg(null);
    try {
      const saved = await api.liSaveConfig({
        slots: cfg.slots, pillars: cfg.pillars, voice_samples: cfg.voice_samples, auto_approve: cfg.auto_approve,
        avoid_employer: cfg.avoid_employer, employer_name: cfg.employer_name,
        daily_cap: Number(cfg.daily_cap), weekly_cap: Number(cfg.weekly_cap), work_start: cfg.work_start, work_end: cfg.work_end,
        work_days: cfg.work_days, delay_min_s: Number(cfg.delay_min_s), delay_max_s: Number(cfg.delay_max_s), premium: cfg.premium,
        note_budget_month: Number(cfg.note_budget_month), my_intro: cfg.my_intro, note_template: cfg.note_template,
        build_log: cfg.build_log, years_experience: Number(cfg.years_experience),
      });
      setCfg(saved);
      setMsg({ ok: true, text: 'Saved ✓' });
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
  }

  return (
    <>
      <section className="card">
        <h2>🔌 LinkedIn connection</h2>
        <p className="small">Your account, posting permission and connections sync live on the <Link to="/linkedin/connector">🔌 Connector</Link> tab.</p>
      </section>

      <section className="card">
        <h2>🗓️ Post slots</h2>
        <p className="muted small">Two posts a week. Weekday mornings tend to reach the most people.</p>
        {cfg.slots.map((s, i) => (
          <div key={i} className="row gap center-v wrap li-slot-row">
            <strong>Post {i + 1}</strong>
            <select value={s.day} onChange={(e) => setSlot(i, 'day', e.target.value)}>{DAYS.map((d, n) => <option key={d} value={n}>{d}</option>)}</select>
            <input type="time" value={s.time} onChange={(e) => setSlot(i, 'time', e.target.value)} />
          </div>
        ))}
      </section>

      <section className="card">
        <h2>🧭 Content pillars</h2>
        <p className="muted small">Drafts rotate through these. The hint tells the AI what kind of posts belong in the pillar.</p>
        {cfg.pillars.map((p, i) => (
          <div key={i} className="li-pillar">
            <input value={p.name} onChange={(e) => setPillar(i, 'name', e.target.value)} placeholder="Pillar name" maxLength={100} />
            <input value={p.hint} onChange={(e) => setPillar(i, 'hint', e.target.value)} placeholder="What posts in this pillar are about" maxLength={300} />
            {cfg.pillars.length > 1 && <button className="link-btn" onClick={() => set('pillars', cfg.pillars.filter((_, j) => j !== i))}>Remove</button>}
          </div>
        ))}
        {cfg.pillars.length < 8 && <button className="btn" onClick={() => set('pillars', [...cfg.pillars, { name: '', hint: '' }])}>+ Add pillar</button>}
      </section>

      <section className="card">
        <h2>🗣️ Your voice</h2>
        <p className="muted small">
          Paste 3–5 things <strong>you</strong> wrote: old posts, emails, long Slack messages, a README. Drafts copy your tone, sentence length and words.
          Stored only in your local database.
        </p>
        <textarea className="notes" rows={10} value={cfg.voice_samples} onChange={(e) => set('voice_samples', e.target.value)} placeholder="Paste your writing samples here, separated by blank lines…" />
        <div className="muted small">{cfg.voice_samples.length.toLocaleString('en-IN')}/20,000 characters</div>
      </section>

      <section className="card">
        <h2>🏆 What you've built (proof points)</h2>
        <p className="muted small">
          The only achievements and numbers your posts may use, so drafts read like an experienced engineer instead of a beginner diary.
          One per line, specific and true (what you built, the hard part, a real number). Prefilled from this project; add your own wins.
          Never put anything confidential from work here.
        </p>
        <label className="field" style={{ maxWidth: 220 }}>
          <span className="field-label">Years of professional experience</span>
          <input type="number" min="0" max="40" step="0.5" value={cfg.years_experience} onChange={(e) => set('years_experience', e.target.value)} />
        </label>
        <textarea className="notes top-gap-sm" rows={9} value={cfg.build_log} onChange={(e) => set('build_log', e.target.value)} placeholder="Built …, which … (one per line)" />
        <div className="muted small">{cfg.build_log.length.toLocaleString('en-IN')}/6,000 characters</div>
      </section>

      <section className="card">
        <h2>🤝 Outreach limits</h2>
        <p className="muted small">
          Hard limits on how many connection requests you can mark as sent. LinkedIn's own ceiling is about 100 per week, and many ignored
          invitations can get an account restricted, so start low and grow only if your acceptance rate is healthy (above 30%).
        </p>
        <div className="goal-grid">
          <label className="field"><span className="field-label">Per day</span><input type="number" min="1" max="30" value={cfg.daily_cap} onChange={(e) => set('daily_cap', e.target.value)} /></label>
          <label className="field"><span className="field-label">Per rolling 7 days</span><input type="number" min="1" max="100" value={cfg.weekly_cap} onChange={(e) => set('weekly_cap', e.target.value)} /></label>
          <label className="field"><span className="field-label">Outreach hours from</span><input type="time" value={cfg.work_start} onChange={(e) => set('work_start', e.target.value)} /></label>
          <label className="field"><span className="field-label">until</span><input type="time" value={cfg.work_end} onChange={(e) => set('work_end', e.target.value)} /></label>
          <label className="field"><span className="field-label">Pause between sends: min (s)</span><input type="number" min="10" max="600" value={cfg.delay_min_s} onChange={(e) => set('delay_min_s', e.target.value)} /></label>
          <label className="field"><span className="field-label">max (s)</span><input type="number" min="10" max="900" value={cfg.delay_max_s} onChange={(e) => set('delay_max_s', e.target.value)} /></label>
        </div>
        <div className="row gap wrap top-gap">
          {DAYS.map((d, n) => (
            <label key={d} className="li-check small">
              <input type="checkbox" checked={cfg.work_days.includes(n)} onChange={(e) => set('work_days', e.target.checked ? [...cfg.work_days, n] : cfg.work_days.filter((x) => x !== n))} />
              <span>{d.slice(0, 3)}</span>
            </label>
          ))}
        </div>
        <label className="li-check top-gap">
          <input type="checkbox" checked={cfg.premium} onChange={(e) => set('premium', e.target.checked)} />
          <span>I have LinkedIn Premium (unlimited personalised notes, 300 characters; free accounts get about 5 a month, 200 characters)</span>
        </label>
        {!cfg.premium && (
          <label className="field top-gap" style={{ maxWidth: 260 }}>
            <span className="field-label">Personalised notes per month</span>
            <input type="number" min="0" max="100" value={cfg.note_budget_month} onChange={(e) => set('note_budget_month', e.target.value)} />
          </label>
        )}
        <label className="field top-gap">
          <span className="field-label">About me (the AI uses this when writing notes)</span>
          <input value={cfg.my_intro} onChange={(e) => set('my_intro', e.target.value)} maxLength={300} />
        </label>
        <label className="field top-gap">
          <span className="field-label">Default note template. Variables: {'{{first_name}} {{name}} {{role}} {{company}} {{location}}'}</span>
          <textarea className="notes" rows={2} value={cfg.note_template} onChange={(e) => set('note_template', e.target.value)} maxLength={400} />
        </label>
      </section>

      <section className="card">
        <h2>🛡️ Safety</h2>
        <label className="li-check">
          <input type="checkbox" checked={cfg.avoid_employer} onChange={(e) => set('avoid_employer', e.target.checked)} />
          <span>Keep my employer out of posts (no company name, clients or internal work)</span>
        </label>
        {cfg.avoid_employer && (
          <input className="search top-gap" value={cfg.employer_name} onChange={(e) => set('employer_name', e.target.value)} placeholder="Employer name the AI must never mention (optional)" />
        )}
        <label className="li-check top-gap">
          <input type="checkbox" checked={cfg.auto_approve} onChange={(e) => set('auto_approve', e.target.checked)} />
          <span>Auto-approve AI drafts (they get scheduled without your review). <strong>Recommended: off</strong> until you trust the drafts.</span>
        </label>
        <p className="muted small top-gap">
          Kill switch: {cfg.paused ? '⏸ automation is PAUSED' : '▶ automation is running'}. Use the button at the top of the LinkedIn page to pause or resume everything.
        </p>
      </section>

      <div className="row gap center-v">
        <button className="btn primary" onClick={save}>Save settings</button>
        {msg && <span className={`small ${msg.ok ? 'ok-text' : 'form-error'}`}>{msg.text}</span>}
      </div>
    </>
  );
}
