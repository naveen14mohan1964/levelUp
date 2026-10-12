import { useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { formatLong, formatRange, formatShort } from '../dates.js';
import { ErrorBox, Loading, ProgressBar, ProgressRing } from '../components/ui.jsx';
import LinkedInPlanner from './LinkedInPlanner.jsx';
import LinkedInSettings from './LinkedInSettings.jsx';
import LinkedInActivity from './LinkedInActivity.jsx';
import LinkedInOutreach from './LinkedInOutreach.jsx';
import Referrals from './Referrals.jsx';
import LinkedInConnector from './LinkedInConnector.jsx';

// Tabs grow phase by phase (Outreach and Dashboard come in Phases 3–5).
const TABS = [
  { to: '/linkedin', label: '🎯 Goal', match: (p) => p === '/linkedin' || p === '/linkedin/' },
  { to: '/linkedin/planner', label: '📝 Posts', match: (p) => p.startsWith('/linkedin/planner') },
  { to: '/linkedin/outreach', label: '🤝 Outreach', match: (p) => p.startsWith('/linkedin/outreach') },
  { to: '/linkedin/referrals', label: '🚀 Referrals', match: (p) => p.startsWith('/linkedin/referrals') },
  { to: '/linkedin/connector', label: '🔌 Connector', match: (p) => p.startsWith('/linkedin/connector') },
  { to: '/linkedin/activity', label: '📜 Activity', match: (p) => p.startsWith('/linkedin/activity') },
  { to: '/linkedin/settings', label: '⚙️ Settings', match: (p) => p.startsWith('/linkedin/settings') },
];

export default function LinkedIn() {
  const { pathname } = useLocation();
  const [paused, setPaused] = useState(null);
  const [hub, setHub] = useState(null); // { connection, network } for the account chip + reminders
  useEffect(() => { api.liConfig().then((c) => setPaused(c.paused)).catch(() => {}); }, [pathname]);
  useEffect(() => { api.liConnector().then(setHub).catch(() => {}); }, [pathname]);
  const conn = hub?.connection;
  const net = hub?.network;
  const onConnector = pathname.startsWith('/linkedin/connector');

  // Global kill switch: pauses every automated LinkedIn action (the scheduler leaves jobs queued).
  async function toggleKill() {
    const next = !paused;
    if (next || confirm('Resume LinkedIn automation? Scheduled posts that are due will publish.')) {
      setPaused((await api.liPause(next)).paused);
    }
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>💼 LinkedIn</h1>
          <div className="muted small">Build a consistent presence and network for the switch to your target salary</div>
        </div>
        <div className="row gap center-v wrap">
          {conn && (
            <Link to="/linkedin/connector" className={`li-chip${conn.connected && !net?.stale ? '' : ' warn'}`} title="LinkedIn connector">
              {conn.connected && conn.picture
                ? <img src={conn.picture} alt="" className="li-chip-avatar" referrerPolicy="no-referrer" />
                : <span className="li-chip-avatar li-avatar-initials">in</span>}
              <span>
                <strong>{conn.connected ? conn.name.split(' ')[0] : 'Not connected'}</strong>
                <span className="small muted"> · {net?.lastImport ? (net.daysSinceImport === 0 ? 'synced today' : `synced ${net.daysSinceImport}d ago`) : 'never synced'}</span>
              </span>
            </Link>
          )}
          {paused !== null && (
            <button className={`btn li-kill${paused ? ' on' : ''}`} onClick={toggleKill} title="Global kill switch for all LinkedIn automation">
              {paused ? '⏸ Paused · resume' : '⏯ Automation on · pause'}
            </button>
          )}
        </div>
      </div>
      {conn && !onConnector && (!conn.connected || conn.daysLeft <= 7) && (
        <div className="card notice">
          <span>🔌 {conn.connected
            ? <>Your LinkedIn login expires in <strong>{conn.daysLeft} days</strong>: reconnect so scheduled posts don't fail.</>
            : <><strong>LinkedIn isn't connected</strong>, so approved posts can't publish yet. Outreach, referrals and jobs work without it.</>}</span>
          <Link className="btn" to="/linkedin/connector">{conn.connected ? 'Reconnect' : 'Connect LinkedIn'}</Link>
        </div>
      )}
      {net && !onConnector && conn?.connected && net.stale && (
        <div className="card notice">
          <span>🤝 {net.lastImport ? <>Your connections were last synced <strong>{net.daysSinceImport} days ago</strong>. Re-import to catch people who changed jobs.</> : <>Import your <strong>Connections.csv</strong> so the app knows who you can ask for referrals.</>}</span>
          <Link className="btn" to="/linkedin/connector">Sync connections</Link>
        </div>
      )}
      {paused && <div className="card notice li-paused"><span>⏸ <strong>All LinkedIn automation is paused.</strong> Nothing will be published until you resume.</span></div>}
      <nav className="tabs li-tabs">
        {TABS.map((t) => (
          <Link key={t.to} to={t.to} className={`tab${t.match(pathname) ? ' active' : ''}`}>{t.label}</Link>
        ))}
      </nav>
      <Routes>
        <Route index element={<GoalTab />} />
        <Route path="planner" element={<LinkedInPlanner />} />
        <Route path="outreach" element={<LinkedInOutreach />} />
        <Route path="referrals" element={<Referrals />} />
        <Route path="connector" element={<LinkedInConnector />} />
        <Route path="activity" element={<LinkedInActivity />} />
        <Route path="settings" element={<LinkedInSettings />} />
      </Routes>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Phase 1: the 7 → 20 LPA goal, campaign stages, this week's targets  */
/* ------------------------------------------------------------------ */
const STATUS = {
  active: { label: 'Current', cls: 'st-active' },
  done: { label: '✓ Done', cls: 'st-done' },
  ended: { label: 'Ended · mark done?', cls: 'st-ended' }, // past its dates: an invitation, not a failure
  upcoming: { label: 'Upcoming', cls: 'st-upcoming' },
};
const EMPTY_STAGE = { name: '', focus: '', start_date: '', end_date: '', posts_per_week: 2, connections_per_week: 10, messages_per_week: 3 };

function GoalTab() {
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [editingGoal, setEditingGoal] = useState(false);
  const [editing, setEditing] = useState(null); // stage id, or 'new'

  const load = () => api.liGoal().then(setView).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  // Every mutation returns the fresh view, so the page always shows server truth.
  async function act(fn) {
    try {
      setView(await fn());
      setSaveError(null);
      return true;
    } catch (e) {
      setSaveError(e.message);
      return false;
    }
  }

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!view) return <Loading />;
  const { goal, progress, stages, current, thisWeek } = view;

  return (
    <>
      {saveError && (
        <div className="card notice">
          <span><strong>Couldn't save:</strong> {saveError}</span>
          <button className="link-btn" onClick={() => setSaveError(null)}>Dismiss</button>
        </div>
      )}

      <section className="card li-goal">
        <div className="li-goal-main">
          <ProgressRing value={progress.stagesDone} total={progress.stagesTotal} size={96} label={progress.stagesDone ? `${progress.stagesDone}/${progress.stagesTotal} stages` : `${progress.stagesTotal} stages`} />
          <div className="li-goal-text">
            <div className="li-salary">
              <span>{goal.current_ctc_lpa} LPA</span>
              <span className="li-arrow">→</span>
              <strong>{goal.target_ctc_lpa} LPA</strong>
              <span className="pill li-pill">+{goal.increasePct}%</span>
            </div>
            <div className="muted small">
              {goal.achieved
                ? `🎉 Goal achieved. Congratulations!`
                : `Target: ${formatLong(goal.target_date)} · ${progress.daysLeft > 0 ? `${progress.daysLeft} days left` : 'target date reached'}`}
            </div>
            <div className="row gap center-v top-gap">
              <ProgressBar value={Math.round(progress.timeElapsed * 100)} total={100} />
              <span className="small muted nowrap">{Math.round(progress.timeElapsed * 100)}% of the timeline</span>
            </div>
          </div>
        </div>
        <div className="row gap wrap top-gap">
          <button className="btn" onClick={() => setEditingGoal((e) => !e)}>{editingGoal ? 'Close' : '✏️ Edit goal'}</button>
          <button className="btn" onClick={() => act(() => api.liSaveGoal({ achieved: !goal.achieved }))}>
            {goal.achieved ? 'Undo "achieved"' : '🎉 I got the offer!'}
          </button>
        </div>
        {editingGoal && <GoalForm goal={goal} onSave={async (g) => (await act(() => api.liSaveGoal(g))) && setEditingGoal(false)} />}
      </section>

      <section className="card li-week">
        <div className="row center-v wrap" style={{ justifyContent: 'space-between', gap: '0.5rem' }}>
          <h2 style={{ margin: 0 }}>This week's LinkedIn targets</h2>
          <span className="muted small">{formatRange(thisWeek.start, thisWeek.end)}{thisWeek.stage ? ` · ${thisWeek.stage}` : ''}</span>
        </div>
        {current?.focus && <p className="muted small">🎯 {current.focus}</p>}
        <div className="li-targets">
          <Target icon="📝" label="Posts" value={thisWeek.actual?.posts ?? 0} target={thisWeek.targets.posts} />
          <Target icon="🤝" label="Connection requests" value={thisWeek.actual?.connections ?? 0} target={thisWeek.targets.connections} />
          {thisWeek.targets.messages > 0 && <Target icon="✉️" label="Messages" value={thisWeek.actual?.messages ?? 0} target={thisWeek.targets.messages} />}
        </div>
        <p className="muted small">Posts count when they publish; connection requests when you mark them sent in Outreach; messages when you log a referral ask, a follow-up or "I messaged them" on a contact.</p>
      </section>

      <section className="card">
        <h2>Campaign stages</h2>
        <p className="muted small">One direct switch from {goal.current_ctc_lpa} to {goal.target_ctc_lpa} LPA, run as stages. The stage you're in sets this week's targets. Edit anything to fit your reality.</p>
        <ol className="li-stages">
          {stages.map((s, i) => (
            <li key={s.id} className={`li-stage ${STATUS[s.status].cls}`}>
              <div className="li-stage-dot">{s.status === 'done' ? '✓' : i + 1}</div>
              <div className="li-stage-body">
                {editing === s.id ? (
                  <StageForm
                    initial={s}
                    onCancel={() => setEditing(null)}
                    onSave={async (v) => (await act(() => api.liSaveStage(s.id, v))) && setEditing(null)}
                  />
                ) : (
                  <>
                    <div className="li-stage-head">
                      <strong>{s.name}</strong>
                      <span className={`li-status ${STATUS[s.status].cls}`}>{STATUS[s.status].label}</span>
                    </div>
                    <div className="muted small">{formatShort(s.start_date)} → {formatShort(s.end_date)}</div>
                    {s.focus && <div className="small li-focus">{s.focus}</div>}
                    <div className="chips">
                      <span className="chip">📝 {s.posts_per_week} posts/wk</span>
                      <span className="chip">🤝 {s.connections_per_week} requests/wk</span>
                      {s.messages_per_week > 0 && <span className="chip">✉️ {s.messages_per_week} messages/wk</span>}
                    </div>
                    <div className="row gap wrap top-gap">
                      <button className="link-btn" onClick={() => setEditing(s.id)}>Edit</button>
                      <button className="link-btn" onClick={() => act(() => api.liCompleteStage(s.id, !s.completed))}>{s.completed ? 'Mark not done' : 'Mark done'}</button>
                      {stages.length > 1 && (
                        <button className="link-btn" onClick={() => confirm(`Delete the "${s.name}" stage?`) && act(() => api.liDeleteStage(s.id))}>Delete</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
        {editing === 'new' ? (
          <StageForm
            initial={{ ...EMPTY_STAGE, start_date: stages.at(-1)?.end_date || '', end_date: stages.at(-1)?.end_date || '' }}
            onCancel={() => setEditing(null)}
            onSave={async (v) => (await act(() => api.liAddStage(v))) && setEditing(null)}
          />
        ) : (
          <button className="btn" onClick={() => setEditing('new')}>+ Add stage</button>
        )}
      </section>
    </>
  );
}

function Target({ icon, label, value, target }) {
  return (
    <div className="li-target">
      <div className="li-target-label">{icon} {label}</div>
      <div className="li-target-value">{value ? <>{value}<span className="muted"> / {target}</span></> : <>{target}<span className="muted"> to go this week</span></>}</div>
      <ProgressBar value={Math.min(value, target)} total={Math.max(target, 1)} />
    </div>
  );
}

function GoalForm({ goal, onSave }) {
  const [f, setF] = useState({ current_ctc_lpa: goal.current_ctc_lpa, target_ctc_lpa: goal.target_ctc_lpa, target_date: goal.target_date });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <form className="li-form" onSubmit={(e) => { e.preventDefault(); onSave({ ...f, current_ctc_lpa: Number(f.current_ctc_lpa), target_ctc_lpa: Number(f.target_ctc_lpa) }); }}>
      <label className="field"><span className="field-label">Current CTC (LPA)</span><input type="number" step="0.5" min="0.5" value={f.current_ctc_lpa} onChange={set('current_ctc_lpa')} /></label>
      <label className="field"><span className="field-label">Target CTC (LPA)</span><input type="number" step="0.5" min="0.5" value={f.target_ctc_lpa} onChange={set('target_ctc_lpa')} /></label>
      <label className="field"><span className="field-label">Target date</span><input type="date" value={f.target_date} onChange={set('target_date')} /></label>
      <button className="btn primary">Save goal</button>
    </form>
  );
}

function StageForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  function submit(e) {
    e.preventDefault();
    onSave({
      name: f.name, focus: f.focus, start_date: f.start_date, end_date: f.end_date,
      posts_per_week: Number(f.posts_per_week), connections_per_week: Number(f.connections_per_week), messages_per_week: Number(f.messages_per_week),
    });
  }
  return (
    <form className="li-form" onSubmit={submit}>
      <label className="field wide"><span className="field-label">Stage name</span><input value={f.name} onChange={set('name')} required maxLength={100} /></label>
      <label className="field"><span className="field-label">Start</span><input type="date" value={f.start_date} onChange={set('start_date')} required /></label>
      <label className="field"><span className="field-label">End</span><input type="date" value={f.end_date} onChange={set('end_date')} required /></label>
      <label className="field"><span className="field-label">📝 Posts / week</span><input type="number" min="0" max="14" value={f.posts_per_week} onChange={set('posts_per_week')} /></label>
      <label className="field"><span className="field-label">🤝 Requests / week</span><input type="number" min="0" max="100" value={f.connections_per_week} onChange={set('connections_per_week')} /></label>
      <label className="field"><span className="field-label">✉️ Messages / week</span><input type="number" min="0" max="100" value={f.messages_per_week} onChange={set('messages_per_week')} /></label>
      <label className="field wide"><span className="field-label">Focus</span><textarea className="notes" rows={2} value={f.focus || ''} onChange={set('focus')} maxLength={500} /></label>
      <div className="row gap">
        <button className="btn primary">Save stage</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
