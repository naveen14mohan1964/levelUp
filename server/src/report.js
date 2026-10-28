// The weekly report (Mon–Sun): what you did each day, this week vs last week, highlights, and a short honest verdict.
// Everything is computed from data the app already has: no AI call.
const { sql } = require('./db');
const { computeGame } = require('./game');
const { localDay, addDays, weekStart } = require('./game/days');

const GOALS = [['dsa', 'DSA'], ['learning', 'Learning'], ['project', 'Project'], ['workout', 'Workout'], ['nutrition', 'Nutrition']];
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Totals for a list of days (pure). */
function totals(days) {
  const sum = (k) => days.reduce((n, d) => n + (d[k] || 0), 0);
  const goalDays = days.filter((d) => d.goals);
  return {
    minutes: sum('minutes'),
    activeDays: days.filter((d) => d.minutes >= 5).length,
    xp: sum('xp'),
    lessons: sum('lessons'),
    problems: sum('problems'),
    cards: sum('cards'),
    workouts: days.filter((d) => d.workoutItems > 0).length,
    goalsMet: goalDays.reduce((n, d) => n + Object.values(d.goals).filter((s) => s === 'met').length, 0),
    goalsTracked: goalDays.reduce((n, d) => n + Object.values(d.goals).filter((s) => s !== 'off' && s !== 'rest').length, 0),
  };
}

/** A few plain sentences about the week (pure, deterministic). */
function verdict({ week, prev, days, camera }) {
  const lines = [];
  const diff = week.minutes - prev.minutes;
  if (!week.minutes && !week.problems && !week.lessons) {
    lines.push('A quiet week: nothing logged yet. One 25-minute session tomorrow restarts the engine.');
    return lines;
  }
  lines.push(`${plural(week.minutes, 'focused minute')} over ${plural(week.activeDays, 'active day')}${prev.minutes ? ` (${diff >= 0 ? '+' : ''}${diff} vs last week)` : ''}.`);
  const best = [...days].sort((a, b) => b.minutes - a.minutes)[0];
  if (best?.minutes) lines.push(`Best day: ${best.name} with ${plural(best.minutes, 'minute')}.`);
  if (week.lessons || week.problems) lines.push(`Shipped ${week.lessons} lesson${week.lessons === 1 ? '' : 's'} and ${week.problems} problem${week.problems === 1 ? '' : 's'}${week.cards ? `, plus ${week.cards} flashcard reviews` : ''}.`);
  if (camera) lines.push(`On camera you stayed focused ${camera.pct}% of the time${camera.pct >= 85 ? '. Strong.' : '. The phone-in-another-room trick helps.'}`);
  // the goal that slipped most (from the Mentor's daily evaluations)
  const missed = GOALS.map(([k, label]) => ({ label, n: days.filter((d) => d.goals && (d.goals[k] === 'missed' || d.goals[k] === 'partial')).length }))
    .sort((a, b) => b.n - a.n)[0];
  if (missed?.n >= 2) lines.push(`${missed.label} slipped on ${missed.n} days: give it a fixed time slot next week.`);
  else if (week.goalsTracked && week.goalsMet === week.goalsTracked) lines.push('Every tracked goal met. That is a perfect week.');
  if (week.activeDays < 5) lines.push(`Next week: aim for ${Math.min(7, Math.max(3, week.activeDays + 1))} active days (5+ minutes each). Small and steady wins.`);
  return lines;
}

async function weekReport(pool, start, now = Date.now()) {
  const end = addDays(start, 6);
  const prevStart = addDays(start, -7);
  const game = await computeGame(pool, now);
  const r = await pool.request().input('from', sql.Date, prevStart).input('to', sql.Date, end)
    .input('fromMs', sql.BigInt, new Date(`${prevStart}T00:00:00`).getTime()).input('toMs', sql.BigInt, new Date(`${addDays(end, 1)}T00:00:00`).getTime())
    .query(`
      SELECT CONVERT(char(10), log_date, 23) AS d, COUNT(*) AS n FROM dbo.workout_log WHERE log_date BETWEEN @from AND @to GROUP BY log_date;
      SELECT CONVERT(char(10), log_date, 23) AS d, weight_kg, water_ml FROM dbo.body_log WHERE log_date BETWEEN @from AND @to ORDER BY log_date;
      SELECT CONVERT(char(10), log_date, 23) AS d, SUM(protein_g) AS protein, SUM(calories) AS kcal FROM dbo.meals WHERE log_date BETWEEN @from AND @to GROUP BY log_date;
      SELECT CONVERT(char(10), eval_date, 23) AS d, results FROM dbo.mentor_evaluations WHERE eval_date BETWEEN @from AND @to;
      SELECT started_ms, ended_ms, minutes, camera, distracted_sec FROM dbo.focus_sessions WHERE started_ms >= @fromMs AND started_ms < @toMs AND ended_ms IS NOT NULL;`);
  const [workouts, body, meals, evals, sessions] = r.recordsets;
  const by = (rows) => new Map(rows.map((x) => [x.d, x]));
  const W = by(workouts); const B = by(body); const M = by(meals); const E = by(evals);

  const dayRow = (d, i) => {
    const a = game.byDay[d] || {};
    const ev = E.get(d);
    const goals = ev ? Object.fromEntries(Object.entries(JSON.parse(ev.results)).map(([k, v]) => [k, v?.status || 'off'])) : null;
    return {
      date: d, name: DAY_NAMES[i], future: d > localDay(now),
      minutes: a.minutes || 0, xp: a.xp || 0, lessons: a.lessons || 0, problems: a.problems || 0, cards: a.cards || 0, levels: a.levels || 0,
      workoutItems: W.get(d)?.n || 0,
      proteinG: M.get(d) ? Math.round(Number(M.get(d).protein)) : 0,
      kcal: M.get(d)?.kcal || 0,
      waterMl: B.get(d)?.water_ml || 0,
      goals,
    };
  };
  const days = DAY_NAMES.map((_, i) => dayRow(addDays(start, i), i));
  const prevDays = DAY_NAMES.map((_, i) => dayRow(addDays(prevStart, i), i));
  const week = totals(days);
  const prev = totals(prevDays);

  const inWeek = sessions.filter((s) => localDay(Number(s.started_ms)) >= start).map((s) => ({ ...s, started_ms: Number(s.started_ms) }));
  const cam = inWeek.filter((s) => s.camera);
  const camFocused = cam.reduce((n, s) => n + (s.minutes || 0), 0);
  const camAway = Math.round(cam.reduce((n, s) => n + (s.distracted_sec || 0), 0) / 60);
  const camera = cam.length ? { sessions: cam.length, focusedMin: camFocused, distractedMin: camAway, pct: camFocused + camAway ? Math.round((camFocused / (camFocused + camAway)) * 100) : 100 } : null;
  const longest = inWeek.sort((a, b) => (b.minutes || 0) - (a.minutes || 0))[0];
  const weights = body.filter((x) => x.weight_kg != null && x.d >= start).map((x) => ({ d: x.d, kg: Number(x.weight_kg) }));
  const lastPrevWeight = body.filter((x) => x.weight_kg != null && x.d < start).map((x) => Number(x.weight_kg)).at(-1);

  return {
    start, end, prevStart, nextStart: addDays(start, 7),
    isCurrent: start === weekStart(localDay(now)),
    days, week, prev,
    camera,
    longestSession: longest?.minutes ? { minutes: longest.minutes, date: localDay(longest.started_ms) } : null,
    weight: weights.length ? { first: lastPrevWeight ?? weights[0].kg, last: weights.at(-1).kg, change: Math.round((weights.at(-1).kg - (lastPrevWeight ?? weights[0].kg)) * 10) / 10 } : null,
    streak: { current: game.streak.current, best: game.streak.best, shields: game.streak.shields?.available || 0 },
    player: { level: game.player.level },
    verdict: verdict({ week, prev, days, camera }),
    goals: GOALS.map(([key, label]) => ({ key, label })),
  };
}

module.exports = { weekReport, totals, verdict, GOALS };
