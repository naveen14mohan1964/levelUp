// LinkedIn module tests. Unit tests for the goal ladder + API tests on the test database (DSATracker_Test).
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/linkedin/ladder');
const { startServer, stopServer, api } = require('./helpers');

describe('LinkedIn goal ladder (linkedin/ladder.js)', () => {
  const stage = (id, start, end, extra = {}) => ({ id, sort_order: id, name: `S${id}`, start_date: start, end_date: end, posts_per_week: id, connections_per_week: 10 * id, messages_per_week: id, completed: false, ...extra });
  const stages = [stage(1, '2026-10-05', '2026-11-15'), stage(2, '2026-11-16', '2026-12-27'), stage(3, '2026-12-28', '2027-01-31')];

  test('week bounds are Monday–Sunday', () => {
    assert.deepEqual(L.weekBounds('2026-10-05'), { start: '2026-10-05', end: '2026-10-11' }); // Monday
    assert.deepEqual(L.weekBounds('2026-10-11'), { start: '2026-10-05', end: '2026-10-11' }); // Sunday
    assert.deepEqual(L.weekBounds('2027-01-01'), { start: '2026-12-28', end: '2027-01-03' }); // across a year
  });

  test('current stage follows the dates, skips completed ones, and holds the last one when late', () => {
    assert.equal(L.currentStage(stages, '2026-10-20').id, 1);
    assert.equal(L.currentStage(stages, '2026-12-01').id, 2);
    assert.equal(L.currentStage(stages, '2026-09-01').id, 1, 'before the plan → first stage');
    assert.equal(L.currentStage(stages, '2027-03-01').id, 3, 'after the last stage → stay on it until marked done');
    const s1done = stages.map((s) => (s.id === 1 ? { ...s, completed: true } : s));
    assert.equal(L.currentStage(s1done, '2026-10-20').id, 2, 'finished early → next stage');
    assert.equal(L.currentStage(stages.map((s) => ({ ...s, completed: true })), '2026-10-20'), null);
  });

  test('statuses: active, done, ended (never "failed"), upcoming', () => {
    const cur = L.currentStage(stages, '2026-12-01');
    assert.deepEqual(stages.map((s) => L.stageStatus(s, cur, '2026-12-01')), ['ended', 'active', 'upcoming']);
    assert.equal(L.stageStatus({ ...stages[0], completed: true }, cur, '2026-12-01'), 'done');
  });

  test("the current stage drives this week's targets", () => {
    const v = L.buildGoalView({ current_ctc_lpa: 7, target_ctc_lpa: 20, target_date: '2027-04-30', achieved: false }, stages, '2026-12-02');
    assert.equal(v.current.id, 2);
    assert.deepEqual(v.thisWeek, { start: '2026-11-30', end: '2026-12-06', stage: 'S2', targets: { posts: 2, connections: 20, messages: 2 } });
    assert.equal(v.goal.increasePct, 186);
    const done = L.buildGoalView({ current_ctc_lpa: 7, target_ctc_lpa: 20, target_date: '2027-04-30', achieved: true }, stages, '2026-12-02');
    assert.equal(done.current, null);
    assert.deepEqual(done.thisWeek.targets, { posts: 0, connections: 0, messages: 0 });
  });

  test('stage validation', () => {
    const ok = { name: 'X', start_date: '2027-01-01', end_date: '2027-01-31', posts_per_week: 2, connections_per_week: 15, messages_per_week: 5 };
    assert.deepEqual(L.validateStage(ok).errors, []);
    assert.match(L.validateStage({ ...ok, end_date: '2026-12-01' }).errors[0], /on or after/);
    assert.match(L.validateStage({ ...ok, name: ' ' }).errors[0], /Name/);
    assert.match(L.validateStage({ ...ok, connections_per_week: 150 }).errors[0], /0 to 100/);
    assert.match(L.validateStage({ ...ok, posts_per_week: 1.5 }).errors[0], /whole number/);
  });
});

describe('LinkedIn API · goal and campaign stages', () => {
  before(startServer);
  after(stopServer);

  test('defaults: 7 → 20 LPA by 2027-04-30 in 5 stages; Foundation drives week-1 targets', async () => {
    const v = (await api('GET', '/linkedin/goal?date=2026-10-05')).body;
    assert.deepEqual([v.goal.current_ctc_lpa, v.goal.target_ctc_lpa, v.goal.target_date], [7, 20, '2027-04-30']);
    assert.equal(v.stages.length, 5);
    assert.equal(v.current.name, 'Foundation');
    assert.deepEqual(v.thisWeek.targets, { posts: 2, connections: 10, messages: 0 });
    const jan = (await api('GET', '/linkedin/goal?date=2027-01-10')).body;
    assert.equal(jan.current.name, 'Outreach & referrals');
    assert.deepEqual(jan.thisWeek.targets, { posts: 2, connections: 20, messages: 8 });
  });

  test('editing the goal validates it', async () => {
    assert.equal((await api('PUT', '/linkedin/goal', { target_ctc_lpa: 6 })).status, 400);
    assert.equal((await api('PUT', '/linkedin/goal', { target_date: 'soon' })).status, 400);
    const v = (await api('PUT', '/linkedin/goal', { target_ctc_lpa: 22, target_date: '2027-05-31' })).body;
    assert.deepEqual([v.goal.target_ctc_lpa, v.goal.target_date], [22, '2027-05-31']);
    assert.equal((await api('PUT', '/linkedin/goal', { achieved: true })).body.goal.achieved, true);
    assert.equal((await api('PUT', '/linkedin/goal', { achieved: false })).body.goal.achieved, false);
  });

  test('stages: add, edit, complete, delete (and keep at least one)', async () => {
    const add = await api('POST', '/linkedin/stages', { name: 'Extra', start_date: '2027-05-01', end_date: '2027-05-31', posts_per_week: 1, connections_per_week: 5, messages_per_week: 2 });
    assert.equal(add.status, 201);
    const extra = add.body.stages.at(-1);
    assert.equal(extra.name, 'Extra');
    const bad = await api('POST', '/linkedin/stages', { name: 'Bad', start_date: '2027-05-31', end_date: '2027-05-01', posts_per_week: 1, connections_per_week: 1, messages_per_week: 1 });
    assert.equal(bad.status, 400);

    const edited = (await api('PUT', `/linkedin/stages/${extra.id}`, { ...extra, name: 'Extra 2', connections_per_week: 12 })).body;
    assert.equal(edited.stages.at(-1).connections_per_week, 12);

    const first = edited.stages[0];
    assert.equal((await api('PATCH', `/linkedin/stages/${first.id}/complete`, { completed: true })).body.stages[0].status, 'done');
    assert.equal((await api('GET', '/linkedin/goal?date=2026-10-05')).body.current.name, 'Visibility', 'finishing early moves you on');
    await api('PATCH', `/linkedin/stages/${first.id}/complete`, { completed: false });

    assert.equal((await api('DELETE', `/linkedin/stages/${extra.id}`)).body.stages.length, 5);
    assert.equal((await api('PUT', '/linkedin/stages/999999', { ...extra })).status, 404);
    const all = (await api('GET', '/linkedin/goal')).body.stages;
    for (const s of all.slice(1)) await api('DELETE', `/linkedin/stages/${s.id}`);
    assert.equal((await api('DELETE', `/linkedin/stages/${all[0].id}`)).status, 400, 'the last stage cannot be deleted');
  });
});
