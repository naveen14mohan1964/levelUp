import { Link } from 'react-router-dom';
import { ArrowsClockwise, CaretRight, CheckCircle } from '@phosphor-icons/react';
import { STAT_META, areaByKey } from '../areas.js';
import { minutesText } from '../lib/hero.js';
import { effort } from '../lib/priorities.js';

/** A small ring that fills as the mission progresses; a green tick once it is done. */
function StepRing({ done, total }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const pct = total ? Math.min(done / total, 1) : 0;
  return (
    <svg className="prio-ring" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="2.5" />
      {pct > 0 && <circle cx="12" cy="12" r={r} fill="none" stroke="var(--focus)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 12 12)" />}
    </svg>
  );
}

/**
 * Today's three missions: one row each with its outcome, planned time, effort and progress.
 * A row opens the place where you do it; a habit row is ticked right here. Done rows turn calm
 * (green tick, muted title) rather than disappearing, so the day's wins stay visible.
 * The third mission is yours to choose (onSwap).
 */
export default function Priorities({ items, preview, swapTo, onSwap, onToggleHabit }) {
  if (!items.length) return null;
  const left = items.filter((p) => !p.complete).length;
  return (
    <section className="card prio-card" aria-labelledby="prio-title">
      <div className="prio-head">
        <h2 id="prio-title" className="card-title">{preview ? 'Your first day: 3 missions' : 'Today\'s missions'}</h2>
        <span className="small muted" role="status">{left ? `${left} to go` : 'All three done'}</span>
      </div>
      <ul className="prio-list">
        {items.map((p) => {
          const meta = p.habit ? STAT_META[p.stat] : areaByKey[p.area];
          const Icon = meta?.Icon;
          const detail = [p.minutes ? `~${minutesText(p.minutes)}` : 'Through the day', effort(p.minutes), p.sub].filter(Boolean).join(' · ');
          const body = (
            <>
              {p.complete ? <CheckCircle size={24} weight="fill" className="prio-check" aria-hidden="true" /> : <StepRing done={p.done} total={p.total} />}
              <span className="prio-text">
                <span className="prio-title">{p.title}</span>
                <span className="prio-sub">{p.complete ? 'Done' : detail}</span>
              </span>
              {Icon && <Icon size={18} className="prio-area" aria-hidden="true" />}
              {!p.habit && <CaretRight size={14} className="prio-go" aria-hidden="true" />}
            </>
          );
          const props = { className: `prio${p.complete ? ' done' : ''}`, style: { '--area': meta?.color } };
          return (
            <li key={p.key}>
              {p.habit
                ? <button type="button" {...props} aria-pressed={p.complete} disabled={preview} onClick={() => onToggleHabit(p)}>{body}</button>
                : <Link to={p.to} {...props}>{body}</Link>}
            </li>
          );
        })}
      </ul>
      {swapTo && (
        <button type="button" className="link-btn prio-swap" onClick={onSwap}>
          <ArrowsClockwise size={14} aria-hidden="true" /> Swap the third mission for: {swapTo.title}
        </button>
      )}
    </section>
  );
}
