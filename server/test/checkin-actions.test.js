// The Mentor (Phase 3): Telegram commands and buttons, commitments, rest / sick days (limits, in advance),
// telling it why (reason / blocker → its answer) and the confirmed plan shift. No real AI calls: templates only.
process.env.GEMINI_API_KEY = '';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, stopServer, api, sqlQuery } = require('./helpers');
const { parseTime, parseCommit, commitDate, parseDayArg } = require('../src/checkin/telegram');
const { BLOCKER_ADVICE } = require('../src/checkin/messages');
const { addDays } = require('../src/game/days');

describe('parsing what you type on Telegram', () => {
  test('times, commitments (category anywhere, the rest is the place), dates', () => {
    assert.deepEqual(['7', '7am', '7:30pm', '19:00', '0730', '12am', '13pm', '25:00'].map(parseTime), ['07:00', '07:00', '19:30', '19:00', '07:30', '00:00', null, null]);
    assert.deepEqual(parseCommit('7am desk dsa'), { time: '07:00', category: 'dsa', place: 'desk' });
    assert.deepEqual(parseCommit('gym 6:15 at the park'), { time: '06:15', category: 'workout', place: 'the park' });
    assert.deepEqual(parseCommit('9 pm'), { time: '21:00', category: null, place: null });
    assert.deepEqual(parseCommit('desk'), { time: null, category: null, place: 'desk' });
    const tz = 'Asia/Kolkata';
    assert.equal(commitDate(new Date('2026-10-13T17:40:00Z').getTime(), tz, '07:00'), '2026-10-14', '23:10: 07:00 means tomorrow');
    assert.equal(commitDate(new Date('2026-10-13T00:30:00Z').getTime(), tz, '07:00'), '2026-10-13', '06:00: 07:00 is still today');
    assert.deepEqual(parseDayArg('tomorrow family trip', '2026-10-13', '2026-10-13'), { date: '2026-10-14', note: 'family trip' });
    assert.deepEqual(parseDayArg('2026-10-24', '2026-10-13', '2026-10-14'), { date: '2026-10-24', note: null });
    assert.deepEqual(parseDayArg('', '2026-10-13', '2026-10-14'), { date: '2026-10-14', note: null });
  });
});

describe('mentor actions (test database)', () => {
  let pool;
  let today;
  before(async () => {
    await startServer();
    pool = await require('../src/db').getPool();
    today = (await api('GET', '/checkin')).body.today.date;
  });
  after(stopServer);

  test('rest days: planned in advance, sick can be today, monthly limits, only future ones can be removed', async () => {
    assert.equal((await api('POST', '/checkin/rest', { date: today, kind: 'rest' })).status, 400, 'rest must be planned ahead');
    const tomorrow = addDays(today, 1);
    const r = await api('POST', '/checkin/rest', { date: tomorrow, kind: 'rest', note: 'family' });
    assert.deepEqual([r.status, r.body.kind], [200, 'rest']);
    await api('PUT', '/settings', { mentor_rest_per_month: 1 });
    const second = addDays(today, 2);
    if (second.slice(0, 7) === tomorrow.slice(0, 7)) assert.equal((await api('POST', '/checkin/rest', { date: second, kind: 'rest' })).status, 409, 'limit reached');
    assert.equal((await api('POST', '/checkin/sick', {})).status, 404);
    assert.equal((await api('POST', '/checkin/rest', { date: today, kind: 'sick' })).status, 200, 'a sick day can be today');
    assert.equal((await api('DELETE', `/checkin/rest/${addDays(today, -1)}`)).status, 400);
    assert.equal((await api('DELETE', `/checkin/rest/${tomorrow}`)).status, 200);
    const st = (await api('GET', '/checkin')).body;
    assert.deepEqual([st.restDays.list.some((x) => x.date === today && x.kind === 'sick'), st.today.rest], [true, 'sick']);
    await api('DELETE', `/checkin/rest/${today}`);
    await api('PUT', '/settings', { mentor_rest_per_month: 2 });
  });

  test('commitments: add (one per goal per day, newest wins), list, delete', async () => {
    const day = addDays(today, 1);
    await api('POST', '/checkin/commitments', { date: day, category: 'dsa', planned_at: '07:00', place: 'desk' });
    const b = await api('POST', '/checkin/commitments', { date: day, category: 'dsa', planned_at: '06:30' });
    assert.equal((await api('POST', '/checkin/commitments', { date: day, category: 'chess', planned_at: '07:00' })).status, 400);
    assert.equal((await api('POST', '/checkin/commitments', { date: day, category: 'dsa', planned_at: '7am' })).status, 400);
    const list = (await api('GET', '/checkin')).body.commitments.filter((c) => c.date === day);
    assert.deepEqual(list.map((c) => [c.category, c.planned_at]), [['dsa', '06:30']]);
    assert.equal((await api('DELETE', `/checkin/commitments/${b.body.id}`)).status, 200);
  });

  test('telling it why: the blocker changes the advice; the answer is saved; behind → the shift is offered', async () => {
    const r = await api('POST', '/checkin/reason', { date: today, blocker: 'energy', reason: 'slept 4 hours' });
    assert.equal(r.status, 200);
    assert.ok(r.body.content.includes(BLOCKER_ADVICE.energy) && r.body.content.includes('slept 4 hours'), r.body.content);
    assert.match(r.body.content.split('\n').at(-1), /^Tomorrow, \d{2}:\d{2}: /);
    assert.equal((await sqlQuery(`SELECT blocker, reason FROM dbo.mentor_evaluations WHERE eval_date = '${today}'`))[0].blocker, 'energy');
    assert.equal((await api('GET', '/checkin')).body.messages[0].kind, 'reply');
    assert.equal((await api('POST', '/checkin/reason', { date: today, blocker: 'boredom' })).status, 400);
  });

  test('Telegram: /commit, /rest, /mentor, a reply, and the level-3 buttons → plan shift with a confirm step', async () => {
    const tgm = require('../src/checkin/telegram');
    const sent = [];
    const said = [];
    const tools = { send: async (t, extra) => sent.push({ t, extra }), mentorSay: async (c, l, s, markup) => said.push({ c, markup }) };
    assert.equal(await tgm.handleCommand(pool, 'commit', '6:45am desk dsa', tools), true);
    assert.match(sent.at(-1).t, /^Locked in: (today|tomorrow) 06:45, desk: DSA/);
    await tgm.handleCommand(pool, 'commit', 'desk', tools);
    assert.match(sent.at(-1).t, /When\?/);
    await tgm.handleCommand(pool, 'rest', addDays(today, 3), tools);
    assert.match(sent.at(-1).t, /Rest day set/);
    await tgm.handleCommand(pool, 'rest', 'today', tools);
    assert.match(sent.at(-1).t, /in advance/, 'errors come back politely');
    await tgm.handleCommand(pool, 'mentor', '', tools);
    assert.match(sent.at(-1).t, /Today so far/);
    await tgm.handleCommand(pool, 'why', 'office release ran late', tools);
    assert.match(said.at(-1).c, /office release ran late/);

    // Button: blocker → advice + (the test plan is behind) a shift button
    const noop = async () => {};
    await tgm.handleCallback(pool, `blk:time:${today}`, { ...tools, answer: noop, clear: noop });
    assert.ok(said.at(-1).c.includes(BLOCKER_ADVICE.time));
    assert.equal(said.at(-1).markup.inline_keyboard[0][0].callback_data, `shift:${today}`);
    await tgm.handleCallback(pool, `shift:${today}`, { ...tools, answer: noop, clear: noop });
    assert.match(sent.at(-1).t, /Sure\?/);
    const yes = sent.at(-1).extra.reply_markup.inline_keyboard[0][0].callback_data;
    const firstBefore = (await sqlQuery('SELECT CONVERT(char(10), MIN(plan_date), 23) AS d FROM dbo.days'))[0].d;
    await tgm.handleCallback(pool, yes, { ...tools, answer: noop, clear: noop });
    assert.match(sent.at(-1).t, /^Done\. DSA moved \d+ days?/);
    const firstAfter = (await sqlQuery('SELECT CONVERT(char(10), MIN(plan_date), 23) AS d FROM dbo.days'))[0].d;
    assert.ok(firstBefore < today && firstAfter === today, `${firstBefore} → ${firstAfter}`);
    const after = (await api('GET', '/checkin')).body.today;
    assert.ok(after.level <= 1, `a confirmed shift is a fresh start for escalation (level ${after.level})`);
    assert.equal((await api('POST', '/checkin/shift', {})).status, 400, 'the web needs { confirm: true }');
    assert.equal((await api('POST', '/checkin/shift', { confirm: true })).status, 409, 'nothing left to shift');
  });
});
