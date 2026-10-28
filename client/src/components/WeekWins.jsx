import { BookOpen, Clock, Fire, Lightning, Medal, PuzzlePiece, Trophy } from '@phosphor-icons/react';
import { formatShort } from '../dates.js';
import { minutesText } from '../lib/hero.js';
import { EmptyState } from './fx.jsx';
import { CountUp } from './motion.jsx';

/** "Wins this week" (Mon–Sun): only real wins are shown, never a row of zeros. Numbers count up as the card arrives. */
export default function WeekWins({ week, onStart }) {
  const tiles = [
    week.lessons && [BookOpen, week.lessons, week.lessons === 1 ? 'lesson done' : 'lessons done'],
    week.problems && [PuzzlePiece, week.problems, week.problems === 1 ? 'problem solved' : 'problems solved'],
    week.minutes && [Clock, minutesText(week.minutes), 'learned'],
    week.levels && [Trophy, week.levels, week.levels === 1 ? 'level complete' : 'levels complete'],
    week.xp && [Lightning, week.xp, 'XP earned'],
    week.activeDays && [Fire, week.activeDays, 'of 7 days active'],
  ].filter(Boolean);

  return (
    <section className="card wins">
      <h2 className="card-title"><Medal size={18} aria-hidden="true" /> Wins this week</h2>
      {tiles.length ? (
        <>
          <div className="wins-grid">
            {tiles.map(([Icon, value, label]) => (
              <div key={label} className="win">
                <Icon size={16} className="win-icon" aria-hidden="true" />
                <strong><CountUp value={value} /></strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          {week.bestDay && <div className="small muted top-gap">Best day: {formatShort(week.bestDay.day)} · {minutesText(week.bestDay.minutes)}</div>}
        </>
      ) : (
        <EmptyState icon="🌱" title="A fresh week" action={onStart && <button className="btn primary" onClick={onStart}><Lightning size={16} aria-hidden="true" /> Just 5 minutes</button>}>
          Your first win is five minutes away. Everything you finish this week shows up here.
        </EmptyState>
      )}
    </section>
  );
}
