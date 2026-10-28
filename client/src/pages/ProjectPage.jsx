import { useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { areaByKey } from '../areas.js';
import { formatLong, formatShort, todayISO } from '../dates.js';
import { DocLinks, ErrorBox, Loading, Md, ProgressBar, ProgressRing } from '../components/ui.jsx';
import MentorDrawer from '../components/MentorDrawer.jsx';
import AssignmentBrief from '../components/AssignmentBrief.jsx';
import LevelMap, { LessonRow } from '../components/LevelMap.jsx';
import { refreshGame } from '../game.jsx';

const ROADMAP_INTRO = {
  node: 'runtime + Express → MongoDB → auth + security → real API features → testing + real-time → production',
  dotnet: 'C# → ASP.NET Core → EF Core → API quality → auth → testing → performance → caching → resilience → observability → messaging → security → deployment → capstone',
  react: 'components + TypeScript → server state → forms → patterns + UX → testing → performance + a11y → production',
};

function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

// Every tickable step in a task row: 📖 learn (if any) + 🛠 build, or ✅ checkpoint.
function stepCounts(tasks) {
  let done = 0;
  let total = 0;
  for (const t of tasks) {
    if (t.learn) { total++; if (t.learn_done) done++; }
    total++; if (t.done) done++;
  }
  return { done, total };
}

/** Shell for /react, /dotnet, /node: loads the area's projects once, shares them with both tabs. */
export default function ProjectPage({ area }) {
  const meta = areaByKey[area];
  const { pathname } = useLocation();
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const load = () => {
    setError(null);
    api.projects(area).then(setProjects).catch((e) => setError(e.message));
  };
  useEffect(() => {
    setProjects(null);
    load();
  }, [area]); // eslint-disable-line react-hooks/exhaustive-deps

  // Optimistic update: change the UI immediately, send to the API, roll back if it fails.
  async function updateTask(task, changes) {
    const apply = (fn) => setProjects((ps) => ps.map((p) => ({
      ...p, weeks: p.weeks.map((w) => ({ ...w, tasks: w.tasks.map((t) => (t.id === task.id ? fn(t) : t)) })),
    })));
    apply((t) => ({ ...t, ...changes }));
    try {
      const saved = await api.updateProjectTask(task.id, changes);
      apply(() => saved);
      refreshGame(); // sidebar XP, streak minutes, LEVEL COMPLETE
      setSaveError(null);
    } catch (e) {
      apply(() => task);
      setSaveError(e.message);
    }
  }

  const base = `/${area}`;
  const onRoadmap = pathname.startsWith(`${base}/roadmap`);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{meta.icon} {meta.label}</h1>
          <div className="muted small">From-scratch course · {ROADMAP_INTRO[area]}</div>
        </div>
        <nav className="tabs">
          <Link to={base} className={`tab${onRoadmap ? '' : ' active'}`}>Today</Link>
          <Link to={`${base}/roadmap`} className={`tab${onRoadmap ? ' active' : ''}`}>Roadmap</Link>
        </nav>
      </div>
      {saveError && (
        <div className="card notice">
          <span><strong>Couldn't save:</strong> {saveError}</span>
          <button className="link-btn" onClick={() => setSaveError(null)}>Dismiss</button>
        </div>
      )}
      {error ? <ErrorBox error={error} onRetry={load} /> : !projects ? <Loading /> : (
        <Routes>
          <Route index element={<Lesson area={area} projects={projects} onUpdate={updateTask} />} />
          <Route path="day/:date" element={<Lesson area={area} projects={projects} onUpdate={updateTask} />} />
          <Route path="roadmap" element={<RoadmapMap area={area} projects={projects} onUpdate={updateTask} />} />
        </Routes>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Today tab: one lesson per day, same shape as the DSA day view       */
/* ------------------------------------------------------------------ */
function Lesson({ area, projects, onUpdate }) {
  const navigate = useNavigate();
  const params = useParams();
  const today = todayISO();

  const all = projects.flatMap((p) => p.weeks.flatMap((w) => w.tasks.map((t) => ({ ...t, project: p }))));
  const dates = [...new Set(all.map((t) => t.plan_date))].sort();
  const first = dates[0];
  const last = dates.at(-1);

  // Default: today if it's a lesson day; before the roadmap starts → its first day; weekends → the next lesson.
  const requested = params.date || today;
  const date = dates.includes(requested) ? requested : dates.find((d) => d > requested) || last;
  const tasks = all.filter((t) => t.plan_date === date);
  const idx = dates.indexOf(date);
  const goTo = (d) => navigate(d === today ? `/${area}` : `/${area}/day/${d}`);

  const build = tasks.find((t) => t.kind === 'build');
  const [mentorFor, setMentorFor] = useState(null);
  const mentorItem = build && { ...build, area: build.project.area };
  const checkpoint = tasks.find((t) => t.kind === 'checkpoint');
  const { done, total } = stepCounts(tasks);
  const project = tasks[0]?.project;
  const weekTasks = all.filter((t) => t.week_no === build?.week_no && t.kind === 'build');
  // assignment weeks (.NET track): objective, level and deliverable for the week
  const week = project?.weeks.find((w) => w.week_no === (build?.week_no ?? checkpoint?.week_no));

  return (
    <>
      {today < first && !params.date && (
        <div className="card notice">
          <span>🗓️ This roadmap starts <strong>{formatLong(first)}</strong>, in {daysBetween(today, first)} days. Here's a preview of day 1.</span>
        </div>
      )}
      {!params.date && requested !== date && today >= first && today <= last && (
        <div className="card notice"><span>No project hour today (weekend). Here's the next lesson.</span></div>
      )}

      <div className="date-nav">
        <button className="btn icon" disabled={idx <= 0} onClick={() => goTo(dates[idx - 1])} aria-label="Previous lesson">‹</button>
        <div className="date-nav-center">
          <div className="date-title">{formatLong(date)}</div>
          <div className="muted small">Lesson {idx + 1} of {dates.length}</div>
        </div>
        <button className="btn icon" disabled={idx >= dates.length - 1} onClick={() => goTo(dates[idx + 1])} aria-label="Next lesson">›</button>
      </div>

      <section className="card lesson">
        <div className="row wrap gap">
          <span className="pill phase-1">Week {build?.week_no ?? checkpoint?.week_no}</span>
          <span className="pill">{build?.week_title}</span>
          <span className="pill">{project?.name}</span>
          {week?.level && <span className={`pill level-${week.level.toLowerCase().replace(/[^a-z]/g, '')}`}>{week.level}</span>}
        </div>
        {week?.objective && (
          <div className="assignment-banner">
            <div><span className="assignment-label">🎯 This week's goal</span> {week.objective}</div>
            {week.deliverable && <div className="small"><span className="assignment-label">📦 Practice outcome</span> {week.deliverable}</div>}
          </div>
        )}
        <div className="row gap center-v top-gap">
          <ProgressBar value={done} total={total} />
          <span className="small nowrap">{done ? `${done}/${total} steps` : `${total} steps today`}</span>
        </div>

        <ol className="steps">
          {build?.learn && (
            <Step
              n="1" icon="📖" label="Learn" minutes="~20 min" done={build.learn_done}
              onToggle={() => onUpdate(build, { learn_done: !build.learn_done })}
              hint="Read the docs below for just this concept, then explain it back in one sentence in your notes."
              extra={
                <>
                  <DocLinks links={build.learn_links} title="📚 Docs for this topic" />
                  <button className="mentor-chip top-gap" onClick={() => setMentorFor(mentorItem)}>🤖 Explain this to me</button>
                </>
              }
            >
              <Md text={build.learn} />
            </Step>
          )}
          {build && (
            <Step
              n={build.learn ? '2' : '1'} icon="🛠" label="Practice" minutes={build.learn ? '~40 min' : '1h'} done={build.done}
              onToggle={() => onUpdate(build, { done: !build.done })}
              extra={
                <>
                  <TaskExtras task={build} onUpdate={onUpdate} />
                  <button className="mentor-chip top-gap" onClick={() => setMentorFor(mentorItem)}>🤖 Review my code / ask about this</button>
                </>
              }
            >
              <Md text={build.title} />
              {build.done_when && <span className="done-when"><strong>✓ Done when:</strong> <Md text={build.done_when} /></span>}
            </Step>
          )}
          {checkpoint && (
            <Step
              n="3" icon="✅" label="Weekly checkpoint" minutes="15–20 min · no docs" done={checkpoint.done}
              onToggle={() => onUpdate(checkpoint, { done: !checkpoint.done })}
              hint="Close every tab first. If you get stuck, note what you forgot; that's next week's review."
              extra={<TaskExtras task={checkpoint} onUpdate={onUpdate} noScratch />}
            >
              <Md text={checkpoint.title} />
            </Step>
          )}
        </ol>

        {/* the day written out in full: today's build open, the weekly drill below it */}
        <AssignmentBrief md={build?.brief} title="Today's lesson, in full" open />
        <AssignmentBrief md={checkpoint?.brief} title="Weekly checkpoint drill" open={!build?.brief} />

        {project?.resources?.length > 0 && (
          <div className="resources top-gap">
            <span className="muted small">Docs:</span>
            {project.resources.map((r) => <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="small">{r.label}</a>)}
          </div>
        )}
      </section>

      {mentorFor && <MentorDrawer kind="lesson" item={mentorFor} onClose={() => setMentorFor(null)} />}
      {weekTasks.length > 0 && (
        <section className="card">
          <h2>This week · {build.week_title}</h2>
          <ul className="week-strip">
            {weekTasks.map((t) => (
              <li key={t.id} className={`${t.plan_date === date ? 'current' : ''}${t.done ? ' done' : ''}`}>
                <button className="link-btn" onClick={() => goTo(t.plan_date)}>{formatShort(t.plan_date).split(',')[0]}</button>
                <span className="week-strip-mark">{t.done && (!t.learn || t.learn_done) ? '✓' : t.done || t.learn_done ? '◐' : '○'}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Step({ n, icon, label, minutes, done, onToggle, hint, extra, children }) {
  return (
    <li className={`step${done ? ' done' : ''}`}>
      <div className="step-num">{done ? '✓' : n}</div>
      <div className="step-body">
        <div className="step-head">
          <span className="step-label">{icon} {label}</span>
          <span className="muted small">{minutes}</span>
        </div>
        <label className="step-main">
          <input type="checkbox" checked={done} onChange={onToggle} />
          <span className="step-text">{children}</span>
        </label>
        {hint && <div className="step-hint">{hint}</div>}
        {extra}
      </div>
    </li>
  );
}

function TaskExtras({ task, onUpdate, noScratch }) {
  const [showNotes, setShowNotes] = useState(!!task.notes);
  const [draft, setDraft] = useState(task.notes || '');
  return (
    <div className="step-extras">
      <div className="row gap">
        {!noScratch && (
          <button
            className={`toggle${task.built_from_scratch ? ' on' : ''}`}
            disabled={!task.done}
            title={task.done ? 'No tutorial copy-paste, and you can explain every line' : 'Tick the step first'}
            onClick={() => onUpdate(task, { built_from_scratch: !task.built_from_scratch })}
          >
            🛠 Built from scratch
          </button>
        )}
        <button className={`toggle${task.notes ? ' has' : ''}`} onClick={() => setShowNotes((s) => !s)}>📝 Notes</button>
      </div>
      {showNotes && (
        <textarea
          className="notes"
          rows={3}
          placeholder="What did you learn? What broke? Link to the commit…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft !== (task.notes || '') && onUpdate(task, { notes: draft })}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Roadmap tab: a level map (each week is a level, lessons unlock one by one) */
/* ------------------------------------------------------------------ */
function RoadmapMap({ area, projects, onUpdate }) {
  const [track, setTrack] = useState(null);
  const [error, setError] = useState(null);
  const load = () => api.gameTrack(area).then((r) => { setTrack(r.track); setError(null); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [area, projects]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!track) return <Loading />;

  const tasks = new Map(projects.flatMap((p) => p.weeks.flatMap((w) => w.tasks.map((t) => [`t${t.id}`, { ...t, project: p }]))));
  const projectOf = (lv) => tasks.get(lv.lessons[0]?.ref)?.project;
  return (
    <>
      {projects.map((p) => <ProjectSummary key={p.code} project={p} />)}
      <LevelMap
        track={track}
        levelKicker={(lv) => `Level ${lv.n} of ${track.levels.length} · Week ${lv.weekNo}${projects.length > 1 ? ` · ${projectOf(lv)?.name}` : ''}`}
        unlockHint={(lv, prev) => `Finish Level ${prev?.n} to unlock`}
        renderLesson={(x) => {
          const t = tasks.get(x.ref);
          if (!t || x.status === 'locked') return <LessonRow lesson={x} meta={x.planDate && formatShort(x.planDate)}><Md text={x.title} /></LessonRow>;
          return <TaskRow area={area} task={t} status={x.status} onUpdate={onUpdate} />;
        }}
      />
    </>
  );
}

/** Project header: progress ring, stack, from-scratch + checkpoint counts (never a bare zero). */
function ProjectSummary({ project }) {
  const today = todayISO();
  const tasks = project.weeks.flatMap((w) => w.tasks);
  const builds = tasks.filter((t) => t.kind === 'build');
  const { done, total } = stepCounts(tasks);
  const scratch = builds.filter((t) => t.done && t.built_from_scratch).length;
  const checkpoints = tasks.filter((t) => t.kind === 'checkpoint');
  const passed = checkpoints.filter((c) => c.done).length;
  const first = tasks[0];
  const notStarted = first && today < first.plan_date;
  return (
    <section className="card project">
      <div className="project-head">
        <ProgressRing value={done} total={total} label={done ? `${done}/${total}` : undefined} />
        <div className="project-info">
          <h2>{project.name}</h2>
          {project.description && <p className="muted small">{project.description}</p>}
          <div className="chips">{project.stack.map((s) => <span key={s} className="chip">{s}</span>)}</div>
        </div>
      </div>
      <div className="stat-row">
        <div className="stat"><strong>{scratch ? `${scratch}/${builds.length}` : builds.length}</strong><span>{scratch ? '🛠 built from scratch' : '🛠 builds to make from scratch'}</span></div>
        <div className="stat"><strong>{passed ? `${passed}/${checkpoints.length}` : checkpoints.length}</strong><span>{passed ? '✅ checkpoints passed' : '✅ weekly checkpoints ahead'}</span></div>
        <div className="stat">
          <strong>{notStarted ? formatShort(first.plan_date) : 'Now'}</strong>
          <span>{notStarted ? `planned start, in ${daysBetween(today, first.plan_date)} days (you can start early)` : 'on your schedule'}</span>
        </div>
      </div>
    </section>
  );
}

/** One roadmap row: 📖 learn + 🛠 build (or a ✅ checkpoint), with doc links and its date. */
function TaskRow({ area, task: t, status, onUpdate }) {
  const navigate = useNavigate();
  const today = todayISO();
  return (
    <div className={`ptask${t.kind === 'checkpoint' ? ' checkpoint' : ''}${t.plan_date === today ? ' today' : ''}${status === 'current' ? ' is-current' : ''}${status === 'done' ? ' is-done' : ''}`}>
      <div className="row center-v gap">
        <button className="ptask-date small link-btn" onClick={() => navigate(`/${area}/day/${t.plan_date}`)}>
          {t.kind === 'checkpoint' ? '✅ Checkpoint' : `planned for ${formatShort(t.plan_date)}`}
        </button>
        {status === 'current' && <span className="lrow-next">Next</span>}
      </div>
      {t.learn && (
        <label className={`ptask-line${t.learn_done ? ' done' : ''}`}>
          <input type="checkbox" checked={t.learn_done} onChange={() => onUpdate(t, { learn_done: !t.learn_done })} />
          <span>📖 <Md text={t.learn} /></span>
        </label>
      )}
      {t.learn && <DocLinks links={t.learn_links} compact />}
      <label className={`ptask-line${t.done ? ' done' : ''}`}>
        <input type="checkbox" checked={t.done} onChange={() => onUpdate(t, { done: !t.done })} />
        <span>{t.kind === 'checkpoint' ? '' : '🛠 '}<Md text={t.title} />{t.built_from_scratch && <span className="scratch-badge"> · from scratch</span>}</span>
      </label>
      <AssignmentBrief md={t.brief} title={t.kind === 'checkpoint' ? 'Read the drill' : 'Read the full lesson'} />
    </div>
  );
}
