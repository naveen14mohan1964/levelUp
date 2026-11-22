import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CaretDown, CheckCircle, Pause, Play, Plus, Trash } from '@phosphor-icons/react';
import { api } from '../api.js';
import { STAT_META, areaByKey } from '../areas.js';
import { formatShort, todayISO } from '../dates.js';
import { refreshGame, useGame } from '../game.jsx';
import { sectionProgress } from '../components/Sidebar.jsx';
import { ErrorBox, Loading, Md, ProgressBar, ProgressRing } from '../components/ui.jsx';
import { EmptyState } from '../components/fx.jsx';

const MAX_ACTIVE_TRACKS = 3;
const HEALTH = ['workout', 'meals'];
const PARKED_PAGES = ['cards', 'assignments', 'mentor', 'linkedin'];
const STAT_KEYS = ['career', 'fitness', 'knowledge', 'discipline'];
const WEEKS = 22;

function planLine(meta) {
  if (!meta) return null;
  const today = todayISO();
  if (today < meta.startDate) return `Starts ${formatShort(meta.startDate)} · ${WEEKS} weeks`;
  const week = Math.min(WEEKS, Math.floor((Date.parse(today) - Date.parse(meta.startDate)) / (7 * 86400000)) + 1);
  return `Week ${week} of ${WEEKS} · ends ${formatShort(meta.endDate)}`;
}

/** One goal: progress, its steps as a checklist, the next step called out, and finish / pause / delete. */
function GoalCard({ goal, act }) {
  const [step, setStep] = useState('');
  const { Icon, color, label } = STAT_META[goal.stat] || STAT_META.career;
  const addStep = (e) => { e.preventDefault(); if (step.trim()) act(() => api.addGoalStep(goal.id, step)).then(() => setStep('')); };
  return (
    <section className="card quest" style={{ '--stat': color }} aria-label={goal.title}>
      <header className="goal-head">
        <span className="stat-icon" aria-hidden="true"><Icon size={18} weight="fill" /></span>
        <div className="goal-title">
          <h3>{goal.title}</h3>
          <div className="muted small">{label}{goal.targetDate ? ` · by ${formatShort(goal.targetDate)}` : ''}{goal.total ? ` · ${goal.done} of ${goal.total} steps` : ''}</div>
        </div>
      </header>
      {goal.total > 0 && <ProgressBar value={goal.done} total={goal.total} />}
      {goal.nextStep && <div className="goal-next"><span className="muted">Next step</span> {goal.nextStep.title}</div>}
      {goal.steps.length > 0 && (
        <ul className="goal-steps">
          {goal.steps.map((s) => (
            <li key={s.id}>
              <label className={s.done ? 'done' : ''}>
                <input type="checkbox" checked={s.done} onChange={() => act(() => api.setGoalStep(s.id, !s.done))} />
                <span>{s.title}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <form className="goal-add" onSubmit={addStep}>
        <input type="text" value={step} maxLength={200} placeholder="Add a small step" aria-label={`Add a step to ${goal.title}`} onChange={(e) => setStep(e.target.value)} />
        <button className="btn" disabled={!step.trim()}><Plus size={14} aria-hidden="true" /> Add</button>
      </form>
      <div className="goal-actions">
        <button type="button" className="link-btn" onClick={() => act(() => api.setGoalStatus(goal.id, 'done'))}><CheckCircle size={14} aria-hidden="true" /> Mark as achieved</button>
        <button type="button" className="link-btn" onClick={() => act(() => api.setGoalStatus(goal.id, 'paused'))}><Pause size={14} aria-hidden="true" /> Pause</button>
        <button type="button" className="link-btn danger" onClick={() => { if (window.confirm(`Delete the goal "${goal.title}" and its steps?`)) act(() => api.deleteGoal(goal.id)); }}><Trash size={14} aria-hidden="true" /> Delete</button>
      </div>
    </section>
  );
}

function NewGoal({ act, onDone }) {
  const [f, setF] = useState({ title: '', stat: 'career', targetDate: '', steps: '' });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = (e) => {
    e.preventDefault();
    act(() => api.addGoal({ title: f.title, stat: f.stat, targetDate: f.targetDate || null, steps: f.steps.split('\n') })).then((ok) => { if (ok) onDone(); });
  };
  return (
    <form className="card goal-new" onSubmit={submit}>
      <h3>New goal</h3>
      <label className="field"><span className="field-label">What do you want to achieve?</span>
        <input type="text" value={f.title} maxLength={200} placeholder="For example: get a 20 LPA offer" onChange={set('title')} required /></label>
      <div className="goal-new-row">
        <label className="field"><span className="field-label">It grows your</span>
          <select value={f.stat} onChange={set('stat')}>{STAT_KEYS.map((k) => <option key={k} value={k}>{STAT_META[k].label}</option>)}</select></label>
        <label className="field"><span className="field-label">By when (optional)</span>
          <input type="date" value={f.targetDate} min={todayISO()} onChange={set('targetDate')} /></label>
      </div>
      <label className="field"><span className="field-label">First small steps, one per line (optional)</span>
        <textarea rows={3} value={f.steps} placeholder={'Finish week 1 of the plan\nUpdate my resume'} onChange={set('steps')} /></label>
      <div className="row gap center-v top-gap">
        <button className="btn primary" disabled={!f.title.trim()}>Add goal</button>
        <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

/**
 * Journey: where you are going and the few things you are working on now.
 * At most 3 goals and 3 learning tracks are active at once; everything else is parked (hidden from Today,
 * progress kept, one click to bring back). Fewer open fronts is what makes each one finishable.
 */
export default function Journey() {
  const { game, today, active } = useGame();
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    Promise.all([api.lifeGoals(), api.meta()]).then(([g, m]) => { setData(g); setMeta(m); }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Runs a goal change and shows the fresh list; returns true when it worked.
  async function act(fn) {
    try { setFormError(null); setData(await fn()); return true; } catch (e) { setFormError(e.message); return false; }
  }
  async function setActive(list) {
    try { setFormError(null); await api.saveSettings({ active_tracks: list }); refreshGame(); } catch (e) { setFormError(e.message); }
  }

  if (error) return <ErrorBox error={error} onRetry={() => { setError(null); load(); }} />;
  if (!data || !game) return <Loading />;

  const goals = data.goals.filter((g) => g.status === 'active');
  const shelved = data.goals.filter((g) => g.status !== 'active');
  const tracks = game.tracks.filter((t) => active.includes(t.key));
  const parked = game.tracks.filter((t) => !active.includes(t.key));
  const full = active.length >= MAX_ACTIVE_TRACKS;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Journey</h1>
          <div className="muted small">Where you are going, and the few things you are working on now.</div>
        </div>
      </div>

      <h2 className="section-label first">Your goals</h2>
      <section className="card quest main-quest" style={{ '--stat': STAT_META.career.color }}>
        <header className="goal-head">
          <span className="stat-icon" aria-hidden="true"><STAT_META.career.Icon size={18} weight="fill" /></span>
          <div className="goal-title">
            <h3>The 5 month plan: interview ready</h3>
            <div className="muted small">{planLine(meta)}</div>
          </div>
          <Link to="/dsa/plan" className="goal-open">See the plan <ArrowRight size={14} aria-hidden="true" /></Link>
        </header>
      </section>
      {goals.map((g) => <GoalCard key={g.id} goal={g} act={act} />)}
      {adding ? <NewGoal act={act} onDone={() => setAdding(false)} /> : goals.length < data.maxActive ? (
        <button type="button" className="card add-goal" onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" /> Add a goal <span className="muted small">{goals.length ? `${goals.length} of ${data.maxActive} active` : 'Keep it to the few that matter most'}</span></button>
      ) : <p className="muted small goal-full">You have {data.maxActive} active goals, which is the limit on purpose. Finish or pause one to add another.</p>}
      {formError && <div className="form-error">{formError}</div>}
      {shelved.length > 0 && (
        <details className="fold">
          <summary>Paused and achieved ({shelved.length}) <CaretDown size={14} aria-hidden="true" /></summary>
          <ul className="shelf">
            {shelved.map((g) => (
              <li key={g.id} className="card">
                <span>{g.status === 'done' ? <CheckCircle size={16} weight="fill" className="ok-text" aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />} {g.title}</span>
                <span className="shelf-actions">
                  <button type="button" className="link-btn" onClick={() => act(() => api.setGoalStatus(g.id, 'active'))}><Play size={14} aria-hidden="true" /> {g.status === 'done' ? 'Reopen' : 'Resume'}</button>
                  <button type="button" className="link-btn danger" onClick={() => { if (window.confirm(`Delete the goal "${g.title}"?`)) act(() => api.deleteGoal(g.id)); }}><Trash size={14} aria-hidden="true" /> Delete</button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <h2 className="section-label">Working on now</h2>
      <div className="track-grid">
        {tracks.map((t) => {
          const a = areaByKey[t.key];
          return (
            <section key={t.key} className="card track-card" style={{ '--area': a.color }}>
              <ProgressRing value={t.done} total={t.total} size={56} stroke={5} />
              <div className="track-text">
                <h3><a.Icon size={16} aria-hidden="true" /> {t.label}</h3>
                <div className="track-next">{t.next ? <Md text={t.next.title} /> : 'Complete. Well done.'}</div>
                <div className="track-actions">
                  <Link to={a.to}>Open <ArrowRight size={14} aria-hidden="true" /></Link>
                  {active.length > 1 && <button type="button" className="link-btn" onClick={() => setActive(active.filter((k) => k !== t.key))}>Park it</button>}
                </div>
              </div>
            </section>
          );
        })}
        {HEALTH.map((k) => {
          const a = areaByKey[k];
          const p = sectionProgress(k, game, today);
          return (
            <Link key={k} to={a.to} className="card track-card" style={{ '--area': a.color }}>
              <ProgressRing value={p?.value || 0} total={p?.total || 1} size={56} stroke={5} />
              <div className="track-text">
                <h3><a.Icon size={16} aria-hidden="true" /> {a.label}</h3>
                <div className="track-next">{p?.label || (k === 'workout' ? 'Rest day: recovery is part of the plan' : 'Log a meal to start')}</div>
              </div>
            </Link>
          );
        })}
      </div>

      <details className="fold">
        <summary>Parked for later ({parked.length + PARKED_PAGES.length}) <CaretDown size={14} aria-hidden="true" /></summary>
        <p className="muted small fold-note">
          Parked means out of sight, not lost: all progress is kept. Up to {MAX_ACTIVE_TRACKS} tracks can be active at once{full ? ', so park one before bringing another back' : ''}.
        </p>
        {parked.length ? (
          <ul className="shelf">
            {parked.map((t) => (
              <li key={t.key} className="card">
                <span>{t.label} <span className="muted small">{t.done ? `${t.done} of ${t.total} lessons done` : `${t.total} lessons, not started`}</span></span>
                <span className="shelf-actions">
                  <Link to={areaByKey[t.key].to}>Open</Link>
                  <button type="button" className="link-btn" disabled={full} onClick={() => setActive([...active, t.key])}><Play size={14} aria-hidden="true" /> Bring back</button>
                </span>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon="🧭" title="Nothing is parked">Every track is active.</EmptyState>}
        <ul className="shelf">
          {PARKED_PAGES.map((k) => (
            <li key={k} className="card"><span>{areaByKey[k].label}</span><span className="shelf-actions"><Link to={areaByKey[k].to}>Open</Link></span></li>
          ))}
        </ul>
      </details>
    </>
  );
}

