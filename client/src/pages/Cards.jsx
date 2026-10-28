import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '../api.js';
import { refreshGame } from '../game.jsx';
import { burst } from '../lib/celebrate.js';
import { ErrorBox, Loading } from '../components/ui.jsx';

const GRADES = [
  { key: 'again', label: 'Again', hint: 'forgot', kbd: '1' },
  { key: 'hard', label: 'Hard', hint: 'barely', kbd: '2' },
  { key: 'good', label: 'Good', hint: 'got it', kbd: '3' },
  { key: 'easy', label: 'Easy', hint: 'instant', kbd: '4' },
];
const TRACKS = [['ai', 'AI + FDE'], ['lld', 'LLD'], ['hld', 'HLD'], ['judge', 'Judgement']];
const days = (n) => (n === 0 ? 'today' : n < 30 ? `${n}d` : n < 365 ? `${Math.round(n / 30)}mo` : `${(n / 365).toFixed(1)}y`);

/**
 * Flashcards: every finished AI / LLD / HLD lesson turns into a card (its checkpoint question), plus your own.
 * Say the answer out loud, flip, then grade honestly: the schedule spaces each card out just before you'd forget it.
 */
export default function Cards() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('review');
  const load = useCallback(() => api.cards().then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!data) return <Loading />;
  const c = data.counts;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>🃏 Flashcards</h1>
          <div className="muted small">Finished lessons come back as questions just before you'd forget them. 5 minutes a day keeps AI, LLD and HLD in long-term memory.</div>
        </div>
      </div>
      <div className="stat-row">
        <div className="stat"><strong>{c.due}</strong><span>due today</span></div>
        <div className="stat"><strong>{c.reviewedToday}</strong><span>reviewed today{c.reviewedToday ? ` · ${Math.round((c.rememberedToday / c.reviewedToday) * 100)}% remembered` : ''}</span></div>
        <div className="stat"><strong>{c.total}</strong><span>cards · {c.mature} mature (3+ weeks)</span></div>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'review'} className={`tab${tab === 'review' ? ' active' : ''}`} onClick={() => setTab('review')}>Review{c.due ? ` (${c.due})` : ''}</button>
        <button role="tab" aria-selected={tab === 'all'} className={`tab${tab === 'all' ? ' active' : ''}`} onClick={() => setTab('all')}>All cards</button>
      </div>
      {tab === 'review' ? <ReviewSession key={data.today} data={data} onDone={load} /> : <AllCards data={data} onChange={load} />}
    </>
  );
}

function ReviewSession({ data, onDone }) {
  const [queue, setQueue] = useState(() => data.due);
  const [flipped, setFlipped] = useState(false);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const endRef = useRef(null);
  const card = queue[0];

  const grade = useCallback(async (g) => {
    if (!card || busy || !flipped) return;
    setBusy(true); setError(null);
    try {
      const next = await api.cardReview(card.id, g);
      setFlipped(false);
      setDone((n) => n + 1);
      // "again" comes back at the end of today's session; the rest leave the queue
      setQueue((q) => (g === 'again' ? [...q.slice(1), { ...q[0], ...next, preview: q[0].preview }] : q.slice(1)));
      refreshGame();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }, [card, busy, flipped]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select, [contenteditable]') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped(true); }
      const g = GRADES.find((x) => x.kbd === e.key);
      if (g) grade(g.key);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [grade]);

  useEffect(() => { if (!card && done > 0) burst(endRef.current); }, [card, done]);

  if (!card) {
    return (
      <section className="card cards-empty" ref={endRef}>
        {done > 0 ? (
          <>
            <h2>🎉 Session done: {done} review{done === 1 ? '' : 's'}</h2>
            <p className="muted">Everything due is reviewed. Tomorrow's cards will be waiting.</p>
            <button className="btn" onClick={onDone}>Refresh</button>
          </>
        ) : data.counts.total ? (
          <>
            <h2>🎉 Nothing due today</h2>
            <p className="muted">Your memory is up to date. Next cards come due over the next days.</p>
          </>
        ) : (
          <>
            <h2>Your deck is empty, for now</h2>
            <p className="muted">Finish a lesson in <Link to="/ai">AI + FDE</Link>, <Link to="/lld">LLD</Link> or <Link to="/hld">HLD</Link> and its checkpoint question becomes a card here the next day. You can also add your own under “All cards”.</p>
          </>
        )}
      </section>
    );
  }

  return (
    <section className="cards-review">
      <div className="cards-progress small muted">{done} done · {queue.length} to go</div>
      <AnimatePresence mode="wait">
        <motion.div key={`${card.id}-${done}`} className="flashcard-wrap"
          initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.2 }}>
          <button className={`flashcard${flipped ? ' flipped' : ''}`} onClick={() => setFlipped((f) => !f)} aria-label={flipped ? 'Answer shown. Click to see the question' : 'Show the answer'}>
            <div className="flashcard-face front">
              <span className="chip">{card.trackLabel}{card.title ? ` · ${card.title}` : card.source === 'drill' ? ' · design drill' : ' · your card'}</span>
              <p className="flashcard-q">{card.front}</p>
              <span className="small muted">Say your answer out loud, then flip · Space</span>
            </div>
            <div className="flashcard-face back" aria-hidden={!flipped}>
              <span className="chip">Answer</span>
              <p className="flashcard-a">{card.back}</p>
            </div>
          </button>
        </motion.div>
      </AnimatePresence>
      {flipped ? (
        <div className="grade-row" role="group" aria-label="How well did you remember it?">
          {GRADES.map((g) => (
            <button key={g.key} className={`btn grade-${g.key}`} disabled={busy} onClick={() => grade(g.key)}>
              <strong>{g.label}</strong>
              <span className="small">{card.preview ? days(card.preview[g.key]) : g.hint} · <kbd>{g.kbd}</kbd></span>
            </button>
          ))}
        </div>
      ) : (
        <div className="grade-row"><button className="btn primary btn-lg" onClick={() => setFlipped(true)}>Show answer</button></div>
      )}
      {error && <div className="form-error">{error}</div>}
    </section>
  );
}

function AllCards({ data, onChange }) {
  const [q, setQ] = useState('');
  const [track, setTrack] = useState('all');
  const [form, setForm] = useState(null); // { id?, track, front, back }
  const [error, setError] = useState(null);
  const list = useMemo(() => data.cards.filter((c) => (track === 'all' || c.track === track)
    && (!q || `${c.front} ${c.back} ${c.title || ''}`.toLowerCase().includes(q.toLowerCase()))), [data.cards, q, track]);

  const save = async (e) => {
    e.preventDefault(); setError(null);
    try {
      if (form.id) await api.cardUpdate(form.id, form); else await api.cardAdd(form);
      setForm(null); onChange();
    } catch (err) { setError(err.message); }
  };
  const remove = async (c) => {
    if (!window.confirm('Delete this card?')) return;
    try { await api.cardDelete(c.id); onChange(); } catch (err) { setError(err.message); }
  };

  return (
    <section className="card">
      <div className="cards-toolbar">
        <input type="search" placeholder="Search cards…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search cards" />
        <select value={track} onChange={(e) => setTrack(e.target.value)} aria-label="Track">
          <option value="all">All tracks</option>
          {TRACKS.map(([k, l]) => <option key={k} value={k}>{l} ({data.byTrack.find((b) => b.track === k)?.total || 0})</option>)}
        </select>
        <button className="btn primary" onClick={() => setForm({ track: 'ai', front: '', back: '' })}>+ Add a card</button>
      </div>
      {form && (
        <form className="card-form" onSubmit={save}>
          <label>Track
            <select value={form.track} onChange={(e) => setForm({ ...form, track: e.target.value })} disabled={!!form.lesson_ref}>
              {TRACKS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label>Front (the question)<textarea rows={2} maxLength={500} value={form.front} onChange={(e) => setForm({ ...form, front: e.target.value })} required /></label>
          <label>Back (the answer)<textarea rows={4} maxLength={2000} value={form.back} onChange={(e) => setForm({ ...form, back: e.target.value })} required /></label>
          <div className="row-gap">
            <button className="btn primary" type="submit">{form.id ? 'Save' : 'Add card'}</button>
            <button className="btn" type="button" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}
      {error && <div className="form-error">{error}</div>}
      {list.length === 0 ? <p className="muted">{data.cards.length ? 'No cards match.' : 'No cards yet. Finish a lesson, or add your own.'}</p> : (
        <ul className="card-list">
          {list.map((c) => (
            <li key={c.id}>
              <div>
                <div className="small muted">{c.trackLabel}{c.title ? ` · ${c.title}` : c.source === 'drill' ? ' · design drill' : ' · your card'} · due {c.due <= data.today ? 'today' : c.due} · every {days(c.interval_days || 0)}</div>
                <strong>{c.front}</strong>
              </div>
              <div className="row-gap">
                <button className="link-btn" onClick={() => setForm({ id: c.id, track: c.track, front: c.front, back: c.back, lesson_ref: c.lesson_ref })}>Edit</button>
                {c.source !== 'lesson' && <button className="link-btn" onClick={() => remove(c)}>Delete</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
