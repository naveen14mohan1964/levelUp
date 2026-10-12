// API integration tests against a fresh DSATracker_Test database (your real data is never touched).
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startServer, stopServer, api, sqlQuery, getBase } = require('./helpers');

before(startServer);
after(stopServer);

describe('plan + day view', () => {
  test('meta: 154 days from 2026-10-05 to 2027-03-07', async () => {
    const { status, body } = await api('GET', '/meta');
    assert.equal(status, 200);
    assert.deepEqual(body, { startDate: '2026-10-05', endDate: '2027-03-07', totalDays: 154 });
  });

  test('day 1: 3 blocks, 4 problems, verified links and video channels', async () => {
    const { body } = await api('GET', '/day/2026-10-05');
    assert.equal(body.day.focus, 'Java collections for DSA · what Big-O means');
    assert.equal(body.tasks.length, 3);
    assert.deepEqual(body.problems.map((p) => p.lc_number), [1, 1480, 1672, 9]);
    assert.ok(body.day.links.length >= 1);
    assert.equal(body.day.channels.length, 6);
    assert.equal(body.prevDate, null);
    assert.equal(body.nextDate, '2026-10-06');
  });

  test('a date before the plan returns no day but points to day 1; bad dates are rejected', async () => {
    assert.deepEqual((await api('GET', '/day/2026-10-04')).body, { day: null, prevDate: null, nextDate: '2026-10-05' });
    assert.equal((await api('GET', '/day/not-a-date')).status, 400);
  });

  test('weeks: 22 weeks with 7 days each', async () => {
    const { body } = await api('GET', '/weeks');
    assert.equal(body.length, 22);
    assert.ok(body.every((w) => w.days.length === 7));
  });

  test('ticking a checklist task persists', async () => {
    const day = (await api('GET', '/day/2026-10-05')).body;
    const id = day.tasks[0].id;
    assert.equal((await api('PATCH', `/tasks/${id}`, { done: true })).body.done, true);
    assert.equal((await api('GET', '/day/2026-10-05')).body.tasks[0].done, true);
    await api('PATCH', `/tasks/${id}`, { done: false });
    assert.equal((await api('PATCH', '/tasks/999999', { done: true })).status, 404);
  });
});

describe('DSA problems + spaced repetition', () => {
  let twoSum;

  test('all 399 plan problems, 324 core (incl. GfG)', async () => {
    const { body } = await api('GET', '/problems');
    assert.equal(body.length, 399);
    assert.equal(body.filter((p) => !p.is_stretch && !p.is_selftest).length, 324);
    twoSum = body.find((p) => p.lc_number === 1);
    assert.equal(twoSum.slug, 'two-sum');
  });

  test('logging a first solve schedules the next review from the confidence', async () => {
    const { status, body } = await api('POST', `/problems/${twoSum.id}/solve`, { confidence: 4, time_taken_min: 12, notes: 'HashMap of complements', date: '2026-10-05' });
    assert.equal(status, 200);
    assert.equal(body.isReview, false);
    assert.equal(body.schedule.interval, 14);
    assert.equal(body.problem.next_review, '2026-10-19');
    assert.equal(body.problem.status, 'solved');
    assert.equal(body.problem.attempts, 1);
    assert.equal(body.problem.notes, 'HashMap of complements');
  });

  test('it shows up in the review queue on its due date, with history logged', async () => {
    assert.equal((await api('GET', '/review/queue?date=2026-10-18')).body.due.length, 0);
    const q = (await api('GET', '/review/queue?date=2026-10-19')).body;
    assert.deepEqual(q.due.map((p) => p.id), [twoSum.id]);
    assert.equal((await api('GET', `/problems/${twoSum.id}/history`)).body.length, 1);
  });

  test('a low-confidence review resets to tomorrow and marks it "needs revision"', async () => {
    const { body } = await api('POST', `/problems/${twoSum.id}/solve`, { confidence: 1, date: '2026-10-19' });
    assert.equal(body.isReview, true);
    assert.equal(body.schedule.interval, 1);
    assert.equal(body.problem.status, 'revision');
    assert.equal(body.problem.attempts, 2);
  });

  test('un-ticking a problem clears its schedule', async () => {
    const { body } = await api('PATCH', `/problems/${twoSum.id}/status`, { status: 'todo' });
    assert.equal(body.status, 'todo');
    assert.equal(body.attempts, 0);
    assert.equal(body.confidence, null);
    assert.equal(body.next_review, null);
  });

  test('validation: confidence must be 1–5; unknown problem is 404', async () => {
    assert.equal((await api('POST', `/problems/${twoSum.id}/solve`, { confidence: 9 })).status, 400);
    assert.equal((await api('POST', '/problems/999999/solve', { confidence: 3 })).status, 404);
  });

  test('add your own problem (slug parsed from the URL) and edit its notes', async () => {
    const { status, body } = await api('POST', '/problems', { title: 'Jump Game VII', url: 'https://leetcode.com/problems/jump-game-vii/', difficulty: 'M', topic: 'Greedy', lc_number: 1871 });
    assert.equal(status, 201);
    assert.equal(body.slug, 'jump-game-vii');
    assert.equal(body.day_id, null);
    assert.equal((await api('PATCH', `/problems/${body.id}`, { notes: 'BFS window' })).body.notes, 'BFS window');
    assert.equal((await api('POST', '/problems', { title: '', difficulty: 'X' })).status, 400);
  });
});

describe('DSA progress follows solved problems', () => {
  const practiceOf = (day) => day.tasks.find((t) => t.kind === 'practice');

  test('the LeetCode block ticks itself only when every core problem is solved, and unticks if one is undone', async () => {
    const date = '2026-10-06';
    let day = (await api('GET', `/day/${date}`)).body;
    const core = day.problems.filter((p) => !p.is_stretch && !p.is_selftest);
    assert.ok(core.length >= 2);
    assert.deepEqual(practiceOf(day), { ...practiceOf(day), linked: true, done: false, solved: 0, total: core.length });

    // Ticking it by hand is refused: it is derived from the problems.
    assert.equal((await api('PATCH', `/tasks/${practiceOf(day).id}`, { done: true })).status, 409);

    // All but one solved -> still open; stretch problems never count.
    for (const p of core.slice(1)) await api('PATCH', `/problems/${p.id}/status`, { status: 'solved' });
    day = (await api('GET', `/day/${date}`)).body;
    assert.equal(practiceOf(day).done, false);
    assert.equal(practiceOf(day).solved, core.length - 1);

    // The last one via "Log solve" -> done, and the Plan page counts it.
    await api('POST', `/problems/${core[0].id}/solve`, { confidence: 3, date });
    day = (await api('GET', `/day/${date}`)).body;
    assert.equal(practiceOf(day).done, true);
    const weekDay = (await api('GET', '/weeks')).body[0].days.find((d) => d.plan_date === date);
    assert.equal(weekDay.core_done, core.length);
    assert.equal(weekDay.tasks_done, 1);

    // Home timeline shows it ticked and read-only.
    const blocks = (await api('GET', `/schedule/${date}`)).body.blocks;
    const item = blocks.flatMap((b) => b.items).find((i) => i.id === practiceOf(day).id);
    assert.equal(item.done, true);
    assert.equal(item.linked, true);

    // Un-ticking one problem un-ticks the task.
    await api('PATCH', `/problems/${core[1].id}/status`, { status: 'todo' });
    assert.equal(practiceOf((await api('GET', `/day/${date}`)).body).done, false);
    for (const p of core) await api('PATCH', `/problems/${p.id}/status`, { status: 'todo' });
  });

  test('a self-test day links its self-test task to the self-test problems; other tasks stay manual', async () => {
    const sunday = (await api('GET', '/weeks')).body[0].days.find((d) => d.day_type === 'selftest');
    let day = (await api('GET', `/day/${sunday.plan_date}`)).body;
    const selftest = day.tasks.find((t) => t.kind === 'selftest');
    assert.equal(selftest.linked, true);
    assert.ok(day.tasks.filter((t) => t.kind !== 'selftest').every((t) => !t.linked));
    for (const p of day.problems.filter((p) => p.is_selftest)) await api('PATCH', `/problems/${p.id}/status`, { status: 'solved' });
    day = (await api('GET', `/day/${sunday.plan_date}`)).body;
    assert.equal(day.tasks.find((t) => t.kind === 'selftest').done, true);
    for (const p of day.problems.filter((p) => p.is_selftest)) await api('PATCH', `/problems/${p.id}/status`, { status: 'todo' });
  });
});

describe('daily timeline', () => {
  test('weekday: 11 blocks from 05:30, with the day\'s tasks, problems, project lesson and workout', async () => {
    const { body } = await api('GET', '/schedule/2026-10-05');
    assert.equal(body.week, 1);
    assert.equal(body.blocks[0].start, '05:30');
    const by = Object.fromEntries(body.blocks.map((b) => [b.key, b]));
    assert.equal(by.workout.detail, 'Strength A · Phase 1 · Foundation');
    assert.match(by['dsa-am'].items[0].title, /^Learn:/);
    assert.ok(by['dsa-pm'].items.some((i) => i.kind === 'problems' && i.total === 4));
    assert.deepEqual(by.project.items.map((i) => i.step), ['learn', 'build']);
  });

  test('Friday adds the weekly checkpoint; Sunday has the self-test and no project hour', async () => {
    const fri = (await api('GET', '/schedule/2026-10-09')).body;
    assert.deepEqual(fri.blocks.find((b) => b.area === 'project').items.map((i) => i.step), ['learn', 'build', 'checkpoint']);
    const sun = (await api('GET', '/schedule/2026-10-11')).body;
    assert.ok(!sun.blocks.some((b) => b.area === 'project'));
    assert.ok(sun.blocks.find((b) => b.key === 'dsa-am').items.some((i) => i.kind === 'problems' && i.selftest));
  });
});

describe('project roadmaps', () => {
  test('each area returns its projects with learn topics, exact doc links and checkpoints', async () => {
    for (const [area, n] of [['node', 36], ['dotnet', 48], ['react', 47]]) {
      const { body } = await api('GET', `/projects/${area}`);
      const tasks = body.flatMap((p) => p.weeks.flatMap((w) => w.tasks));
      assert.equal(tasks.length, n, area);
      for (const t of tasks.filter((x) => x.learn)) assert.ok(Array.isArray(t.learn_links) && t.learn_links.length > 0, `${area} ${t.plan_date}`);
    }
    assert.equal((await api('GET', '/projects/python')).status, 400);
  });

  test('YOUR TODO: PATCH /project-tasks/:id saves done / learn_done / built_from_scratch / notes', async (t) => {
    const task = (await api('GET', '/projects/node')).body[0].weeks[0].tasks[0];
    const r = await api('PATCH', `/project-tasks/${task.id}`, { done: true });
    if (r.status === 501) return t.todo('implement PATCH /api/project-tasks/:id in server/src/routes/projects.js');
    assert.equal(r.status, 200);
    assert.equal(r.body.done, true);
    assert.ok(r.body.done_at);
    assert.equal((await api('PATCH', `/project-tasks/${task.id}`, { learn_done: true })).body.done, true, 'unsent fields are kept');
    const n = (await api('PATCH', `/project-tasks/${task.id}`, { notes: 'hi', built_from_scratch: true })).body;
    assert.equal(n.notes, 'hi');
    assert.equal(n.built_from_scratch, true);
    assert.equal((await api('PATCH', `/project-tasks/${task.id}`, { notes: null })).body.notes, null, 'notes: null clears');
    assert.equal((await api('PATCH', `/project-tasks/${task.id}`, { done: false })).body.done_at, null);
    assert.equal((await api('PATCH', '/project-tasks/999999', { done: true })).status, 404);
  });
});

describe('settings', () => {
  test('defaults and validation', async () => {
    const s = (await api('GET', '/settings')).body;
    assert.equal(s.calorie_target, 2050);
    assert.equal(s.water_target_ml, 3250);
    assert.equal(s.leetcode_username, '');
    assert.equal((await api('PUT', '/settings', { calorie_target: 1950 })).body.calorie_target, 1950);
    assert.equal((await api('PUT', '/settings', { calorie_target: -5 })).status, 400);
  });

  test('LeetCode sync is skipped politely until a username is set', async () => {
    assert.equal((await api('POST', '/leetcode/sync')).body.skipped, true);
  });
});

describe('workout, goals, water, meals, photos', () => {
  test('session for a date with ticks; toggling persists', async () => {
    const s = (await api('GET', '/workout/day/2026-10-05')).body;
    assert.equal(s.session, 'Strength A');
    const main = s.items.filter((i) => i.group === 'main');
    for (const it of main) await api('POST', '/workout/day/2026-10-05/toggle', { key: it.key, done: true });
    assert.equal((await api('GET', '/workout/day/2026-10-05')).body.complete, true);
    assert.equal((await api('POST', '/workout/day/2026-10-05/toggle', { key: 'drop table', done: true })).status, 400);
    assert.equal((await api('GET', '/workout/summary?date=2026-10-05')).body.streak, 1);
  });

  test('every exercise in the plan has a how-to; every demo image it points to exists and is served', async () => {
    const { guideFor } = require('../src/exercise-guide');
    const names = new Set();
    const walk = (o) => {
      if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === 'object') {
        if (typeof o.name === 'string' && 'prescription' in o) names.add(o.name);
        Object.values(o).forEach(walk);
      }
    };
    walk(require('../data/plan.json').workout);
    assert.ok(names.size > 50);
    const missing = [...names].filter((n) => !guideFor(n));
    assert.deepEqual(missing, []);
    const pub = path.join(__dirname, '..', '..', 'client', 'public');
    for (const n of names) {
      const g = guideFor(n);
      assert.equal(g.cues.length, 3, n);
      for (const img of g.demo || []) assert.ok(fs.existsSync(path.join(pub, img)), `${n}: ${img}`);
    }
    // Demos only where the photo shows the exact move: a wall push-up has none, a counter push-up uses the incline demo.
    assert.equal(guideFor('Wall push-up').demo, null);
    assert.equal(guideFor('Incline push-up (kitchen counter)').demo[0], '/exercises/Incline_Push-Up/0.jpg');
    assert.equal(guideFor('Hip circles, 10 each way').demo, null);
    // The session API carries them.
    const s = (await api('GET', '/workout/day/2026-10-05')).body;
    assert.ok(s.items.every((i) => i.guide && i.guide.cues.length === 3));
    assert.match(s.items[0].guide.video, /^https:\/\/www\.youtube\.com\/results\?search_query=/);
  });

  test('progress photo AI comparison is off by default and refused until turned on', async () => {
    assert.equal((await api('GET', '/settings')).body.progress_ai, 0);
    assert.equal((await api('POST', '/progress-photos/1/analyze')).status, 400);
  });

  test('goals: targets for the week, water buttons, body log upsert and validation', async () => {
    const g = (await api('GET', '/goals/2026-10-19')).body;
    assert.deepEqual(g.targets, { calories: 1950, protein_g: 130, water_ml: 3250, steps: 6000, sleep_h: 7 });
    await api('POST', '/body/2026-10-19/water', { delta_ml: 250 });
    assert.equal((await api('POST', '/body/2026-10-19/water', { delta_ml: 500 })).body.body.water_ml, 750);
    assert.equal((await api('POST', '/body/2026-10-19/water', { delta_ml: -2000 })).body.body.water_ml, 0, 'never below 0');
    assert.equal((await api('PUT', '/body/2026-10-19', { weight_kg: 113.4, steps: 6200 })).body.body.weight_kg, 113.4);
    assert.equal((await api('PUT', '/body/2026-10-19', { weight_kg: 9 })).status, 400);
    assert.equal((await api('PUT', '/body/2026-10-19', { hacker: 1 })).status, 400);
    const hist = (await api('GET', '/body-history?days=800')).body;
    assert.ok(hist.some((h) => h.log_date === '2026-10-19' && h.weight_kg === 113.4));
  });

  test('meals: manual add counts toward goals; delete removes it', async () => {
    const m = await api('POST', '/meals', { date: '2026-10-19', meal_type: 'lunch', title: 'Chicken curry + 2 rotis', calories: 640, protein_g: 42, carbs_g: 55, fat_g: 24 });
    assert.equal(m.status, 201);
    const g = (await api('GET', '/goals/2026-10-19')).body;
    assert.equal(g.eaten.calories, 640);
    assert.equal(g.eaten.protein_g, 42);
    assert.equal((await api('GET', '/meals/2026-10-19')).body.length, 1);
    assert.equal((await api('DELETE', `/meals/${m.body.id}`)).status, 200);
    assert.equal((await api('GET', '/meals/2026-10-19')).body.length, 0);
    assert.equal((await api('POST', '/meals', { date: '2026-10-19', meal_type: 'brunch', title: 'x', calories: 1 })).status, 400);
    assert.equal((await api('POST', '/meals', { date: '2026-10-19', meal_type: 'lunch', title: 'x', calories: 1, photo_path: '../../etc/passwd' })).status, 400);
  });

  test('meal analysis needs a photo or a description', async () => {
    const fd = new FormData();
    fd.append('date', '2026-10-19');
    assert.equal((await api('POST', '/meals/analyze', fd)).status, 400);
  });

  test('progress photo upload is stored locally, served, and deletable', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const fd = new FormData();
    fd.append('photo', new Blob([png], { type: 'image/png' }), 'front.png');
    fd.append('pose', 'front');
    fd.append('date', '2026-10-19');
    const up = await api('POST', '/progress-photos', fd);
    assert.equal(up.status, 201);
    const served = await fetch(`${getBase()}${up.body.photo_url}`);
    assert.equal(served.status, 200);
    const list = (await api('GET', '/progress-photos')).body;
    const file = path.join(__dirname, '..', 'uploads', list[0].photo_path);
    assert.ok(fs.existsSync(file));
    await api('DELETE', `/progress-photos/${list[0].id}`);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(fs.existsSync(file), false);
  });
});

describe('mentor endpoints (no AI call)', () => {
  test('context summarises live progress', async () => {
    const c = (await api('GET', '/mentor/context?date=2026-10-05')).body;
    assert.equal(c.week, 1);
    assert.equal(c.focus, 'Java collections for DSA · what Big-O means');
    assert.equal(c.workout.session, 'Strength A');
    assert.ok(c.links.length > 0);
  });

  test('threads are validated and start empty', async () => {
    assert.equal((await api('GET', '/mentor/thread/general')).body.length, 0);
    assert.equal((await api('GET', '/mentor/thread/../../x')).status, 404);
    assert.equal((await api('POST', '/mentor/ask', { thread: 'evil thread', mode: 'chat', message: 'hi' })).status, 400);
    assert.equal((await api('POST', '/mentor/ask', { thread: 'general', mode: 'shell', message: 'hi' })).status, 400);
    assert.equal((await api('POST', '/mentor/ask', { thread: 'general', mode: 'review', code: 'x' })).status, 400);
  });
});

describe('robustness', () => {
  test('unknown API route → 404 JSON; malformed JSON → 400', async () => {
    assert.equal((await api('GET', '/nope')).status, 404);
    const res = await fetch(`${getBase()}/api/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{bad json' });
    assert.equal(res.status, 400);
  });

  test('test run used the test database, not your real one', async () => {
    const [{ db }] = await sqlQuery('SELECT DB_NAME() AS db');
    assert.equal(db, 'DSATracker_Test');
  });
});
