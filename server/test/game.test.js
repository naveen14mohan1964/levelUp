// Game layer: level progression (unlocks), XP + player level, minutes + streak with shields, and the API.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, sqlQuery } = require('./helpers');
const { progress } = require('../src/game/progression');
const { xpEvents, playerLevel } = require('../src/game/xp');
const { dayMinutes, computeStreak } = require('../src/game/streak');
const { localDay, addDays, weekStart } = require('../src/game/days');

// A small track: 2 levels × 3 lessons. `state` maps lesson index -> 'done' | 'touched'.
function track(state = {}) {
  let i = 0;
  const lesson = () => { const s = state[i]; const x = { ref: `x${i}`, title: `Lesson ${i}`, minutes: 30, done: s === 'done', touched: !!s, doneMs: s === 'done' ? 1000 + i : null }; i++; return x; };
  return { key: 't', label: 'Test', levels: [1, 2].map((n) => ({ n, title: `Level ${n}`, lessons: [lesson(), lesson(), lesson()] })) };
}
const statuses = (t) => t.levels.flatMap((lv) => lv.lessons.map((x) => x.status));

describe('progression', () => {
  test('at the start only level 1, lesson 1 is open; everything else is locked', () => {
    const t = progress(track());
    assert.deepEqual(statuses(t), ['current', 'locked', 'locked', 'locked', 'locked', 'locked']);
    assert.deepEqual(t.levels.map((lv) => lv.status), ['current', 'locked']);
    assert.deepEqual([t.next.ref, t.next.level, t.currentLevel, t.done, t.total, t.pct], ['x0', 1, 1, 0, 6, 0]);
  });

  test('finishing a lesson unlocks the next; finishing a level unlocks the next level', () => {
    assert.deepEqual(statuses(progress(track({ 0: 'done' }))), ['done', 'current', 'locked', 'locked', 'locked', 'locked']);
    const t = progress(track({ 0: 'done', 1: 'done', 2: 'done' }));
    assert.deepEqual(statuses(t), ['done', 'done', 'done', 'current', 'locked', 'locked']);
    assert.deepEqual(t.levels.map((lv) => [lv.status, lv.complete, lv.completedMs]), [['complete', true, 1002], ['current', false, null]]);
    assert.equal(t.levelsComplete, 1);
  });

  test('catch-up: progress made out of order (e.g. LeetCode sync) is never locked, and the gap behind it stays open', () => {
    assert.deepEqual(statuses(progress(track({ 0: 'touched', 1: 'touched' }))), ['current', 'open', 'locked', 'locked', 'locked', 'locked'],
      'like your DSA: Day 1 partly done, Day 2 started → Day 1 is next, Day 2 open, Day 3 locked');
    assert.deepEqual(statuses(progress(track({ 4: 'done' }))), ['current', 'open', 'open', 'open', 'done', 'open']);
  });

  test('everything done: no next lesson', () => {
    const t = progress(track({ 0: 'done', 1: 'done', 2: 'done', 3: 'done', 4: 'done', 5: 'done' }));
    assert.deepEqual([t.next, t.currentLevel, t.pct, t.levelsComplete], [null, null, 100, 2]);
  });
});

describe('xp', () => {
  test('5 for starting (once per lesson per day), 25 per lesson, 150 per level, 15/25/40 per problem', () => {
    const t = progress(track({ 0: 'done', 1: 'done', 2: 'done' }));
    const day = new Date(2026, 9, 12, 9).getTime();
    const sessions = [
      { track: 't', lesson_ref: 'x3', started_ms: day }, { track: 't', lesson_ref: 'x3', started_ms: day + 3600000 }, // same lesson, same day: once
      { track: 't', lesson_ref: 'x3', started_ms: day + 86400000 }, // next day: again
    ];
    const ev = xpEvents({ tracks: [t], problems: [{ id: 1, difficulty: 'E', solvedMs: day }, { id: 2, difficulty: 'H', solvedMs: day }], sessions });
    const by = (k) => ev.filter((e) => e.kind === k).reduce((s, e) => s + e.xp, 0);
    assert.deepEqual([by('lesson'), by('level'), by('problem'), by('start')], [75, 150, 55, 10]);
  });

  test('player level: 100 XP to level 2, then 150, 200, …', () => {
    assert.deepEqual(playerLevel(0), { level: 1, total: 0, xpInLevel: 0, xpForNext: 100 });
    assert.deepEqual(playerLevel(100), { level: 2, total: 100, xpInLevel: 0, xpForNext: 150 });
    assert.deepEqual(playerLevel(260), { level: 3, total: 260, xpInLevel: 10, xpForNext: 200 });
  });
});

describe('minutes + streak', () => {
  const at = (day, h = 10) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`).getTime();
  const mins = (obj) => new Map(Object.entries(obj));

  test('minutes = focus time + estimates of finished items, without counting a timed lesson twice', () => {
    const m = dayMinutes(
      [{ track: 'ai', lesson_ref: 'L1-1', started_ms: at('2026-10-12'), minutes: 40 }],
      [{ ms: at('2026-10-12', 11), track: 'ai', ref: 'L1-1', minutes: 60 }, { ms: at('2026-10-12', 12), track: 'dsa', ref: 'd1', minutes: 20 }, { ms: at('2026-10-13'), track: 'ai', ref: 'L1-1', minutes: 60 }],
    );
    assert.deepEqual(Object.fromEntries(m), { '2026-10-12': 60, '2026-10-13': 60 });
  });

  test('a day counts at 5+ minutes; today is still in progress; the flame grows', () => {
    let s = computeStreak(mins({ '2026-10-10': 30, '2026-10-11': 5, '2026-10-12': 4 }), new Set(), '2026-10-12');
    assert.deepEqual([s.current, s.todayActive, s.todayMinutes, s.flame, s.welcomeBack], [2, false, 4, 1, null]);
    s = computeStreak(mins({ '2026-10-10': 30, '2026-10-11': 5, '2026-10-12': 10 }), new Set(), '2026-10-12');
    assert.deepEqual([s.current, s.best, s.todayActive, s.flame], [3, 3, true, 2]);
    assert.equal(computeStreak(new Map(), new Set(), '2026-10-12').current, 0);
  });

  test('a streak shield covers a missed day; with no shield left the next miss → "welcome back", not "streak lost"', () => {
    // Mon 12 – Wed 14 active, Thu 15 missed (one shield, earned before), Fri 16 active
    let s = computeStreak(mins({ '2026-10-12': 10, '2026-10-13': 10, '2026-10-14': 10, '2026-10-16': 10 }), new Set(), '2026-10-16', ['2026-10-01']);
    assert.deepEqual([s.current, s.newFreezes, s.shields.available, s.freeze], [4, ['2026-10-15'], 0, { available: false, usedOn: '2026-10-15' }]);
    // ...and Sat 17 missed too: no shield left, so the streak restarts on Sun 18 with a welcome back
    s = computeStreak(mins({ '2026-10-12': 10, '2026-10-13': 10, '2026-10-14': 10, '2026-10-16': 10, '2026-10-18': 10 }), new Set(['2026-10-15']), '2026-10-18', []);
    assert.deepEqual([s.current, s.best, s.newFreezes, s.welcomeBack], [1, 4, [], { daysAway: 1, previousStreak: 4, backToday: true }]);
    // two shields in the bank cover two misses (oldest first)
    s = computeStreak(mins({ '2026-10-12': 10, '2026-10-15': 10 }), new Set(), '2026-10-15', ['2026-10-05', '2026-10-01']);
    assert.deepEqual([s.current, s.newFreezes, s.shields.available], [2, ['2026-10-13', '2026-10-14'], 0]);
    // no shields, no weekly freebie any more
    assert.deepEqual(computeStreak(mins({ '2026-10-18': 10, '2026-10-20': 10 }), new Set(), '2026-10-20').newFreezes, []);
  });

  test("a shield never covers days before it was earned (a new shield can't rewrite old gaps)", () => {
    const s = computeStreak(mins({ '2026-10-05': 10, '2026-10-06': 10, '2026-10-08': 10, '2026-10-13': 10 }), new Set(), '2026-10-13', ['2026-10-13']);
    assert.deepEqual([s.newFreezes, s.shields.available, s.current], [[], 1, 1]);
  });

  test('away for days: welcome back counts the days away (shield-covered days included) until you return', () => {
    const s = computeStreak(mins({ '2026-10-12': 10, '2026-10-13': 10 }), new Set(), '2026-10-18', ['2026-10-01']);
    assert.deepEqual([s.current, s.best, s.welcomeBack], [0, 2, { daysAway: 4, previousStreak: 2, backToday: false }]);
    assert.deepEqual(s.newFreezes, ['2026-10-14'], 'the shield covered Wed; Thu broke the streak');
  });

  test('day helpers: weeks start on Monday', () => {
    assert.deepEqual([weekStart('2026-10-18'), weekStart('2026-10-12'), addDays('2026-12-31', 1)], ['2026-10-12', '2026-10-12', '2027-01-01']);
  });
});

describe('game API', () => {
  before(startServer);
  after(stopServer);

  test('fresh start: level 1 player, no streak, every roadmap starts at level 1 lesson 1', async () => {
    const g = (await api('GET', '/game')).body;
    assert.deepEqual([g.player.level, g.player.total, g.streak.current, g.focus, g.celebrate], [1, 0, 0, null, []]);
    assert.deepEqual(g.tracks.map((t) => t.key), ['ai', 'dsa', 'lld', 'hld', 'judge', 'react', 'dotnet', 'node']);
    const ai = g.tracks[0];
    assert.deepEqual([ai.next.ref, ai.next.level, ai.currentLevel, ai.total, ai.levelsTotal, ai.levels], ['L1-1', 1, 1, 69, 14, undefined]);
    assert.ok(g.tracks.every((t) => t.next && t.next.level === 1 && t.total > 0), 'every roadmap has a first lesson');
    const map = (await api('GET', '/game/track/ai')).body.track;
    assert.deepEqual(map.levels.slice(0, 3).map((lv) => lv.status), ['current', 'locked', 'locked']);
    assert.deepEqual(map.levels[0].lessons.map((x) => x.status), ['current', 'locked', 'locked', 'locked']);
    assert.equal((await api('GET', '/game/track/nope')).status, 404);
  });

  test('locked lessons: can\'t be started or marked done (notes still save)', async () => {
    assert.equal((await api('POST', '/ai/lessons/L1-2', { done: true })).status, 409);
    assert.equal((await api('POST', '/ai/lessons/L1-2', { notes: 'reading ahead' })).status, 200);
    assert.equal((await api('POST', '/focus/start', { track: 'ai', ref: 'L1-2' })).status, 409);
    assert.equal((await api('POST', '/focus/start', { track: 'ai', ref: 'L9-99' })).status, 404);
    assert.equal((await api('POST', '/focus/start', { track: 'chess' })).status, 400);
    assert.equal((await api('POST', '/focus/start', { track: 'ai', ref: 'L1-1', minutes: 0 })).status, 400);
    assert.equal((await api('POST', '/focus/stop')).status, 409);
  });

  test('focus timer: start = +5 XP; 6 minutes → today counts for the streak; a forgotten timer closes itself', async () => {
    const r = await api('POST', '/focus/start', { track: 'ai', ref: 'L1-1', minutes: 5 });
    assert.equal(r.status, 201);
    assert.deepEqual([r.body.game.focus.ref, r.body.game.focus.plannedMin, r.body.game.player.total], ['L1-1', 5, 5]);
    await sqlQuery('UPDATE dbo.focus_sessions SET started_ms = started_ms - 6 * 60000 WHERE ended_ms IS NULL');
    const s = (await api('POST', '/focus/stop')).body;
    assert.equal(s.stopped.minutes, 6);
    assert.deepEqual([s.game.streak.current, s.game.streak.todayActive, s.game.streak.todayMinutes, s.game.week.minutes, s.game.focus], [1, true, 6, 6, null]);
    // restarting the same lesson today: no extra start XP
    await api('POST', '/focus/start', { track: 'ai', ref: 'L1-1' });
    await sqlQuery('UPDATE dbo.focus_sessions SET started_ms = started_ms - 3 * 3600000 WHERE ended_ms IS NULL'); // left running 3 h (plan: 60 min)
    const g = (await api('GET', '/game')).body;
    assert.deepEqual([g.focus, g.player.total], [null, 5]);
    assert.equal((await sqlQuery('SELECT TOP 1 minutes FROM dbo.focus_sessions ORDER BY id DESC'))[0].minutes, 60, 'closed at its planned length');
  });

  test('"Just 5 minutes" left running while the page was closed counts 5, not the whole time away', async () => {
    await api('POST', '/focus/start', { track: 'ai', ref: 'L1-1', minutes: 5 });
    await sqlQuery('UPDATE dbo.focus_sessions SET started_ms = started_ms - 30 * 60000 WHERE ended_ms IS NULL');
    const running = (await api('GET', '/game')).body;
    assert.deepEqual([running.focus.plannedMin, running.focus.elapsedMin], [5, 5], 'a running timer counts up to its plan');
    assert.equal((await api('POST', '/focus/stop', { auto: true })).body.stopped.minutes, 5);
    // a manual stop may count overtime, up to the plan + 60 min
    await api('POST', '/focus/start', { track: 'ai', ref: 'L1-1', minutes: 5 });
    await sqlQuery('UPDATE dbo.focus_sessions SET started_ms = started_ms - 20 * 60000 WHERE ended_ms IS NULL');
    assert.equal((await api('POST', '/focus/stop')).body.stopped.minutes, 20);
  });

  test('camera focus guard: heartbeats store distracted time; only focused minutes count; today\'s focus %', async () => {
    assert.deepEqual((await api('POST', '/focus/stats', { distractedSec: 60 })).body, { ok: false, running: false }, 'no timer running: nothing to update');
    await api('POST', '/focus/start', { track: 'ai', ref: 'L1-1', minutes: 25 });
    assert.equal((await api('POST', '/focus/stats', { distractedSec: -1 })).status, 400);
    assert.equal((await api('POST', '/focus/stats', { distractedSec: 'lots' })).status, 400);
    await sqlQuery('UPDATE dbo.focus_sessions SET started_ms = started_ms - 20 * 60000 WHERE ended_ms IS NULL');
    assert.equal((await api('POST', '/focus/stats', { distractedSec: 130 })).status, 200);
    let g = (await api('GET', '/game')).body;
    assert.deepEqual([g.focus.elapsedMin, g.focus.camera, g.focus.distractedSec], [18, true, 130], 'running: 20 min - 2 distracted');
    // the final count on stop wins over the last heartbeat
    const s = (await api('POST', '/focus/stop', { distractedSec: 300, camera: true })).body;
    assert.deepEqual([s.stopped.minutes, s.stopped.distractedSec, s.stopped.camera], [15, 300, true]);
    assert.deepEqual(s.game.focusToday, { sessions: 1, focusedMin: 15, distractedMin: 5, totalMin: 20, pct: 75 });
    // a session without the camera doesn't change the %
    await api('POST', '/focus/start', { track: 'ai', ref: 'L1-1', minutes: 5 });
    g = (await api('POST', '/focus/stop', { auto: true })).body.game;
    assert.equal(g.focusToday.pct, 75);
  });

  test('finishing a level: XP, celebration (once), and the next level becomes current', async () => {
    for (const id of ['L1-1', 'L1-2', 'L1-3', 'L1-4']) assert.equal((await api('POST', `/ai/lessons/${id}`, { done: true })).status, 200, id);
    let t = (await api('GET', '/game/track/ai')).body;
    assert.deepEqual(t.track.levels.slice(0, 3).map((lv) => lv.status), ['complete', 'current', 'locked']);
    assert.deepEqual([t.track.next.ref, t.track.levels[1].lessons[0].status], ['L2-1', 'current']);
    assert.equal(t.player.total, 5 + 4 * 25 + 150);
    assert.deepEqual([t.player.level, t.player.xpInLevel], [3, 5]);
    assert.deepEqual(t.celebrate.map((c) => [c.track, c.level, c.xp, c.nextLevel.n]), [['ai', 1, 175, 2]]);
    assert.equal((await api('POST', '/game/seen', { track: 'ai', level: 1 })).status, 200);
    assert.equal((await api('POST', '/game/seen', { track: 'ai', level: 1 })).status, 200, 'seen twice is fine');
    assert.equal((await api('POST', '/game/seen', { track: 'ai' })).status, 400);
    t = (await api('GET', '/game')).body;
    assert.deepEqual([t.celebrate, t.week.lessons, t.week.levels], [[], 4, 1]);
    // un-ticking takes the XP back and relocks what came after
    await api('POST', '/ai/lessons/L1-4', { done: false });
    t = (await api('GET', '/game/track/ai')).body;
    assert.deepEqual([t.player.total, t.track.next.ref, t.track.levels[1].status], [5 + 3 * 25, 'L1-4', 'locked']);
  });

  test('DSA catch-up: solving a Day 2 problem opens Day 2 without skipping Day 1; problems earn XP', async () => {
    const [d1, d2] = (await api('GET', '/game/track/dsa')).body.track.levels[0].lessons;
    const day2 = Number(d2.ref.slice(1));
    const p = (await sqlQuery(`SELECT TOP 1 id, difficulty FROM dbo.problems WHERE day_id = ${day2} AND is_stretch = 0 ORDER BY sort_order`))[0];
    const before = (await api('GET', '/game')).body.player.total;
    assert.equal((await api('PATCH', `/problems/${p.id}/status`, { status: 'solved' })).status, 200);
    const t = (await api('GET', '/game/track/dsa')).body;
    assert.deepEqual(t.track.levels[0].lessons.slice(0, 3).map((x) => x.status), ['current', 'open', 'locked']);
    assert.equal(t.track.next.ref, d1.ref);
    assert.equal(t.player.total - before, { E: 15, M: 25, H: 40 }[p.difficulty]);
  });

  test('today\'s day is the local calendar day', () => {
    assert.equal(localDay(new Date(2026, 9, 12, 0, 5).getTime()), '2026-10-12');
    assert.equal(localDay(new Date(2026, 9, 12, 23, 55).getTime()), '2026-10-12');
  });
});
