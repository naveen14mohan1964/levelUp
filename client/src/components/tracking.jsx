// Shared pieces of the day-by-day trackers (Workout and Meals): date navigation, goal rings, number inputs.
import { useEffect, useState } from 'react';
import { formatLong, todayISO } from '../dates.js';
import { ProgressRing } from './ui.jsx';

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function DateNav({ date, goTo }) {
  return (
    <div className="date-nav">
      <button className="btn icon" onClick={() => goTo(addDays(date, -1))} aria-label="Previous day">‹</button>
      <div className="date-nav-center">
        <div className="date-title">{formatLong(date)}</div>
        {date !== todayISO() && <button className="link-btn" onClick={() => goTo(todayISO())}>Jump to today</button>}
      </div>
      <button className="btn icon" onClick={() => goTo(addDays(date, 1))} aria-label="Next day">›</button>
    </div>
  );
}

export function SaveError({ error, onDismiss }) {
  if (!error) return null;
  return (
    <div className="card notice">
      <span><strong>Couldn't save:</strong> {error}</span>
      <button className="link-btn" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}

export function Goal({ label, value, target, unit, color, sub }) {
  return (
    <div className="goal">
      <ProgressRing value={Math.min(value, target)} total={target} size={76} stroke={7} color={color} />
      <div>
        <div className="goal-label">{label}</div>
        <div className="goal-value">
          {value
            ? <>{value.toLocaleString('en-IN')}<span className="muted small"> / {target.toLocaleString('en-IN')} {unit}</span></>
            : <>{target.toLocaleString('en-IN')}<span className="muted small"> {unit} goal</span></>}
        </div>
        <div className="muted small">{sub}</div>
      </div>
    </div>
  );
}

export function NumberField({ label, value, step, onSave }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  const commit = () => {
    const next = v === '' ? null : Number(v);
    if (next !== (value ?? null)) onSave(next);
  };
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input type="number" step={step} min="0" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
    </label>
  );
}
