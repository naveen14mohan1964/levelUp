import { useSearchParams } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import PostImage from '../components/PostImage.jsx';
import { formatRange } from '../dates.js';
import { ErrorBox, Loading } from '../components/ui.jsx';

const STATUS = {
  draft: { label: 'Draft', cls: 'ps-draft' },
  approved: { label: 'Approved · needs a time', cls: 'ps-approved' },
  scheduled: { label: 'Scheduled', cls: 'ps-scheduled' },
  posted: { label: '✓ Posted', cls: 'ps-posted' },
  failed: { label: 'Failed', cls: 'ps-failed' },
};
const when = (ms) => new Date(ms).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const toLocalInput = (ms) => {
  const d = new Date(ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

/** Phase 2: 2 post slots per week. Generate → review/edit → approve → the scheduler publishes via your LinkedIn MCP. */
export default function LinkedInPlanner() {
  // "✍️ Post idea" from AI + FDE → Stay updated arrives as ?pillar=&angle= to pre-fill the first empty slot.
  const [search] = useSearchParams();
  const preset = { pillar: search.get('pillar') || '', angle: search.get('angle') || '' };
  const [week, setWeek] = useState(null);
  const [data, setData] = useState(null);
  const [mcp, setMcp] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => api.liPlanner(week).then((d) => { setData(d); if (!week) setWeek(d.week_start); }).catch((e) => setError(e.message)), [week]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.liMcpStatus().then(setMcp).catch(() => setMcp({ connected: false, text: 'Could not reach the LinkedIn MCP' })); }, []);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;

  return (
    <>
      <div className="date-nav">
        <button className="btn icon" onClick={() => setWeek(addDays(data.week_start, -7))} aria-label="Previous week">‹</button>
        <div className="date-nav-center">
          <div className="date-title">Week of {formatRange(data.week_start, addDays(data.week_start, 6))}</div>
          <div className="muted small">2 posts a week · nothing posts without your approval{data.auto_approve ? ' (auto-approve is ON)' : ''}</div>
        </div>
        <button className="btn icon" onClick={() => setWeek(addDays(data.week_start, 7))} aria-label="Next week">›</button>
      </div>

      {mcp && !mcp.connected && (
        <div className="card notice">
          <span>
            🔌 <strong>LinkedIn isn't connected yet</strong>, so approved posts will wait and then fail with a clear message.
            Connect once: in Claude Code say <em>"connect my LinkedIn"</em>, or run <code>npm run login</code> in <code>linkedin-mcp</code>.
            You can still draft, edit and schedule now.
          </span>
        </div>
      )}
      {mcp?.connected && <div className="muted small li-mcp-ok">🔗 {mcp.text.replace(/\*\*/g, '')}</div>}

      {data.slots.map((slot) => (
        <SlotCard key={`${data.week_start}-${slot.index}`} weekStart={data.week_start} slot={slot} pillars={data.pillars} paused={data.paused} onChange={load}
          preset={!slot.post && data.slots.find((x) => !x.post)?.index === slot.index ? preset : null} />
      ))}
    </>
  );
}

// Post structures (same keys as server/src/linkedin/drafts.js). Auto rotates so consecutive posts feel different.
const FORMATS = [
  ['auto', 'Auto (rotate formats)'], ['story', 'Story: problem → fix → lesson'], ['contrarian', 'Contrarian take'],
  ['breakdown', 'How it works (breakdown)'], ['numbers', 'Before → after (numbers)'], ['lessons', '3 lessons'], ['ai_take', 'Opinion on an AI topic'],
];

function SlotCard({ weekStart, slot, pillars, paused, onChange, preset }) {
  const post = slot.post;
  const presetPillar = preset?.pillar && pillars.some((p) => p.name === preset.pillar) ? preset.pillar : null;
  const [pillar, setPillar] = useState(post?.pillar || presetPillar || slot.pillar.name);
  const [angle, setAngle] = useState(post?.angle || preset?.angle || '');
  const [text, setText] = useState(post?.text || '');
  const [at, setAt] = useState(toLocalInput(Math.max(slot.at_ms, Date.now() + 10 * 60000)));
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [writing, setWriting] = useState(false);
  const [format, setFormat] = useState('auto');
  const [firstComment, setFirstComment] = useState('');
  const [usedFormat, setUsedFormat] = useState(null);

  useEffect(() => { setText(post?.text || ''); setPillar(post?.pillar || slot.pillar.name); setAngle(post?.angle || ''); }, [post?.id, post?.updated_ms]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(label, fn, okMsg) {
    setBusy(label);
    setMsg(null);
    try {
      const r = await fn();
      if (r?.draft) { setFirstComment(r.draft.firstComment || ''); setUsedFormat(r.draft.format); }
      if (r?.warnings?.length) setMsg({ kind: 'warn', text: r.warnings.join(' · ') });
      else if (okMsg) setMsg({ kind: 'ok', text: okMsg });
      setWriting(false);
      await onChange();
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    } finally {
      setBusy(null);
    }
  }

  const status = post ? STATUS[post.status] : null;
  const editable = post && ['draft', 'approved', 'failed'].includes(post.status);
  const dirty = post && text.trim() !== post.text;
  const slotPassed = slot.at_ms <= Date.now();

  return (
    <section className={`card li-slot ${status?.cls || 'ps-empty'}`}>
      <div className="li-slot-head">
        <div>
          <strong>Post {slot.index + 1} · {when(slot.at_ms)}</strong>
          <div className="muted small">Pillar: {post?.pillar || slot.pillar.name}{post?.ai_generated ? ' · ✨ AI draft' : post ? ' · ✍️ written by you' : ''}</div>
        </div>
        {status && <span className={`li-post-status ${status.cls}`}>{status.label}</span>}
      </div>

      {/* Empty slot: generate from a pillar, or write your own */}
      {(!post || writing) && (
        <div className="li-compose">
          <div className="li-form">
            <label className="field">
              <span className="field-label">Pillar</span>
              <select value={pillar} onChange={(e) => setPillar(e.target.value)}>
                {pillars.map((p) => <option key={p.name}>{p.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Format</span>
              <select value={format} onChange={(e) => setFormat(e.target.value)}>
                {FORMATS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </label>
            <label className="field wide">
              <span className="field-label">Your angle (optional): one line on what this post is about</span>
              <input value={angle} onChange={(e) => setAngle(e.target.value)} maxLength={500} placeholder="e.g. How I cut my LLM feature from 27 s to 5.6 s" />
            </label>
          </div>
          {writing && (
            <textarea className="notes li-text" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your post…" />
          )}
          <div className="row gap wrap top-gap">
            {!writing ? (
              <>
                <button className="btn primary" disabled={!!busy} onClick={() => run('gen', () => api.liCreatePost({ week_start: weekStart, slot_index: slot.index, pillar, angle, mode: 'ai', format }))}>
                  {busy === 'gen' ? '✨ Writing a strong draft… (about 15 s)' : '✨ Generate draft'}
                </button>
                <button className="btn" onClick={() => { setText(''); setWriting(true); }}>✍️ Write my own</button>
              </>
            ) : (
              <>
                <button className="btn primary" disabled={!text.trim() || !!busy} onClick={() => run('save', () => api.liCreatePost({ week_start: weekStart, slot_index: slot.index, pillar, angle, mode: 'manual', text }))}>Save draft</button>
                <button className="btn" onClick={() => setWriting(false)}>Cancel</button>
              </>
            )}
          </div>
        </div>
      )}

      {post && !writing && (
        <>
          {editable ? (
            <textarea className="notes li-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} />
          ) : (
            <div className="li-preview">{post.text}</div>
          )}
          <div className="row center-v wrap li-meta">
            <span className={`small ${text.length > 3000 ? 'warn-text' : 'muted'}`}>{text.length}/3000</span>
            {post.status === 'scheduled' && <span className="small">⏰ Publishes {when(post.scheduled_ms)}</span>}
            {post.status === 'posted' && (
              <span className="small">Posted {when(post.posted_ms)} · {post.post_url ? <a href={post.post_url} target="_blank" rel="noreferrer">View on LinkedIn ↗</a> : post.post_urn}</span>
            )}
          </div>
          {post.error && <div className="li-error small">⚠️ {post.error}</div>}
          <PostImage post={post} onChange={onChange} />
          {editable && (
            <div className="row gap center-v wrap small top-gap-sm">
              {usedFormat && <span className="muted">Format: {FORMATS.find(([k]) => k === usedFormat)?.[1] || usedFormat}</span>}
              <span className="muted">Regenerate as</span>
              <select value={format} onChange={(e) => setFormat(e.target.value)} aria-label="Format for regenerate">
                {FORMATS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </div>
          )}
          {firstComment && (
            <div className="li-first-comment small">
              <strong>💬 Suggested first comment</strong> <span className="muted">(post it yourself right after publishing; links go here, not in the post)</span>
              <p>{firstComment}</p>
              <button className="btn small-btn" onClick={() => navigator.clipboard?.writeText(firstComment)}>Copy</button>
            </div>
          )}

          <div className="row gap wrap top-gap">
            {editable && dirty && (
              <button className="btn" disabled={!!busy} onClick={() => run('save', () => api.liUpdatePost(post.id, { text }), 'Saved')}>💾 Save changes</button>
            )}
            {post.status === 'draft' && !dirty && !slotPassed && (
              <button className="btn primary" disabled={!!busy} onClick={() => run('approve', () => api.liApprove(post.id), 'Approved and scheduled')}>
                ✅ Approve · post {when(slot.at_ms)}
              </button>
            )}
            {editable && !dirty && (slotPassed || post.status !== 'draft') && (
              <span className="row gap center-v wrap">
                <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
                <button className="btn primary" disabled={!!busy} onClick={() => run('approve', () => api.liApprove(post.id, new Date(at).getTime()), 'Approved and scheduled')}>✅ Approve · schedule</button>
              </span>
            )}
            {['approved', 'scheduled', 'failed'].includes(post.status) && !dirty && (
              <button
                className="btn" disabled={!!busy || paused} title={paused ? 'Automation is paused' : ''}
                onClick={() => confirm('Publish this post to LinkedIn now?') && run('now', () => api.liPublishNow(post.id))}
              >
                {busy === 'now' ? 'Publishing…' : '🚀 Publish now'}
              </button>
            )}
            {post.status === 'scheduled' && <button className="btn" disabled={!!busy} onClick={() => run('uns', () => api.liUnschedule(post.id))}>↩ Unschedule (edit)</button>}
            {editable && (
              <button className="btn" disabled={!!busy} onClick={() => run('gen', () => api.liCreatePost({ week_start: weekStart, slot_index: slot.index, pillar: post.pillar, angle: post.angle || '', mode: 'ai', format }))}>
                {busy === 'gen' ? '✨ Rewriting…' : '✨ Regenerate'}
              </button>
            )}
            {post.status !== 'posted' && post.status !== 'scheduled' && (
              <button className="link-btn" disabled={!!busy} onClick={() => confirm('Delete this draft?') && run('del', () => api.liDeletePost(post.id))}>Delete</button>
            )}
          </div>
        </>
      )}
      {msg && <div className={`small top-gap ${msg.kind === 'error' ? 'form-error' : msg.kind === 'warn' ? 'warn-text' : 'ok-text'}`}>{msg.kind === 'warn' ? '💡 ' : ''}{msg.text}</div>}
    </section>
  );
}
