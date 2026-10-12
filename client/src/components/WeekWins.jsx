import { formatShort } from '../dates.js';
import { minutesText } from '../lib/hero.js';
import { EmptyState } from './fx.jsx';

/** "Wins this week" (Mon–Sun): only real wins are shown, never a row of zeros. */
export default function WeekWins({ week, onStart }) {
  const tiles = [
    week.lessons && ['📚', week.lessons, week.lessons === 1 ? 'lesson done' : 'lessons done'],
    week.problems && ['🧩', week.problems, week.problems === 1 ? 'problem solved' : 'problems solved'],
    week.minutes && ['⏱', minutesText(week.minutes), 'learned'],
    week.levels && ['🏆', week.levels, week.levels === 1 ? 'level complete' : 'levels complete'],
    week.xp && ['⚡', week.xp, 'XP earned'],
    week.activeDays && ['🔥', `${week.activeDays}/7`, 'active days'],
  ].filter(Boolean);

  return (
    <section className="card wins">
      <h2>🏅 Wins this week</h2>
      {tiles.length ? (
        <>
          <div className="wins-grid">
            {tiles.map(([icon, value, label]) => (
              <div key={label} className="win"><span aria-hidden="true">{icon}</span><strong>{value}</strong><span>{label}</span></div>
            ))}
          </div>
          {week.bestDay && <div className="small muted top-gap">Best day: {formatShort(week.bestDay.day)} · {minutesText(week.bestDay.minutes)}</div>}
        </>
      ) : (
        <EmptyState icon="🌱" title="A fresh week" action={onStart && <button className="btn primary" onClick={onStart}>⚡ Just 5 minutes</button>}>
          Your first win is five minutes away. Everything you finish this week shows up here.
        </EmptyState>
      )}
    </section>
  );
}
