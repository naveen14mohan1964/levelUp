import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { todayISO } from '../dates.js';
import { ErrorBox, Loading, ProgressBar } from '../components/ui.jsx';
import { DateNav, Goal, NumberField, SaveError } from '../components/tracking.jsx';
import ExerciseGuide from '../components/ExerciseGuide.jsx';

// Workout tracker: today's session (with how-to demos), steps and sleep. Food + water live on Meals; weight,
// measurements and photos on Progress.
export default function Workout() {
  const params = useParams();
  const navigate = useNavigate();
  const date = params.date || todayISO();
  const goTo = (d) => navigate(d === todayISO() ? '/workout' : `/workout/day/${d}`);

  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [session, goals, summary] = await Promise.all([
        api.workoutDay(date), api.goals(date), api.workoutSummary(date),
      ]);
      setState({ session, goals, summary });
    } catch (e) {
      setError(e.message);
    }
  }, [date]);
  useEffect(() => { setState(null); load(); }, [load]);

  // Small helper: run an API call, then refresh the bits of the page that depend on it.
  async function act(fn, refresh = true) {
    try {
      await fn();
      setSaveError(null);
      if (refresh) await load();
    } catch (e) {
      setSaveError(e.message);
    }
  }

  if (error) return <ErrorBox error={error} />;
  if (!state) return <Loading />;
  const { session, goals, summary } = state;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>💪 Workout</h1>
          <div className="muted small">{session.week >= 1 ? `Week ${session.week} · ${session.phase}` : 'Plan starts Mon 5 Oct: log your baseline weight today'}</div>
        </div>
        <div className="streak-chip" title="Consecutive completed workout days (Sundays are rest and don't break it)">
          {summary.streak ? <>🔥 <strong>{summary.streak}</strong> day streak</> : '🌱 Today can be day 1'}
        </div>
      </div>

      <DateNav date={date} goTo={goTo} />
      <SaveError error={saveError} onDismiss={() => setSaveError(null)} />

      <TodayWorkout date={date} session={session} act={act} />
      <DailyGoals date={date} goals={goals} summary={summary} act={act} />
    </>
  );
}

/* ------------------------------ daily goals ------------------------------ */
function DailyGoals({ date, goals, summary, act }) {
  const { body, eaten, targets } = goals;
  const dayPath = (base) => (date === todayISO() ? base : `${base}/day/${date}`);
  const w = summary.weight;

  return (
    <section className="card">
      <h2>🎯 Activity</h2>
      <div className="goals">
        <Goal label="Steps" value={body.steps || 0} target={targets.steps} unit="" color="var(--streak)"
          sub={`Week target ${targets.steps.toLocaleString('en-IN')}`} />
        <Goal label="Sleep" value={body.sleep_h || 0} target={targets.sleep_h} unit="h" color="var(--dotnet)"
          sub={(body.sleep_h || 0) >= targets.sleep_h ? 'Rested 😴' : 'Recovery burns fat too'} />
      </div>

      <div className="quick-inputs">
        <NumberField label="Steps" step="100" value={body.steps} onSave={(v) => act(() => api.saveBody(date, { steps: v }))} />
        <NumberField label={`Sleep last night (h) · target ${targets.sleep_h}`} step="0.5" value={body.sleep_h} onSave={(v) => act(() => api.saveBody(date, { sleep_h: v }))} />
      </div>

      <Link to={dayPath('/progress')} className="meals-link small">
        ⚖️ Weight: {body.weight_kg ? `${body.weight_kg} kg today` : 'not logged today'}
        {w.latest ? ` · ${w.latest.avg7.toFixed(1)} kg 7-day avg` : ''} · {w.toGoal} kg to goal → Progress
      </Link>
      <Link to={dayPath('/meals')} className="meals-link small">
        🍽️ Food & water: {eaten.calories.toLocaleString('en-IN')} / {targets.calories.toLocaleString('en-IN')} kcal ·{' '}
        {Math.round(eaten.protein_g)} / {targets.protein_g} g protein · {(body.water_ml || 0).toLocaleString('en-IN')} ml water → Meals
      </Link>
    </section>
  );
}

/* ----------------------------- today's workout ---------------------------- */
const GROUPS = [
  { key: 'warmup', title: 'Warm-up · 5 min' },
  { key: 'main', title: 'Main' },
  { key: 'cooldown', title: 'Cool-down · 5 min' },
];

function TodayWorkout({ date, session, act }) {
  const [mini, setMini] = useState(session.mini.some((i) => i.done));
  const toggle = (item) => act(() => api.toggleWorkoutItem(date, item.key, !item.done));

  if (session.rest) {
    return (
      <section className="card">
        <h2>😌 Rest day</h2>
        <p className="muted">Recovery is where you get stronger. An easy walk is optional. Sunday is weigh-in, measurements and (every 2 weeks) progress photos.</p>
      </section>
    );
  }

  const list = mini ? session.mini : session.items;
  const doneCount = list.filter((i) => i.done).length;

  return (
    <section className={`card${session.complete ? ' complete-card' : ''}`}>
      <div className="row center-v wrap" style={{ justifyContent: 'space-between', gap: '0.5rem' }}>
        <div>
          <h2 style={{ marginBottom: 0 }}>{session.complete ? '✅ ' : ''}{mini ? '⚡ 10-minute mode' : session.session}</h2>
          <div className="muted small">{mini ? 'Low-energy day: this still counts for your streak' : `${session.phase} · ~35 min`}</div>
        </div>
        <button className="toggle" onClick={() => setMini((m) => !m)}>{mini ? '↩ Full workout' : '😴 Low energy? 10-minute mode'}</button>
      </div>
      <div className="row gap center-v top-gap">
        <ProgressBar value={doneCount} total={list.length} />
        <span className="small nowrap">{doneCount ? `${doneCount}/${list.length}` : `${list.length} moves`}</span>
      </div>
      {session.complete && <p className="ok-text small">Workout done. That's another vote for the person you're becoming. 🔥</p>}

      {(mini ? [{ key: 'mini', title: 'Do 2 rounds' }] : GROUPS).map((g) => {
        const items = list.filter((i) => i.group === g.key);
        if (!items.length) return null;
        return (
          <div key={g.key} className="wgroup">
            <div className="wgroup-title">{g.title}</div>
            <ul className="exercises">
              {items.map((it) => (
                <li key={it.key} className={it.done ? 'done' : ''}>
                  <label>
                    <input type="checkbox" checked={it.done} onChange={() => toggle(it)} />
                    <span className="ex-body">
                      <span className="ex-name">{it.name}</span>
                      {(it.prescription || it.rest) && (
                        <span className="ex-rx">
                          {it.prescription && <span>{it.prescription}</span>}
                          {it.rest && <span className="muted"> · rest {it.rest}</span>}
                        </span>
                      )}
                      {it.tip && <span className="ex-tip">💡 {it.tip}</span>}
                    </span>
                  </label>
                  {it.guide && <ExerciseGuide name={it.name} guide={it.guide} />}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
