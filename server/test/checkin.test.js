// The Mentor (Phase 1): time zones, judging goals, escalation, minimum viable day, comeback bonus, rest days,
// streak shields, commitments and plan vs actual. Pure rules first, then the engine against the test database.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, sqlQuery } = require('./helpers');
const { localParts, dueEvaluation, freshStart, hhmm, validTimeZone } = require('../src/checkin/time');
const { judge, levelFor, escalate, comebacks, perfectWeek } = require('../src/checkin/rules');
const { planPace } = require('../src/checkin/pace');

const at = (iso) => new Date(iso).getTime();
const day = (date, results, extra = {}) => ({ date, results: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { status: v }])), ...extra });

describe('time zones', () => {
  test('local date, time and weekday in a chosen zone', () => {
    assert.deepEqual(localParts(at('2026-10-12T17:45:00Z'), 'Asia/Kolkata'), { date: '2026-10-12', minutes: 23 * 60 + 15, dow: 1 });
    assert.deepEqual(localParts(at('2026-10-12T17:45:00Z'), 'America/New_York'), { date: '2026-10-12', minutes: 13 * 60 + 45, dow: 1 });
    assert.equal(localParts(at('2026-10-12T18:40:00Z'), 'Asia/Kolkata').date, '2026-10-13', '00:10 IST is already the next day');
    assert.deepEqual([hhmm('23:00'), hhmm('7:00'), hhmm('24:00'), validTimeZone('Asia/Kolkata'), validTimeZone('Mars/Base'), validTimeZone('')], [1380, null, null, true, false, true]);
  });

  test('which day is due: today after the evaluation time, yesterday before it (catch-up after sleep), never twice', () => {
    const tz = 'Asia/Kolkata';
    assert.equal(dueEvaluation(at('2026-10-12T17:00:00Z'), { tz, evalTime: '23:00' }), '2026-10-11', '22:30: today is not over yet');
    assert.equal(dueEvaluation(at('2026-10-12T17:31:00Z'), { tz, evalTime: '23:00' }), '2026-10-12', '23:01');
    assert.equal(dueEvaluation(at('2026-10-12T18:40:00Z'), { tz, evalTime: '23:00', lastFinal: '2026-10-11' }), '2026-10-12', '00:10 next day: the laptop slept through 23:00');
    assert.equal(dueEvaluation(at('2026-10-12T17:31:00Z'), { tz, evalTime: '23:00', lastFinal: '2026-10-12' }), null, 'already done');
  });

  test('daylight-saving changes (New York) and fresh starts', () => {
    const tz = 'America/New_York';
    assert.equal(dueEvaluation(at('2026-03-09T03:30:00Z'), { tz, evalTime: '23:00' }), '2026-03-08', 'spring forward: 23:30 EDT');
    assert.equal(dueEvaluation(at('2026-11-02T04:30:00Z'), { tz, evalTime: '23:00' }), '2026-11-01', 'fall back: 23:30 EST');
    assert.equal(dueEvaluation(at('2026-03-08T07:05:00Z'), { tz, evalTime: '02:30' }), '2026-03-08', 'a skipped 02:30 fires at 03:00');
    assert.deepEqual([freshStart('2026-11-01'), freshStart('2026-10-12'), freshStart('2026-10-13')], ['month', 'week', null]);
  });
});

describe('rules', () => {
  test('judging each goal: met / partial / missed / off, and the minimum viable bar', () => {
    assert.equal(judge('dsa', { planned: true, required: 4, done: 4, solvedToday: 0 }).status, 'met');
    assert.equal(judge('dsa', { planned: true, required: 4, done: 1, solvedToday: 0 }).status, 'partial');
    assert.equal(judge('dsa', { planned: true, required: 4, done: 0, solvedToday: 0 }).status, 'missed');
    assert.equal(judge('dsa', { planned: true, required: 4, done: 1, solvedToday: 0 }, { mvd: true }).status, 'met', 'minimum day: 1 problem');
    assert.equal(judge('dsa', { off: true, why: 'outside the plan' }).status, 'off');
    assert.deepEqual([judge('learning', { minutes: 30 }).status, judge('learning', { minutes: 12 }).status, judge('learning', { minutes: 6 }, { mvd: true }).status], ['met', 'partial', 'met']);
    assert.equal(judge('project', { planned: false }).status, 'off', 'weekend');
    assert.equal(judge('project', { planned: true, rows: 1, done: 0, learnDone: 1 }, { mvd: true }).status, 'met', 'minimum day: the learn step');
    assert.deepEqual([judge('workout', { rest: true }).status, judge('workout', { complete: true }).status, judge('workout', { complete: false, moves: 3 }).status], ['off', 'met', 'partial']);
    assert.deepEqual([judge('nutrition', { meals: 3, protein: 110, target: 130 }).status, judge('nutrition', { meals: 1, protein: 20, target: 130 }).status, judge('nutrition', { meals: 1, protein: 20, target: 130 }, { mvd: true }).status], ['met', 'partial', 'met']);
  });

  test('escalation levels: 1 → 1, 2 → 2, 3–4 → 3, 5+ → 4 (reset talk, not more pressure)', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5, 9].map(levelFor), [0, 1, 2, 3, 3, 4, 4]);
  });

  test('consecutive misses per category: met resets, off / rest / shield-covered days are neutral', () => {
    const h = [
      day('2026-10-05', { dsa: 'met', workout: 'missed' }),
      day('2026-10-06', { dsa: 'missed', workout: 'partial' }),
      day('2026-10-07', { dsa: 'missed', workout: 'off' }), // workout rest day
      day('2026-10-08', { dsa: 'missed', workout: 'missed' }, { rest: 'sick' }), // planned sick day: neutral
      day('2026-10-09', { dsa: 'missed', workout: 'missed' }, { covered: true }), // a shield covered it: neutral
      day('2026-10-10', { dsa: 'missed', workout: 'missed' }),
    ];
    const e = escalate(h, ['dsa', 'workout']);
    assert.deepEqual(e.misses, { dsa: 3, workout: 3 });
    assert.deepEqual([e.levels.dsa, e.level, e.mvdNext], [3, 3, ['dsa', 'workout']]);
    assert.deepEqual(escalate([...h, day('2026-10-11', { dsa: 'met', workout: 'missed' })], ['dsa', 'workout']).misses, { dsa: 0, workout: 4 });
  });

  test('comeback: a goal met the day after it was missed (not after a rest day)', () => {
    assert.deepEqual(comebacks(day('a', { dsa: 'missed', workout: 'met', learning: 'partial' }), day('b', { dsa: 'met', workout: 'met', learning: 'met' })), ['dsa', 'learning']);
    assert.deepEqual(comebacks(day('a', { dsa: 'missed' }), day('b', { dsa: 'met' }, { rest: 'rest' })), []);
  });

  test('a perfect week (all 7 days evaluated, 5+ active days, every scheduled goal met) earns a shield', () => {
    const week = ['13', '14', '15', '16', '17', '18', '19'].map((d, i) => day(`2026-10-${d}`, { dsa: 'met', project: i >= 5 ? 'off' : 'met' }));
    assert.equal(perfectWeek(week, ['dsa', 'project']), true);
    assert.equal(perfectWeek(week.slice(1), ['dsa', 'project']), false, 'a day missing');
    assert.equal(perfectWeek(week.map((d, i) => (i === 2 ? { ...d, results: { dsa: { status: 'partial' } } } : d)), ['dsa', 'project']), false);
    assert.equal(perfectWeek(week.map((d, i) => (i < 3 ? { ...d, rest: 'rest' } : d)), ['dsa', 'project']), false, 'only 4 active days');
  });

  test('plan vs actual: behind / on track / ahead, and days left', () => {
    const dsa = [{ date: '2026-10-12', done: true }, { date: '2026-10-13', done: false }, { date: '2026-10-14', done: false }, { date: '2026-10-15', done: false }, { date: '2026-10-16', done: false }];
    const p = planPace({ today: '2026-10-16', startDate: '2026-10-12', endDate: '2027-03-14', dsa, learning: { done: 0, total: 155 } });
    assert.deepEqual([p.daysLeft, p.tracks[0].daysBehind, p.tracks[0].status, p.overall.status], [149, 3, 'behind', 'behind']);
    const ahead = planPace({ today: '2026-10-13', startDate: '2026-10-12', endDate: '2027-03-14', dsa: dsa.map((d) => ({ ...d, done: true })) });
    assert.deepEqual([ahead.tracks[0].daysBehind, ahead.tracks[0].status], [-4, 'ahead'], '4 plan days from today on are already done');
  });
});

describe('engine (test database)', () => {
  let pool;
  let data;
  before(async () => {
    await startServer();
    pool = await require('../src/db').getPool();
    data = require('../src/checkin/data');
  });
  after(stopServer);

  test('a week of misses escalates, the minimum day kicks in, a comeback earns XP, a rest day is neutral', async () => {
    // Test plan starts Mon 2026-10-05. Nothing done on Mon and Tue.
    let e = await data.evaluateDay(pool, '2026-10-05', { final: true });
    assert.deepEqual([e.results.dsa.status, e.results.project.status, e.results.workout.status, e.results.nutrition.status, e.level], ['missed', 'missed', 'missed', 'missed', 1]);
    e = await data.evaluateDay(pool, '2026-10-06', { final: true });
    assert.deepEqual([e.misses.dsa, e.level, e.mvdTomorrow.includes('dsa')], [2, 2, true]);

    // Wed: minimum day. One problem from Wednesday solved + one meal logged → both met at the lowered bar
    const p = (await sqlQuery("SELECT TOP 1 p.id FROM dbo.problems p JOIN dbo.days d ON d.id = p.day_id WHERE d.plan_date = '2026-10-07' AND p.is_stretch = 0"))[0];
    await api('PATCH', `/problems/${p.id}/status`, { status: 'solved' });
    await api('POST', '/meals', { date: '2026-10-07', meal_type: 'lunch', title: 'Dal rice', calories: 500, protein_g: 20, carbs_g: 70, fat_g: 10 });
    await sqlQuery("INSERT INTO dbo.mentor_commitments (for_date, category, planned_at, place, created_ms) VALUES ('2026-10-07', 'dsa', '07:00', 'desk', 0), ('2026-10-07', 'workout', '06:00', NULL, 0)");
    e = await data.evaluateDay(pool, '2026-10-07', { final: true });
    assert.deepEqual([e.results.dsa.status, e.results.dsa.mvd, e.results.nutrition.status, e.misses.dsa, e.misses.workout, e.level], ['met', true, 'met', 0, 3, 3]);
    const commits = await sqlQuery("SELECT category, fulfilled FROM dbo.mentor_commitments WHERE for_date = '2026-10-07' ORDER BY category");
    assert.deepEqual(commits.map((c) => [c.category, c.fulfilled]), [['dsa', true], ['workout', false]]);

    // Comeback bonus: DSA and nutrition met the day after missing them → +20 XP each, through the game layer
    const xp = (await api('GET', '/game')).body.player.total;
    assert.ok(xp >= 40 + 15, `comeback XP counted (total ${xp})`);

    // Thu: planned sick day → level 0, nothing escalates; Fri: still nothing → workout continues counting from Wed
    await sqlQuery("INSERT INTO dbo.rest_days (rest_date, kind, created_ms) VALUES ('2026-10-08', 'sick', 0)");
    e = await data.evaluateDay(pool, '2026-10-08', { final: true });
    assert.deepEqual([e.rest, e.level], ['sick', 0]);
    e = await data.evaluateDay(pool, '2026-10-09', { final: true });
    assert.deepEqual([e.misses.workout, e.level], [4, 3]);
  });

  test('status: catch-up, starter shield, plan vs actual; the evening run never re-finalises a day', async () => {
    const s = (await api('GET', '/checkin')).body;
    assert.equal(s.shields.available, 1, 'everyone starts with one shield');
    assert.ok(s.today.date && s.pace && s.pace.daysLeft > 0 && ['ahead', 'on track', 'behind'].includes(s.pace.overall.status));
    assert.ok(s.recent.length >= 7, 'past days were evaluated (catch-up)');
    assert.deepEqual([s.restDays.restLeft >= 0, typeof s.settings.evalTime], [true, 'string']);
    const finals = await sqlQuery("SELECT COUNT(*) AS n FROM dbo.mentor_evaluations WHERE final = 1 AND eval_date = '2026-10-07'");
    assert.equal(finals[0].n, 1);
  });

  test('a perfect week earns a shield on Sunday night; the bank holds at most 2', async () => {
    const met = JSON.stringify({ dsa: { status: 'met' }, learning: { status: 'met' }, project: { status: 'off' }, workout: { status: 'met' }, nutrition: { status: 'met' } });
    const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
    for (const d of days) await sqlQuery(`INSERT INTO dbo.mentor_evaluations (eval_date, results, misses, level, final, evaluated_ms) VALUES ('${d}', '${met}', '{}', 0, 1, 0)`);
    const s = await data.mentorSettings();
    assert.equal(await data.maybeEarnShield(pool, '2026-11-08', s), true);
    assert.equal((await sqlQuery('SELECT COUNT(*) AS n FROM dbo.streak_shields WHERE used_ms IS NULL'))[0].n, 2);
    assert.equal(await data.maybeEarnShield(pool, '2026-11-08', s), false, 'the same week never pays twice, and the bank is full');
  });
});
