// Flashcards (spaced repetition from finished lessons + your own) and the weekly report.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, sqlQuery } = require('./helpers');
const { schedule, lessonCatalog } = require('../src/cards');
const { totals, verdict } = require('../src/report');
const { xpEvents, XP, CARD_XP_PER_DAY } = require('../src/game/xp');

const T = '2026-10-16';

describe('flashcard scheduling (pure)', () => {
  test('good: 1 day -> 3 days -> interval x ease; easy jumps further; hard grows slowly', () => {
    let c = { ease: 2.5, interval_days: 0, reps: 0, lapses: 0 };
    c = schedule(c, 3, T); assert.deepEqual([c.interval_days, c.due], [1, '2026-10-17']);
    c = schedule(c, 3, T); assert.equal(c.interval_days, 3);
    c = schedule(c, 3, T); assert.equal(c.interval_days, 8); // 3 x 2.5 = 7.5 -> 8
    assert.equal(schedule({ ease: 2.5, interval_days: 0, reps: 0 }, 4, T).interval_days, 3, 'easy on a new card');
    const easy = schedule({ ease: 2.5, interval_days: 10, reps: 3 }, 4, T);
    assert.deepEqual([easy.interval_days, easy.ease], [33, 2.65]);
    const hard = schedule({ ease: 2.5, interval_days: 10, reps: 3 }, 2, T);
    assert.deepEqual([hard.interval_days, hard.ease], [12, 2.35]);
  });

  test('again: back to the start, due today, ease drops but never below 1.3; intervals cap at 180 days', () => {
    const a = schedule({ ease: 1.4, interval_days: 40, reps: 5, lapses: 1 }, 1, T);
    assert.deepEqual(a, { ease: 1.3, interval_days: 0, reps: 0, lapses: 2, due: T });
    assert.equal(schedule({ ease: 3, interval_days: 150, reps: 9 }, 4, T).interval_days, 180);
  });

  test('every AI / LLD / HLD lesson with a checkpoint question can become a card', () => {
    const cat = lessonCatalog();
    const first = cat.get('ai|L1-1');
    assert.ok(first.front.endsWith('?') && first.back.length > 20);
    assert.ok([...cat.keys()].some((k) => k.startsWith('lld|')) && [...cat.keys()].some((k) => k.startsWith('hld|')));
  });

  test('XP: +2 per review, only the first 10 reviews of a day count', () => {
    const day = new Date(`${T}T09:00:00`).getTime();
    const reviews = Array.from({ length: 14 }, (_, i) => ({ ms: day + i * 1000 }));
    const cardXp = xpEvents({ tracks: [], problems: [], sessions: [], reviews }).filter((e) => e.kind === 'card');
    assert.equal(cardXp.length, CARD_XP_PER_DAY);
    assert.equal(cardXp.reduce((n, e) => n + e.xp, 0), CARD_XP_PER_DAY * XP.card);
  });
});

describe('weekly report (pure)', () => {
  const day = (o) => ({ minutes: 0, xp: 0, lessons: 0, problems: 0, cards: 0, workoutItems: 0, goals: null, ...o });
  test('totals: active days need 5+ minutes; goals count only tracked ones', () => {
    const t = totals([day({ minutes: 30, workoutItems: 3, goals: { dsa: 'met', workout: 'missed', project: 'off' } }), day({ minutes: 4 }), day({ minutes: 12, problems: 2 })]);
    assert.deepEqual([t.minutes, t.activeDays, t.problems, t.workouts, t.goalsMet, t.goalsTracked], [46, 2, 2, 1, 1, 2]);
  });
  test('verdict: minutes vs last week, best day, the goal that slipped most, a next-week target', () => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((name, i) => day({ name, minutes: i === 2 ? 50 : 10, goals: { workout: i < 3 ? 'missed' : 'met' } }));
    const week = totals(days);
    const v = verdict({ week, prev: { ...week, minutes: 60 }, days, camera: { pct: 80 } });
    assert.match(v[0], /^110 focused minutes over 7 active days \(\+50 vs last week\)\.$/);
    assert.ok(v.includes('Best day: Wed with 50 minutes.'));
    assert.ok(v.some((l) => /^Workout slipped on 3 days/.test(l)));
    assert.ok(v.some((l) => /On camera you stayed focused 80%/.test(l)));
    assert.deepEqual(verdict({ week: totals([day({})]), prev: totals([]), days: [day({})] }).length, 1, 'an empty week: one gentle line');
    assert.equal(verdict({ week: totals([day({ minutes: 1 })]), prev: totals([]), days: [day({ minutes: 1, name: 'Fri' })] })[0], '1 focused minute over 0 active days.');
  });
});

describe('flashcards + report API', () => {
  before(startServer);
  after(stopServer);

  test('a finished lesson becomes a card due the next day; the game shows due cards', async () => {
    let d = (await api('GET', '/cards')).body;
    assert.deepEqual([d.counts.total, d.due.length], [0, 0]);
    assert.equal((await api('POST', '/ai/lessons/L1-1', { done: true })).status, 200);
    d = (await api('GET', '/cards')).body;
    assert.equal(d.counts.total, 1);
    assert.equal(d.counts.due, 0, 'due tomorrow, not today');
    const card = d.cards[0];
    assert.deepEqual([card.track, card.lesson_ref, card.source], ['ai', 'L1-1', 'lesson']);
    assert.equal((await api('GET', '/cards')).body.counts.total, 1, 'synced once, no duplicates');
    await sqlQuery('UPDATE dbo.flashcards SET due = CAST(GETDATE() AS date)');
    const g = (await api('GET', '/game')).body;
    assert.deepEqual(g.cards, { due: 1, reviewedToday: 0 });
    assert.equal(g.byDay, undefined, 'per-day activity stays on the server');
  });

  test('reviewing: grades validate, the schedule moves, XP is earned, previews show each grade', async () => {
    const d = (await api('GET', '/cards')).body;
    const c = d.due[0];
    assert.deepEqual(c.preview, { again: 0, hard: 1, good: 1, easy: 3 });
    assert.equal((await api('POST', `/cards/${c.id}/review`, { grade: 'meh' })).status, 400);
    assert.equal((await api('POST', '/cards/99999/review', { grade: 'good' })).status, 404);
    const before = (await api('GET', '/game')).body.player.total;
    const r = (await api('POST', `/cards/${c.id}/review`, { grade: 'good' })).body;
    assert.deepEqual([r.interval_days, r.reps], [1, 1]);
    const g = (await api('GET', '/game')).body;
    assert.equal(g.player.total - before, XP.card);
    assert.deepEqual(g.cards, { due: 0, reviewedToday: 1 });
  });

  test('your own cards: add (due today), edit, delete; lesson cards can be edited but not deleted', async () => {
    assert.equal((await api('POST', '/cards', { front: '', back: 'x' })).status, 400);
    assert.equal((await api('POST', '/cards', { front: 'Q', back: 'A', track: 'chess' })).status, 400);
    const add = await api('POST', '/cards', { track: 'hld', front: 'What does a CDN cache?', back: 'Static content near users.' });
    assert.equal(add.status, 201);
    let d = (await api('GET', '/cards')).body;
    assert.equal(d.due.find((x) => x.id === add.body.id)?.source, 'mine');
    assert.equal(d.byTrack.find((b) => b.track === 'hld').total, 1);
    assert.equal((await api('PUT', `/cards/${add.body.id}`, { track: 'hld', front: 'What does a CDN cache, and where?', back: 'Static content, at the edge.' })).status, 200);
    const lessonCard = d.cards.find((x) => x.source === 'lesson');
    assert.equal((await api('PUT', `/cards/${lessonCard.id}`, { track: 'hld', front: 'My wording', back: lessonCard.back })).status, 200);
    d = (await api('GET', '/cards')).body;
    assert.deepEqual([d.cards.find((x) => x.id === lessonCard.id).front, d.cards.find((x) => x.id === lessonCard.id).track], ['My wording', 'ai'], 'a lesson card keeps its track');
    assert.equal((await api('DELETE', `/cards/${lessonCard.id}`)).status, 404);
    assert.equal((await api('DELETE', `/cards/${add.body.id}`)).status, 200);
    assert.equal((await api('GET', '/cards')).body.counts.total, 1);
  });

  test('weekly report: this week by default, Monday-aligned, compared with last week', async () => {
    assert.equal((await api('GET', '/report/week?start=nope')).status, 400);
    const r = (await api('GET', '/report/week?start=2026-10-14')).body;
    assert.deepEqual([r.start, r.end, r.prevStart, r.nextStart], ['2026-10-12', '2026-10-18', '2026-10-05', '2026-10-19']);
    assert.deepEqual(r.days.map((d) => d.name), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    assert.ok(Array.isArray(r.verdict) && r.verdict.length >= 1);
    assert.deepEqual(r.goals.map((g) => g.key), ['dsa', 'learning', 'project', 'workout', 'nutrition']);
    const now = (await api('GET', '/report/week')).body;
    assert.equal(now.isCurrent, true);
    assert.ok(now.week.xp >= XP.lesson + XP.card, 'this week counts the lesson + the review');
    assert.ok(now.days.some((d) => d.lessons === 1 && d.cards === 1));
  });
});
