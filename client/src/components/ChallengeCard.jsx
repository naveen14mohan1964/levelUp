import { useState } from 'react';
import { CheckCircle, Flag } from '@phosphor-icons/react';
import { api } from '../api.js';
import { refreshGame, useGame } from '../game.jsx';

/**
 * This week's challenge: one promise you choose yourself from three suggestions based on your own last week.
 * Why you choose: a goal you picked is one you own (autonomy), and one challenge is easier to keep than five.
 * Progress is counted from real activity; there is no deadline pressure and nothing is lost if the week slips.
 */
export default function ChallengeCard() {
  const { game } = useGame();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const c = game?.growth?.challenge;
  if (!c) return null;
  const { chosen, suggestions } = c;

  async function choose(key) {
    setBusy(true); setError(null);
    try { await api.chooseChallenge(key); setPicking(false); refreshGame(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <section className="card challenge" aria-labelledby="challenge-title">
      <h2 id="challenge-title" className="card-title"><Flag size={18} aria-hidden="true" /> This week's challenge</h2>
      {chosen && !picking ? (
        <>
          <div className="challenge-row">
            <strong>{chosen.title}</strong>
            <span className="muted">{chosen.value} of {chosen.target}</span>
          </div>
          <div className={`challenge-bar${chosen.complete ? ' complete' : ''}`} role="progressbar" aria-label={chosen.title} aria-valuemin={0} aria-valuemax={chosen.target} aria-valuenow={chosen.value}>
            <span style={{ transform: `scaleX(${chosen.value / chosen.target})` }} />
          </div>
          {chosen.complete
            ? <p className="challenge-note won" role="status"><CheckCircle size={16} weight="fill" aria-hidden="true" /> Won. +{chosen.xp} Discipline XP for keeping your word.</p>
            : <p className="challenge-note muted">No rush: it counts everything you finish this week. <button type="button" className="link-btn" onClick={() => setPicking(true)}>Change it</button></p>}
        </>
      ) : (
        <>
          <p className="muted small challenge-intro">Pick one. It is based on your own last week, so it is within reach.</p>
          <div className="challenge-options">
            {suggestions.map((s) => (
              <button key={s.key} type="button" className="challenge-option" disabled={busy} onClick={() => choose(s.key)}>
                <strong>{s.title}</strong>
                <span>{s.why}</span>
              </button>
            ))}
          </div>
          {chosen && <button type="button" className="link-btn top-gap" onClick={() => setPicking(false)}>Keep the current one</button>}
        </>
      )}
      {error && <div className="form-error top-gap">{error}</div>}
    </section>
  );
}
