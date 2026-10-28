// The Mentor (Phase 2): the voice (levels, strictness, fresh starts, one timed action), the AI → template fallback,
// the 2-a-day cap, Telegram delivery and the scheduler (evening, catch-up, morning, vacation, rest days).
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, sqlQuery, api } = require('./helpers');
const { buildContext, nextAction, slotTime, template, validate, writeMessage } = require('../src/checkin/messages');

const SETTINGS = { strictness: 'standard', categories: ['dsa', 'learning', 'project', 'workout', 'nutrition'] };
const INSULT = /\b(lazy|loser|pathetic|useless|worthless|failure|hopeless|never make it)\b/i;

function ctxFor({ level, misses = {}, statuses = {}, mvd = [], date = '2026-10-14', strictness = 'standard', kind = 'evening', commitments = [], yesterday = null, reason = null, game = null }) {
  const results = Object.fromEntries(SETTINGS.categories.map((c) => [c, { status: statuses[c] || 'met', detail: '' }]));
  return buildContext({
    kind,
    evaluation: { date, level, results, misses, mvdTomorrow: mvd, rest: null, reason },
    yesterdayEval: yesterday,
    pace: { daysLeft: 150, overall: { status: level >= 2 ? 'behind' : 'on track', daysBehind: level >= 2 ? 3 : 0 } },
    streak: { current: 0, best: 4, todayActive: false, shields: { available: 1 } },
    shields: { available: 1 },
    commitments,
    settings: { ...SETTINGS, strictness },
    game,
  });
}
const lastLine = (t) => t.trim().split('\n').at(-1);

describe('the voice', () => {
  test('every level: names the miss, days left, never insults, ends with ONE action that has a time', () => {
    const cases = [
      ctxFor({ level: 0 }),
      ctxFor({ level: 1, statuses: { dsa: 'missed' }, misses: { dsa: 1 } }),
      ctxFor({ level: 2, statuses: { dsa: 'missed', workout: 'partial' }, misses: { dsa: 2, workout: 2 }, mvd: ['dsa', 'workout'] }),
      ctxFor({ level: 3, statuses: { dsa: 'missed' }, misses: { dsa: 3 }, mvd: ['dsa'] }),
      ctxFor({ level: 4, statuses: { dsa: 'missed' }, misses: { dsa: 6 }, mvd: ['dsa'] }),
    ];
    for (const ctx of cases) {
      const t = template(ctx);
      assert.match(lastLine(t), /^Tomorrow, \d{2}:\d{2}: /, `level ${ctx.level}: ${t}`);
      assert.ok(!INSULT.test(t), `level ${ctx.level} insult: ${t}`);
      assert.ok(t.includes('150 days left'), `level ${ctx.level} mentions the mission`);
      assert.equal(validate(t), null, `level ${ctx.level} passes the safety check`);
    }
    assert.match(template(cases[1]), /You missed: DSA\./);
    assert.match(template(cases[1]), /\/commit HH:MM/, 'level 1 asks for the commitment');
    assert.match(template(cases[2]), /minimum viable day: 1 easy problem, the 10-minute mode/);
    assert.match(template(cases[2]), /Cost so far: .*XP left on the table|Cost so far: your streak/);
    assert.match(template(cases[3]), /blocking you: time, energy, difficulty or motivation/);
    assert.match(template(cases[4]), /not going to push harder/);
    assert.doesNotMatch(template(cases[4]), /Never miss twice/, 'level 4 stops escalating');
    assert.match(lastLine(template(cases[2])), /solve 1 easy problem/, 'minimum day → the tiny action');
  });

  test('strictness changes the tone only; fresh starts; comebacks; your reason is acknowledged', () => {
    const base = { level: 1, statuses: { dsa: 'missed' }, misses: { dsa: 1 } };
    assert.notEqual(template(ctxFor({ ...base, strictness: 'drill' })), template(ctxFor({ ...base, strictness: 'gentle' })));
    const two = { level: 2, statuses: { dsa: 'missed', workout: 'missed', learning: 'missed', project: 'missed', nutrition: 'missed' }, misses: { dsa: 2, workout: 2, learning: 2, project: 2, nutrition: 2 }, mvd: ['dsa'] };
    assert.notEqual(template(ctxFor({ ...two, strictness: 'drill' })), template(ctxFor({ ...two, strictness: 'gentle' })), 'level 2 tone differs too');
    assert.ok(template(ctxFor(two)).startsWith("All 5 goals slipped (DSA, Learning, Project, Workout, Nutrition). That's 2 days straight."), 'one line when everything slipped');
    assert.match(template(ctxFor({ ...base, date: '2026-10-18' })), /Tomorrow is Monday: a clean reset point/, 'Sunday evening');
    assert.match(template(ctxFor({ ...base, date: '2026-10-31' })), /new month/);
    const comeback = ctxFor({ level: 0, yesterday: { results: { dsa: { status: 'missed' } } } });
    assert.match(template(comeback), /Comeback on DSA\. \+20 XP/);
    assert.match(template(ctxFor({ ...base, reason: 'office release ran late' })), /You said: "office release ran late"/);
  });

  test('the camera focus guard: the evening message reports today’s focus %', () => {
    const game = { focusToday: { sessions: 2, focusedMin: 45, distractedMin: 15, totalMin: 60, pct: 75 } };
    assert.match(template(ctxFor({ level: 0, game })), /On camera you focused 45 of 60 minutes \(75%\)\./);
    assert.doesNotMatch(template(ctxFor({ level: 0 })), /On camera/, 'no camera sessions: no line');
  });

  test('before the plan starts nothing counts: a plain "not started" message, never invented misses, no AI call', async () => {
    const off = Object.fromEntries(SETTINGS.categories.map((c) => [c, 'off']));
    const ctx = ctxFor({ level: 0, statuses: off });
    assert.equal(ctx.preStart, true);
    assert.match(template(ctx), /^Your plan hasn't started yet/);
    let called = false;
    const r = await writeMessage(ctx, { isConfigured: () => true, generate: async () => { called = true; return { message: 'You missed learning.', action: 'Tomorrow, 07:00: x' }; } });
    assert.deepEqual([r.source, called], ['template', false]);
  });

  test('the one action: your commitment wins, otherwise the slot from your timeline', () => {
    assert.deepEqual([slotTime('dsa', '2026-10-15'), slotTime('dsa', '2026-10-17'), slotTime('workout', '2026-10-15')], ['06:10', '08:00', '05:35']);
    const a = nextAction(ctxFor({ level: 1, statuses: { dsa: 'missed' }, misses: { dsa: 1 }, commitments: [{ date: '2026-10-15', category: 'dsa', planned_at: '07:30', place: 'desk' }] }));
    assert.deepEqual([a.category, a.time, a.place], ['dsa', '07:30', 'desk']);
    assert.match(lastLine(template(ctxFor({ level: 1, statuses: { dsa: 'missed' }, misses: { dsa: 1 }, commitments: [{ date: '2026-10-15', category: 'dsa', planned_at: '07:30', place: 'desk' }] }))), /^Tomorrow, 07:30 \(desk\): /);
    const morning = template(ctxFor({ level: 1, kind: 'morning', date: '2026-10-14', statuses: { dsa: 'missed' }, misses: { dsa: 1 }, commitments: [{ date: '2026-10-15', category: 'dsa', planned_at: '07:30', place: null }] }));
    assert.match(morning, /You committed to DSA at 07:30/);
    assert.match(lastLine(morning), /^Today, 07:30: /);
  });

  test('safety check + AI → template fallback', async () => {
    assert.equal(validate('You are lazy.\nTomorrow, 07:00: solve 1 problem'), 'insult');
    assert.equal(validate('Do better.\nTomorrow: solve 1 problem'), 'no time');
    assert.equal(validate('x'.repeat(800) + ' 07:00'), 'length');
    const ctx = ctxFor({ level: 1, statuses: { dsa: 'missed' }, misses: { dsa: 1 } });
    const ok = await writeMessage(ctx, { isConfigured: () => true, generate: async () => ({ message: 'You skipped DSA today. 150 days left.', action: 'Tomorrow, 06:10: solve 1 medium array problem.' }) });
    assert.deepEqual([ok.source, ok.content.endsWith('06:10: solve 1 medium array problem.')], ['ai', true]);
    const rude = await writeMessage(ctx, { isConfigured: () => true, generate: async () => ({ message: 'You are hopeless.', action: 'Tomorrow, 06:10: try.' }) });
    assert.deepEqual([rude.source, rude.reason], ['template', 'ai message rejected (insult)']);
    const down = await writeMessage(ctx, { isConfigured: () => true, generate: async () => { throw new Error('429 quota'); } });
    assert.deepEqual([down.source, /429/.test(down.reason)], ['template', true]);
    assert.equal((await writeMessage(ctx, { isConfigured: () => false })).source, 'template');
  });
});

describe('delivery + scheduler (test database)', () => {
  let pool;
  let runner;
  const sent = [];
  const deps = { isConfigured: () => false, telegramOn: true, send: async (chat, html) => { sent.push({ chat, html }); return { message_id: 1000 + sent.length }; } };
  const local = (y, m, d, h, min) => new Date(y, m - 1, d, h, min).getTime();
  before(async () => {
    await startServer();
    pool = await require('../src/db').getPool();
    runner = require('../src/checkin/runner');
    await sqlQuery("UPDATE dbo.settings SET v = '555' WHERE k = 'tg_chat_id'");
  });
  after(stopServer);

  test('mentor_* settings save with validation (and come back as text)', async () => {
    const ok = await api('PUT', '/settings', { mentor_strictness: 'drill', mentor_eval_time: '22:30', mentor_tz: 'Asia/Kolkata', mentor_pause_until: '2026-12-31', mentor_rest_per_month: 0, mentor_categories: ['dsa', 'workout'], mentor_enabled: false });
    assert.equal(ok.status, 200);
    assert.deepEqual([ok.body.mentor_strictness, ok.body.mentor_eval_time, ok.body.mentor_tz, ok.body.mentor_pause_until, ok.body.mentor_rest_per_month, ok.body.mentor_categories, ok.body.mentor_enabled],
      ['drill', '22:30', 'Asia/Kolkata', '2026-12-31', '0', 'dsa,workout', '0']);
    for (const bad of [{ mentor_strictness: 'brutal' }, { mentor_eval_time: '25:00' }, { mentor_tz: 'Mars/Base' }, { mentor_categories: 'dsa,chess' }, { mentor_learning_minutes: 1 }, { mentor_pause_until: 'tomorrow' }]) {
      assert.equal((await api('PUT', '/settings', bad)).status, 400, JSON.stringify(bad));
    }
    // back to the defaults for the scheduler tests below
    await api('PUT', '/settings', { mentor_strictness: 'standard', mentor_eval_time: '23:00', mentor_tz: '', mentor_pause_until: '', mentor_rest_per_month: 2, mentor_categories: 'dsa,learning,project,workout,nutrition', mentor_enabled: true });
  });

  test("at most one evening + one morning a day; tests don't count; Telegram ids are kept; a Telegram failure still saves", async () => {
    const s = await require('../src/checkin/data').mentorSettings();
    const m = (kind) => ({ date: '2026-10-20', kind, level: 1, content: 'Missed DSA.\nTomorrow, 06:10: solve 1 problem', source: 'template' });
    const a = await runner.deliver(pool, m('evening'), s, deps);
    assert.deepEqual([a.channel, a.tgMessageId, sent.at(-1).chat], ['telegram', 1001, 555]);
    assert.match((await runner.deliver(pool, m('evening'), s, deps)).skipped, /already sent/);
    assert.ok((await runner.deliver(pool, m('morning'), s, deps)).id);
    assert.ok((await runner.deliver(pool, m('test'), s, deps)).id, 'test messages are not limited');
    const failing = await runner.deliver(pool, { ...m('test'), date: '2026-10-21' }, s, { ...deps, send: async () => { throw new Error('network'); } });
    assert.deepEqual([failing.channel, failing.tgMessageId], ['web', null]);
    assert.equal((await sqlQuery("SELECT COUNT(*) AS n FROM dbo.mentor_outbox WHERE msg_date = '2026-10-20' AND kind IN ('morning', 'evening')"))[0].n, 2);
  });

  test("a Telegram reply to a mentor message is saved as that day's reason, never logged as a meal", async () => {
    await sqlQuery("INSERT INTO dbo.mentor_evaluations (eval_date, results, misses, level, final, evaluated_ms) VALUES ('2026-10-20', '{}', '{}', 1, 0, 0)");
    const { handleUpdate } = require('../src/telegram/runner');
    const mealsBefore = (await sqlQuery('SELECT COUNT(*) AS n FROM dbo.tg_inbox'))[0].n;
    await handleUpdate(pool, { update_id: 777001, message: { message_id: 50, date: Math.floor(Date.now() / 1000), chat: { id: 555, type: 'private' }, text: 'Office release ran till 11pm', reply_to_message: { message_id: 1001 } } });
    assert.equal((await sqlQuery("SELECT reason FROM dbo.mentor_evaluations WHERE eval_date = '2026-10-20'"))[0].reason, 'Office release ran till 11pm');
    assert.equal((await sqlQuery('SELECT COUNT(*) AS n FROM dbo.tg_inbox'))[0].n, mealsBefore, 'no meal was queued');
  });

  test('scheduler: 23:05 → finalise + evening (once), catch-up is silent, morning window, vacation mode, rest days', async () => {
    // earlier tests (a mentor reply) caught up past days by the real clock: start this simulated week clean
    await sqlQuery("DELETE FROM dbo.mentor_evaluations; DELETE FROM dbo.mentor_outbox WHERE msg_date < '2026-10-20'");
    let out = await runner.tick(local(2026, 10, 7, 23, 5), deps);
    assert.equal(out.evaluated, '2026-10-07');
    assert.ok(out.evening && out.evening.content.split('\n').at(-1).startsWith('Tomorrow, '), JSON.stringify(out));
    const caught = await sqlQuery("SELECT COUNT(*) AS n FROM dbo.mentor_evaluations WHERE final = 1 AND eval_date IN ('2026-10-05', '2026-10-06')");
    assert.equal(caught[0].n, 2, 'earlier days were caught up');
    assert.equal((await sqlQuery("SELECT COUNT(*) AS n FROM dbo.mentor_outbox WHERE msg_date IN ('2026-10-05', '2026-10-06')"))[0].n, 0, '…without messages');
    out = await runner.tick(local(2026, 10, 7, 23, 6), deps);
    assert.equal(out.evening, undefined, 'never twice');

    out = await runner.tick(local(2026, 10, 8, 6, 40), deps);
    assert.ok(out.morning?.id && /^Today, /.test(out.morning.content.split('\n').at(-1)), JSON.stringify(out));
    assert.equal((await runner.tick(local(2026, 10, 8, 10, 0), deps)).morning, undefined, 'outside the window / already sent');

    await sqlQuery("UPDATE dbo.settings SET v = '2026-10-09' WHERE k = 'mentor_pause_until'");
    out = await runner.tick(local(2026, 10, 9, 23, 5), deps);
    assert.deepEqual([out.evaluated, out.evening], ['2026-10-09', undefined], 'vacation: evaluated quietly');
    await sqlQuery("UPDATE dbo.settings SET v = '' WHERE k = 'mentor_pause_until'");

    await sqlQuery("INSERT INTO dbo.rest_days (rest_date, kind, created_ms) VALUES ('2026-10-10', 'rest', 0)");
    out = await runner.tick(local(2026, 10, 10, 23, 5), deps);
    assert.deepEqual([out.evaluated, out.evening], ['2026-10-10', undefined], 'rest day: no check-in');
    assert.equal((await runner.tick(local(2026, 10, 11, 6, 40), deps)).morning?.id > 0, true, 'the morning after a rest day still comes');
  });
});

