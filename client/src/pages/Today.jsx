import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { formatLong, minutesLabel, todayISO } from '../dates.js';
import { DiffPill, DocLinks, ErrorBox, Loading, Md, ProgressBar } from '../components/ui.jsx';
import LogSolveDialog from '../components/LogSolveDialog.jsx';
import MentorDrawer from '../components/MentorDrawer.jsx';
import { refreshGame } from '../game.jsx';

const KIND_LABEL = {
  concept: 'Concept', practice: 'Practice', review: 'Review', selftest: 'Self-test', mock: 'Mock', contest: 'Contest',
};
const STATUS_LABEL = { todo: 'To do', solved: 'Solved', revision: 'Needs revision' };

export default function Today() {
  const params = useParams();
  const navigate = useNavigate();
  const date = params.date || todayISO();
  const isToday = date === todayISO();

  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [showWeek, setShowWeek] = useState(false);
  const [logging, setLogging] = useState(null);
  const [mentorFor, setMentorFor] = useState(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([api.day(date), api.meta()])
      .then(([d, m]) => {
        setData(d);
        setMeta(m);
      })
      .catch((e) => setError(e.message));
  }, [date]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const goTo = (d) => navigate(d === todayISO() ? '/dsa' : `/dsa/day/${d}`);

  async function toggleTask(task) {
    const done = !task.done;
    setData((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, done } : t)) }));
    try {
      await api.setTaskDone(task.id, done);
      refreshGame(); // sidebar XP + LEVEL COMPLETE
    } catch (e) {
      setError(e.message);
      load();
    }
  }

  async function setStatus(problem, status) {
    setData((s) => ({ ...s, problems: s.problems.map((p) => (p.id === problem.id ? { ...p, status } : p)) }));
    try {
      await api.setProblemStatus(problem.id, status);
      load(); // the day's linked task may have ticked/unticked itself
      refreshGame();
    } catch (e) {
      setError(e.message);
      load();
    }
  }

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data || !meta) return <Loading />;

  const header = (
    <div className="date-nav">
      <button className="btn icon" disabled={!data.prevDate} onClick={() => goTo(data.prevDate)} aria-label="Previous day">‹</button>
      <div className="date-nav-center">
        <div className="date-title">{formatLong(date)}</div>
        <div className="date-actions">
          {!isToday && <button className="link-btn" onClick={() => goTo(todayISO())}>Jump to today</button>}
          <input type="date" aria-label="Go to a date" value={date} min={meta.startDate} max={meta.endDate} onChange={(e) => e.target.value && goTo(e.target.value)} />
        </div>
      </div>
      <button className="btn icon" disabled={!data.nextDate} onClick={() => goTo(data.nextDate)} aria-label="Next day">›</button>
    </div>
  );

  if (!data.day) {
    const beforeStart = date < meta.startDate;
    return (
      <>
        {header}
        <div className="card center">
          {beforeStart ? (
            <>
              <h2>Your plan starts {formatLong(meta.startDate)} 🚀</h2>
              <p className="muted">Use today to set up Java + your IDE, create your LeetCode account, and skim the plan.</p>
              <button className="btn primary" onClick={() => goTo(meta.startDate)}>Preview Day 1</button>
            </>
          ) : (
            <>
              <h2>No plan for this date</h2>
              <p className="muted">The plan ended on {formatLong(meta.endDate)}.</p>
            </>
          )}
        </div>
      </>
    );
  }

  const { day, tasks, problems } = data;
  const core = problems.filter((p) => !p.is_stretch && !p.is_selftest);
  const stretch = problems.filter((p) => p.is_stretch);
  const selftest = problems.filter((p) => p.is_selftest);
  const required = [...core, ...selftest];
  const doneCount = tasks.filter((t) => t.done).length + required.filter((p) => p.status !== 'todo').length;
  const totalCount = tasks.length + required.length;
  const plannedMin = tasks.reduce((s, t) => s + t.minutes, 0);

  return (
    <>
      {header}

      <section className="card day-head">
        <div className="row wrap gap">
          <span className={`pill phase-${day.phase}`}>Phase {day.phase}</span>
          <span className="pill">Week {day.week_no}</span>
          <span className={`pill type-${day.day_type}`}>{day.day_type === 'study' ? 'Study day' : day.day_type === 'selftest' ? 'Self-test + buffer' : 'Revision'}</span>
          {day.original_date !== day.plan_date && <span className="pill warn">Moved from {day.original_date}</span>}
        </div>
        <h1 className="day-focus">{day.focus}</h1>
        <div className="muted small">{day.week_title}{plannedMin ? ` · planned ${minutesLabel(plannedMin)}` : ''}</div>
        <DocLinks links={day.links} title={day.day_type === 'revision' ? '📚 Practice sources' : "📚 Today's reading"} />
        <div className="row gap center-v top-gap">
          <ProgressBar value={doneCount} total={totalCount} />
          <span className="small nowrap">{doneCount}/{totalCount} done</span>
        </div>
        <button className="link-btn top-gap" onClick={() => setShowWeek((s) => !s)}>
          {showWeek ? '▾ Hide' : '▸ Show'} week {day.week_no} resources & key concepts
        </button>
        {showWeek && (
          <div className="week-info">
            {day.resources && <p><strong>Resources:</strong> {day.resources}</p>}
            {day.key_concepts.length > 0 && (
              <>
                <strong>Key concepts</strong>
                <ul>{day.key_concepts.map((k, i) => <li key={i}><Md text={k} /></li>)}</ul>
              </>
            )}
            {day.milestone && <p><strong>Milestone:</strong> {day.milestone}</p>}
            <DocLinks links={day.channels} title="▶️ Video channels" />
          </div>
        )}
      </section>

      {/* wide screens: checklist left, problems right (.split) */}
      <div className="split">
      <div className="split-col">
      <section className="card">
        <h2>Checklist</h2>
        <ul className="checklist">
          {tasks.map((t) => (
            <li key={t.id} className={t.done ? 'done' : ''}>
              <label title={t.linked ? 'Ticks itself when all its problems are solved (LeetCode sync or the ticks below)' : undefined}>
                <input type="checkbox" checked={t.done} disabled={t.linked} onChange={() => toggleTask(t)} />
                <span className="task-title">{t.title}</span>
              </label>
              <span className="task-meta">
                {t.linked && <span className="muted small nowrap">🔗 {t.solved}/{t.total} solved</span>}
                <span className={`kind kind-${t.kind}`}>{KIND_LABEL[t.kind] || t.kind}</span>
                {t.minutes > 0 && <span className="muted small">{minutesLabel(t.minutes)}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>
      </div>

      <div className="split-col">
      {selftest.length > 0 && <ProblemList title="Self-test problems (unseen, timed)" problems={selftest} onStatus={setStatus} onLog={setLogging} onMentor={setMentorFor} />}
      {core.length > 0 && <ProblemList title="Core problems" problems={core} onStatus={setStatus} onLog={setLogging} onMentor={setMentorFor} />}
      {stretch.length > 0 && (
        <ProblemList title="★ Stretch (only if time allows)" problems={stretch} onStatus={setStatus} onLog={setLogging} onMentor={setMentorFor} subtle />
      )}
      </div>
      </div>
      {mentorFor && <MentorDrawer kind="problem" item={mentorFor} onClose={() => setMentorFor(null)} />}
      {logging && (
        <LogSolveDialog
          problem={logging}
          onClose={() => setLogging(null)}
          onSaved={() => { load(); refreshGame(); }}
        />
      )}

      <div className="muted small center pad">
        <Link to="/dsa/plan">See the full roadmap →</Link>
      </div>
    </>
  );
}

function ProblemList({ title, problems, onStatus, onLog, onMentor, subtle }) {
  const solved = problems.filter((p) => p.status !== 'todo').length;
  return (
    <section className={`card${subtle ? ' subtle' : ''}`}>
      <h2>
        {title} <span className="muted small">{solved}/{problems.length}</span>
      </h2>
      <ul className="problems">
        {problems.map((p) => (
          <li key={p.id} className={`problem status-${p.status}`}>
            <input
              type="checkbox"
              checked={p.status !== 'todo'}
              onChange={() => (p.status === 'todo' ? onLog(p) : onStatus(p, 'todo'))}
              aria-label={`Mark ${p.title} solved`}
            />
            <div className="problem-main">
              <a href={p.url} target="_blank" rel="noreferrer" className="problem-title">
                {p.lc_number ? `${p.lc_number}. ` : ''}{p.title}
              </a>
              <div className="problem-sub">
                <DiffPill d={p.difficulty} />
                {p.source !== 'LeetCode' && <span className="pill">{p.source}</span>}
                <span className="muted small">{p.topic}</span>
                {p.hint && <span className="hint small">💡 {p.hint}</span>}
                {p.auto_synced && !p.confidence && (
                  <button className="sync-chip" onClick={() => onLog(p)}>⚡ synced: rate it</button>
                )}
                {p.confidence && <span className="muted small">confidence {p.confidence}/5</span>}
                {p.source === 'LeetCode' && <button className="mentor-chip" onClick={() => onMentor(p)}>🤖 Hint</button>}
              </div>
            </div>
            <select value={p.status} onChange={(e) => (e.target.value === 'todo' ? onStatus(p, 'todo') : onLog(p))} className={`status-select s-${p.status}`}>
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </li>
        ))}
      </ul>
    </section>
  );
}
