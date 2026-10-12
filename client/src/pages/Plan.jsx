import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { formatRange, formatShort, todayISO } from '../dates.js';
import { ErrorBox, Loading, ProgressBar } from '../components/ui.jsx';
import LevelMap, { LessonRow } from '../components/LevelMap.jsx';

function dayProgress(d) {
  return { done: d.tasks_done + d.core_done, total: d.tasks_total + d.core_total };
}

const PHASE = { 1: 'Phase 1 · Learn', 2: 'Phase 2 · Revision & mocks' };

/** DSA roadmap as a level map: each week is a level, each day a lesson (unlocks: GET /api/game/track/dsa). */
export default function Plan() {
  const [weeks, setWeeks] = useState(null);
  const [track, setTrack] = useState(null);
  const [error, setError] = useState(null);
  const today = todayISO();

  const load = () => {
    setError(null);
    Promise.all([api.weeks(), api.gameTrack('dsa')])
      .then(([ws, t]) => { setWeeks(ws); setTrack(t.track); })
      .catch((e) => setError(e.message));
  };
  useEffect(load, []);

  if (error) return <ErrorBox error={error} onRetry={load} />;
  if (!weeks || !track) return <Loading />;

  const byWeek = new Map(weeks.map((w) => [w.week_no, w]));
  const days = new Map(weeks.flatMap((w) => w.days).map((d) => [`d${d.id}`, d]));

  return (
    <>
      <section className="card">
        <h2>5-month roadmap</h2>
        <div className="row gap center-v">
          <ProgressBar value={track.done} total={track.total} />
          <span className="small nowrap">
            {track.done ? `${track.done} of ${track.total} days complete` : `${track.total} days · Day 1 is ready`}
          </span>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Each week is a level. Days unlock one by one; anything you solve early (even via LeetCode sync) stays open.
        </p>
      </section>

      <LevelMap
        track={track}
        levelKicker={(lv) => {
          const w = byWeek.get(lv.n);
          return `Week ${lv.n} of ${track.levels.length} · ${formatRange(w.start_date, w.end_date)} · ${PHASE[w.phase]}`;
        }}
        unlockHint={(lv, prev) => `Finish Week ${prev?.n} to unlock`}
        levelExtra={(lv) => byWeek.get(lv.n)?.milestone && <p className="small muted lmap-goal">🎯 {byWeek.get(lv.n).milestone}</p>}
        renderLesson={(x) => {
          const d = days.get(x.ref);
          const p = d ? dayProgress(d) : { done: 0, total: 0 };
          const meta = [formatShort(x.planDate), x.planDate === today ? 'today' : null, p.done && !x.done ? `${p.done}/${p.total} done` : null].filter(Boolean).join(' · ');
          const row = <LessonRow lesson={x} meta={meta} />;
          return x.status === 'locked' ? row : <Link className="lrow-link" to={x.planDate === today ? '/dsa' : `/dsa/day/${x.planDate}`}>{row}</Link>;
        }}
      />
    </>
  );
}
