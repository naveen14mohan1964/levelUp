// The growth layer: four stats (Career, Fitness, Knowledge, Discipline), consistency over the last 28 days,
// one weekly challenge you choose, and milestones for real results.
// Every point comes from something finished in real life (a solved problem, a workout, a kept habit):
// opening the app earns nothing, and nothing here can be lost by taking a break.
const { sql } = require('./db');
const { playerLevel } = require('./game/xp');
const { localDay, addDays, weekStart } = require('./game/days');
const { sessionFor, isDayDone } = require('./workout');

const STATS = [
  { key: 'career', label: 'Career', identity: 'Becoming a stronger engineer' },
  { key: 'fitness', label: 'Fitness', identity: 'Becoming physically stronger' },
  { key: 'knowledge', label: 'Knowledge', identity: 'Becoming a deeper thinker' },
  { key: 'discipline', label: 'Discipline', identity: 'Becoming someone who shows up' },
];
// Tiny daily habits: a two-minute action is easy to start, and starting is the hard part
const HABITS = {
  spend: { stat: 'discipline', xp: 5, title: 'Log today\'s spend', minutes: 2 },
  review: { stat: 'knowledge', xp: 10, title: '10 minute review of what you learned', minutes: 10 },
};
const GXP = { workout: 30, protein: 10, journal: 5, challenge: 40 };
const CONSISTENCY_DAYS = 28;
const ACTIVE_MINUTES = 5;
const CAREER_TRACKS = new Set(['dsa', 'fullstack', 'react', 'dotnet', 'node']);
const KNOWLEDGE_TRACKS = new Set(['ai', 'lld', 'hld', 'judge', 'cards']);

const noon = (day) => new Date(`${day}T12:00:00`).getTime();
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Which stat an XP event feeds. */
function statOf(e) {
  if (e.stat) return e.stat;
  if (e.kind === 'comeback') return 'discipline';
  if (CAREER_TRACKS.has(e.track)) return 'career';
  if (KNOWLEDGE_TRACKS.has(e.track)) return 'knowledge';
  return 'career';
}

/** Everything the growth layer needs beyond the learning data: workouts, protein, journal, habits, challenges, weight. */
async function loadExtras(pool) {
  const r = await pool.request().query(`
    SELECT CONVERT(char(10), log_date, 23) AS d, item_key FROM dbo.workout_log;
    SELECT CONVERT(char(10), log_date, 23) AS d, SUM(protein_g) AS protein FROM dbo.meals GROUP BY log_date;
    SELECT CONVERT(char(10), entry_date, 23) AS d FROM dbo.journal
      WHERE mood IS NOT NULL OR note IS NOT NULL OR accomplished IS NOT NULL OR learned IS NOT NULL OR improve IS NOT NULL OR grateful IS NOT NULL;
    SELECT CONVERT(char(10), log_date, 23) AS d, habit_key AS k FROM dbo.habit_log;
    SELECT CONVERT(char(10), week_start, 23) AS week, challenge_key AS [key], target FROM dbo.weekly_challenges;
    SELECT k, v FROM dbo.settings WHERE k IN ('start_date', 'protein_target_g', 'start_weight_kg');
    SELECT TOP 7 weight_kg FROM dbo.body_log WHERE weight_kg IS NOT NULL ORDER BY log_date DESC;`);
  const s = Object.fromEntries(r.recordsets[5].map((x) => [x.k, x.v]));
  const byDate = new Map();
  for (const { d, item_key } of r.recordsets[0]) {
    if (!byDate.has(d)) byDate.set(d, new Set());
    byDate.get(d).add(item_key);
  }
  const workoutDays = s.start_date ? [...byDate].filter(([d, keys]) => isDayDone(sessionFor(d, s.start_date), keys) === true).map(([d]) => d) : [];
  const target = Number(s.protein_target_g) || 0;
  const weights = r.recordsets[6].map((x) => Number(x.weight_kg));
  const startWeight = Number(s.start_weight_kg) || null;
  return {
    workoutDays: workoutDays.sort(),
    proteinDays: target ? r.recordsets[1].filter((x) => Number(x.protein) >= target).map((x) => x.d).sort() : [],
    journalDays: r.recordsets[2].map((x) => x.d).sort(),
    habits: r.recordsets[3].filter((x) => HABITS[x.k]),
    challenges: r.recordsets[4],
    // weight lost uses the average of the last (up to 7) weigh-ins, so one light morning unlocks nothing early
    weightLost: startWeight && weights.length ? Math.max(0, Math.round((startWeight - weights.reduce((a, b) => a + b, 0) / weights.length) * 10) / 10) : 0,
  };
}

const CHALLENGES = {
  workouts: { title: (n) => `Finish ${plural(n, 'workout')}`, unit: 'workouts', min: 3, max: 6, step: 1 },
  problems: { title: (n) => `Solve ${plural(n, 'problem')}`, unit: 'problems', min: 5, max: 30, step: 2 },
  active: { title: (n) => `Be active on ${plural(n, 'day')}`, unit: 'active days', min: 4, max: 7, step: 1 },
};

const MILESTONES = [
  { family: 'problems', stat: 'career', tiers: [1, 10, 25, 50, 100, 150], title: (n) => (n === 1 ? 'First problem solved' : `${n} problems solved`) },
  { family: 'lessons', stat: 'knowledge', tiers: [1, 10, 25, 50, 100], title: (n) => (n === 1 ? 'First lesson finished' : `${n} lessons finished`) },
  { family: 'workouts', stat: 'fitness', tiers: [1, 5, 10, 25, 50, 100], title: (n) => (n === 1 ? 'First workout done' : `${n} workouts done`) },
  { family: 'kg', stat: 'fitness', tiers: [1, 3, 5, 10, 15, 20, 25, 30, 35], title: (n) => `${n} kg lost` },
  { family: 'days', stat: 'discipline', tiers: [7, 30, 60, 100], title: (n) => `${n} active days` },
  { family: 'journal', stat: 'discipline', tiers: [3, 7, 30], title: (n) => `${n} days of reflection` },
];

/**
 * Pure: turns the learning events + the extras into extra XP events, stats, consistency, the weekly challenge and milestones.
 * @param events   XP events from the learning data (game/xp.js)
 * @param minutes  Map(day -> learning minutes)
 * @param extras   loadExtras()
 * @param today    YYYY-MM-DD
 * @returns { events (the extra ones), stats, consistency, challenge, milestones, habits }
 */
function build({ events, minutes, extras, today }) {
  const extra = [];
  const add = (day, kind, stat, xp, ref) => extra.push({ ms: noon(day), xp, kind, track: kind, stat, ref });
  for (const d of extras.workoutDays) add(d, 'workout', 'fitness', GXP.workout, `workout-${d}`);
  for (const d of extras.proteinDays) add(d, 'protein', 'fitness', GXP.protein, `protein-${d}`);
  for (const d of extras.journalDays) add(d, 'journal', 'discipline', GXP.journal, `journal-${d}`);
  for (const h of extras.habits) add(h.d, 'habit', HABITS[h.k].stat, HABITS[h.k].xp, `habit-${h.k}-${h.d}`);

  // An active day = real work happened: 5+ minutes of learning, or a finished workout
  const workoutSet = new Set(extras.workoutDays);
  const isActive = (d) => (minutes.get(d) || 0) >= ACTIVE_MINUTES || workoutSet.has(d);
  const dayOf = (e) => (e.ms ? localDay(e.ms) : null);
  const between = (d, from, to) => d && d >= from && d <= to;
  const range = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };
  const metric = (key, from, to) => {
    if (key === 'workouts') return extras.workoutDays.filter((d) => between(d, from, to)).length;
    if (key === 'problems') return events.filter((e) => e.kind === 'problem' && between(dayOf(e), from, to)).length;
    if (key === 'active') return range(from, to).filter(isActive).length;
    return 0;
  };

  // Weekly challenge: a won week earns Discipline XP (you kept a promise you made to yourself)
  let won = 0;
  for (const c of extras.challenges) {
    if (!CHALLENGES[c.key]) continue;
    const end = addDays(c.week, 6);
    if (metric(c.key, c.week, end > today ? today : end) >= c.target) {
      won++;
      add(end > today ? today : end, 'challenge', 'discipline', GXP.challenge, `challenge-${c.week}`);
    }
  }
  const week = weekStart(today);
  const chosenRow = extras.challenges.find((c) => c.week === week && CHALLENGES[c.key]);
  const lastWeek = addDays(week, -7);
  const suggestions = Object.entries(CHALLENGES).map(([key, c]) => {
    const last = metric(key, lastWeek, addDays(week, -1));
    const target = clamp(last + c.step, c.min, c.max);
    return { key, title: c.title(target), target, why: last ? `Last week: ${last} ${c.unit}` : 'A gentle start' };
  });
  const chosen = chosenRow && (() => {
    const value = metric(chosenRow.key, week, today);
    return { key: chosenRow.key, title: CHALLENGES[chosenRow.key].title(chosenRow.target), target: chosenRow.target, value: Math.min(value, chosenRow.target), complete: value >= chosenRow.target, xp: GXP.challenge };
  })();

  // Stats: each is its own small level track, fed only by its own kind of work
  const all = [...events, ...extra];
  const count = (fn) => all.filter(fn).length;
  const n = {
    problems: count((e) => e.kind === 'problem'),
    careerLessons: count((e) => e.kind === 'lesson' && CAREER_TRACKS.has(e.track)),
    knowledgeLessons: count((e) => e.kind === 'lesson' && KNOWLEDGE_TRACKS.has(e.track)),
    reviews: count((e) => e.kind === 'card') + extras.habits.filter((h) => h.k === 'review').length,
    workouts: extras.workoutDays.length,
    protein: extras.proteinDays.length,
    journal: extras.journalDays.length,
    comebacks: count((e) => e.kind === 'comeback'),
    spend: extras.habits.filter((h) => h.k === 'spend').length,
  };
  const evidence = {
    career: [n.problems && plural(n.problems, 'problem') + ' solved', n.careerLessons && plural(n.careerLessons, 'lesson') + ' finished'],
    fitness: [n.workouts && plural(n.workouts, 'workout') + ' done', n.protein && plural(n.protein, 'protein goal') + ' hit', extras.weightLost >= 0.5 && `${extras.weightLost} kg lost`],
    knowledge: [n.knowledgeLessons && plural(n.knowledgeLessons, 'lesson') + ' finished', n.reviews && plural(n.reviews, 'review') + ' done'],
    discipline: [n.journal && plural(n.journal, 'day') + ' of reflection', won && plural(won, 'challenge') + ' won', n.spend && plural(n.spend, 'day') + ' of spend logged', n.comebacks && plural(n.comebacks, 'comeback')],
  };
  const stats = STATS.map((s) => {
    const xp = all.filter((e) => statOf(e) === s.key).reduce((sum, e) => sum + e.xp, 0);
    return { ...s, ...playerLevel(xp), xp, today: all.filter((e) => statOf(e) === s.key && dayOf(e) === today).reduce((sum, e) => sum + e.xp, 0), evidence: evidence[s.key].filter(Boolean) };
  });

  // Consistency: active days in the last 28. It only ever moves by one day at a time, so a break never wipes it out.
  const from = addDays(today, -(CONSISTENCY_DAYS - 1));
  const days = range(from, today).map((date) => ({ date, active: isActive(date) }));
  const everActive = new Set([...[...minutes.keys()].filter((d) => (minutes.get(d) || 0) >= ACTIVE_MINUTES), ...extras.workoutDays]);

  // Milestones: only real results. "next" = the closest ones still ahead (anticipation without any gamble).
  const values = { problems: n.problems, lessons: n.careerLessons + n.knowledgeLessons, workouts: n.workouts, kg: extras.weightLost, days: everActive.size, journal: n.journal };
  const earned = [];
  const next = [];
  for (const m of MILESTONES) {
    const value = values[m.family];
    for (const t of m.tiers) if (value >= t) earned.push({ key: `${m.family}-${t}`, title: m.title(t), stat: m.stat });
    const t = m.tiers.find((x) => value < x);
    if (t) next.push({ key: `${m.family}-${t}`, title: m.title(t), stat: m.stat, value, target: t });
  }
  next.sort((a, b) => b.value / b.target - a.value / a.target);

  const todayHabits = new Set(extras.habits.filter((h) => h.d === today).map((h) => h.k));
  return {
    events: extra,
    stats,
    consistency: { active: days.filter((d) => d.active).length, total: CONSISTENCY_DAYS, days },
    challenge: { week, chosen: chosen || null, suggestions },
    milestones: { earned, next: next.slice(0, 3) },
    habits: Object.entries(HABITS).map(([key, h]) => ({ key, ...h, done: todayHabits.has(key) })),
  };
}

/** Tick or un-tick a habit for a day. */
async function setHabit(pool, date, key, done) {
  const q = pool.request().input('d', sql.Date, date).input('k', sql.NVarChar, key).input('now', sql.BigInt, Date.now());
  if (done) await q.query('IF NOT EXISTS (SELECT 1 FROM dbo.habit_log WHERE log_date = @d AND habit_key = @k) INSERT INTO dbo.habit_log (log_date, habit_key, done_ms) VALUES (@d, @k, @now);');
  else await q.query('DELETE FROM dbo.habit_log WHERE log_date = @d AND habit_key = @k;');
}

/** Choose (or change) this week's challenge. */
async function chooseChallenge(pool, week, key, target) {
  await pool.request().input('w', sql.Date, week).input('k', sql.NVarChar, key).input('t', sql.Int, target).input('now', sql.BigInt, Date.now()).query(`
    MERGE dbo.weekly_challenges AS t USING (SELECT @w AS week_start) AS s ON t.week_start = s.week_start
    WHEN MATCHED THEN UPDATE SET challenge_key = @k, target = @t
    WHEN NOT MATCHED THEN INSERT (week_start, challenge_key, target, created_ms) VALUES (@w, @k, @t, @now);`);
}

module.exports = { STATS, HABITS, GXP, CHALLENGES, CONSISTENCY_DAYS, statOf, loadExtras, build, setHabit, chooseChallenge };
