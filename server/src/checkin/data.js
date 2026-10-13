// The Mentor's data layer: load what you did on a day, evaluate it, store it, and summarise your status.
// Rules live in rules.js (pure); this file only gathers inputs and persists results.
const { sql } = require('../db');
const { readSettings } = require('../routes/settings');
const { sessionFor, isDayDone } = require('../workout');
const { ROADMAP } = require('../ai/feeds');
const { MODULES } = require('../learn/modules');
const { addDays } = require('../game/days');
const { localDate, freshStart, dowOf } = require('./time');
const { CATEGORIES, SHIELD_BANK, judge, escalate, perfectWeek } = require('./rules');
const { planPace } = require('./pace');

const BACKFILL_DAYS = 14;
const LEARN_TRACKS = ['ai', 'lld', 'hld'];
const LESSON_MINUTES = new Map([
  ...ROADMAP.levels.flatMap((lv) => lv.lessons.map((x) => [`ai|${x.id}`, x.minutes])),
  ...Object.values(MODULES).flatMap((m) => m.roadmap.levels.flatMap((lv) => lv.lessons.map((x) => [`${m.key}|${x.id}`, x.minutes]))),
]);
const ms = (d) => (d ? new Date(d).getTime() : null);

/** Mentor settings with defaults (stored as mentor_* rows in dbo.settings). */
async function mentorSettings() {
  const s = await readSettings();
  const str = (k, d) => (s[k] == null || s[k] === '' ? d : String(s[k]));
  const num = (k, d) => (Number.isFinite(Number(s[k])) && s[k] !== '' && s[k] != null ? Number(s[k]) : d);
  return {
    enabled: str('mentor_enabled', '1') === '1',
    strictness: str('mentor_strictness', 'standard'),
    evalTime: str('mentor_eval_time', '23:00'),
    morning: str('mentor_morning', '1') === '1',
    morningTime: str('mentor_morning_time', '06:30'),
    tz: str('mentor_tz', ''),
    telegram: str('mentor_telegram', '1') === '1',
    pauseUntil: str('mentor_pause_until', ''),
    restPerMonth: num('mentor_rest_per_month', 2),
    sickPerMonth: num('mentor_sick_per_month', 3),
    categories: str('mentor_categories', CATEGORIES.join(',')).split(',').map((c) => c.trim()).filter((c) => CATEGORIES.includes(c)),
    learningMinutes: num('mentor_learning_minutes', 30),
    planStart: s.start_date ? String(s.start_date) : null,
    proteinTarget: num('protein_target_g', 0),
    resetFrom: str('mentor_reset_from', ''), // a confirmed plan shift: misses before this day stop escalating
  };
}

/** Plan range (first and last DSA day). */
async function planRange(pool) {
  const r = await pool.request().query('SELECT CONVERT(char(10), MIN(plan_date), 23) AS a, CONVERT(char(10), MAX(plan_date), 23) AS b FROM dbo.days');
  return { start: r.recordset[0].a, end: r.recordset[0].b };
}

const PRE_PLAN = { off: true, why: 'before the plan starts' };

/** Everything the rules need about one local day. Before the plan starts, nothing counts. */
async function loadDay(pool, date, s, range) {
  if (range.start && date < range.start) {
    return { rest: null, dsa: PRE_PLAN, learning: PRE_PLAN, project: PRE_PLAN, workout: PRE_PLAN, nutrition: PRE_PLAN };
  }
  const lo = addDays(date, -1);
  const hi = addDays(date, 2);
  const r = await pool.request().input('d', sql.Date, date).input('lo', sql.Date, lo).input('hi', sql.Date, hi).query(`
    SELECT p.status, p.is_stretch FROM dbo.problems p JOIN dbo.days d ON d.id = p.day_id WHERE d.plan_date = @d;
    SELECT COUNT(*) AS n FROM dbo.days WHERE plan_date = @d;
    SELECT solved_at FROM dbo.problems WHERE solved_at >= @lo AND solved_at < @hi;
    SELECT track, lesson_ref, started_ms, planned_min, ended_ms, minutes FROM dbo.focus_sessions
      WHERE started_ms >= DATEDIFF_BIG(ms, '1970-01-01', CAST(@lo AS datetime2)) AND started_ms < DATEDIFF_BIG(ms, '1970-01-01', CAST(@hi AS datetime2));
    SELECT 'ai' AS track, lesson_id, done_ms FROM dbo.ai_progress WHERE done_ms IS NOT NULL
    UNION ALL SELECT track, lesson_id, done_ms FROM dbo.learn_progress WHERE done_ms IS NOT NULL;
    SELECT done, learn, learn_done FROM dbo.project_tasks WHERE plan_date = @d;
    SELECT item_key FROM dbo.workout_log WHERE log_date = @d;
    SELECT COUNT(*) AS meals, COALESCE(SUM(protein_g), 0) AS protein FROM dbo.meals WHERE log_date = @d;
    SELECT kind FROM dbo.rest_days WHERE rest_date = @d;`);
  const [probs, dayRow, solvedRows, sessions, lessons, projRows, workoutKeys, meal, rest] = r.recordsets;
  const inPlan = !!range.start && date >= range.start && date <= range.end;
  const tz = s.tz;
  const now = Date.now();

  // Learning minutes (AI + LLD + HLD): focus timer + estimates of lessons finished that day (a timed lesson isn't counted twice)
  const timed = new Set();
  let minutes = 0;
  for (const x of sessions) {
    if (!LEARN_TRACKS.includes(x.track) || localDate(Number(x.started_ms), tz) !== date) continue;
    const m = x.ended_ms != null ? x.minutes || 0 : Math.min(Math.floor((now - Number(x.started_ms)) / 60000), x.planned_min);
    minutes += m;
    timed.add(`${x.track}|${x.lesson_ref}`);
  }
  for (const x of lessons) {
    if (localDate(Number(x.done_ms), tz) !== date || timed.has(`${x.track}|${x.lesson_id}`)) continue;
    minutes += LESSON_MINUTES.get(`${x.track}|${x.lesson_id}`) || 0;
  }

  const core = probs.filter((p) => !p.is_stretch);
  const session = s.planStart ? sessionFor(date, s.planStart) : null;
  const doneKeys = new Set(workoutKeys.map((x) => x.item_key));
  return {
    rest: rest[0]?.kind || null,
    dsa: inPlan && dayRow[0].n ? { planned: core.length > 0, required: core.length, done: core.filter((p) => p.status !== 'todo').length, solvedToday: solvedRows.filter((x) => localDate(ms(x.solved_at), tz) === date).length } : { off: true, why: 'outside the plan' },
    learning: { minutes },
    project: projRows.length ? { planned: true, rows: projRows.length, done: projRows.filter((t) => t.done && (!t.learn || t.learn_done)).length, learnDone: projRows.filter((t) => t.learn_done).length } : { planned: false },
    workout: !inPlan || !session ? { off: true, why: 'outside the plan' } : { rest: !!session.rest, complete: !!isDayDone(session, doneKeys), moves: doneKeys.size },
    nutrition: { meals: Number(meal[0].meals), protein: Math.round(Number(meal[0].protein)), target: s.proteinTarget },
  };
}

async function history(pool, before, days = 30) {
  const r = await pool.request().input('b', sql.Date, before).input('a', sql.Date, addDays(before, -days)).query(`
    SELECT CONVERT(char(10), e.eval_date, 23) AS date, e.results, e.misses, e.level, e.shield_used, e.final, e.reason, e.blocker,
           (SELECT kind FROM dbo.rest_days r WHERE r.rest_date = e.eval_date) AS rest
    FROM dbo.mentor_evaluations e WHERE e.eval_date >= @a AND e.eval_date < @b ORDER BY e.eval_date`);
  return r.recordset.map((x) => ({ ...x, results: JSON.parse(x.results), misses: JSON.parse(x.misses), covered: !!x.shield_used }));
}

/** Evaluate one day and store it. `final` = the day is over (end-of-day check or catch-up). */
async function evaluateDay(pool, date, { final = false, s, range } = {}) {
  s = s || await mentorSettings();
  range = range || await planRange(pool);
  const past = (await history(pool, date)).filter((d) => !s.resetFrom || d.date >= s.resetFrom);
  const input = await loadDay(pool, date, s, range);
  // Categories with 2+ misses going into this day get the minimum-viable bar
  const before = escalate(past, s.categories);
  const results = {};
  for (const cat of CATEGORIES) {
    results[cat] = s.categories.includes(cat) ? judge(cat, input[cat], { mvd: before.mvdNext.includes(cat), learningMinutes: s.learningMinutes }) : { status: 'off', detail: 'not tracked' };
  }
  const covered = !!(await pool.request().input('d', sql.Date, date).query('SELECT 1 AS x FROM dbo.streak_freezes WHERE day = @d')).recordset.length;
  const today = { date, results, rest: input.rest, covered };
  const now = escalate([...past, today], s.categories);
  await pool.request().input('d', sql.Date, date).input('res', sql.NVarChar(sql.MAX), JSON.stringify(results))
    .input('mis', sql.NVarChar(sql.MAX), JSON.stringify(now.misses)).input('lvl', sql.TinyInt, input.rest ? 0 : now.level)
    .input('sh', sql.Bit, covered).input('fin', sql.Bit, final).input('ms', sql.BigInt, Date.now())
    .query(`MERGE dbo.mentor_evaluations AS t USING (SELECT @d AS eval_date) AS s ON t.eval_date = s.eval_date
            WHEN MATCHED THEN UPDATE SET results = @res, misses = @mis, level = @lvl, shield_used = @sh, final = CASE WHEN t.final = 1 THEN 1 ELSE @fin END, evaluated_ms = @ms
            WHEN NOT MATCHED THEN INSERT (eval_date, results, misses, level, shield_used, final, evaluated_ms) VALUES (@d, @res, @mis, @lvl, @sh, @fin, @ms);`);
  // Commitments for this day: kept if that category was met
  const commits = (await pool.request().input('d', sql.Date, date).query('SELECT id, category FROM dbo.mentor_commitments WHERE for_date = @d')).recordset;
  for (const c of commits) {
    await pool.request().input('id', sql.Int, c.id).input('f', sql.Bit, results[c.category]?.status === 'met').query('UPDATE dbo.mentor_commitments SET fulfilled = @f WHERE id = @id');
  }
  if (final && dowOf(date) === 0) await maybeEarnShield(pool, date, s);
  return { date, results, misses: now.misses, levels: now.levels, level: input.rest ? 0 : now.level, mvdTomorrow: now.mvdNext, rest: input.rest, covered, final };
}

/** Sunday night: a perfect Mon–Sun week earns a shield (bank of 2). */
async function maybeEarnShield(pool, sunday, s) {
  const monday = addDays(sunday, -6);
  const week = (await history(pool, addDays(sunday, 1), 7)).filter((d) => d.date >= monday);
  if (!perfectWeek(week, s.categories)) return false;
  const bank = (await pool.request().query('SELECT COUNT(*) AS n FROM dbo.streak_shields WHERE used_ms IS NULL')).recordset[0].n;
  if (bank >= SHIELD_BANK) return false;
  await pool.request().input('r', sql.NVarChar, `perfect-week:${monday}`).input('ms', sql.BigInt, Date.now())
    .query('IF NOT EXISTS (SELECT 1 FROM dbo.streak_shields WHERE reason = @r) INSERT INTO dbo.streak_shields (earned_ms, reason) VALUES (@ms, @r);');
  return true;
}

/** Everyone starts with one shield. */
async function ensureStarterShield(pool) {
  await pool.request().input('ms', sql.BigInt, Date.now())
    .query("IF NOT EXISTS (SELECT 1 FROM dbo.streak_shields WHERE reason = 'starter') INSERT INTO dbo.streak_shields (earned_ms, reason) VALUES (@ms, 'starter');");
}

/**
 * Catch up: finalise every past day (up to two weeks, from the plan start) that has no final evaluation, oldest first,
 * silently. Returns the dates it evaluated.
 */
async function catchUp(pool, upTo, s, range) {
  const r = await pool.request().input('a', sql.Date, addDays(upTo, -BACKFILL_DAYS)).query('SELECT CONVERT(char(10), eval_date, 23) AS d FROM dbo.mentor_evaluations WHERE final = 1 AND eval_date >= @a');
  const done = new Set(r.recordset.map((x) => x.d));
  const first = [addDays(upTo, -BACKFILL_DAYS + 1), range.start || upTo].sort()[1];
  const out = [];
  for (let d = first; d <= upTo; d = addDays(d, 1)) {
    if (done.has(d)) continue;
    await evaluateDay(pool, d, { final: true, s, range });
    out.push(d);
  }
  return out;
}

/** The status the web app shows: today so far, recent days, shields, rest days, commitments, plan vs actual. */
async function status(pool, now = Date.now()) {
  const s = await mentorSettings();
  const range = await planRange(pool);
  await ensureStarterShield(pool);
  const today = localDate(now, s.tz);
  await catchUp(pool, addDays(today, -1), s, range);
  const live = await evaluateDay(pool, today, { final: false, s, range });
  const recent = await history(pool, addDays(today, 1), 14);
  const r = await pool.request().input('t', sql.Date, today).input('m', sql.Date, `${today.slice(0, 8)}01`).query(`
    SELECT CAST(id AS int) AS id, reason, earned_ms, used_ms, CONVERT(char(10), used_for_day, 23) AS used_for_day FROM dbo.streak_shields ORDER BY id;
    SELECT CONVERT(char(10), rest_date, 23) AS date, kind, note FROM dbo.rest_days WHERE rest_date >= @m ORDER BY rest_date;
    SELECT CAST(id AS int) AS id, CONVERT(char(10), for_date, 23) AS date, category, planned_at, place, fulfilled FROM dbo.mentor_commitments WHERE for_date >= DATEADD(day, -7, @t) ORDER BY for_date, planned_at;
    SELECT CONVERT(char(10), d.plan_date, 23) AS date,
      CASE WHEN NOT EXISTS (SELECT 1 FROM dbo.problems p WHERE p.day_id = d.id AND p.is_stretch = 0 AND p.status = 'todo')
           AND EXISTS (SELECT 1 FROM dbo.problems p WHERE p.day_id = d.id AND p.is_stretch = 0) THEN 1 ELSE 0 END AS done
    FROM dbo.days d;
    SELECT CONVERT(char(10), plan_date, 23) AS date, MIN(CASE WHEN done = 1 AND (learn IS NULL OR learn_done = 1) THEN 1 ELSE 0 END) AS done
    FROM dbo.project_tasks GROUP BY plan_date;
    SELECT (SELECT COUNT(*) FROM dbo.ai_progress WHERE done_ms IS NOT NULL) + (SELECT COUNT(*) FROM dbo.learn_progress WHERE done_ms IS NOT NULL) AS done;`);
  const [shields, rest, commitments, dsaDays, projDays, learnDone] = r.recordsets;
  const lessonTotal = ROADMAP.levels.reduce((n, lv) => n + lv.lessons.length, 0) + Object.values(MODULES).reduce((n, m) => n + m.roadmap.levels.reduce((k, lv) => k + lv.lessons.length, 0), 0);
  const month = today.slice(0, 7);
  return {
    settings: s,
    today: live,
    freshStart: freshStart(today),
    paused: !!(s.pauseUntil && today <= s.pauseUntil),
    recent,
    shields: { available: shields.filter((x) => !x.used_ms).length, bank: SHIELD_BANK, list: shields.map((x) => ({ ...x, earned_ms: Number(x.earned_ms), used_ms: x.used_ms == null ? null : Number(x.used_ms) })) },
    restDays: { month, list: rest, restLeft: s.restPerMonth - rest.filter((x) => x.kind === 'rest').length, sickLeft: s.sickPerMonth - rest.filter((x) => x.kind === 'sick').length },
    commitments: commitments.map((c) => ({ ...c, fulfilled: c.fulfilled == null ? null : !!c.fulfilled })),
    pace: range.start ? planPace({ today, startDate: range.start, endDate: range.end, dsa: dsaDays.map((x) => ({ date: x.date, done: !!x.done })), project: projDays.map((x) => ({ date: x.date, done: !!x.done })), learning: { done: learnDone[0].done, total: lessonTotal } }) : null,
  };
}

module.exports = { mentorSettings, planRange, loadDay, history, evaluateDay, catchUp, ensureStarterShield, maybeEarnShield, status };
