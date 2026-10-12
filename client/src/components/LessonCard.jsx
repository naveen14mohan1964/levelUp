import { useEffect, useRef, useState } from 'react';
import { refreshGame } from '../game.jsx';
import { burst } from '../lib/celebrate.js';
import { XpFloat } from './fx.jsx';

/**
 * One lesson of a self-paced roadmap (AI + FDE, LLD, HLD): learn text, links, build, checkpoint, your notes, and
 * "Done: next lesson" with confetti + a floating +25 XP. onSave(id, { done?, notes? }) persists it.
 */
export default function LessonCard({ lesson: l, onSave, onChange, expanded = false, status }) {
  const [open, setOpen] = useState(expanded);
  const [xp, setXp] = useState(null);
  const doneBtn = useRef(null);
  const [notes, setNotes] = useState(l.notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => setNotes(l.notes || ''), [l.id, l.notes]);
  async function save(body) {
    setBusy(true); setError(null);
    try {
      await onSave(l.id, body);
      if (body.done) { burst(doneBtn.current); setXp(Date.now()); }
      refreshGame();
      await onChange();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <section className={`card ai-lesson${l.done_ms ? ' done' : ''}${status === 'current' ? ' is-current' : ''}`}>
      <div className="row center-v wrap" style={{ justifyContent: 'space-between', gap: '0.5rem' }}>
        <button className="link-btn ai-lesson-title" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {l.done_ms ? '✅' : open ? '▾' : '▸'} <span className="muted">{l.id}</span> {l.title}
        </button>
        <span className="small muted nowrap">{status === 'current' && <span className="lrow-next">Next</span>} ~{l.minutes} min</span>
      </div>
      {open && (
        <div className="ai-lesson-body">
          <p>{l.learn}</p>
          <div className="ai-block"><strong>📚 Learn</strong>
            <ul>{l.links.map((x) => <li key={x.url}><a href={x.url} target="_blank" rel="noreferrer">{x.label} ↗</a></li>)}</ul>
          </div>
          <div className="ai-block"><strong>🛠 Build</strong><p>{l.build}</p></div>
          <div className="ai-block"><strong>✅ Checkpoint</strong><p>{l.check}</p></div>
          <label className="field">
            <span className="field-label">Your notes (answer the checkpoint in your own words)</span>
            <textarea className="notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (l.notes || '') && save({ notes })} maxLength={10000} />
          </label>
          <div className="row gap wrap">
            {l.done_ms
              ? <button className="btn" disabled={busy} onClick={() => save({ done: false })}>↩ Mark not done</button>
              : (
                <span className="xp-anchor">
                  <button ref={doneBtn} className="btn primary" disabled={busy} onClick={() => save({ done: true, notes })}>✅ Done: next lesson</button>
                  {xp && <XpFloat key={xp} amount={25} onDone={() => setXp(null)} />}
                </span>
              )}
            {l.done_ms && <span className="small muted">Done {new Date(l.done_ms).toLocaleDateString('en-IN')}</span>}
          </div>
          {error && <div className="form-error">{error}</div>}
        </div>
      )}
    </section>
  );
}
