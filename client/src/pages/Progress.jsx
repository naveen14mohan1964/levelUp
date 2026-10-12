import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { formatShort, todayISO } from '../dates.js';
import { ErrorBox, Loading, ProgressBar } from '../components/ui.jsx';
import WeightChart from '../components/WeightChart.jsx';
import { DateNav, NumberField, SaveError } from '../components/tracking.jsx';

// Progress tracker: weigh-in, weight trend + badges, weekly measurements, progress photos (+ optional AI comparison).
export default function Progress() {
  const params = useParams();
  const navigate = useNavigate();
  const date = params.date || todayISO();
  const goTo = (d) => navigate(d === todayISO() ? '/progress' : `/progress/day/${d}`);

  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [goals, summary, settings] = await Promise.all([api.goals(date), api.workoutSummary(date), api.settings()]);
      setState({ goals, summary, settings });
    } catch (e) {
      setError(e.message);
    }
  }, [date]);
  useEffect(() => { setState(null); load(); }, [load]);

  async function act(fn) {
    try {
      await fn();
      setSaveError(null);
      await load();
    } catch (e) {
      setSaveError(e.message);
    }
  }

  if (error) return <ErrorBox error={error} />;
  if (!state) return <Loading />;
  const { goals, summary, settings } = state;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>📈 Progress</h1>
          <div className="muted small">Weigh in every morning; measure on Sundays; photos every 2 weeks</div>
        </div>
      </div>

      <DateNav date={date} goTo={goTo} />
      <SaveError error={saveError} onDismiss={() => setSaveError(null)} />

      <WeightCard date={date} goals={goals} summary={summary} act={act} />
      <Measurements date={date} goals={goals} act={act} />
      <ProgressPhotos date={date} aiOn={settings.progress_ai === 1} geminiOn={settings.gemini_configured}
        onToggleAi={(on) => act(() => api.saveSettings({ progress_ai: on }))} />
    </>
  );
}

/* --------------------------- weigh-in + weight trend --------------------------- */
function WeightCard({ date, goals, summary, act }) {
  const w = summary.weight;
  const next = w.next;
  return (
    <section className="card">
      <h2>⚖️ Weight</h2>
      <div className="quick-inputs">
        <NumberField label="Morning weight (kg)" step="0.1" value={goals.body.weight_kg} onSave={(v) => act(() => api.saveBody(date, { weight_kg: v }))} />
      </div>
      <div className="stat-row top-gap">
        <div className="stat"><strong>{w.latest ? w.latest.avg7.toFixed(1) : w.startWeight}</strong><span>kg now (7-day avg)</span></div>
        <div className="stat"><strong>{w.lost > 0 ? `−${w.lost}` : w.lost}</strong><span>kg lost since {w.startWeight}</span></div>
        <div className="stat"><strong>{w.toGoal}</strong><span>kg to goal ({w.goalWeight})</span></div>
      </div>

      {next && (
        <div className="next-badge">
          <div className="row center-v" style={{ justifyContent: 'space-between' }}>
            <span>Next badge: <strong>{next.icon} {next.name}</strong> at {next.kg} kg</span>
            <span className="small">{next.remainingKg} kg to go</span>
          </div>
          <ProgressBar value={Math.round(next.progress * 100)} total={100} />
        </div>
      )}

      <WeightChart series={w.series} milestone={next} />

      <div className="badges">
        {w.badges.map((b) => (
          <div key={b.kg} aria-disabled={!b.unlocked || undefined} className={`badge${b.unlocked ? ' unlocked' : ''}`} title={b.unlocked ? 'Unlocked!' : `Reach a 7-day average of ${b.kg} kg`}>
            <span className="badge-icon">{b.unlocked ? b.icon : '🔒'}</span>
            <span className="badge-name">{b.name}</span>
            <span className="muted small">{b.kg} kg</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------- measurements ------------------------------ */
const MEASURES = [
  { k: 'waist_cm', label: 'Waist (at navel)' }, { k: 'chest_cm', label: 'Chest' }, { k: 'hips_cm', label: 'Hips' },
  { k: 'arm_cm', label: 'Upper arm' }, { k: 'thigh_cm', label: 'Thigh' },
];

function Measurements({ date, goals, act }) {
  const [history, setHistory] = useState([]);
  useEffect(() => {
    api.bodyHistory(400).then((h) => setHistory(h.filter((x) => MEASURES.some((m) => x[m.k] != null)).reverse())).catch(() => {});
  }, [goals]);
  const isSunday = new Date(date + 'T00:00:00').getDay() === 0;

  return (
    <section className="card">
      <h2>📏 Measurements <span className="muted small">{isSunday ? '· it\'s Sunday, measure today' : '· weekly, on Sundays'}</span></h2>
      <p className="muted small">The tape measure is your real size metric: same spot, same time (morning, before food), tape snug but not tight.</p>
      <div className="quick-inputs">
        {MEASURES.map((m) => (
          <NumberField key={m.k} label={`${m.label} (cm)`} step="0.5" value={goals.body[m.k]} onSave={(v) => act(() => api.saveBody(date, { [m.k]: v }))} />
        ))}
      </div>
      {history.length > 0 && (
        <table className="data-table top-gap">
          <thead><tr><th>Date</th>{MEASURES.map((m) => <th key={m.k}>{m.label.split(' ')[0]}</th>)}</tr></thead>
          <tbody>
            {history.slice(0, 8).map((h) => (
              <tr key={h.log_date}><td>{formatShort(h.log_date)}</td>{MEASURES.map((m) => <td key={m.k}>{h[m.k] ?? '—'}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ------------------------------ progress photos ----------------------------- */
function ProgressPhotos({ date, aiOn, geminiOn, onToggleAi }) {
  const [photos, setPhotos] = useState([]);
  const [pose, setPose] = useState('front');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = useCallback(() => api.progressPhotos().then(setPhotos).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  // Photos sent from Telegram may still be waiting for their AI comparison: refresh until they are done.
  useEffect(() => {
    if (!photos.some((p) => p.ai_status === 'pending')) return undefined;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [photos, load]);

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('photo', file);
    fd.append('pose', pose);
    fd.append('date', date);
    setBusy('upload');
    try {
      await api.uploadProgressPhoto(fd);
      setError(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function analyze(p) {
    setBusy(p.id);
    try {
      await api.analyzeProgressPhoto(p.id);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
      load();
    }
  }

  const byDate = photos.reduce((acc, p) => ((acc[p.log_date] ||= []).push(p), acc), {});

  return (
    <section className="card">
      <h2>📸 Progress photos <span className="muted small">· every 2 weeks, same light, clothes and distance</span></h2>
      <p className="muted small">
        Stored on this computer (tracker/server/uploads/progress). From your phone: send the photo to your Telegram bot with the
        caption <code>progress front</code> (or side / back). <Link to="/settings">Bot setup</Link>
      </p>

      <label className="row gap center-v small ai-toggle">
        <input type="checkbox" checked={aiOn} disabled={!geminiOn} onChange={(e) => onToggleAi(e.target.checked)} />
        <span>
          <strong>🤖 AI comparison</strong>: compare each new photo with your last one in the same pose and give a rough body-fat range.
          {' '}<span className="muted">When on, these photos are sent to Google Gemini. On the free tier Google may use them to improve
          its products, and reviewers may see them. Leave it off if you'd rather keep them on this computer only.</span>
        </span>
      </label>

      <div className="row gap wrap center-v top-gap">
        <select value={pose} onChange={(e) => setPose(e.target.value)}>
          <option value="front">Front</option><option value="side">Side</option><option value="back">Back</option>
        </select>
        <label className="btn file-btn">
          {busy === 'upload' ? 'Uploading…' : `⬆ Add ${pose} photo for ${formatShort(date)}`}
          <input type="file" accept="image/*" onChange={upload} hidden disabled={!!busy} />
        </label>
      </div>
      {error && <div className="form-error">{error}</div>}

      {Object.entries(byDate).map(([d, list]) => (
        <div key={d} className="photo-day">
          <div className="small muted">{formatShort(d)}</div>
          <div className="photo-row">
            {list.map((p) => (
              <figure key={p.id} className="photo">
                <a href={p.photo_url} target="_blank" rel="noreferrer"><img src={p.photo_url} alt={`${p.pose} on ${d}`} loading="lazy" /></a>
                <figcaption className="small">
                  {p.pose}{p.source === 'telegram' ? ' · 📲' : ''}{' '}
                  <button className="link-btn" onClick={async () => { if (confirm('Delete this photo?')) { await api.deleteProgressPhoto(p.id); load(); } }}>delete</button>
                </figcaption>
              </figure>
            ))}
          </div>
          {list.map((p) => (
            <PhotoAnalysis key={p.id} p={p} aiOn={aiOn} busy={busy === p.id} onAnalyze={() => analyze(p)} />
          ))}
        </div>
      ))}
    </section>
  );
}

function PhotoAnalysis({ p, aiOn, busy, onAnalyze }) {
  const a = p.ai;
  if (busy || p.ai_status === 'pending') return <div className="ai-note small muted">🤖 Comparing your {p.pose} photo…</div>;
  if (!a) {
    if (!aiOn) return null;
    return (
      <div className="ai-note small">
        {p.ai_status === 'failed' && <span className="warn-text">Last try failed: {p.ai_error}. </span>}
        <button className="link-btn" onClick={onAnalyze}>🤖 Compare this {p.pose} photo</button>
      </div>
    );
  }
  return (
    <div className="ai-note small">
      <div><strong>🤖 {p.pose}</strong>{a.compared_with ? ` vs ${formatShort(a.compared_with)}` : ' (first photo in this pose: baseline)'}</div>
      {a.changes?.length > 0 && <ul>{a.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>}
      {a.body_fat && (
        <div>Body fat (rough visual estimate): <strong>{a.body_fat.low}–{a.body_fat.high}%</strong> <span className="muted">· {a.body_fat.confidence} confidence, the tape measure is more reliable</span></div>
      )}
      {a.consistency_tip && <div className="muted">📷 Next time: {a.consistency_tip}</div>}
      {a.encouragement && <div>💪 {a.encouragement}</div>}
    </div>
  );
}
