import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { areaByKey } from '../areas.js';
import { blockStatus, nowMinutes } from '../lib/timeline.js';
import { Md } from './ui.jsx';

const BLOCK_COLOR = {
  dsa: 'var(--dsa)',
  workout: 'var(--workout)',
  routine: 'var(--muted)',
  sleep: 'var(--dotnet)',
};
const BLOCK_LINK = { dsa: '/dsa', workout: '/workout' };
const STATUS_LABEL = { now: 'Now', done: '✓ Done', next: 'Next' };

/**
 * Vertical time-blocked plan for one day.
 * Behavioural design: a fixed daily routine is the cue; the "Now / Next" banner
 * removes the decision of "what should I do?" (decision fatigue kills habits).
 */
export default function Timeline({ schedule, isToday, onToggleTask, onToggleProject }) {
  const [now, setNow] = useState(nowMinutes());
  useEffect(() => {
    const id = setInterval(() => setNow(nowMinutes()), 60_000);
    return () => clearInterval(id);
  }, []);

  const nowMin = isToday ? now : null;
  const statuses = schedule.blocks.map((b) => blockStatus(b, nowMin));
  // The first not-yet-started block after the current one is "next".
  const nextIdx = statuses.findIndex((s) => s === 'upcoming');
  const current = schedule.blocks[statuses.indexOf('now')];
  const next = schedule.blocks[nextIdx];

  return (
    <section className="card timeline-card">
      {(current || next) && (
        <div className="now-banner">
          {current ? (
            <><span className="pulse" /> <strong>Now:</strong> {current.title} <span className="muted">until {current.end}</span></>
          ) : (
            <><strong>Next:</strong> {next.title} <span className="muted">at {next.start}</span></>
          )}
        </div>
      )}
      <ol className="timeline">
        {schedule.blocks.map((b, i) => {
          const status = i === nextIdx && !current ? 'next' : statuses[i];
          const color = b.area === 'project' && b.items[0] ? areaByKey[b.items[0].area].color : BLOCK_COLOR[b.area] || 'var(--node)';
          const compact = (b.area === 'routine' || b.area === 'sleep') && !b.items.length;
          const link = b.area === 'project' && b.items[0] ? areaByKey[b.items[0].area].to : BLOCK_LINK[b.area];
          return (
            <li key={b.key} className={`tl-block status-${status}${compact ? ' compact' : ''}`} style={{ '--block': color }}>
              <div className="tl-time">
                <strong>{b.start}</strong>
                {!compact && <span>{b.end}</span>}
              </div>
              <div className="tl-rail"><span className="tl-dot" /></div>
              <div className="tl-body">
                <div className="tl-head">
                  {link ? <Link to={link} className="tl-title">{b.title}</Link> : <span className="tl-title">{b.title}</span>}
                  {STATUS_LABEL[status] && <span className={`tl-badge badge-${status}`}>{STATUS_LABEL[status]}</span>}
                </div>
                {b.detail && <div className="tl-detail">{b.detail}</div>}
                {b.items.length > 0 && (
                  <ul className="tl-items">
                    {b.items.map((it) => it.kind === 'problems' ? (
                      <li key="problems">
                        <Link to={`/dsa/day/${schedule.date}`} className="tl-problems">
                          {it.selftest ? '🎯 Self-test' : '🧩 LeetCode'}: {it.solved}/{it.total} solved →
                        </Link>
                      </li>
                    ) : (
                      <li key={`${it.kind}-${it.step || ''}-${it.id}`}>
                        <label className={it.done ? 'done' : ''} title={it.linked ? 'Ticks itself when all its problems are solved' : undefined}>
                          <input
                            type="checkbox"
                            checked={it.done}
                            disabled={it.linked}
                            onChange={() => (it.kind === 'task' ? onToggleTask(it) : onToggleProject(it))}
                          />
                          <span>
                            <Md text={it.title} />
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
