import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ErrorBox, Loading } from '../components/ui.jsx';
import TelegramCard from '../components/TelegramCard.jsx';
import DevTools from '../components/DevTools.jsx';
import MentorSettings from '../components/MentorSettings.jsx';
import AppCard from '../components/AppCard.jsx';

const GOAL_FIELDS = [
  { k: 'height_cm', label: 'Height (cm)' },
  { k: 'start_weight_kg', label: 'Start weight (kg)' },
  { k: 'goal_weight_kg', label: 'Goal weight (kg)' },
  { k: 'calorie_target', label: 'Calories / day (kcal)' },
  { k: 'protein_target_g', label: 'Protein / day (g)' },
  { k: 'water_target_ml', label: 'Water / day (ml)' },
  { k: 'sleep_target_h', label: 'Sleep (hours)' },
];

export default function Settings() {
  const [s, setS] = useState(null);
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [lc, setLc] = useState({ username: '', status: null, checking: false, error: null, profile: null });

  useEffect(() => {
    Promise.all([api.settings(), api.leetcodeStatus()])
      .then(([settings, status]) => {
        setS(settings);
        setForm(Object.fromEntries(GOAL_FIELDS.map((f) => [f.k, settings[f.k] ?? ''])));
        setLc((x) => ({ ...x, username: settings.leetcode_username || '', status }));
      })
      .catch((e) => setError(e.message));
  }, []);

  async function saveGoals(e) {
    e.preventDefault();
    try {
      setS(await api.saveSettings(form));
      setMsg('Saved ✓');
      setTimeout(() => setMsg(null), 2000);
    } catch (err) {
      setMsg(err.message);
    }
  }

  async function saveLeetCode(e) {
    e.preventDefault();
    const username = lc.username.trim();
    setLc((x) => ({ ...x, checking: true, error: null, profile: null }));
    try {
      const profile = username ? await api.leetcodeProfile(username) : null; // verify it exists first
      await api.saveSettings({ leetcode_username: username });
      const sync = username ? await api.leetcodeSync() : null;
      setLc((x) => ({ ...x, checking: false, profile, status: { username, lastSync: sync } }));
    } catch (err) {
      setLc((x) => ({ ...x, checking: false, error: err.message }));
    }
  }

  if (error) return <ErrorBox error={error} />;
  if (!s) return <Loading />;
  const last = lc.status?.lastSync;

  return (
    <>
      <div className="page-head"><h1>⚙️ Settings</h1></div>

      <section className="card">
        <h2>⚡ LeetCode auto-sync</h2>
        <p className="muted small">
          Uses LeetCode's public profile data: your recently accepted submissions tick the matching problems here every 30 minutes.
          Your profile must be public (the default). Time taken and failed attempts aren't public, so you still enter those yourself.
        </p>
        <form className="row gap wrap center-v" onSubmit={saveLeetCode}>
          <input className="search" placeholder="LeetCode username" value={lc.username} onChange={(e) => setLc((x) => ({ ...x, username: e.target.value }))} />
          <button className="btn primary" disabled={lc.checking}>{lc.checking ? 'Checking…' : 'Save & sync'}</button>
        </form>
        {lc.error && <div className="form-error">{lc.error}</div>}
        {lc.profile && (
          <div className="small top-gap">
            ✓ Found <strong>{lc.profile.username}</strong>: {lc.profile.solved.All} solved on LeetCode ({lc.profile.solved.Easy} E · {lc.profile.solved.Medium} M · {lc.profile.solved.Hard} H)
          </div>
        )}
        {last && !last.skipped && (
          <div className="small muted top-gap">
            Last sync {new Date(last.checkedAt).toLocaleString('en-IN')}: checked {last.checked}, ticked {last.newlySolved.length}, added {last.added.length}.
          </div>
        )}
      </section>

      <section className="card">
        <h2>🎯 Body & nutrition goals</h2>
        <p className="muted small">
          Defaults come from WORKOUT_PLAN.md (~2,000–2,100 kcal assumes male physiology; adjust if that's wrong).
          Step targets follow the plan automatically (5,000 → 10,000 by Week 11).
        </p>
        <form onSubmit={saveGoals}>
          <div className="goal-grid">
            {GOAL_FIELDS.map((f) => (
              <label key={f.k} className="field">
                <span className="field-label">{f.label}</span>
                <input type="number" step="any" min="0" value={form[f.k]} onChange={(e) => setForm((x) => ({ ...x, [f.k]: e.target.value }))} />
              </label>
            ))}
          </div>
          <div className="row gap center-v top-gap">
            <button className="btn primary">Save goals</button>
            {msg && <span className="small">{msg}</span>}
          </div>
        </form>
      </section>

      <section className="card">
        <h2>🤖 AI (Gemini)</h2>
        <p className="small">
          Status: {s.gemini_configured ? <span className="ok-text">✓ configured</span> : <span className="warn-text">not configured: add GEMINI_API_KEY to tracker/server/.env</span>}
        </p>
        <p className="muted small">Used for meal photo → calorie estimates. The key stays on your machine's server and is never sent to the browser.</p>
      </section>

      <AppCard />
      <TelegramCard />
      <MentorSettings />
      {/* dev server only (npm run dev): never shown on the always-on app */}
      {import.meta.env.DEV && <DevTools />}
    </>
  );
}
