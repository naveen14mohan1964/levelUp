import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { formatShort, todayISO } from '../dates.js';
import { DiffPill } from './ui.jsx';

export const CONFIDENCE = [
  { v: 1, label: 'Copied', hint: "Couldn't solve it / read the solution" },
  { v: 2, label: 'Heavy hints', hint: 'Needed a lot of help' },
  { v: 3, label: 'Slow', hint: 'Solved alone but slow or buggy' },
  { v: 4, label: 'Clean', hint: 'Solved cleanly in the time box' },
  { v: 5, label: 'Could teach', hint: 'Fast, and could explain it to someone' },
];

/**
 * Logs one attempt: confidence + time + notes → the server schedules the next review.
 * Used from DSA Today, Problems and Review.
 */
export default function LogSolveDialog({ problem, onClose, onSaved }) {
  const isReview = problem.interval_days != null;
  const [confidence, setConfidence] = useState(null);
  const [time, setTime] = useState(problem.time_taken_min ?? '');
  const [notes, setNotes] = useState(problem.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    const d = dialogRef.current;
    d?.showModal();
    return () => d?.close();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await api.solveProblem(problem.id, { confidence, time_taken_min: time === '' ? null : Number(time), notes, date: todayISO() });
      setResult(r);
      onSaved?.(r.problem);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="dialog" onClose={onClose} onCancel={onClose}>
      <div className="dialog-head">
        <div>
          <div className="muted small">{isReview ? '🔁 Review re-solve' : problem.auto_synced ? '⚡ Synced from LeetCode: rate it' : '✅ Log a solve'}</div>
          <h2>
            <a href={problem.url} target="_blank" rel="noreferrer">{problem.lc_number ? `${problem.lc_number}. ` : ''}{problem.title}</a>
          </h2>
          <div className="row gap center-v"><DiffPill d={problem.difficulty} /><span className="muted small">{problem.topic}</span></div>
        </div>
        <button className="btn icon" onClick={onClose} aria-label="Close">×</button>
      </div>

      {result ? (
        <div className="dialog-body center">
          <div className="big-emoji">{result.schedule.mastered ? '🏆' : result.problem.confidence >= 4 ? '🎉' : '👍'}</div>
          <p>
            Next review in <strong>{result.schedule.interval} day{result.schedule.interval === 1 ? '' : 's'}</strong> ({formatShort(result.schedule.nextReview)}).
            {result.schedule.mastered && ' Mastered!'}
          </p>
          <p className="muted small">
            {result.problem.confidence <= 2
              ? "Marked 'needs revision'. Seeing it again tomorrow is how it sticks, so no stress."
              : 'Spaced repetition will bring it back just before you forget it.'}
          </p>
          <button className="btn primary" onClick={onClose}>Done</button>
        </div>
      ) : (
        <div className="dialog-body">
          <label className="field-label">How did it go?</label>
          <div className="confidence">
            {CONFIDENCE.map((c) => (
              <button key={c.v} className={`conf-btn${confidence === c.v ? ' on' : ''}`} onClick={() => setConfidence(c.v)} title={c.hint}>
                <strong>{c.v}</strong>
                <span>{c.label}</span>
              </button>
            ))}
          </div>
          {confidence && <div className="muted small">{CONFIDENCE[confidence - 1].hint}</div>}

          <div className="field-row">
            <label className="field">
              <span className="field-label">Time taken (min)</span>
              <input type="number" min="0" max="999" value={time} onChange={(e) => setTime(e.target.value)} placeholder="e.g. 25" />
            </label>
            <div className="field muted small">
              Time box: Easy 15 · Medium 30 · Hard 45 min
            </div>
          </div>

          <label className="field">
            <span className="field-label">Key insight (one line future-you will thank you for)</span>
            <textarea className="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. prefix sum + HashMap of counts; watch the k = 0 case" />
          </label>

          {error && <div className="form-error">{error}</div>}
          <div className="dialog-actions">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" disabled={!confidence || saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
    </dialog>
  );
}
