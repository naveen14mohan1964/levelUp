import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBox, Loading, ProgressBar, ProgressRing } from '../components/ui.jsx';
import LevelMap, { LessonRow } from '../components/LevelMap.jsx';
import SharedLessonCard from '../components/LessonCard.jsx';

/**
 * ✨ AI + FDE: learn AI engineering and Forward Deployed Engineer skills from scratch to advanced
 * (14 levels: math → ML → LLMs → RAG → agents/harnesses → deploy → FDE → hired; builds in your own app),
 * shown as a game-style level map where lessons unlock one by one; plus "stay updated" from official AI blogs.
 */
const TABS = [['today', '🎯 Today'], ['roadmap', '🗺️ Roadmap'], ['news', '📰 Stay updated']];

export default function AI() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'today';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api.aiRoadmap().then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>✨ AI + FDE</h1>
          <div className="muted small">AI engineering and Forward Deployed Engineer skills, from scratch to advanced</div>
        </div>
        <div className="row gap center-v">
          <span className="streak-chip" title="Days in a row with 5+ minutes of learning">{data.streak ? <>🔥 <strong>{data.streak}</strong> day streak</> : '🌱 Start your streak today'}</span>
          <ProgressRing value={data.progress.done} total={data.progress.total} size={54} />
        </div>
      </div>
      <nav className="tabs ai-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setParams({ tab: k })}>
            {label}{k === 'news' && data.unreadNews ? <span className="ai-badge">{data.unreadNews}</span> : null}
          </button>
        ))}
      </nav>
      {tab === 'today' && <Today data={data} onChange={load} go={(t) => setParams({ tab: t })} />}
      {tab === 'roadmap' && <Roadmap data={data} onChange={load} />}
      {tab === 'news' && <News onChange={load} />}
    </>
  );
}

/* ------------------------------- Today ------------------------------- */
function Today({ data, onChange, go }) {
  const l = data.next;
  if (!l) {
    return <section className="card center"><h2>🏆 Roadmap complete</h2><p className="muted">All {data.progress.total} lessons done. Keep up with the field on Stay updated.</p></section>;
  }
  const level = data.levels.find((x) => x.n === l.level);
  return (
    <>
      <section className="card">
        <div className="stat-row ai-stats">
          <div className="stat">{data.progress.done ? <><strong>{data.progress.done}/{data.progress.total}</strong><span>lessons done</span></> : <><strong>{data.progress.total}</strong><span>lessons · your first one is ready</span></>}</div>
          <div className="stat">{data.thisWeek ? <><strong>{data.thisWeek}</strong><span>this week (aim for 5)</span></> : <><strong>5</strong><span>lessons is a great week</span></>}</div>
          <div className="stat"><strong>Level {l.level}/{data.levels.length}</strong><span>{level.title}</span></div>
        </div>
        <ProgressBar value={level.done} total={level.total} />
        <div className="small muted top-gap-sm">🎯 Level goal: {level.goal}</div>
      </section>
      <LessonCard lesson={l} onChange={onChange} expanded />
      <section className="card subtle small">
        Every build happens in your own Level Up app, so each level ends with something real for your portfolio, and a strong LinkedIn post.
        {' '}<button className="link-btn" onClick={() => go('roadmap')}>See the whole roadmap →</button>
      </section>
    </>
  );
}

const LessonCard = (props) => <SharedLessonCard {...props} onSave={api.aiLesson} />;

/* ------------------------------ Roadmap ------------------------------ */
function Roadmap({ data, onChange }) {
  const [track, setTrack] = useState(null);
  const [error, setError] = useState(null);
  const loadTrack = useCallback(() => api.gameTrack('ai').then((r) => { setTrack(r.track); setError(null); }).catch((e) => setError(e.message)), []);
  useEffect(() => { loadTrack(); }, [loadTrack, data]); // data changes after every save → the map follows
  if (error) return <ErrorBox error={error} onRetry={loadTrack} />;
  if (!track) return <Loading />;
  const content = new Map(data.levels.flatMap((lv) => lv.lessons).map((x) => [x.id, x]));
  return (
    <>
      <p className="muted small">{data.about}</p>
      <LevelMap
        track={track}
        renderLesson={(x) => (x.status === 'locked'
          ? <LessonRow lesson={x} meta={`~${x.minutes} min`} />
          : <LessonCard lesson={content.get(x.ref)} onChange={onChange} expanded={x.status === 'current'} status={x.status} />)}
      />
    </>
  );
}

/* ------------------------------- News ------------------------------- */
const NEWS_TABS = [['', 'Latest'], ['saved', 'Saved'], ['hidden', 'Hidden']];

function News({ onChange }) {
  const navigate = useNavigate();
  const [f, setF] = useState({ status: '', source: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const load = useCallback(() => api.aiNews(f).then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)), [f]);
  useEffect(() => { load(); }, [load]);
  const mark = (id, status) => api.aiNewsStatus(id, status).then(() => { load(); onChange(); }).catch((e) => setError(e.message));
  async function refresh() {
    setBusy(true); setNote(null);
    try {
      const s = await api.aiNewsRefresh();
      setNote(`Checked ${s.ok}/${s.feeds} feeds: ${s.added} new${s.failed.length ? ` · ${s.failed.length} failed` : ''}.`);
      await load(); onChange();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  // Turn an article into a LinkedIn post angle: your take on it, grounded in what you built.
  function postIdea(item) {
    const angle = `My take on "${item.title}" (${item.source}) from building AI features myself`.slice(0, 480);
    navigate(`/linkedin/planner?pillar=${encodeURIComponent('AI engineering in practice')}&angle=${encodeURIComponent(angle)}`);
  }
  return (
    <>
      <section className="card">
        <div className="row center-v wrap" style={{ justifyContent: 'space-between', gap: '0.5rem' }}>
          <h2 style={{ margin: 0 }}>📰 Stay updated</h2>
          <button className="btn" disabled={busy} onClick={refresh}>{busy ? 'Checking feeds…' : '↻ Refresh'}</button>
        </div>
        <p className="muted small">
          New posts from official AI blogs and trusted engineers, checked daily{data?.lastFetched ? ` (last ${new Date(data.lastFetched).toLocaleString('en-IN')})` : ''}.
          Read 2–3 a week; turn the interesting ones into LinkedIn posts.
        </p>
        {note && <div className="small ok-text">{note}</div>}
        <div className="li-subtabs top-gap-sm">
          {NEWS_TABS.map(([k, label]) => <button key={k} className={`chip-btn${f.status === k ? ' on' : ''}`} onClick={() => setF({ ...f, status: k })}>{label}</button>)}
          <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} aria-label="Source">
            <option value="">All sources</option>{(data?.sources || []).map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      </section>
      {error && <ErrorBox error={error} onRetry={load} />}
      {!data ? <Loading /> : (
        <section className="card">
          {!data.items.length && <p className="muted">Nothing here yet: press Refresh (the first check takes a few seconds).</p>}
          <ul className="ai-news">
            {data.items.map((n) => (
              <li key={n.id} className={`ai-news-item${n.status === 'new' ? ' unread' : ''}`}>
                <div className="small muted">{n.source} · {n.published_ms ? new Date(n.published_ms).toLocaleDateString('en-IN') : 'recent'}{n.status === 'new' ? ' · new' : ''}</div>
                <a className="ai-news-title" href={n.url} target="_blank" rel="noreferrer" onClick={() => n.status === 'new' && mark(n.id, 'read')}>{n.title} ↗</a>
                {n.summary && <p className="small muted">{n.summary.length > 220 ? `${n.summary.slice(0, 220)}…` : n.summary}</p>}
                <div className="row gap wrap small">
                  <button className="link-btn" onClick={() => postIdea(n)}>✍️ Post idea</button>
                  {n.status !== 'saved' ? <button className="link-btn" onClick={() => mark(n.id, 'saved')}>Save</button> : <button className="link-btn" onClick={() => mark(n.id, 'read')}>Unsave</button>}
                  {n.status !== 'hidden' ? <button className="link-btn" onClick={() => mark(n.id, 'hidden')}>Hide</button> : <button className="link-btn" onClick={() => mark(n.id, 'read')}>Unhide</button>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
