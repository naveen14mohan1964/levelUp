import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { refreshGame } from '../game.jsx';

/**
 * 🧪 Developer tools (dev server only: rendered when import.meta.env.DEV, and the API answers only with --dev-tools).
 * Reset AI lessons + game state to replay the level-up flow; a snapshot is taken first, so you can restore it.
 * DSA, projects, LeetCode, meals and everything else are never touched.
 */
export default function DevTools() {
  const [status, setStatus] = useState(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => api.devStatus().then(setStatus).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function run(fn, done) {
    setBusy(true); setError(null); setMsg(null);
    try { const r = await fn(); setMsg(done(r)); setConfirm(''); refreshGame(); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const when = (ms) => new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <section className="card dev-tools">
      <h2>🧪 Developer tools <span className="pill">dev server only</span></h2>
      <p className="muted small">
        Reset the AI + FDE lessons and the game state (focus sessions, streak freezes, seen celebrations) to test unlocks and
        LEVEL COMPLETE from Level 1. A snapshot is saved first. DSA, projects, LeetCode and meals are never touched.
      </p>
      {error && <div className="form-error">{error}</div>}
      {msg && <div className="small ok-text">{msg}</div>}
      {status && (
        <>
          <form className="row gap wrap center-v top-gap" onSubmit={(e) => { e.preventDefault(); run(() => api.devReset(confirm), (r) => `Reset done. Snapshot #${r.snapshot.id} saved (${r.snapshot.counts.lessons} lessons).`); }}>
            <label className="field" style={{ margin: 0 }}>
              <span className="field-label">Type RESET to confirm</span>
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="RESET" autoComplete="off" aria-describedby="dev-reset-note" />
            </label>
            <button className="btn danger" disabled={busy || confirm !== 'RESET'}>Reset AI + game progress</button>
          </form>
          <p id="dev-reset-note" className="small muted">Then open AI + FDE → Roadmap: only Level 1, lesson 1 is open.</p>
          <h3 className="small" style={{ marginBottom: '0.3rem' }}>Snapshots</h3>
          {!status.snapshots.length ? <p className="muted small">None yet: one is saved automatically before every reset.</p> : (
            <ul className="dev-snapshots">
              {status.snapshots.map((s) => (
                <li key={s.id}>
                  <span>#{s.id} · {when(s.created_ms)} · {s.counts.lessons} lessons, {s.counts.sessions} focus sessions</span>
                  <button className="btn" disabled={busy} onClick={() => run(() => api.devRestore(s.id), (r) => `Snapshot #${r.restored} restored.`)}>Restore</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
