import { useEffect, useState } from 'react';
import { SOUNDS, choose, chooseVolume, prefs, setVolume, subscribe } from '../lib/soundscape.js';

/**
 * Focus soundscapes under the timer. Your choice is remembered; focus.jsx plays it whenever a session runs (on any
 * page), fades it out when the session ends, and drops it to a whisper while the camera guard sees you away.
 */
export default function SoundBar({ running }) {
  const [p, setP] = useState(prefs);
  useEffect(() => subscribe(setP), []);
  useEffect(() => { setVolume(p.volume); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="soundbar" role="group" aria-label="Focus sound">
      {SOUNDS.map((s) => (
        <button key={s.key} className={`chip-btn${p.kind === s.key ? ' on' : ''}`} aria-pressed={p.kind === s.key}
          onClick={() => choose(s.key, { now: running })} title={s.label}>
          <span aria-hidden="true">{s.icon}</span> {s.label}
        </button>
      ))}
      {p.kind !== 'off' && (
        <label className="soundbar-vol small muted">
          Volume
          <input type="range" min="0" max="1" step="0.05" value={p.volume} onChange={(e) => chooseVolume(Number(e.target.value))} aria-label="Sound volume" />
        </label>
      )}
    </div>
  );
}
