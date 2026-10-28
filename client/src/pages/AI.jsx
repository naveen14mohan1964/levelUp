import { useCallback, useEffect, useRef, useState } from 'react';
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
  // The news tab doesn't need the roadmap: it renders straight away and loads its own page of items in parallel.
  if (error && tab !== 'news') return <ErrorBox error={error} onRetry={load} />;
  if (!data && tab !== 'news') return <Loading />;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>✨ AI + FDE</h1>
          <div className="muted small">AI engineering and Forward Deployed Engineer skills, from scratch to advanced</div>
        </div>
        <div className="row gap center-v">
          {data && <span className="streak-chip" title="Days in a row with 5+ minutes of learning">{data.streak ? <>🔥 <strong>{data.streak}</strong> day streak</> : '🌱 Start your streak today'}</span>}
          {data && <ProgressRing value={data.progress.done} total={data.progress.total} size={54} />}
        </div>
      </div>
      <nav className="tabs ai-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={`tab${tab === k ? ' active' : ''}`} onClick={() => setParams({ tab: k })}>
            {label}{k === 'news' && data?.unreadNews ? <span className="ai-badge">{data.unreadNews}</span> : null}
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
// The feed is stored in the database by a daily job (server/src/ai/feeds.js, 06:00); this page reads it from there,
// one page at a time, and checks again every minute while it's open so new posts appear without a reload.
const NEWS_VIEWS = [['unread', 'Unread'], ['all', 'All'], ['saved', 'Saved'], ['read', 'Read'], ['hidden', 'Hidden']];
const PAGE = 30;
const POLL_MS = 60_000;
const newsCache = new Map(); // last result per view+source: coming back to the tab paints instantly, then refreshes
const fmtTime = (ms) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function News({ onChange }) {
  const navigate = useNavigate();
  const [f, setF] = useState({ view: 'unread', source: '' });
  const key = `${f.view}|${f.source}`;
  const [data, setData] = useState(() => newsCache.get(key) || null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [note, setNote] = useState(null);
  const [fresh, setFresh] = useState(() => new Set()); // ids that arrived while this page was open
  const [writing, setWriting] = useState(null); // id of the item whose post panel is open
  const seen = useRef(null);
  const shown = useRef(PAGE); // how many items are on screen (the live check re-reads that many)

  const load = useCallback(async ({ silent = false } = {}) => {
    try {
      const d = await api.aiNews({ ...f, limit: Math.max(PAGE, shown.current), offset: 0 });
      // live: anything fetched after we first looked is "new" here
      if (seen.current == null) seen.current = d.newestFetched || 0;
      const arrived = d.items.filter((x) => x.fetched_ms > seen.current);
      if (arrived.length) {
        setFresh((s) => new Set([...s, ...arrived.map((x) => x.id)]));
        seen.current = d.newestFetched;
        if (silent) { setNote(`${arrived.length} new post${arrived.length === 1 ? '' : 's'} just arrived.`); onChange(); }
      }
      newsCache.set(`${f.view}|${f.source}`, d);
      setData(d); setError(null);
    } catch (e) { if (!silent) setError(e.message); }
  }, [f, onChange]);
  useEffect(() => { shown.current = PAGE; setData(newsCache.get(key) || null); load(); }, [load, key]);
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load({ silent: true }); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) load({ silent: true }); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  async function loadMore() {
    setMore(true);
    try {
      const d = await api.aiNews({ ...f, limit: PAGE, offset: data.items.length });
      shown.current = data.items.length + d.items.length;
      setData((cur) => ({ ...cur, items: [...cur.items, ...d.items.filter((x) => !cur.items.some((y) => y.id === x.id))] }));
    } catch (e) { setError(e.message); } finally { setMore(false); }
  }
  // read tick: update the row and the counts at once, keep it in place (so you can untick), then save
  const setRead = async (item, read) => {
    setData((d) => ({
      ...d,
      items: d.items.map((x) => (x.id === item.id ? { ...x, read_ms: read ? Date.now() : null } : x)),
      counts: { ...d.counts, unread: d.counts.unread + (read ? -1 : 1), read: d.counts.read + (read ? 1 : -1) },
    }));
    try { await api.aiNewsRead(item.id, read); onChange(); } catch (e) { setError(e.message); load(); }
  };
  const mark = (id, status) => api.aiNewsStatus(id, status).then(() => { load(); onChange(); }).catch((e) => setError(e.message));
  async function readAll() {
    try { const r = await api.aiNewsReadAll(f.source); setNote(`Marked ${r.marked} as read.`); await load(); onChange(); } catch (e) { setError(e.message); }
  }
  async function refresh() {
    setBusy(true); setNote(null);
    try {
      const s = await api.aiNewsRefresh();
      setNote(`Checked ${s.ok}/${s.feeds} feeds: ${s.added} new${s.failed.length ? ` · ${s.failed.length} failed` : ''}.`);
      await load({ silent: true }); onChange();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const run = data?.schedule?.lastRun;
  const total = data?.counts?.[f.view] ?? 0;
  return (
    <>
      <section className="card">
        <div className="row center-v wrap" style={{ justifyContent: 'space-between', gap: '0.5rem' }}>
          <h2 style={{ margin: 0 }}>Stay updated</h2>
          <div className="row gap wrap">
            {data?.counts?.unread > 0 && <button className="btn" onClick={readAll}>Mark all read</button>}
            <button className="btn" disabled={busy} onClick={refresh}>{busy ? 'Checking feeds…' : 'Check now'}</button>
          </div>
        </div>
        <p className="muted small news-schedule">
          <span className="live-dot" aria-hidden="true" /> Saved to your database by a daily job at {data?.schedule?.hour ?? 6}:00 AM
          {run ? ` · last run ${fmtTime(run.ms)} (${run.added} new from ${run.ok}/${run.feeds} feeds${run.failed?.length ? `, ${run.failed.length} failed` : ''})` : data ? ' · first run pending' : ''}
          {data?.schedule?.nextRun ? ` · next ${fmtTime(data.schedule.nextRun)}` : ''}. Pick any post and press “Write a post” for a LinkedIn draft and image prompt.
        </p>
        {note && <div className="small ok-text" role="status">{note}</div>}
        <div className="li-subtabs top-gap-sm">
          {NEWS_VIEWS.map(([k, label]) => (
            <button key={k} className={`chip-btn${f.view === k ? ' on' : ''}`} aria-pressed={f.view === k} onClick={() => setF({ ...f, view: k })}>
              {label}{data?.counts?.[k] != null ? <span className="news-count">{data.counts[k]}</span> : null}
            </button>
          ))}
          <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} aria-label="Source">
            <option value="">All sources</option>{(data?.sources || []).map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      </section>
      {error && <ErrorBox error={error} onRetry={load} />}
      {!data ? <NewsSkeleton /> : (
        <section className="card" data-reveal="off">
          {!data.items.length && (
            <p className="muted">
              {f.view === 'unread' ? 'All caught up. New posts land here after the next daily run.' : f.view === 'saved' ? 'Nothing saved yet: save the posts worth coming back to.' : 'Nothing here yet.'}
            </p>
          )}
          <ul className="ai-news">
            {data.items.map((n) => {
              const read = !!n.read_ms;
              return (
                <li key={n.id} className={`ai-news-item${read ? ' is-read' : ' unread'}${fresh.has(n.id) ? ' fresh' : ''}${writing === n.id ? ' writing' : ''}`}>
                  <label className="news-read" title={read ? 'Mark as unread' : 'Mark as read'}>
                    <input type="checkbox" checked={read} onChange={(e) => setRead(n, e.target.checked)} aria-label={`Read: ${n.title}`} />
                  </label>
                  <div className="news-main">
                    <div className="small muted">
                      {n.source} · {n.published_ms ? new Date(n.published_ms).toLocaleDateString('en-IN') : 'recent'}
                      {fresh.has(n.id) && <span className="news-new">New</span>}
                      {n.status === 'saved' && <span className="news-saved">Saved</span>}
                    </div>
                    <a className="ai-news-title" href={n.url} target="_blank" rel="noreferrer" onClick={() => !read && setRead(n, true)}>{n.title} ↗</a>
                    {n.summary && <p className="small muted">{n.summary.length > 220 ? `${n.summary.slice(0, 220)}…` : n.summary}</p>}
                    <div className="row gap wrap small news-actions">
                      <button className={`btn news-write${writing === n.id ? ' on' : ''}`} aria-expanded={writing === n.id} onClick={() => setWriting(writing === n.id ? null : n.id)}>
                        {writing === n.id ? 'Close post' : n.posts ? `Your posts (${n.posts})` : 'Write a post'}
                      </button>
                      {n.status !== 'saved' ? <button className="link-btn" onClick={() => mark(n.id, 'saved')}>Save</button> : <button className="link-btn" onClick={() => mark(n.id, 'new')}>Unsave</button>}
                      {n.status !== 'hidden' ? <button className="link-btn" onClick={() => mark(n.id, 'hidden')}>Hide</button> : <button className="link-btn" onClick={() => mark(n.id, 'new')}>Unhide</button>}
                    </div>
                    {writing === n.id && (
                      <NewsPost item={n} onWritten={() => setData((d) => ({ ...d, items: d.items.map((x) => (x.id === n.id ? { ...x, posts: (x.posts || 0) + 1 } : x)) }))} onPlanner={(angle) => navigate(`/linkedin/planner?pillar=${encodeURIComponent('AI engineering in practice')}&angle=${encodeURIComponent(angle)}`)} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {data.items.length < total && (
            <div className="news-more">
              <button className="btn" disabled={more} onClick={loadMore}>{more ? 'Loading…' : `Load ${Math.min(PAGE, total - data.items.length)} more`}</button>
              <span className="small muted">{data.items.length} of {total}</span>
            </div>
          )}
        </section>
      )}
    </>
  );
}

/** Placeholder rows shaped like news items while the first page loads. */
function NewsSkeleton() {
  return (
    <section className="card" data-reveal="off" aria-busy="true">
      <span className="sr-only" role="status">Loading news…</span>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="news-sk">
          <div className="sk" style={{ width: 18, height: 18, borderRadius: 4 }} />
          <div style={{ flex: 1, display: 'grid', gap: 8 }}>
            <div className="sk sk-line w40" /><div className="sk sk-line w90" /><div className="sk sk-line w60" />
          </div>
        </div>
      ))}
    </section>
  );
}

/** A LinkedIn post written from one news item: the post, a first comment with the source link, and an image prompt. */
function NewsPost({ item, onWritten, onPlanner }) {
  const [posts, setPosts] = useState(null);
  const [i, setI] = useState(0);
  const [angle, setAngle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);
  useEffect(() => { api.aiNewsPosts(item.id).then((r) => setPosts(r.posts)).catch((e) => setError(e.message)); }, [item.id]);
  async function write() {
    setBusy(true); setError(null);
    try {
      const r = await api.aiNewsWritePost(item.id, angle);
      setPosts((p) => [r.post, ...(p || [])]); setI(0); onWritten();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const copy = async (what, text) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1600); } catch { setError('Copy failed: select the text and copy it manually.'); }
  };
  const p = posts?.[i];
  return (
    <div className="news-post" role="region" aria-label={`LinkedIn post about ${item.title}`}>
      <div className="row gap wrap center-v">
        <input className="news-angle" value={angle} onChange={(e) => setAngle(e.target.value)} maxLength={300}
          placeholder="Optional: your angle (e.g. what this means for teams shipping RAG)" aria-label="Your angle for the post" />
        <button className="btn primary" disabled={busy} onClick={write}>{busy ? 'Reading the article and writing…' : p ? 'Write another' : 'Generate post'}</button>
      </div>
      {busy && <p className="small muted">This takes about 15–30 seconds: it reads the article first, then writes in your voice.</p>}
      {error && <div className="form-error top-gap">{error}</div>}
      {posts && !posts.length && !busy && <p className="small muted top-gap">No post for this one yet. Generate one: you get the post, a first comment with the link, and an image prompt.</p>}
      {p && (
        <div className="news-post-body">
          <div className="row gap wrap center-v small muted">
            {posts.length > 1 && (
              <span className="row gap center-v">
                <button className="link-btn" disabled={i >= posts.length - 1} onClick={() => setI(i + 1)} aria-label="Older version">‹</button>
                Version {posts.length - i} of {posts.length}
                <button className="link-btn" disabled={i === 0} onClick={() => setI(i - 1)} aria-label="Newer version">›</button>
              </span>
            )}
            <span>{p.grounded === 'article' ? 'Based on the full article' : 'Based on the summary (the article page could not be read)'}</span>
          </div>
          <div className="news-post-block">
            <div className="news-post-head"><strong>Post</strong><button className="link-btn" onClick={() => copy('post', p.text)}>{copied === 'post' ? 'Copied' : 'Copy'}</button></div>
            <p className="news-post-text">{p.text}</p>
          </div>
          {p.first_comment && (
            <div className="news-post-block">
              <div className="news-post-head"><strong>First comment</strong><button className="link-btn" onClick={() => copy('comment', p.first_comment)}>{copied === 'comment' ? 'Copied' : 'Copy'}</button></div>
              <p className="news-post-text small">{p.first_comment}</p>
            </div>
          )}
          {p.image_prompt && (
            <div className="news-post-block">
              <div className="news-post-head"><strong>Image prompt</strong><button className="link-btn" onClick={() => copy('image', p.image_prompt)}>{copied === 'image' ? 'Copied' : 'Copy'}</button></div>
              <p className="news-post-text small">{p.image_prompt}</p>
              <p className="small muted">Paste it into Designer, Gemini or ChatGPT to make the image; alt text: {p.image_alt || 'none'}</p>
            </div>
          )}
          <button className="link-btn" onClick={() => onPlanner(`My take on "${item.title}" (${item.source})`.slice(0, 480))}>Plan it in the LinkedIn planner →</button>
        </div>
      )}
    </div>
  );
}
