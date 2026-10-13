// Plan vs actual for the 5-month target: ahead, on track or behind, per roadmap and overall (pure, unit-tested).
const { daysBetween } = require('../game/days');

const ON_TRACK_DAYS = 1; // within ±1 day counts as on track

const verdict = (daysBehind) => (daysBehind > ON_TRACK_DAYS ? 'behind' : daysBehind < -ON_TRACK_DAYS ? 'ahead' : 'on track');

/**
 * @param today, startDate, endDate   YYYY-MM-DD (the plan's first and last day)
 * @param dsa      [{ date, done }] one per plan day
 * @param project  [{ date, done }] one per project roadmap day
 * @param learning { done, total } lessons across AI + FDE, LLD and HLD (self-paced: an even pace over the plan)
 */
function planPace({ today, startDate, endDate, dsa = [], project = [], learning = { done: 0, total: 0 } }) {
  const totalDays = daysBetween(startDate, endDate) + 1;
  const elapsed = Math.min(Math.max(daysBetween(startDate, today), 0), totalDays);
  // Dated roadmaps: unfinished days in the past minus days finished early
  const dated = (rows) => rows.filter((r) => r.date < today && !r.done).length - rows.filter((r) => r.date >= today && r.done).length;
  const tracks = [];
  if (dsa.length) tracks.push({ key: 'dsa', label: 'DSA', daysBehind: dated(dsa) });
  if (project.length) tracks.push({ key: 'project', label: 'Projects', daysBehind: dated(project) });
  if (learning.total) {
    const perDay = learning.total / totalDays;
    const expected = perDay * elapsed;
    tracks.push({ key: 'learning', label: 'Learning', daysBehind: Math.round((expected - learning.done) / perDay) });
  }
  for (const t of tracks) t.status = verdict(t.daysBehind);
  const worst = tracks.reduce((m, t) => Math.max(m, t.daysBehind), Number.NEGATIVE_INFINITY);
  const overall = tracks.length ? { daysBehind: worst, status: verdict(worst) } : { daysBehind: 0, status: 'on track' };
  return {
    daysLeft: Math.max(daysBetween(today, endDate), 0),
    totalDays,
    elapsedPct: Math.round((elapsed / totalDays) * 100),
    tracks,
    overall,
  };
}

module.exports = { planPace, verdict };
