// The growth layer: four stats, consistency, the weekly challenge, milestones, habits and goals.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api } = require('./helpers');
const { build, statOf, GXP, HABITS } = require('../src/growth');
const { localDay } = require('../src/game/days');

const T = '2026-11-18'; // a Wednesday; its week starts Mon 2026-11-16
const noon = (d) => new Date(`${d}T12:00:00`).getTime();
const EMPTY = { workoutDays: [], proteinDays: [], journalDays: [], habits: [], challenges: [], weightLost: 0 };
const stat = (g, key) => g.stats.find((s) => s.key === key);

describe('growth layer (pure)', () => {
  test('each kind of real work feeds its own stat', () => {
    assert.equal(statOf({ kind: 'problem', track: 'dsa' }), 'career');
    assert.equal(statOf({ kind: 'lesson', track: 'fullstack' }), 'career');
    assert.equal(statOf({ kind: 'lesson', track: 'dotnet' }), 'career'); // older focus sessions keep counting
    assert.equal(statOf({ kind: 'lesson', track: 'hld' }), 'knowledge');
    assert.equal(statOf({ kind: 'card', track: 'cards' }), 'knowledge');
    assert.equal(statOf({ kind: 'comeback', track: 'workout' }), 'discipline');
  });

  test('workouts, protein, reflection and habits earn XP; nothing else does', () => {
    const g = build({
      events: [{ ms: noon(T), xp: 25, kind: 'problem', track: 'dsa', ref: 'p1' }],
      minutes: new Map(),
      extras: { ...EMPTY, workoutDays: [T], proteinDays: [T], journalDays: [T], habits: [{ d: T, k: 'spend' }, { d: T, k: 'review' }] },
      today: T,
    });
    assert.equal(stat(g, 'career').xp, 25);
    assert.equal(stat(g, 'fitness').xp, GXP.workout + GXP.protein);
    assert.equal(stat(g, 'knowledge').xp, HABITS.review.xp);
    assert.equal(stat(g, 'discipline').xp, GXP.journal + HABITS.spend.xp);
    assert.equal(g.events.length, 5);
    assert.deepEqual(g.habits.map((h) => h.done), [true, true]);
    assert.ok(stat(g, 'fitness').evidence.includes('1 workout done'));
  });

  test('with no activity every stat is level 1 with no XP, and nothing is negative', () => {
    const g = build({ events: [], minutes: new Map(), extras: EMPTY, today: T });
    assert.deepEqual(g.stats.map((s) => [s.level, s.xp]), [[1, 0], [1, 0], [1, 0], [1, 0]]);
    assert.equal(g.consistency.active, 0);
    assert.equal(g.milestones.earned.length, 0);
    assert.equal(g.milestones.next.length, 3);
  });

  test('consistency counts active days in the last 28 and a break only costs the days it covers', () => {
    const minutes = new Map([['2026-11-18', 30], ['2026-11-17', 4], ['2026-11-10', 10], ['2026-10-01', 60]]);
    const g = build({ events: [], minutes, extras: { ...EMPTY, workoutDays: ['2026-11-17'] }, today: T });
    assert.equal(g.consistency.total, 28);
    assert.equal(g.consistency.days.length, 28);
    assert.equal(g.consistency.active, 3); // 18th (learning), 17th (workout), 10th; Oct 1 is outside the window
  });

  test('weekly challenge: three suggestions from last week, progress from this week, XP only when won', () => {
    const lastWeek = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'];
    let g = build({ events: [], minutes: new Map(), extras: { ...EMPTY, workoutDays: lastWeek }, today: T });
    assert.equal(g.challenge.week, '2026-11-16');
    assert.equal(g.challenge.chosen, null);
    assert.deepEqual(g.challenge.suggestions.map((s) => [s.key, s.target]), [['workouts', 5], ['problems', 5], ['active', 5]]);

    const chosen = [{ week: '2026-11-16', key: 'workouts', target: 2 }];
    g = build({ events: [], minutes: new Map(), extras: { ...EMPTY, workoutDays: ['2026-11-16'], challenges: chosen }, today: T });
    assert.deepEqual([g.challenge.chosen.value, g.challenge.chosen.complete], [1, false]);
    assert.equal(stat(g, 'discipline').xp, 0);

    g = build({ events: [], minutes: new Map(), extras: { ...EMPTY, workoutDays: ['2026-11-16', '2026-11-17'], challenges: chosen }, today: T });
    assert.equal(g.challenge.chosen.complete, true);
    assert.equal(stat(g, 'discipline').xp, GXP.challenge);
  });

  test('milestones are earned by real results and the closest ones come next', () => {
    const problems = Array.from({ length: 9 }, (_, i) => ({ ms: noon(T), xp: 15, kind: 'problem', track: 'dsa', ref: `p${i}` }));
    const g = build({ events: problems, minutes: new Map(), extras: { ...EMPTY, weightLost: 3.2 }, today: T });
    assert.deepEqual(g.milestones.earned.map((m) => m.key), ['problems-1', 'kg-1', 'kg-3']);
    assert.deepEqual([g.milestones.next[0].key, g.milestones.next[0].value, g.milestones.next[0].target], ['problems-10', 9, 10]);
  });
});

describe('growth layer (API)', () => {
  before(startServer);
  after(stopServer);
  const today = localDay(Date.now());

  test('ticking a habit shows up in the game summary and its stat; un-ticking takes it back', async () => {
    let r = await api('POST', `/habits/${today}/spend`, { done: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.growth.habits.find((h) => h.key === 'spend').done, true);
    assert.equal(r.body.growth.stats.find((s) => s.key === 'discipline').xp, HABITS.spend.xp);
    assert.equal(r.body.player.total, HABITS.spend.xp);
    r = await api('POST', `/habits/${today}/spend`, { done: false });
    assert.equal(r.body.player.total, 0);
    assert.equal((await api('POST', `/habits/${today}/gaming`, { done: true })).status, 404);
    assert.equal((await api('POST', '/habits/2999-01-01/spend', { done: true })).status, 400);
  });

  test('a weekly challenge can be chosen from the suggestions only', async () => {
    assert.equal((await api('POST', '/challenge', { key: 'scrolling' })).status, 400);
    const r = await api('POST', '/challenge', { key: 'workouts' });
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.growth.challenge.chosen.key, r.body.growth.challenge.chosen.target, r.body.growth.challenge.chosen.value], ['workouts', 3, 0]);
  });

  test('goals: steps, the next step, and at most 3 active at once', async () => {
    let r = await api('POST', '/journey/goals', { title: 'Get a 20 LPA offer', stat: 'career', targetDate: '2027-04-30', steps: ['Finish week 1', 'Finish week 2'] });
    assert.equal(r.status, 201);
    const goal = r.body.goals[0];
    assert.deepEqual([goal.total, goal.done, goal.nextStep.title], [2, 0, 'Finish week 1']);
    r = await api('PATCH', `/journey/steps/${goal.steps[0].id}`, { done: true });
    assert.deepEqual([r.body.goals[0].done, r.body.goals[0].nextStep.title], [1, 'Finish week 2']);
    r = await api('POST', `/journey/goals/${goal.id}/steps`, { title: 'Apply to 5 companies' });
    assert.equal(r.body.goals[0].total, 3);

    await api('POST', '/journey/goals', { title: 'Reach 80 kg', stat: 'fitness' });
    await api('POST', '/journey/goals', { title: 'Read 6 books', stat: 'knowledge' });
    assert.equal((await api('POST', '/journey/goals', { title: 'One more', stat: 'discipline' })).status, 409);
    r = await api('PATCH', `/journey/goals/${goal.id}`, { status: 'done' });
    assert.equal(r.body.goals.find((g) => g.id === goal.id).status, 'done');
    assert.equal((await api('POST', '/journey/goals', { title: 'One more', stat: 'discipline' })).status, 201);
    assert.equal((await api('POST', '/journey/goals', { title: '', stat: 'career' })).status, 400);
    assert.equal((await api('DELETE', `/journey/goals/${goal.id}`)).status, 200);
  });

  test('the journal list returns recent entries, newest first', async () => {
    await api('PUT', `/journal/${today}`, { mood: 2, learned: 'Two pointers' });
    const r = await api('GET', '/journal?days=7');
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.entries[0].date, r.body.entries[0].learned], [today, 'Two pointers']);
  });

  test('with escalation off the mentor setting is saved', async () => {
    const r = await api('PUT', '/settings', { mentor_escalation: false });
    assert.equal(r.body.mentor_escalation, '0');
  });
});
