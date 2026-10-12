import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatShort, todayISO } from '../dates.js';
import { DiffPill, ErrorBox, Loading } from '../components/ui.jsx';
import LogSolveDialog from '../components/LogSolveDialog.jsx';
import MentorDrawer from '../components/MentorDrawer.jsx';

const STATUS = { todo: 'To do', solved: 'Solved', revision: 'Needs revision' };

export function Stars({ n }) {
  if (!n) return <span className="muted small">—</span>;
  return <span className="stars" title={`Confidence ${n}/5`}>{'●'.repeat(n)}<span className="off">{'●'.repeat(5 - n)}</span></span>;
}

export default function Problems() {
  const [problems, setProblems] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [topic, setTopic] = useState('');
  const [diff, setDiff] = useState('');
  const [status, setStatus] = useState('');
  const [scope, setScope] = useState('core'); // core | all | mine
  const [open, setOpen] = useState(null);
  const [logging, setLogging] = useState(null);
  const [mentorFor, setMentorFor] = useState(null);
  const [adding, setAdding] = useState(false);
  const [sync, setSync] = useState(null);
  const today = todayISO();

  const load = () => api.problems().then(setProblems).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const replace = (p) => setProblems((ps) => ps.map((x) => (x.id === p.id ? p : x)));
  const topics = useMemo(() => [...new Set((problems || []).map((p) => p.topic))].sort(), [problems]);

  const filtered = useMemo(() => {
    if (!problems) return [];
    const needle = q.trim().toLowerCase();
    return problems.filter((p) =>
      (scope === 'all' || (scope === 'core' ? p.day_id && !p.is_stretch && !p.is_selftest : !p.day_id)) &&
      (!topic || p.topic === topic) &&
      (!diff || p.difficulty === diff) &&
      (!status || (status === 'unrated' ? p.status !== 'todo' && !p.confidence : p.status === status)) &&
      (!needle || p.title.toLowerCase().includes(needle) || String(p.lc_number || '') === needle));
  }, [problems, q, topic, diff, status, scope]);

  async function runSync() {
    setSync({ running: true });
    try {
      const r = await api.leetcodeSync();
      setSync(r);
      if (!r.skipped) load();
    } catch (e) {
      setSync({ error: e.message });
    }
  }

  if (error) return <ErrorBox error={error} />;
  if (!problems) return <Loading />;

  const solved = problems.filter((p) => p.status !== 'todo');
  const unrated = solved.filter((p) => !p.confidence);
  const byDiff = (d) => solved.filter((p) => p.difficulty === d).length;

  return (
    <>
      <div className="stat-row">
        <div className="stat"><strong>{solved.length}</strong><span>solved{solved.length ? ` (${['E', 'M', 'H'].filter((d) => byDiff(d)).map((d) => `${byDiff(d)} ${d}`).join(' · ')})` : ': your first one is waiting'}</span></div>
        {(() => { const m = problems.filter((p) => p.interval_days >= 60).length; return <div className="stat">{m ? <><strong>{m}</strong><span>mastered (60+ day interval)</span></> : <><strong>60 days</strong><span>between reviews = mastered</span></>}</div>; })()}
        <div className="stat"><strong>{problems.filter((p) => p.status === 'revision').length}</strong><span>need revision</span></div>
      </div>

      <section className="card sync-card">
        <div>
          <strong>⚡ LeetCode auto-sync</strong>
          <div className="muted small">
            Problems you solve on LeetCode get ticked here automatically (every 30 min). Just rate your confidence.{' '}
            <Link to="/settings">Set username</Link>
          </div>
          {sync?.skipped && <div className="small warn-text">{sync.reason}</div>}
          {sync?.error && <div className="small warn-text">{sync.error}</div>}
          {sync?.checked != null && <div className="small">Checked {sync.checked} recent solves: {sync.newlySolved.length} ticked, {sync.added.length} added from outside the plan.</div>}
        </div>
        <button className="btn" onClick={runSync} disabled={sync?.running}>{sync?.running ? 'Syncing…' : 'Sync now'}</button>
      </section>

      {unrated.length > 0 && (
        <div className="card notice">
          <span>⚡ <strong>{unrated.length}</strong> solved problem{unrated.length > 1 ? 's' : ''} without a confidence rating. Rate them so they enter spaced repetition.</span>
          <button className="link-btn" onClick={() => { setStatus('unrated'); setScope('all'); }}>Show them</button>
        </div>
      )}

      <section className="card">
        <div className="filters">
          <input className="search" placeholder="Search title or number…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="core">Plan: core</option>
            <option value="all">Everything</option>
            <option value="mine">Added by me / sync</option>
          </select>
          <select value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">All topics</option>
            {topics.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select value={diff} onChange={(e) => setDiff(e.target.value)}>
            <option value="">Any difficulty</option>
            <option value="E">Easy</option><option value="M">Medium</option><option value="H">Hard</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            {Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            <option value="unrated">Solved, not rated</option>
          </select>
          <button className="btn" onClick={() => setAdding((a) => !a)}>+ Add problem</button>
        </div>
        {adding && <AddProblem topics={topics} onAdded={(p) => { setProblems((ps) => [...ps, p]); setAdding(false); setScope('mine'); }} />}
        <div className="muted small top-gap">{filtered.length} problem{filtered.length === 1 ? '' : 's'}</div>

        <ul className="plist">
          {filtered.map((p) => (
            <li key={p.id} className={`prow status-${p.status}`}>
              <button className="prow-main" onClick={() => setOpen(open === p.id ? null : p.id)}>
                <span className="prow-title">
                  {p.lc_number ? `${p.lc_number}. ` : ''}{p.title}
                  {p.is_stretch && <span className="muted"> ★</span>}
                  {p.auto_synced && !p.confidence && <span className="sync-chip">⚡ rate it</span>}
                </span>
                <span className="prow-meta">
                  <DiffPill d={p.difficulty} />
                  <span className="muted small">{p.topic}</span>
                  {p.plan_date && <span className="muted small">W{p.week_no} · {formatShort(p.plan_date)}</span>}
                </span>
              </button>
              <span className={`status-pill s-${p.status}`}>{STATUS[p.status]}</span>
              <Stars n={p.confidence} />
              {open === p.id && (
                <ProblemDetail
                  p={p} today={today}
                  onLog={() => setLogging(p)}
                  onMentor={() => setMentorFor(p)}
                  onNotes={async (notes) => replace(await api.updateProblem(p.id, { notes }))}
                />
              )}
            </li>
          ))}
        </ul>
      </section>

      {mentorFor && <MentorDrawer kind="problem" item={mentorFor} onClose={() => setMentorFor(null)} />}
      {logging && <LogSolveDialog problem={logging} onClose={() => setLogging(null)} onSaved={replace} />}
    </>
  );
}

function ProblemDetail({ p, today, onLog, onMentor, onNotes }) {
  const [history, setHistory] = useState(null);
  const [notes, setNotes] = useState(p.notes || '');
  useEffect(() => { api.problemHistory(p.id).then(setHistory).catch(() => setHistory([])); }, [p.id]);

  return (
    <div className="pdetail">
      <div className="pdetail-grid">
        <div><span className="muted small">Attempts</span><strong>{p.attempts}</strong></div>
        <div><span className="muted small">Last time</span><strong>{p.time_taken_min != null ? `${p.time_taken_min} min` : '—'}</strong></div>
        <div><span className="muted small">Interval</span><strong>{p.interval_days ? `${p.interval_days} d` : '—'}</strong></div>
        <div><span className="muted small">Next review</span><strong className={p.next_review && p.next_review <= today ? 'warn-text' : ''}>{p.next_review ? formatShort(p.next_review) : '—'}</strong></div>
      </div>
      {p.hint && <div className="small muted">💡 {p.hint}</div>}
      <textarea className="notes" rows={2} placeholder="Notes / key insight" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (p.notes || '') && onNotes(notes)} />
      {history?.length > 0 && (
        <div className="small muted">
          History: {history.map((h) => `${new Date(h.reviewed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} (${h.confidence}/5${h.time_taken_min != null ? `, ${h.time_taken_min}m` : ''})`).join(' · ')}
        </div>
      )}
      <div className="row gap">
        <a className="btn" href={p.url} target="_blank" rel="noreferrer">Open on {p.source === 'GfG' ? 'GfG' : 'LeetCode'} ↗</a>
        <button className="btn" onClick={onMentor}>🤖 Ask mentor</button>
        <button className="btn primary" onClick={onLog}>{p.interval_days != null ? 'Log a re-solve' : 'Log a solve'}</button>
      </div>
    </div>
  );
}

function AddProblem({ topics, onAdded }) {
  const [f, setF] = useState({ title: '', url: '', difficulty: 'M', topic: topics[0] || 'Arrays', lc_number: '' });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    try {
      onAdded(await api.addProblem(f));
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <form className="add-form" onSubmit={submit}>
      <input placeholder="Title *" value={f.title} onChange={set('title')} required />
      <input placeholder="#" value={f.lc_number} onChange={set('lc_number')} className="narrow" />
      <input placeholder="https://leetcode.com/problems/…" value={f.url} onChange={set('url')} />
      <select value={f.difficulty} onChange={set('difficulty')}><option value="E">Easy</option><option value="M">Medium</option><option value="H">Hard</option></select>
      <input list="topic-list" placeholder="Topic" value={f.topic} onChange={set('topic')} />
      <datalist id="topic-list">{topics.map((t) => <option key={t} value={t} />)}</datalist>
      <button className="btn primary">Add</button>
      {error && <div className="form-error">{error}</div>}
    </form>
  );
}
