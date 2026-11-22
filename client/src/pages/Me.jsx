import { Link } from 'react-router-dom';
import { ArrowRight, Medal, ShieldCheck } from '@phosphor-icons/react';
import { STAT_META } from '../areas.js';
import { useGame } from '../game.jsx';
import { Loading } from '../components/ui.jsx';
import { CountUp } from '../components/motion.jsx';
import ChallengeCard from '../components/ChallengeCard.jsx';
import WeekWins from '../components/WeekWins.jsx';

// What starts each stat, shown instead of a row of zeros
const FIRST_STEP = {
  career: 'Solve one problem or finish one lesson to start it.',
  fitness: 'Finish one workout to start it.',
  knowledge: 'A 10 minute review of what you learned starts it.',
  discipline: 'A check-in or a kept habit starts it.',
};

function Bar({ value, total, label }) {
  return (
    <div className="stat-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
      <span style={{ transform: `scaleX(${total ? Math.min(value / total, 1) : 0})` }} />
    </div>
  );
}

/**
 * Me: your character, built only from real work. Four stats, how consistent you have been lately,
 * this week's challenge and the milestones you have reached. Every number here is evidence of something you did.
 */
export default function Me() {
  const { game, name } = useGame();
  if (!game?.growth) return <Loading />;
  const { player, streak, growth } = game;
  const { stats, consistency, milestones } = growth;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{name || 'Me'}</h1>
          <div className="muted small">Level {player.level} · {player.total ? `${player.total} XP earned from real work` : 'Your first XP is one finished task away'}</div>
        </div>
      </div>

      <div className="stat-grid">
        {stats.map((s) => {
          const { Icon, color } = STAT_META[s.key];
          return (
            <section key={s.key} className="card stat-card" style={{ '--stat': color }} aria-label={`${s.label}: level ${s.level}`}>
              <header>
                <span className="stat-icon" aria-hidden="true"><Icon size={20} weight="fill" /></span>
                <div>
                  <h2>{s.label}</h2>
                  <div className="stat-identity">{s.identity}</div>
                </div>
                <span className="stat-level">Level <strong><CountUp value={s.level} /></strong></span>
              </header>
              <Bar value={s.xpInLevel} total={s.xpForNext} label={`${s.label} XP toward the next level`} />
              <div className="stat-xp">{s.xp ? `${s.xpInLevel} of ${s.xpForNext} XP${s.today ? ` · ${s.today} earned today` : ''}` : FIRST_STEP[s.key]}</div>
              {s.evidence.length > 0 && <div className="stat-evidence">{s.evidence.join(' · ')}</div>}
            </section>
          );
        })}
      </div>

      <div className="me-cols">
        <div>
          <section className="card consistency" aria-labelledby="cons-title">
            <h2 id="cons-title" className="card-title">Consistency</h2>
            <div className="cons-line">
              {consistency.active
                ? <>Active on <strong>{consistency.active}</strong> of the last {consistency.total} days</>
                : 'Your first active day lights up the first square.'}
            </div>
            <div className="cons-grid" role="img" aria-label={`${consistency.active} active days in the last ${consistency.total}`}>
              {consistency.days.map((d) => <span key={d.date} className={d.active ? 'on' : ''} title={`${d.date}${d.active ? ': active' : ''}`} />)}
            </div>
            <p className="muted small cons-note">
              A day is active with 5 minutes of learning or a finished workout. A break only costs the days it covers: nothing resets.
              {streak.current > 1 ? ` Current run: ${streak.current} days.` : ''}
              {streak.shields?.available ? <> <ShieldCheck size={14} aria-hidden="true" /> {streak.shields.available} streak shield{streak.shields.available === 1 ? '' : 's'} ready.</> : ''}
            </p>
          </section>

          <section className="card milestones" aria-labelledby="ms-title">
            <h2 id="ms-title" className="card-title"><Medal size={18} aria-hidden="true" /> Milestones</h2>
            {milestones.next.length > 0 && (
              <>
                <div className="ms-label">Coming up</div>
                <ul className="ms-next">
                  {milestones.next.map((m) => (
                    <li key={m.key} style={{ '--stat': STAT_META[m.stat].color }}>
                      <div className="ms-row"><span>{m.title}</span><span className="muted">{m.value} of {m.target}</span></div>
                      <Bar value={m.value} total={m.target} label={m.title} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="ms-label">{milestones.earned.length ? `Earned (${milestones.earned.length})` : 'Earned'}</div>
            {milestones.earned.length ? (
              <ul className="ms-earned">
                {milestones.earned.map((m) => (
                  <li key={m.key} style={{ '--stat': STAT_META[m.stat].color }}><Medal size={16} weight="fill" aria-hidden="true" /> {m.title}</li>
                ))}
              </ul>
            ) : <p className="muted small">Your first one arrives with your first finished problem, lesson or workout.</p>}
          </section>
        </div>

        <div>
          <ChallengeCard />
          <WeekWins week={game.week} />
          <Link to="/report" className="card me-link"><span><strong>Weekly report</strong><span className="muted small"> The week in numbers, compared with the one before.</span></span><ArrowRight size={16} aria-hidden="true" /></Link>
          <Link to="/progress" className="card me-link"><span><strong>Body progress</strong><span className="muted small"> Weight, measurements and photos.</span></span><ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </div>
    </>
  );
}
